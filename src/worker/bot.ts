/**
 * BotWorker - Instancia genérica de bot WhatsApp
 *
 * Este script es spawneado por el BotManager para cada cliente.
 * Recibe su configuración a través de variables de entorno:
 * - BOT_NIT: ID único del cliente
 * - BOT_PUERTO: Puerto donde escuchar
 * - BOT_NOMBRE: Nombre del bot/empresa
 * - BOT_STORAGE_PATH: Ruta para almacenar datos
 * - BOT_SESSION_PATH: Ruta para la sesión de Baileys
 * - BOT_QR_PATH: Ruta donde guardar el QR
 * - BOT_WEBHOOK_URL: URL base del backend (opcional)
 */

import { createBot, createFlow, createProvider, addKeyword, utils } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import { MemoryDB } from '@builderbot/bot';
import { copyFileSync, existsSync, mkdirSync, writeFileSync, watch } from 'fs';
import { join, dirname, resolve } from 'path';
import Queue from 'queue-promise';

// ============================================
// CONFIGURACIÓN DESDE ENV
// ============================================

const BOT_NIT = process.env.BOT_NIT || 'default';
const BOT_PUERTO = parseInt(process.env.BOT_PUERTO || '3001', 10);
const BOT_NOMBRE = process.env.BOT_NOMBRE || 'Bot';
const BOT_STORAGE_PATH = resolve(process.env.BOT_STORAGE_PATH || './storage/default');
const BOT_SESSION_PATH = resolve(process.env.BOT_SESSION_PATH || './storage/default/sessions');
const BOT_QR_PATH = resolve(process.env.BOT_QR_PATH || './storage/default/qr.png');

// ============================================
// CONFIGURACIÓN CRÍTICA: Cambiar CWD al storage
// BaileysProvider genera archivos relativos al CWD
// ============================================

function ensureDirectories(): void {
  const dirs = [BOT_STORAGE_PATH, BOT_SESSION_PATH, dirname(BOT_QR_PATH)];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`[Worker] Directorio creado: ${dir}`);
    }
  }
}

// Crear directorios primero
ensureDirectories();

// CRÍTICO: Cambiar al directorio de storage ANTES de cualquier operación de Baileys
// Esto hace que Baileys genere el QR y sesiones en este directorio
const originalCwd = process.cwd();
process.chdir(BOT_STORAGE_PATH);

console.log('='.repeat(50));
console.log(`[Worker] Iniciando bot: ${BOT_NOMBRE}`);
console.log(`[Worker] NIT: ${BOT_NIT}`);
console.log(`[Worker] Puerto: ${BOT_PUERTO}`);
console.log(`[Worker] Storage: ${BOT_STORAGE_PATH}`);
console.log(`[Worker] Sessions: ${BOT_SESSION_PATH}`);
console.log(`[Worker] CWD cambiado a: ${process.cwd()}`);
console.log('='.repeat(50));

// ============================================
// TIPOS
// ============================================

interface Answer {
  option: number;
  action: string;
  message: string;
}

