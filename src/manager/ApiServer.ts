/**
 * ApiServer - API REST para gestión del Bot Manager
 *
 * Endpoints:
 * - GET  /                    - Dashboard HTML
 * - GET  /api/info            - Información del manager
 * - GET  /api/clients         - Listar todos los clientes
 * - POST /api/clients         - Crear nuevo cliente
 * - GET  /api/clients/:nit    - Estado de un cliente
 * - PUT  /api/clients/:nit    - Actualizar cliente
 * - DELETE /api/clients/:nit  - Eliminar cliente
 * - POST /api/clients/:nit/start   - Iniciar bot
 * - POST /api/clients/:nit/stop    - Detener bot
 * - POST /api/clients/:nit/restart - Reiniciar bot
 * - GET  /api/clients/:nit/qr      - Obtener imagen QR
 * - POST /api/clients/:nit/clear-session - Limpiar sesión
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { BotManager } from './BotManager.js';
import type { ApiResponse, ClientConfig, ClientStatusResponse } from './types.js';

export class ApiServer {
  private app: Express;
  private manager: BotManager;
  private port: number;

  constructor(manager: BotManager) {
    this.manager = manager;
    this.port = manager.getConfig().managerPort;
    this.app = express();

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Configura middleware de Express
   */
  private setupMiddleware(): void {
    // JSON body parser
    this.app.use(express.json());

    // CORS simple
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Logging de requests
    this.app.use((req, res, next) => {
      console.log(`[API] ${req.method} ${req.path}`);
      next();
    });

    // Servir archivos estáticos (dashboard)
    const publicPath = resolve('./public');
    if (existsSync(publicPath)) {
      this.app.use(express.static(publicPath));
    }
  }

  /**
   * Configura todas las rutas
   */
  private setupRoutes(): void {
    // ============================================
    // DASHBOARD
    // ============================================

    this.app.get('/', (req, res) => {
      const dashboardPath = resolve('./public/index.html');
      if (existsSync(dashboardPath)) {
        res.sendFile(dashboardPath);
      } else {
        // Si no existe el dashboard, mostrar JSON
        res.json(this.manager.getManagerInfo());
      }
    });

    // ============================================
    // INFO DEL MANAGER
    // ============================================

    this.app.get('/api/info', (req, res) => {
      this.sendSuccess(res, this.manager.getManagerInfo());
    });

    // ============================================
    // CLIENTES - CRUD
    // ============================================

    /**
     * GET /api/clients - Listar todos los clientes con estado
     */
    this.app.get('/api/clients', (req, res) => {
      const bots = this.manager.getAllBotsStatus();
      const response: ClientStatusResponse[] = bots.map(bot => ({
        nit: bot.nit,
        nombre: bot.nombre,
        puerto: bot.puerto,
        status: bot.status,
        authenticated: bot.status === 'ONLINE',
        hasQr: this.manager.hasQr(bot.nit),
        uptime: bot.startedAt
          ? Math.floor((Date.now() - bot.startedAt.getTime()) / 1000)
          : undefined
      }));

      this.sendSuccess(res, response);
    });

    /**
     * POST /api/clients - Crear nuevo cliente
     */
    this.app.post('/api/clients', async (req, res) => {
      try {
        const { nit, puerto, nombre, webhookUrl, autoStart = true } = req.body;

        // Validaciones
        if (!nit || !puerto || !nombre) {
          return this.sendError(res, 'nit, puerto y nombre son requeridos', 400);
        }

        if (typeof puerto !== 'number' || puerto < 1024 || puerto > 65535) {
          return this.sendError(res, 'puerto debe ser un número entre 1024 y 65535', 400);
        }

        const store = this.manager.getClientStore();

        // Crear cliente
        const newClient = store.add({
          nit: String(nit),
          puerto,
          nombre,
          webhookUrl,
          activo: true
        });

        // Auto-iniciar si se solicita
        if (autoStart) {
          try {
            await this.manager.startBot(newClient.nit);
          } catch (startError) {
            console.error(`[API] Error auto-iniciando bot ${nit}:`, startError);
            // No fallar la creación, solo advertir
          }
        }

        const botStatus = this.manager.getBotStatus(newClient.nit);

        this.sendSuccess(res, {
          client: newClient,
          status: botStatus?.status || 'OFFLINE',
          message: `Cliente ${nombre} creado exitosamente`
        }, 201);

      } catch (error) {
        this.sendError(res, error instanceof Error ? error.message : 'Error creando cliente', 400);
      }
    });

    /**
     * GET /api/clients/:nit - Obtener estado de un cliente
     */
    this.app.get('/api/clients/:nit', (req, res) => {
      const { nit } = req.params;
      const bot = this.manager.getBotStatus(nit);

      if (!bot) {
        return this.sendError(res, `Cliente ${nit} no encontrado`, 404);
      }

      const response: ClientStatusResponse = {
        nit: bot.nit,
        nombre: bot.nombre,
        puerto: bot.puerto,
        status: bot.status,
        authenticated: bot.status === 'ONLINE',
        hasQr: this.manager.hasQr(bot.nit),
        uptime: bot.startedAt
          ? Math.floor((Date.now() - bot.startedAt.getTime()) / 1000)
          : undefined
      };

      this.sendSuccess(res, response);
    });

    /**
     * PUT /api/clients/:nit - Actualizar cliente
     */
    this.app.put('/api/clients/:nit', async (req, res) => {
      try {
        const { nit } = req.params;
        const { puerto, nombre, webhookUrl, activo } = req.body;

        const store = this.manager.getClientStore();

        if (!store.exists(nit)) {
          return this.sendError(res, `Cliente ${nit} no encontrado`, 404);
        }

        const updates: Partial<ClientConfig> = {};
        if (puerto !== undefined) updates.puerto = puerto;
        if (nombre !== undefined) updates.nombre = nombre;
        if (webhookUrl !== undefined) updates.webhookUrl = webhookUrl;
        if (activo !== undefined) updates.activo = activo;

        const updated = store.update(nit, updates);

        // Si cambió el puerto o se desactivó, reiniciar el bot
        if (puerto !== undefined || activo === false) {
          await this.manager.stopBot(nit);
          if (activo !== false) {
            await this.manager.startBot(nit);
          }
        }

        this.sendSuccess(res, {
          client: updated,
          message: 'Cliente actualizado exitosamente'
        });

      } catch (error) {
        this.sendError(res, error instanceof Error ? error.message : 'Error actualizando cliente', 400);
      }
    });

    /**
     * DELETE /api/clients/:nit - Eliminar cliente
     */
    this.app.delete('/api/clients/:nit', async (req, res) => {
      try {
        const { nit } = req.params;
        const store = this.manager.getClientStore();

        if (!store.exists(nit)) {
          return this.sendError(res, `Cliente ${nit} no encontrado`, 404);
        }

        // Detener el bot primero
        await this.manager.stopBot(nit);

        // Eliminar de la configuración
        store.delete(nit);

        this.sendSuccess(res, { message: `Cliente ${nit} eliminado exitosamente` });

      } catch (error) {
        this.sendError(res, error instanceof Error ? error.message : 'Error eliminando cliente', 500);
      }
    });

    // ============================================
    // CONTROL DE BOTS
    // ============================================

    /**
     * POST /api/clients/:nit/start - Iniciar bot
     */
    this.app.post('/api/clients/:nit/start', async (req, res) => {
      try {
        const { nit } = req.params;
        const bot = await this.manager.startBot(nit);

        this.sendSuccess(res, {
          nit: bot.nit,
          status: bot.status,
          message: `Bot ${nit} iniciado`
        });

      } catch (error) {
        this.sendError(res, error instanceof Error ? error.message : 'Error iniciando bot', 500);
      }
    });

    /**
     * POST /api/clients/:nit/stop - Detener bot
     */
    this.app.post('/api/clients/:nit/stop', async (req, res) => {
      try {
        const { nit } = req.params;
        await this.manager.stopBot(nit);

        this.sendSuccess(res, {
          nit,
          status: 'OFFLINE',
          message: `Bot ${nit} detenido`
        });

      } catch (error) {
        this.sendError(res, error instanceof Error ? error.message : 'Error deteniendo bot', 500);
      }
    });

    /**
     * POST /api/clients/:nit/restart - Reiniciar bot
     */
    this.app.post('/api/clients/:nit/restart', async (req, res) => {
      try {
        const { nit } = req.params;
        const bot = await this.manager.restartBot(nit);

        this.sendSuccess(res, {
          nit: bot.nit,
          status: bot.status,
          message: `Bot ${nit} reiniciado`
        });

      } catch (error) {
        this.sendError(res, error instanceof Error ? error.message : 'Error reiniciando bot', 500);
      }
    });

    // ============================================
    // QR Y SESIONES
    // ============================================

    /**
     * GET /api/clients/:nit/qr - Obtener imagen QR
     */
    this.app.get('/api/clients/:nit/qr', (req, res) => {
      const { nit } = req.params;

      const qrPath = this.manager.getQrPath(nit);

      if (!existsSync(qrPath)) {
        return this.sendError(res, `QR no disponible para ${nit}. El bot puede estar autenticado o no iniciado.`, 404);
      }

      // Enviar imagen
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(qrPath);
    });

    /**
     * GET /qrs/:nit - Alias corto para QR (compatible con tu request)
     */
    this.app.get('/qrs/:nit', (req, res) => {
      const { nit } = req.params;
      const qrPath = this.manager.getQrPath(nit);

      if (!existsSync(qrPath)) {
        return res.status(404).send('QR no disponible');
      }

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(qrPath);
    });

    /**
     * POST /api/clients/:nit/clear-session - Limpiar sesión (forzar nuevo QR)
     */
    this.app.post('/api/clients/:nit/clear-session', async (req, res) => {
      try {
        const { nit } = req.params;

        // Detener el bot primero
        await this.manager.stopBot(nit);

        // Limpiar sesión
        this.manager.clearClientSession(nit);

        // Reiniciar para generar nuevo QR
        await this.manager.startBot(nit);

        this.sendSuccess(res, {
          nit,
          message: `Sesión limpiada. Nuevo QR generándose...`
        });

      } catch (error) {
        this.sendError(res, error instanceof Error ? error.message : 'Error limpiando sesión', 500);
      }
    });

    // ============================================
    // ERROR HANDLER
    // ============================================

    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('[API] Error:', err);
      this.sendError(res, 'Error interno del servidor', 500);
    });

    // 404 handler
    this.app.use((req, res) => {
      this.sendError(res, `Ruta no encontrada: ${req.method} ${req.path}`, 404);
    });
  }

  /**
   * Helper para enviar respuestas exitosas
   */
  private sendSuccess<T>(res: Response, data: T, status: number = 200): void {
    const response: ApiResponse<T> = {
      success: true,
      data,
      timestamp: new Date().toISOString()
    };
    res.status(status).json(response);
  }

  /**
   * Helper para enviar errores
   */
  private sendError(res: Response, message: string, status: number = 500): void {
    const response: ApiResponse = {
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    };
    res.status(status).json(response);
  }

  /**
   * Inicia el servidor
   */
  start(): void {
    this.app.listen(this.port, () => {
      console.log('='.repeat(60));
      console.log(`[API] Bot Manager API corriendo en puerto ${this.port}`);
      console.log(`[API] Dashboard: http://localhost:${this.port}`);
      console.log(`[API] API Base: http://localhost:${this.port}/api`);
      console.log('='.repeat(60));
    });
  }

  /**
   * Obtiene la instancia de Express (para testing)
   */
  getApp(): Express {
    return this.app;
  }
}
