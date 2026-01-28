/**
 * Tipos e interfaces para el Sistema Multi-Tenant
 * Bot Manager - Plataforma Escalable
 */

// ============================================
// CONFIGURACIÓN DE CLIENTES
// ============================================

export type ProviderType = 'baileys' | 'meta';

export interface MetaConfig {
  jwtToken: string;      // Access Token de Meta
  numberId: string;      // Phone Number ID
  verifyToken: string;   // Verify Token para webhook
  version?: string;      // Version de API (default: v21.0)
}

export interface ClientConfig {
  nit: string;           // ID único del cliente (NIT empresarial)
  puerto: number;        // Puerto donde corre el bot
  nombre: string;        // Nombre visible del cliente/empresa
  provider: ProviderType; // Tipo de provider: 'baileys' | 'meta'
  webhookUrl?: string;   // URL base del backend PHP (opcional)
  metaConfig?: MetaConfig; // Configuración de Meta (requerida si provider='meta')
  activo: boolean;       // Si el bot debe estar activo
  createdAt?: string;    // Fecha de creación
  updatedAt?: string;    // Última actualización
}

export interface ClientsDatabase {
  version: string;
  clients: ClientConfig[];
}

// ============================================
// ESTADO DE LOS BOTS
// ============================================

export type BotStatus = 'STARTING' | 'ONLINE' | 'OFFLINE' | 'ERROR' | 'AUTHENTICATING';

export interface BotInstance {
  nit: string;
  puerto: number;
  nombre: string;
  status: BotStatus;
  pid?: number;              // Process ID del worker
  qrPath?: string;           // Ruta al QR actual
  sessionPath?: string;      // Ruta a la sesión
  lastError?: string;        // Último error si existe
  startedAt?: Date;          // Cuándo inició
  authenticatedAt?: Date;    // Cuándo se autenticó
}

export interface ManagerState {
  bots: Map<string, BotInstance>;  // nit -> BotInstance
  startedAt: Date;
}

// ============================================
// API RESPONSES
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface ClientStatusResponse {
  nit: string;
  nombre: string;
  puerto: number;
  status: BotStatus;
  authenticated: boolean;
  hasQr: boolean;
  uptime?: number;  // segundos desde que inició
}

export interface ManagerInfoResponse {
  version: string;
  uptime: number;
  totalClients: number;
  onlineClients: number;
  offlineClients: number;
}

// ============================================
// EVENTOS INTER-PROCESO
// ============================================

export type WorkerEventType =
  | 'STATUS_CHANGE'
  | 'QR_GENERATED'
  | 'AUTHENTICATED'
  | 'ERROR'
  | 'MESSAGE_SENT'
  | 'READY';

export interface WorkerMessage {
  type: WorkerEventType;
  nit: string;
  data?: unknown;
  timestamp: string;
}

export interface ManagerCommand {
  action: 'START' | 'STOP' | 'RESTART' | 'STATUS';
  nit: string;
}

// ============================================
// REQUESTS DEL BOT (compatibilidad con backend PHP)
// ============================================

export interface MessageRequest {
  number: string;
  message: string;
  urlMedia?: string;
}

export interface Answer {
  option: number;
  action: string;
  message: string;
}

export interface QuestionRequest {
  number: string;
  message: string[];
  answers: Answer[];
}

// ============================================
// CONFIGURACIÓN DEL SISTEMA
// ============================================

export interface ManagerConfig {
  managerPort: number;           // Puerto del API del Manager
  storageBasePath: string;       // Ruta base para storage/
  clientsConfigPath: string;     // Ruta al clients.json
  workerBaileysPath: string;     // Ruta al script del worker Baileys
  workerMetaPath: string;        // Ruta al script del worker Meta
  autoStartOnBoot: boolean;      // Iniciar bots al arrancar el manager
  healthCheckInterval: number;   // Intervalo de health check en ms
  maxRestartAttempts: number;    // Máximo intentos de reinicio por bot
}

export const DEFAULT_MANAGER_CONFIG: ManagerConfig = {
  managerPort: 4000,
  storageBasePath: './storage',
  clientsConfigPath: './config/clients.json',
  workerBaileysPath: './dist/worker/bot.js',
  workerMetaPath: './dist/worker/bot-meta.js',
  autoStartOnBoot: true,
  healthCheckInterval: 30000,
  maxRestartAttempts: 3
};
