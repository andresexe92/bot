    import { createBot, createFlow } from '@builderbot/bot';
    import { adapterDB, adapterProvider } from './config';
    import { flowQuestion } from './flowQuestion';
    import { Body } from './types';
    import Queue from 'queue-promise'
    import { readFileSync } from "fs";
    import { fileURLToPath } from "url";
    import { dirname, resolve } from "path";


    const queue = new Queue({
        concurrent: 1,
        interval: 3000,
    });



    // Reconstruir __dirname
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Ruta al JSON
    const configPath = resolve(__dirname, "config.json");

    // Leer y parsear
    const configData = readFileSync(configPath, "utf-8");
    const config = JSON.parse(configData);

    // Definir el puerto
    const PORT = config.puerto ?? 3999;

console.log("El puerto cargado es:", PORT);

 


    // FUNCION PRINCIPAL DEL BOT 
    const main = async () => {


        const adapterFlow = createFlow([flowQuestion]);
        
        const { handleCtx, httpServer } = await createBot({
            flow: adapterFlow,
            provider: adapterProvider,
            database: adapterDB,
        });

    
        
        
        
        
        
        
        // ENDPOINT PARA SOLO MANDAR UN MENSAJE SIMPLE CON O SI ARCHIVOS RECIBE EL NUMERO DE TELEFONO DE LA PERSONA A LA QUE SE LE ENVIARA EL MENSAJE Y EL MENSAJE QUE LE QUEREMOS PASAR
        // UNA URL PARA ENVIAR UN ARCHIVO YA SEA PDF, JPG, EXCEL ETC.
        //EJEMPLO DEL OBJETO QUE LE DEBEMOS PASAR 
        /*
        {
            "number": "573012348168",
            "message": "Hola",
            "urlMedia": "https://apipuntoventav1.nubep7.com/documentos/facura_PDF/3483901/76093"
        }
        */
        adapterProvider.server.post(
            '/v1/messages',
            handleCtx(async (bot, req, res) => {
                const { number, message, urlMedia } = req.body;

                queue.enqueue(async () => {
                    await bot.sendMessage(number, message, { media: urlMedia ?? null });
                });

                return res.end('sended');
            })
        );

    
    
        // ENDPOINT PARA ENVIAR UNA PREGUNTAS CON OPCIONES AL USUARIO Y EL BOT RESPONDE A LO QUE EL USUARIO SELECCIONE RECIBE UN BODY 
        //EJEMPLO DEL OBJETO QUE LE DEBEMOS PASAR 
        /*
        {
            "number": "573122946723",
            "urlMedia": "",
            "message": [
                "👋 Hola Andres, ¿Llegaste a tu cita?",
                "1️⃣ Si, gracias por preguntar",
                "2️⃣ No, me quede sin gasolina"
            ],
            "answers": [
                {
                "option": 1,
                "action": "https://miapi.com/estado/1",
                "message": "Muy bien, que te vaya bien"
                },
                {
                "option": 2,
                "action": "https://miapi.com/soporte",
                "message": "Ahh XD ve a la bomba mas cercana",
                    
                }
            ]
        }
        */
        adapterProvider.server.post('/v1/question',
            handleCtx(async (bot, req, res) => {
                const body = req.body as Body;

                queue.enqueue(async () => {
                    
                    await bot.dispatch('question', { from: body.number, name: JSON.stringify(body) });
                    
                });


                return res.end('sended');
            })
        );


        // INICIALIZACION DEL SERVIDOR HTTP SEGUN EL PUERTO QUE SE LE INDICA
        httpServer(+PORT);
    };

    // EJECUTAMOS LA FUNCION PRINCIPAL
    main();
