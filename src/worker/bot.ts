/**
 * BotWorker - Instancia genérica de bot WhatsApp
 *
 * Este script es spawneado por el BotManager para cada cliente.
 * Recibe su configuración a través de variables de entorno.
 */

import { createBot, createFlow, createProvider, addKeyword, utils } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import { MemoryDB } from '@builderbot/bot';
import { copyFileSync, existsSync, mkdirSync, writeFileSync, watch, unlinkSync } from 'fs';
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
process.chdir(BOT_STORAGE_PATH);

console.log('='.repeat(50));
console.log(`[Worker] Iniciando bot: ${BOT_NOMBRE}`);
console.log(`[Worker] NIT: ${BOT_NIT}`);
console.log(`[Worker] Puerto: ${BOT_PUERTO}`);
console.log(`[Worker] Storage: ${BOT_STORAGE_PATH}`);
console.log(`[Worker] Sessions: ${BOT_SESSION_PATH}`);
console.log(`[Worker] CWD: ${process.cwd()}`);
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

/**
 * Busca y copia el QR generado por Baileys
 */
function setupQrFileWatcher(): void {
  const possibleQrNames = [
    `${BOT_NOMBRE}.qr.png`,
    `${BOT_NIT}.qr.png`,
    'bot.qr.png'
  ];

  const checkAndCopyQr = (): boolean => {
    for (const qrName of possibleQrNames) {
      const sourcePath = join(process.cwd(), qrName);
      if (existsSync(sourcePath)) {
        if (sourcePath !== BOT_QR_PATH) {
          copyFileSync(sourcePath, BOT_QR_PATH);
          console.log(`[Worker] QR copiado: ${sourcePath} -> ${BOT_QR_PATH}`);
        }
        sendToManager('QR_GENERATED', { path: BOT_QR_PATH });
        return true;
      }
    }
    return false;
  };

  // Polling cada 2 segundos
  const interval = setInterval(checkAndCopyQr, 2000);
  setTimeout(() => clearInterval(interval), 300000);

  // Watch del directorio
  try {
    watch(process.cwd(), (eventType, filename) => {
      if (filename?.endsWith('.qr.png')) {
        setTimeout(checkAndCopyQr, 500);
      }
    });
  } catch (e) {
    // Watch no disponible
  }
}

// ============================================
// COLA DE MENSAJES
// ============================================

