/**
 * BotWorker Meta - Instancia de bot usando WhatsApp Business API (Meta Cloud API)
 *
 * Este worker usa el provider oficial de Meta en lugar de Baileys.
 * No requiere escanear QR, usa tokens de API.
 *
 * Variables de entorno requeridas:
 * - BOT_NIT: ID único del cliente
 * - BOT_PUERTO: Puerto donde escuchar (webhook)
 * - BOT_NOMBRE: Nombre del bot/empresa
 * - META_JWT_TOKEN: Access token de Meta
 * - META_NUMBER_ID: Phone Number ID de WhatsApp
 * - META_VERIFY_TOKEN: Token para verificar webhook
 * - META_VERSION: Version de la API (default: v21.0)
 */

import { createBot, createFlow, createProvider, addKeyword, utils } from '@builderbot/bot';
import { MetaProvider } from '@builderbot/provider-meta';
import { MemoryDB } from '@builderbot/bot';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import Queue from 'queue-promise';

// ============================================
// CONFIGURACIÓN DESDE ENV
// ============================================

const BOT_NIT = process.env.BOT_NIT || 'default';
const BOT_PUERTO = parseInt(process.env.BOT_PUERTO || '3001', 10);
const BOT_NOMBRE = process.env.BOT_NOMBRE || 'Bot';
const BOT_STORAGE_PATH = resolve(process.env.BOT_STORAGE_PATH || './storage/default');

// Meta API Config
const META_JWT_TOKEN = process.env.META_JWT_TOKEN || '';
const META_NUMBER_ID = process.env.META_NUMBER_ID || '';
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || '';
const META_VERSION = process.env.META_VERSION || 'v21.0';

// Validar configuración requerida
if (!META_JWT_TOKEN || !META_NUMBER_ID || !META_VERIFY_TOKEN) {
  console.error('[Worker-Meta] ERROR: Faltan variables de entorno de Meta');
  console.error('[Worker-Meta] Requeridas: META_JWT_TOKEN, META_NUMBER_ID, META_VERIFY_TOKEN');
  process.exit(1);
}

console.log('='.repeat(50));
console.log(`[Worker-Meta] Iniciando bot: ${BOT_NOMBRE}`);
console.log(`[Worker-Meta] NIT: ${BOT_NIT}`);
console.log(`[Worker-Meta] Puerto: ${BOT_PUERTO}`);
console.log(`[Worker-Meta] Provider: Meta Cloud API ${META_VERSION}`);
console.log(`[Worker-Meta] Number ID: ${META_NUMBER_ID}`);
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

function ensureDirectories(): void {
  if (!existsSync(BOT_STORAGE_PATH)) {
    mkdirSync(BOT_STORAGE_PATH, { recursive: true });
    console.log(`[Worker-Meta] Directorio creado: ${BOT_STORAGE_PATH}`);
  }
}

// ============================================
// COLA DE MENSAJES
// ============================================

const messageQueue = new Queue({
  concurrent: 1,
  interval: 1000  // Meta permite mas velocidad que Baileys
});

// ============================================
// FLUJOS DEL BOT
// ============================================

const flowQuestion = addKeyword(utils.setEvent('question'))
  .addAction(async (ctx, $) => {
    try {
      const body = JSON.parse(ctx.name) as QuestionBody;
      await $.state.update({ body });
      await $.flowDynamic(body.message.join('\n'));
    } catch (error) {
      console.error('[Worker-Meta] Error en flowQuestion:', error);
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
        console.log(`[Worker-Meta] Enviando respuesta a: ${answer.action}`);
        try {
          await fetch(answer.action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ respuesta })
          });
        } catch (err) {
          console.error('[Worker-Meta] Error enviando webhook:', err);
        }
        await $.flowDynamic(answer.message);
        return;
      }
    }

    await $.flowDynamic(`*${respuesta}* no es una opcion valida`);
    return $.fallBack(message.join('\n'));
  });

