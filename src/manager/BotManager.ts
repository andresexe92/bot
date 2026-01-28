/**
 * BotManager - Orquestador Central de Bots Multi-Tenant
 *
 * Responsabilidades:
 * - Leer configuración de clientes
 * - Spawnar/detener instancias de bots (workers)
 * - Monitorear estado de los bots
 * - Centralizar almacenamiento de QRs y sesiones
 * - Exponer API REST para gestión
 */

import { fork, ChildProcess } from 'child_process';
import { existsSync, mkdirSync, rmSync, copyFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { ClientStore } from './ClientStore.js';
import type {
  ClientConfig,
  BotInstance,
  BotStatus,
  ManagerConfig,
  WorkerMessage,
  DEFAULT_MANAGER_CONFIG
} from './types.js';

export class BotManager {
  private config: ManagerConfig;
  private clientStore: ClientStore;
  private bots: Map<string, BotInstance> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private restartAttempts: Map<string, number> = new Map();
  private startedAt: Date;
  private healthCheckTimer?: ReturnType<typeof setInterval>;

  constructor(config: Partial<ManagerConfig> = {}) {
    // Merge con configuración por defecto
    this.config = {
      managerPort: config.managerPort ?? 4000,
      storageBasePath: config.storageBasePath ?? './storage',
      clientsConfigPath: config.clientsConfigPath ?? './config/clients.json',
      workerBaileysPath: config.workerBaileysPath ?? './dist/worker/bot.js',
      workerMetaPath: config.workerMetaPath ?? './dist/worker/bot-meta.js',
      autoStartOnBoot: config.autoStartOnBoot ?? true,
      healthCheckInterval: config.healthCheckInterval ?? 30000,
      maxRestartAttempts: config.maxRestartAttempts ?? 3
    };

    this.startedAt = new Date();
    this.ensureStorageStructure();
    this.clientStore = new ClientStore(this.config.clientsConfigPath);
  }

  /**
   * Asegura que la estructura de storage exista
   */
  private ensureStorageStructure(): void {
    const storagePath = resolve(this.config.storageBasePath);

    if (!existsSync(storagePath)) {
      mkdirSync(storagePath, { recursive: true });
      console.log(`[BotManager] Directorio storage creado: ${storagePath}`);
    }
  }

  /**
   * Obtiene la ruta de storage para un cliente específico
   */
  getClientStoragePath(nit: string): string {
    const path = resolve(this.config.storageBasePath, nit);
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
    return path;
  }

  /**
   * Obtiene la ruta del QR para un cliente
   */
  getQrPath(nit: string): string {
    return join(this.getClientStoragePath(nit), 'qr.png');
  }

  /**
   * Obtiene la ruta de sesiones para un cliente
   */
  getSessionPath(nit: string): string {
    return join(this.getClientStoragePath(nit), 'sessions');
  }

  /**
   * Inicia el BotManager
   */
  async start(): Promise<void> {
    console.log('='.repeat(60));
    console.log('[BotManager] Iniciando Bot Manager Multi-Tenant');
    console.log(`[BotManager] Puerto del Manager: ${this.config.managerPort}`);
    console.log(`[BotManager] Storage: ${resolve(this.config.storageBasePath)}`);
    console.log('='.repeat(60));

    if (this.config.autoStartOnBoot) {
      await this.startAllActiveBots();
    }

    // Iniciar health check periódico
    this.startHealthCheck();
  }

  /**
   * Inicia todos los bots activos
   */
  async startAllActiveBots(): Promise<void> {
    const activeClients = this.clientStore.getActive();
    console.log(`[BotManager] Iniciando ${activeClients.length} bots activos...`);

    for (const client of activeClients) {
      try {
        await this.startBot(client.nit);
        // Pequeña pausa entre inicios para evitar sobrecarga
        await this.sleep(1000);
      } catch (error) {
        console.error(`[BotManager] Error iniciando bot ${client.nit}:`, error);
      }
    }
  }

  /**
   * Inicia un bot específico
   */
  async startBot(nit: string): Promise<BotInstance> {
    const client = this.clientStore.get(nit);
    if (!client) {
      throw new Error(`Cliente ${nit} no encontrado`);
    }

    // Verificar si ya está corriendo
    if (this.processes.has(nit)) {
      const existing = this.bots.get(nit);
      if (existing && existing.status !== 'OFFLINE' && existing.status !== 'ERROR') {
        console.log(`[BotManager] Bot ${nit} ya está corriendo`);
        return existing;
      }
      // Si está en error u offline, detenerlo primero
      await this.stopBot(nit);
    }

    console.log(`[BotManager] Iniciando bot: ${client.nombre} (NIT: ${nit}, Puerto: ${client.puerto})`);

    // Crear instancia inicial
    const instance: BotInstance = {
      nit: client.nit,
      puerto: client.puerto,
      nombre: client.nombre,
      status: 'STARTING',
      qrPath: this.getQrPath(nit),
      sessionPath: this.getSessionPath(nit),
      startedAt: new Date()
    };

    this.bots.set(nit, instance);

    // Spawnar el proceso worker
    try {
      await this.spawnWorker(client, instance);
    } catch (error) {
      instance.status = 'ERROR';
      instance.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }

    return instance;
  }

  /**
   * Spawna un proceso worker para un bot
   */
  private async spawnWorker(client: ClientConfig, instance: BotInstance): Promise<void> {
    // Seleccionar worker según el tipo de provider
    const providerType = client.provider || 'baileys';
    const workerPath = providerType === 'meta'
      ? resolve(this.config.workerMetaPath)
      : resolve(this.config.workerBaileysPath);

    console.log(`[BotManager] Provider: ${providerType}, Worker: ${workerPath}`);

    if (!existsSync(workerPath)) {
      throw new Error(`Worker script no encontrado: ${workerPath}`);
    }

    // Variables de entorno base para el worker
    const workerEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      BOT_NIT: client.nit,
      BOT_PUERTO: String(client.puerto),
      BOT_NOMBRE: client.nombre,
      BOT_WEBHOOK_URL: client.webhookUrl || '',
      BOT_STORAGE_PATH: this.getClientStoragePath(client.nit),
      BOT_SESSION_PATH: this.getSessionPath(client.nit),
      BOT_QR_PATH: this.getQrPath(client.nit)
    };

    // Agregar variables de Meta si el provider es meta
    if (providerType === 'meta' && client.metaConfig) {
      workerEnv.META_JWT_TOKEN = client.metaConfig.jwtToken;
      workerEnv.META_NUMBER_ID = client.metaConfig.numberId;
      workerEnv.META_VERIFY_TOKEN = client.metaConfig.verifyToken;
      workerEnv.META_VERSION = client.metaConfig.version || 'v21.0';
    }

    const child = fork(workerPath, [], {
      env: workerEnv,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    instance.pid = child.pid;
    this.processes.set(client.nit, child);

    // Manejar mensajes del worker
    child.on('message', (msg: WorkerMessage) => {
      this.handleWorkerMessage(client.nit, msg);
    });

    // Manejar salida del proceso
    child.on('exit', (code, signal) => {
      console.log(`[BotManager] Worker ${client.nit} terminó (code: ${code}, signal: ${signal})`);
      this.handleWorkerExit(client.nit, code, signal);
    });

    // Manejar errores
    child.on('error', (error) => {
      console.error(`[BotManager] Error en worker ${client.nit}:`, error);
      instance.status = 'ERROR';
      instance.lastError = error.message;
    });

    // Capturar stdout/stderr del worker
    child.stdout?.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        console.log(`[Worker:${client.nit}] ${line}`);
      }
    });

    child.stderr?.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        console.error(`[Worker:${client.nit}:ERROR] ${line}`);
      }
    });

    console.log(`[BotManager] Worker spawneado para ${client.nit} (PID: ${child.pid})`);
  }

  /**
   * Maneja mensajes recibidos de un worker
   */
  private handleWorkerMessage(nit: string, msg: WorkerMessage): void {
    const instance = this.bots.get(nit);
    if (!instance) return;

    console.log(`[BotManager] Mensaje de ${nit}: ${msg.type}`);

    switch (msg.type) {
      case 'READY':
        instance.status = 'AUTHENTICATING';
        break;

      case 'QR_GENERATED':
        instance.status = 'AUTHENTICATING';
        console.log(`[BotManager] QR generado para ${nit}: ${instance.qrPath}`);
        break;

      case 'AUTHENTICATED':
        instance.status = 'ONLINE';
        instance.authenticatedAt = new Date();
        this.restartAttempts.set(nit, 0); // Reset intentos de reinicio
        console.log(`[BotManager] Bot ${nit} autenticado exitosamente`);
        break;

      case 'STATUS_CHANGE':
        if (typeof msg.data === 'object' && msg.data && 'status' in msg.data) {
          instance.status = (msg.data as { status: BotStatus }).status;
        }
        break;

      case 'ERROR':
        instance.status = 'ERROR';
        if (typeof msg.data === 'object' && msg.data && 'message' in msg.data) {
          instance.lastError = (msg.data as { message: string }).message;
        }
        break;

      case 'MESSAGE_SENT':
        // Log opcional para debugging
        break;
    }
  }

  /**
   * Maneja la salida de un worker
   */
  private handleWorkerExit(nit: string, code: number | null, signal: string | null): void {
    const instance = this.bots.get(nit);
    if (instance) {
      instance.status = 'OFFLINE';
      instance.pid = undefined;
    }

    this.processes.delete(nit);

    // Intentar reinicio automático si no fue una salida limpia
    if (code !== 0 && signal !== 'SIGTERM') {
      const attempts = this.restartAttempts.get(nit) || 0;

      if (attempts < this.config.maxRestartAttempts) {
        this.restartAttempts.set(nit, attempts + 1);
        console.log(`[BotManager] Reiniciando bot ${nit} (intento ${attempts + 1}/${this.config.maxRestartAttempts})`);

        setTimeout(() => {
          this.startBot(nit).catch(err => {
            console.error(`[BotManager] Fallo al reiniciar ${nit}:`, err);
          });
        }, 5000 * (attempts + 1)); // Backoff exponencial
      } else {
        console.error(`[BotManager] Bot ${nit} alcanzó máximo de intentos de reinicio`);
        if (instance) {
          instance.status = 'ERROR';
          instance.lastError = 'Máximo de intentos de reinicio alcanzado';
        }
      }
    }
  }

  /**
   * Detiene un bot específico
   */
  async stopBot(nit: string): Promise<void> {
    const process = this.processes.get(nit);
    const instance = this.bots.get(nit);

    if (process) {
      console.log(`[BotManager] Deteniendo bot ${nit}...`);
      process.kill('SIGTERM');

      // Esperar que termine gracefully
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (process.killed === false) {
            process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        process.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.processes.delete(nit);
    }

    if (instance) {
      instance.status = 'OFFLINE';
      instance.pid = undefined;
    }

    console.log(`[BotManager] Bot ${nit} detenido`);
  }

  /**
   * Reinicia un bot
   */
  async restartBot(nit: string): Promise<BotInstance> {
    console.log(`[BotManager] Reiniciando bot ${nit}...`);
    await this.stopBot(nit);
    await this.sleep(2000);
    return this.startBot(nit);
  }

  /**
   * Detiene todos los bots
   */
  async stopAllBots(): Promise<void> {
    console.log('[BotManager] Deteniendo todos los bots...');

    const stopPromises = Array.from(this.processes.keys()).map(nit =>
      this.stopBot(nit).catch(err => console.error(`Error deteniendo ${nit}:`, err))
    );

    await Promise.all(stopPromises);
    console.log('[BotManager] Todos los bots detenidos');
  }

  /**
   * Health check periódico
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      for (const [nit, instance] of this.bots) {
        const process = this.processes.get(nit);

        if (!process || process.killed) {
          if (instance.status !== 'OFFLINE' && instance.status !== 'ERROR') {
            instance.status = 'OFFLINE';
            console.log(`[BotManager] Health check: ${nit} detectado como OFFLINE`);
          }
        }
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Detiene el health check
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Cierra el manager gracefully
   */
  async shutdown(): Promise<void> {
    console.log('[BotManager] Iniciando shutdown...');
    this.stopHealthCheck();
    await this.stopAllBots();
    console.log('[BotManager] Shutdown completo');
  }

  // ============================================
  // MÉTODOS DE ACCESO (para el API)
  // ============================================

  /**
   * Obtiene el estado de todos los bots
   */
  getAllBotsStatus(): BotInstance[] {
    // Incluir también clientes que no están corriendo
    const allClients = this.clientStore.getAll();
    const statuses: BotInstance[] = [];

    for (const client of allClients) {
      const running = this.bots.get(client.nit);
      if (running) {
        statuses.push(running);
      } else {
        statuses.push({
          nit: client.nit,
          puerto: client.puerto,
          nombre: client.nombre,
          status: 'OFFLINE',
          qrPath: this.getQrPath(client.nit),
          sessionPath: this.getSessionPath(client.nit)
        });
      }
    }

    return statuses;
  }

  /**
   * Obtiene el estado de un bot específico
   */
  getBotStatus(nit: string): BotInstance | undefined {
    const running = this.bots.get(nit);
    if (running) return running;

    const client = this.clientStore.get(nit);
    if (client) {
      return {
        nit: client.nit,
        puerto: client.puerto,
        nombre: client.nombre,
        status: 'OFFLINE',
        qrPath: this.getQrPath(client.nit),
        sessionPath: this.getSessionPath(client.nit)
      };
    }

    return undefined;
  }

  /**
   * Verifica si el QR existe para un cliente
   */
  hasQr(nit: string): boolean {
    const qrPath = this.getQrPath(nit);
    return existsSync(qrPath);
  }

  /**
   * Obtiene información general del manager
   */
  getManagerInfo() {
    const all = this.getAllBotsStatus();
    const online = all.filter(b => b.status === 'ONLINE').length;

    return {
      version: '1.0.0',
      uptime: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
      totalClients: all.length,
      onlineClients: online,
      offlineClients: all.length - online,
      managerPort: this.config.managerPort
    };
  }

  /**
   * Acceso al ClientStore
   */
  getClientStore(): ClientStore {
    return this.clientStore;
  }

  /**
   * Configuración del manager
   */
  getConfig(): ManagerConfig {
    return this.config;
  }

  /**
   * Elimina datos de sesión de un cliente (para forzar nuevo QR)
   */
  clearClientSession(nit: string): void {
    const sessionPath = this.getSessionPath(nit);
    const qrPath = this.getQrPath(nit);

    if (existsSync(sessionPath)) {
      rmSync(sessionPath, { recursive: true, force: true });
      mkdirSync(sessionPath, { recursive: true });
      console.log(`[BotManager] Sesión eliminada para ${nit}`);
    }

    if (existsSync(qrPath)) {
      rmSync(qrPath, { force: true });
      console.log(`[BotManager] QR eliminado para ${nit}`);
    }
  }

  // Utilidad
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
