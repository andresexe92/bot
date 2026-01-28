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
import { copyFileSync, existsSync, mkdirSync, watch, readdirSync } from 'fs';
import { join, dirname } from 'path';
import Queue from 'queue-promise';

// ============================================
// CONFIGURACIÓN DESDE ENV
// ============================================

const BOT_NIT = process.env.BOT_NIT || 'default';
const BOT_PUERTO = parseInt(process.env.BOT_PUERTO || '3001', 10);
const BOT_NOMBRE = process.env.BOT_NOMBRE || 'Bot';
const BOT_STORAGE_PATH = process.env.BOT_STORAGE_PATH || './storage/default';
const BOT_SESSION_PATH = process.env.BOT_SESSION_PATH || './storage/default/sessions';
const BOT_QR_PATH = process.env.BOT_QR_PATH || './storage/default/qr.png';

console.log('='.repeat(50));
console.log(`[Worker] Iniciando bot: ${BOT_NOMBRE}`);
console.log(`[Worker] NIT: ${BOT_NIT}`);
console.log(`[Worker] Puerto: ${BOT_PUERTO}`);
console.log(`[Worker] Storage: ${BOT_STORAGE_PATH}`);
console.log(`[Worker] Sessions: ${BOT_SESSION_PATH}`);
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
 * Asegura que los directorios existan
 */
function ensureDirectories(): void {
  const dirs = [BOT_STORAGE_PATH, BOT_SESSION_PATH, dirname(BOT_QR_PATH)];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`[Worker] Directorio creado: ${dir}`);
    }
  }
}

/**
 * Busca y copia el QR generado por Baileys a la ubicación centralizada
 */
function setupQrWatcher(): void {
  // Baileys genera el QR en el directorio actual con nombre basado en el bot
  const possibleQrNames = [
    `${BOT_NOMBRE}.qr.png`,
    `${BOT_NIT}.qr.png`,
    'bot.qr.png'
  ];

  // Verificar periódicamente si existe el QR
  const checkQr = () => {
    // Buscar en el directorio de trabajo actual
    const currentDir = process.cwd();
    const storageDir = BOT_STORAGE_PATH;

    for (const qrName of possibleQrNames) {
      // Verificar en directorio actual
      const qrInCwd = join(currentDir, qrName);
      if (existsSync(qrInCwd)) {
        try {
          copyFileSync(qrInCwd, BOT_QR_PATH);
          console.log(`[Worker] QR copiado: ${qrInCwd} -> ${BOT_QR_PATH}`);
          sendToManager('QR_GENERATED', { path: BOT_QR_PATH });
          return true;
        } catch (err) {
          console.error(`[Worker] Error copiando QR:`, err);
        }
      }

      // Verificar en storage
      const qrInStorage = join(storageDir, qrName);
      if (existsSync(qrInStorage) && qrInStorage !== BOT_QR_PATH) {
        try {
          copyFileSync(qrInStorage, BOT_QR_PATH);
          console.log(`[Worker] QR copiado: ${qrInStorage} -> ${BOT_QR_PATH}`);
          sendToManager('QR_GENERATED', { path: BOT_QR_PATH });
          return true;
        } catch (err) {
          console.error(`[Worker] Error copiando QR:`, err);
        }
      }
    }

    return false;
  };

  // Revisar cada 2 segundos por nuevos QRs
  const interval = setInterval(() => {
    checkQr();
  }, 2000);

  // Detener después de 5 minutos (ya debería estar autenticado)
  setTimeout(() => {
    clearInterval(interval);
  }, 300000);
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
  ensureDirectories();

  // Crear provider de Baileys con rutas personalizadas
  const adapterProvider = createProvider(BaileysProvider, {
    name: BOT_NOMBRE,
    experimentalStore: true,
    experimentalSyncMessage: 'Sincronizando mensajes...'
  });

  const adapterDB = new MemoryDB();
  const adapterFlow = createFlow([flowQuestion]);

  const { handleCtx, httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB
  });

  // ============================================
  // ENDPOINTS HTTP
  // ============================================

  /**
   * POST /v1/messages - Enviar mensaje simple
   */
  adapterProvider.server.post('/v1/messages', handleCtx(async (bot, req, res) => {
    const { number, message, urlMedia } = req.body;

    if (!number || !message) {
      return res.status(400).json({ error: 'number y message son requeridos' });
    }

    messageQueue.enqueue(async () => {
      try {
        await bot.sendMessage(number, message, urlMedia ? { media: urlMedia } : {});
        sendToManager('MESSAGE_SENT', { number, message });
      } catch (err) {
        console.error('[Worker] Error enviando mensaje:', err);
      }
    });

    res.json({ status: 'queued', nit: BOT_NIT });
  }));

  /**
   * POST /v1/question - Enviar pregunta con opciones
   */
  adapterProvider.server.post('/v1/question', handleCtx(async (bot, req, res) => {
    const { number, message, answers } = req.body;

    if (!number || !message || !answers) {
      return res.status(400).json({ error: 'number, message y answers son requeridos' });
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

    res.json({ status: 'queued', nit: BOT_NIT });
  }));

  /**
   * GET /health - Health check
   */
  adapterProvider.server.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      nit: BOT_NIT,
      nombre: BOT_NOMBRE,
      puerto: BOT_PUERTO,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * GET /status - Estado detallado
   */
  adapterProvider.server.get('/status', (req, res) => {
    res.json({
      nit: BOT_NIT,
      nombre: BOT_NOMBRE,
      puerto: BOT_PUERTO,
      queueSize: messageQueue.size,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  });

  // ============================================
  // EVENTOS DE BAILEYS
  // ============================================

  // Escuchar eventos de autenticación
  adapterProvider.on('auth_failure', (error) => {
    console.error('[Worker] Error de autenticación:', error);
    sendToManager('ERROR', { message: 'auth_failure', error: String(error) });
  });

  adapterProvider.on('ready', () => {
    console.log('[Worker] Bot listo y autenticado');
    sendToManager('AUTHENTICATED');
  });

  // ============================================
  // INICIAR SERVIDOR
  // ============================================

  httpServer(BOT_PUERTO);

  // Configurar watcher para QR
  setupQrWatcher();

  // Notificar al manager que estamos listos
  sendToManager('READY');

  console.log(`[Worker] Bot ${BOT_NOMBRE} escuchando en puerto ${BOT_PUERTO}`);
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

// Ejecutar
main().catch((error) => {
  console.error('[Worker] Error fatal:', error);
  sendToManager('ERROR', { message: 'fatal', error: error.message });
  process.exit(1);
});