interface QuestionBody {
  number: string;
  message: string[];
  answers: Answer[];
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Envía mensaje al proceso padre (BotManager)
 */
function sendToManager(type: string, data?: unknown): void {
  if (process.send) {
    process.send({
      type,
      nit: BOT_NIT,
      data,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Busca el QR generado por Baileys y lo copia/renombra a qr.png
 */
function setupQrWatcher(): void {
  // Nombres posibles que Baileys puede generar
  const possibleQrNames = [
    `${BOT_NOMBRE}.qr.png`,
    `${BOT_NIT}.qr.png`,
    'bot.qr.png',
    'Bot.qr.png'
  ];

  const checkAndCopyQr = (): boolean => {
    const cwd = process.cwd();

    for (const qrName of possibleQrNames) {
      const sourcePath = join(cwd, qrName);

      if (existsSync(sourcePath)) {
        try {
          // Si el QR generado no es el mismo que el destino, copiarlo
          if (sourcePath !== BOT_QR_PATH) {
            copyFileSync(sourcePath, BOT_QR_PATH);
            console.log(`[Worker] QR copiado: ${sourcePath} -> ${BOT_QR_PATH}`);
          } else {
            console.log(`[Worker] QR encontrado en: ${sourcePath}`);
          }
          sendToManager('QR_GENERATED', { path: BOT_QR_PATH });
          return true;
        } catch (err) {
          console.error(`[Worker] Error copiando QR:`, err);
        }
      }
    }

    return false;
  };

  // Revisar inmediatamente y luego cada 2 segundos
  if (!checkAndCopyQr()) {
    const interval = setInterval(() => {
      if (checkAndCopyQr()) {
        // Seguir verificando por si se regenera el QR
      }
    }, 2000);

    // Detener después de 5 minutos
    setTimeout(() => {
      clearInterval(interval);
    }, 300000);
  }

  // También usar watch para detectar cambios en el directorio
  try {
    watch(process.cwd(), (eventType, filename) => {
      if (filename && filename.endsWith('.qr.png')) {
        console.log(`[Worker] Detectado cambio en QR: ${filename}`);
        setTimeout(checkAndCopyQr, 500);
      }
    });
  } catch (err) {
    console.log('[Worker] Watch no disponible, usando polling');
  }
}

// ============================================
// COLA DE MENSAJES
// ============================================

const messageQueue = new Queue({
  concurrent: 1,
  interval: 3000  // 3 segundos entre mensajes para evitar ban
});

// ============================================
// FLUJOS DEL BOT
// ============================================

/**
 * Flujo de preguntas con opciones (lógica stateless)
 */
const flowQuestion = addKeyword(utils.setEvent('question'))
  .addAction(async (ctx, $) => {
    try {
      const body = JSON.parse(ctx.name) as QuestionBody;
      await $.state.update({ body });
      await $.flowDynamic(body.message.join('\n'));
    } catch (error) {
      console.error('[Worker] Error en flowQuestion:', error);
    }
  })
  .addAction({ capture: true }, async (ctx, $) => {
    const respuesta = Number(ctx.body);
    const { answers, message } = $.state.get('body') as QuestionBody;

    if (isNaN(respuesta)) {
      await $.flowDynamic(`*${ctx.body}* no es una respuesta valida`);
      return $.fallBack(message.join('\n'));
    }

    for (const answer of answers) {
      if (answer.option === respuesta) {
        const data = { respuesta };

        console.log(`[Worker] Enviando respuesta a: ${answer.action}`);

        try {
          const httpResponse = await fetch(answer.action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });

          console.log(`[Worker] Respuesta del webhook: ${httpResponse.status}`);
        } catch (err) {
          console.error('[Worker] Error enviando webhook:', err);
        }

        await $.flowDynamic(answer.message);
        return;
      }
    }

    // Si no coincide ninguna opción
    await $.flowDynamic(`*${respuesta}* no es una opcion valida`);
    return $.fallBack(message.join('\n'));
  });

// ============================================
// INICIALIZACIÓN DEL BOT
// ============================================

async function main(): Promise<void> {
  console.log('[Worker] Creando provider BaileysProvider...');

  // Crear provider de Baileys
  // El QR se generará en el CWD actual (que es BOT_STORAGE_PATH)
  const adapterProvider = createProvider(BaileysProvider, {
    name: BOT_NOMBRE,
    experimentalStore: true,
    experimentalSyncMessage: 'Sincronizando mensajes...'
  });

  console.log('[Worker] Provider creado, inicializando bot...');

  const adapterDB = new MemoryDB();
  const adapterFlow = createFlow([flowQuestion]);

  const { handleCtx, httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB
  });

  console.log('[Worker] Bot inicializado, configurando endpoints...');

  // ============================================
  // ENDPOINTS HTTP
  // ============================================

  /**
   * POST /v1/messages - Enviar mensaje simple
   */
  adapterProvider.server.post('/v1/messages', handleCtx(async (bot, req, res) => {
    const { number, message, urlMedia } = req.body;

    if (!number || !message) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'number y message son requeridos' }));
      return;
    }

    messageQueue.enqueue(async () => {
      try {
        await bot.sendMessage(number, message, urlMedia ? { media: urlMedia } : {});
        sendToManager('MESSAGE_SENT', { number, message });
      } catch (err) {
        console.error('[Worker] Error enviando mensaje:', err);
      }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'queued', nit: BOT_NIT }));
  }));

  /**
   * POST /v1/question - Enviar pregunta con opciones
   */
  adapterProvider.server.post('/v1/question', handleCtx(async (bot, req, res) => {
    const { number, message, answers } = req.body;

    if (!number || !message || !answers) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'number, message y answers son requeridos' }));
      return;
    }

    messageQueue.enqueue(async () => {
      try {
        await bot.dispatch('question', {
          from: number,
          name: JSON.stringify({ number, message, answers })
        });
        sendToManager('MESSAGE_SENT', { number, type: 'question' });
      } catch (err) {
        console.error('[Worker] Error enviando pregunta:', err);
      }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'queued', nit: BOT_NIT }));
  }));

  /**
   * GET /health - Health check
   */
  adapterProvider.server.get('/health', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      nit: BOT_NIT,
      nombre: BOT_NOMBRE,
      puerto: BOT_PUERTO,
      cwd: process.cwd(),
      timestamp: new Date().toISOString()
    }));
  });

  /**
   * GET /status - Estado detallado
   */
  adapterProvider.server.get('/status', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      nit: BOT_NIT,
      nombre: BOT_NOMBRE,
      puerto: BOT_PUERTO,
      queueSize: messageQueue.size,
      uptime: process.uptime(),
      cwd: process.cwd(),
      qrPath: BOT_QR_PATH,
      qrExists: existsSync(BOT_QR_PATH),
      memory: process.memoryUsage()
    }));
  });

  // ============================================
  // EVENTOS DE BAILEYS
  // ============================================

  // Evento cuando se necesita acción (QR)
  adapterProvider.on('require_action', (payload: { title: string; instructions: string[] }) => {
    console.log('[Worker] ====== REQUIRE_ACTION ======');
    console.log('[Worker] Title:', payload?.title);
    console.log('[Worker] Instructions:', payload?.instructions);
    sendToManager('REQUIRE_ACTION', { payload });
  });

  // Evento de error de autenticación
  adapterProvider.on('auth_failure', (error: unknown) => {
    console.error('[Worker] Error de autenticación:', error);
    sendToManager('ERROR', { message: 'auth_failure', error: String(error) });
  });

  // Evento cuando el bot está listo
  adapterProvider.on('ready', () => {
    console.log('[Worker] ====== BOT READY ======');
    console.log('[Worker] Bot listo y autenticado');
    sendToManager('AUTHENTICATED');
  });

  // Capturar TODOS los eventos del provider para debug
  const originalEmit = adapterProvider.emit.bind(adapterProvider);
  adapterProvider.emit = (event: string, ...args: unknown[]) => {
    console.log(`[Worker] Evento emitido: ${event}`);
    return originalEmit(event, ...args);
  };

  // ============================================
  // INICIAR SERVIDOR
  // ============================================

  httpServer(BOT_PUERTO);

  // Configurar watcher para QR
  setupQrWatcher();

  // Notificar al manager que estamos listos
  sendToManager('READY');

  console.log(`[Worker] Bot ${BOT_NOMBRE} escuchando en puerto ${BOT_PUERTO}`);
  console.log(`[Worker] QR se generará en: ${join(process.cwd(), BOT_NOMBRE + '.qr.png')}`);
}

// ============================================
// MANEJO DE SEÑALES
// ============================================

process.on('SIGTERM', () => {
  console.log('[Worker] Recibido SIGTERM, cerrando...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Worker] Recibido SIGINT, cerrando...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('[Worker] Excepción no capturada:', error);
  sendToManager('ERROR', { message: 'uncaughtException', error: error.message });
});

process.on('unhandledRejection', (reason) => {
  console.error('[Worker] Promesa rechazada no manejada:', reason);
  sendToManager('ERROR', { message: 'unhandledRejection', error: String(reason) });
});

// ============================================
// EJECUTAR
// ============================================

main().catch((error) => {
  console.error('[Worker] Error fatal:', error);
  sendToManager('ERROR', { message: 'fatal', error: error.message });
  process.exit(1);
});
