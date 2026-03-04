/**
 * BotWorker Meta - Instancia de bot para WhatsApp Cloud API
 */

import { createBot, createFlow, createProvider, addKeyword, utils } from '@builderbot/bot';
import { MetaProvider } from '@builderbot/provider-meta';
import { MemoryDB } from '@builderbot/bot';
import Queue from 'queue-promise';

// ============================================
// CONFIGURACIÓN DESDE ENV
// ============================================

const BOT_NIT = process.env.BOT_NIT || 'default';
const BOT_PUERTO = parseInt(process.env.BOT_PUERTO || '3001', 10);
const BOT_NOMBRE = process.env.BOT_NOMBRE || 'Bot Meta';

// Configuración Meta
const META_JWT_TOKEN = process.env.META_JWT_TOKEN;
const META_NUMBER_ID = process.env.META_NUMBER_ID;
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const META_VERSION = process.env.META_VERSION || 'v21.0';

console.log('='.repeat(50));
console.log(`[Worker-Meta] Iniciando bot: ${BOT_NOMBRE}`);
console.log(`[Worker-Meta] NIT: ${BOT_NIT}`);
console.log(`[Worker-Meta] Puerto: ${BOT_PUERTO}`);
console.log(`[Worker-Meta] Meta Number ID: ${META_NUMBER_ID}`);
console.log('='.repeat(50));

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

// ============================================
// COLA DE MENSAJES
// ============================================

const messageQueue = new Queue({
  concurrent: 1,
  interval: 100 // API de Meta es más rápida, podemos bajar el intervalo
});

// ============================================
// FLUJO DUMMY (La lógica la maneja el backend PHP)
// ============================================

const flowQuestion = addKeyword(utils.setEvent('question'))
  .addAction(async (ctx, $) => {
    // Lógica similar a bot.ts
    // ...
  });

// ============================================
// INICIALIZACIÓN
// ============================================

async function main(): Promise<void> {
  if (!META_JWT_TOKEN || !META_NUMBER_ID || !META_VERIFY_TOKEN) {
    throw new Error('Faltan variables de entorno de Meta (JWT, NUMBER_ID, VERIFY_TOKEN)');
  }

  console.log('[Worker-Meta] Creando MetaProvider...');

  const adapterProvider = createProvider(MetaProvider, {
    jwtToken: META_JWT_TOKEN,
    numberId: META_NUMBER_ID,
    verifyToken: META_VERIFY_TOKEN,
    version: META_VERSION,
    port: BOT_PUERTO // El provider levanta su propio servidor si se le pasa puerto
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

  // Sobreescribir endpoints si se necesita customización o usar los del provider
  // Nota: MetaProvider ya maneja el webhook en POST /webhook y GET /webhook (verificación)

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
        console.error('[Worker-Meta] Error enviando mensaje:', err);
      }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'queued', nit: BOT_NIT }));
  }));

  // Endpoint Health
  adapterProvider.server.get('/health', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      nit: BOT_NIT,
      provider: 'meta',
      timestamp: new Date().toISOString()
    }));
  });

  // Notificar listo
  // En Meta no hay QR, se considera "AUTHENTICATED" si la config es válida
  sendToManager('READY');
  sendToManager('AUTHENTICATED');

  // En MetaProvider, el servidor ya se inicia al pasar 'port' en createProvider? 
  // O debemos llamar a httpServer? Revisar documentación o comportamiento usual.
  // BuilderBot suele requerir httpServer(port) explicito

  httpServer(BOT_PUERTO);

  console.log(`[Worker-Meta] Escuchando en puerto ${BOT_PUERTO}`);
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

main().catch((error) => {
  console.error('[Worker-Meta] Error fatal:', error);
  sendToManager('ERROR', { message: 'fatal', error: error.message });
  process.exit(1);
});