// ============================================
// INICIALIZACIÓN DEL BOT
// ============================================

async function main(): Promise<void> {
  ensureDirectories();

  console.log('[Worker-Meta] Creando provider MetaProvider...');

  // Crear provider de Meta (WhatsApp Business API)
  const adapterProvider = createProvider(MetaProvider, {
    jwtToken: META_JWT_TOKEN,
    numberId: META_NUMBER_ID,
    verifyToken: META_VERIFY_TOKEN,
    version: META_VERSION
  });

  console.log('[Worker-Meta] Provider creado');

  const adapterDB = new MemoryDB();
  const adapterFlow = createFlow([flowQuestion]);

  const { handleCtx, httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB
  });

  console.log('[Worker-Meta] Bot creado, configurando endpoints...');

  // ============================================
  // ENDPOINTS HTTP
  // ============================================

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
        console.log(`[Worker-Meta] Mensaje enviado a ${number}`);
      } catch (err) {
        console.error('[Worker-Meta] Error enviando mensaje:', err);
      }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'queued', nit: BOT_NIT }));
  }));

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
      } catch (err) {
        console.error('[Worker-Meta] Error enviando pregunta:', err);
      }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'queued', nit: BOT_NIT }));
  }));

  adapterProvider.server.get('/health', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      provider: 'meta',
      nit: BOT_NIT,
      nombre: BOT_NOMBRE,
      puerto: BOT_PUERTO,
      numberId: META_NUMBER_ID,
      version: META_VERSION,
      timestamp: new Date().toISOString()
    }));
  });

  adapterProvider.server.get('/status', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      nit: BOT_NIT,
      nombre: BOT_NOMBRE,
      puerto: BOT_PUERTO,
      provider: 'meta',
      numberId: META_NUMBER_ID,
      version: META_VERSION,
      queueSize: messageQueue.size,
      uptime: process.uptime()
    }));
  });

  // ============================================
  // EVENTOS DE META
  // ============================================

  adapterProvider.on('ready', () => {
    console.log('[Worker-Meta] ====== BOT READY ======');
    console.log('[Worker-Meta] Webhook configurado y listo para recibir mensajes');
    sendToManager('AUTHENTICATED');
  });

  adapterProvider.on('auth_failure', (error: unknown) => {
    console.error('[Worker-Meta] Error de autenticación:', error);
    sendToManager('ERROR', { message: 'auth_failure', error: String(error) });
  });

  adapterProvider.on('message', (ctx: unknown) => {
    console.log('[Worker-Meta] Mensaje recibido:', JSON.stringify(ctx).substring(0, 200));
  });

  // ============================================
  // INICIAR SERVIDOR
  // ============================================

  httpServer(BOT_PUERTO);

  sendToManager('READY');

  console.log(`[Worker-Meta] Bot ${BOT_NOMBRE} escuchando en puerto ${BOT_PUERTO}`);
  console.log(`[Worker-Meta] Webhook URL: https://tu-dominio.com:${BOT_PUERTO}/webhook`);
  console.log('[Worker-Meta] Configura esta URL en Meta Developer Console');
}

// ============================================
// MANEJO DE SEÑALES
// ============================================

process.on('SIGTERM', () => {
  console.log('[Worker-Meta] SIGTERM recibido');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Worker-Meta] SIGINT recibido');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('[Worker-Meta] Excepción no capturada:', error);
  sendToManager('ERROR', { message: 'uncaughtException', error: error.message });
});

process.on('unhandledRejection', (reason) => {
  console.error('[Worker-Meta] Promesa rechazada:', reason);
  sendToManager('ERROR', { message: 'unhandledRejection', error: String(reason) });
});

// ============================================
// EJECUTAR
// ============================================

main().catch((error) => {
  console.error('[Worker-Meta] Error fatal:', error);
  sendToManager('ERROR', { message: 'fatal', error: error.message });
  process.exit(1);
});