const messageQueue = new Queue({
  concurrent: 1,
  interval: 3000
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
        console.log(`[Worker] Enviando respuesta a: ${answer.action}`);
        try {
          await fetch(answer.action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ respuesta })
          });
        } catch (err) {
          console.error('[Worker] Error enviando webhook:', err);
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
  console.log('[Worker] Creando provider BaileysProvider...');

  // Limpiar sesión si existe para forzar nuevo QR (solo en desarrollo)
  // Descomentar la siguiente línea para forzar nuevo QR cada vez:
  // cleanSession();

  const adapterProvider = createProvider(BaileysProvider, {
    name: BOT_NOMBRE,
    experimentalStore: true,
    experimentalSyncMessage: 'Sincronizando mensajes...'
  });

  console.log('[Worker] Provider creado');

  const adapterDB = new MemoryDB();
  const adapterFlow = createFlow([flowQuestion]);

  const { handleCtx, httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB
  });

  console.log('[Worker] Bot creado, configurando endpoints...');

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
      } catch (err) {
        console.error('[Worker] Error enviando mensaje:', err);
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
        console.error('[Worker] Error enviando pregunta:', err);
      }
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'queued', nit: BOT_NIT }));
  }));

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

  adapterProvider.server.get('/status', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      nit: BOT_NIT,
      nombre: BOT_NOMBRE,
      puerto: BOT_PUERTO,
      cwd: process.cwd(),
      qrPath: BOT_QR_PATH,
      qrExists: existsSync(BOT_QR_PATH),
      sessionPath: BOT_SESSION_PATH,
      sessionExists: existsSync(join(BOT_SESSION_PATH, 'creds.json')),
      uptime: process.uptime()
    }));
  });

  // ============================================
  // EVENTOS - ESCUCHAR DIRECTAMENTE DE BAILEYS
  // ============================================

  // Eventos del provider wrapper
  adapterProvider.on('require_action', (payload: unknown) => {
    console.log('[Worker] EVENT: require_action', payload);
    sendToManager('REQUIRE_ACTION', { payload });
  });

  adapterProvider.on('auth_failure', (error: unknown) => {
    console.error('[Worker] EVENT: auth_failure', error);
    sendToManager('ERROR', { message: 'auth_failure', error: String(error) });
  });

  adapterProvider.on('ready', () => {
    console.log('[Worker] EVENT: ready - Bot autenticado!');
    sendToManager('AUTHENTICATED');

    // Eliminar QR si existe (ya no se necesita)
    if (existsSync(BOT_QR_PATH)) {
      try {
        unlinkSync(BOT_QR_PATH);
        console.log('[Worker] QR eliminado (ya autenticado)');
      } catch (e) {
        // Ignorar
      }
    }
  });

  // ============================================
  // ACCESO DIRECTO AL SOCKET DE BAILEYS
  // El vendor contiene el socket de Baileys
  // ============================================

  // Esperar a que el vendor esté disponible
  const waitForVendor = async (): Promise<void> => {
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      // @ts-ignore - vendor existe en runtime
      const vendor = adapterProvider.vendor;

      if (vendor) {
        console.log('[Worker] Vendor (socket Baileys) disponible');

        // Escuchar eventos de conexión directamente del socket
        // @ts-ignore
        if (vendor.ev) {
          console.log('[Worker] Registrando listeners en vendor.ev...');

          // @ts-ignore
          vendor.ev.on('connection.update', (update: any) => {
            console.log('[Worker] BAILEYS connection.update:', JSON.stringify(update));

            const { qr, connection, lastDisconnect } = update;

            if (qr) {
              console.log('[Worker] ========== QR RECIBIDO ==========');
              console.log('[Worker] QR String (primeros 50 chars):', qr.substring(0, 50));
              sendToManager('QR_RECEIVED', { qr: qr.substring(0, 100) });
            }

            if (connection === 'close') {
              console.log('[Worker] Conexión cerrada:', lastDisconnect);
            }

            if (connection === 'open') {
              console.log('[Worker] ========== CONECTADO ==========');
              sendToManager('AUTHENTICATED');
            }
          });

          // @ts-ignore
          vendor.ev.on('creds.update', () => {
            console.log('[Worker] BAILEYS creds.update - Credenciales actualizadas');
          });
        }

        return;
      }

      attempts++;
      console.log(`[Worker] Esperando vendor... (${attempts}/${maxAttempts})`);
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log('[Worker] ADVERTENCIA: vendor no disponible después de esperar');
  };

  // Iniciar en paralelo
  waitForVendor().catch(console.error);

  // ============================================
  // INICIAR SERVIDOR
  // ============================================

  httpServer(BOT_PUERTO);
  setupQrFileWatcher();
  sendToManager('READY');

  console.log(`[Worker] Bot ${BOT_NOMBRE} escuchando en puerto ${BOT_PUERTO}`);
  console.log(`[Worker] Esperando QR o reconexión...`);
}

// ============================================
// UTILIDAD: Limpiar sesión para forzar nuevo QR
// ============================================

function cleanSession(): void {
  const sessionDir = join(process.cwd(), `${BOT_NOMBRE}_sessions`);
  if (existsSync(sessionDir)) {
    console.log(`[Worker] Limpiando sesión existente: ${sessionDir}`);
    try {
      const { rmSync } = require('fs');
      rmSync(sessionDir, { recursive: true, force: true });
      console.log('[Worker] Sesión limpiada');
    } catch (e) {
      console.error('[Worker] Error limpiando sesión:', e);
    }
  }
}

// ============================================
// MANEJO DE SEÑALES
// ============================================

process.on('SIGTERM', () => {
  console.log('[Worker] SIGTERM recibido');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Worker] SIGINT recibido');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('[Worker] Excepción no capturada:', error);
  sendToManager('ERROR', { message: 'uncaughtException', error: error.message });
});

process.on('unhandledRejection', (reason) => {
  console.error('[Worker] Promesa rechazada:', reason);
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
