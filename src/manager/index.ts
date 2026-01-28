/**
 * Bot Manager - Punto de Entrada
 *
 * Plataforma Multi-Tenant para bots de WhatsApp
 *
 * Uso:
 *   npm run manager
 *
 * Variables de entorno opcionales:
 *   MANAGER_PORT=4000          Puerto del API
 *   STORAGE_PATH=./storage     Ruta de almacenamiento
 *   CLIENTS_CONFIG=./config/clients.json
 *   AUTO_START=true            Iniciar bots al arrancar
 */

import { BotManager } from './BotManager.js';
import { ApiServer } from './ApiServer.js';

// ============================================
// CONFIGURACIÓN DESDE ENV
// ============================================

const config = {
  managerPort: parseInt(process.env.MANAGER_PORT || '4000', 10),
  storageBasePath: process.env.STORAGE_PATH || './storage',
  clientsConfigPath: process.env.CLIENTS_CONFIG || './config/clients.json',
  workerScriptPath: process.env.WORKER_SCRIPT || './dist/worker/bot.js',
  autoStartOnBoot: process.env.AUTO_START !== 'false',
  healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
  maxRestartAttempts: parseInt(process.env.MAX_RESTART_ATTEMPTS || '3', 10)
};

// ============================================
// BANNER
// ============================================

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     ██████╗  ██████╗ ████████╗    ███╗   ███╗ ██████╗ ██████╗║
║     ██╔══██╗██╔═══██╗╚══██╔══╝    ████╗ ████║██╔════╝ ██╔══██║
║     ██████╔╝██║   ██║   ██║       ██╔████╔██║██║  ███╗██████╔║
║     ██╔══██╗██║   ██║   ██║       ██║╚██╔╝██║██║   ██║██╔══██║
║     ██████╔╝╚██████╔╝   ██║       ██║ ╚═╝ ██║╚██████╔╝██║  ██║
║     ╚═════╝  ╚═════╝    ╚═╝       ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═║
║                                                              ║
║              Multi-Tenant WhatsApp Bot Manager               ║
║                        v1.0.0                                ║
╚══════════════════════════════════════════════════════════════╝
`);

// ============================================
// INICIALIZACIÓN
// ============================================

async function main(): Promise<void> {
  console.log('[Main] Configuración:');
  console.log(`  - Puerto Manager: ${config.managerPort}`);
  console.log(`  - Storage: ${config.storageBasePath}`);
  console.log(`  - Clientes Config: ${config.clientsConfigPath}`);
  console.log(`  - Worker Script: ${config.workerScriptPath}`);
  console.log(`  - Auto Start: ${config.autoStartOnBoot}`);
  console.log('');

  // Crear instancia del manager
  const manager = new BotManager(config);

  // Crear servidor API
  const api = new ApiServer(manager);

  // Iniciar API
  api.start();

  // Iniciar manager (arranca bots si autoStartOnBoot)
  await manager.start();

  console.log('[Main] Sistema listo');
}

// ============================================
// MANEJO DE SEÑALES
// ============================================

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[Main] Recibido ${signal}, iniciando shutdown graceful...`);

  // El manager se encargará de detener todos los bots
  // No tenemos referencia directa aquí, pero los procesos hijos
  // recibirán SIGTERM automáticamente

  setTimeout(() => {
    console.log('[Main] Timeout de shutdown, forzando salida');
    process.exit(1);
  }, 10000);

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('[Main] Excepción no capturada:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Promesa rechazada no manejada:', reason);
  process.exit(1);
});

// ============================================
// EJECUTAR
// ============================================

main().catch((error) => {
  console.error('[Main] Error fatal:', error);
  process.exit(1);
});
