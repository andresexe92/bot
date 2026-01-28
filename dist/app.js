import { createProvider, MemoryDB, addKeyword, utils, createFlow, createBot } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import Queue from 'queue-promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const name = 'NOMBRE_DE_LA_EMPRESA';
const adapterProvider = createProvider(BaileysProvider, {
    name,
    experimentalStore: true,
    experimentalSyncMessage: 'Ups tu mensaje no pudo ser leído, por favor reenviado de nuevo',
});
const adapterDB = new MemoryDB();

const flowQuestion = addKeyword(utils.setEvent('question'))
    .addAction(async (ctx, $) => {
    try {
        const body = JSON.parse(ctx.name);
        await $.state.update({ body });
        await $.flowDynamic(body.message.join('\n'));
    }
    catch (error) {
        console.log(error.message);
    }
})
    .addAction({ capture: true }, async (ctx, $) => {
    const respuesta = Number(ctx.body);
    console.log(respuesta);
    const { answers, message } = $.state.get('body');
    if (respuesta.toString() == 'NaN') {
        await $.flowDynamic(`❌ *${ctx.body}* no es una respuesta valida ❌`);
        return $.fallBack(message.join('\n'));
    }
    for (const answer of answers) {
        const { option, action, message } = answer;
        if (option == respuesta) {
            let data = {
                respuesta: respuesta
            };
            console.log("Apuntando a : " + action);
            let httpResponse = await fetch(action, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            });
            console.log("Esta es la Respuesta del servidor");
            console.log(httpResponse);
            await $.flowDynamic(message);
            break;
        }
    }
});

const queue = new Queue({
    concurrent: 1,
    interval: 3000,
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = resolve(__dirname, "config.json");
const configData = readFileSync(configPath, "utf-8");
const config = JSON.parse(configData);
const PORT = config.puerto ?? 3999;
console.log("El puerto cargado es:", PORT);
const main = async () => {
    const adapterFlow = createFlow([flowQuestion]);
    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });
    adapterProvider.server.post('/v1/messages', handleCtx(async (bot, req, res) => {
        const { number, message, urlMedia } = req.body;
        queue.enqueue(async () => {
            await bot.sendMessage(number, message, { media: urlMedia ?? null });
        });
        return res.end('sended');
    }));
    adapterProvider.server.post('/v1/question', handleCtx(async (bot, req, res) => {
        const body = req.body;
        queue.enqueue(async () => {
            await bot.dispatch('question', { from: body.number, name: JSON.stringify(body) });
        });
        return res.end('sended');
    }));
    httpServer(+PORT);
};
main();
