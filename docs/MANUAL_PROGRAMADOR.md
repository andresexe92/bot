# Manual del Programador - Bot Manager Multi-Tenant

## Tabla de Contenidos

1. [Introduccion](#introduccion)
2. [Arquitectura](#arquitectura)
3. [Instalacion](#instalacion)
4. [Configuracion](#configuracion)
5. [API Reference](#api-reference)
6. [Solucion al Error ENOENT de QRs](#solucion-al-error-enoent-de-qrs)
7. [Depuracion](#depuracion)
8. [Escalabilidad](#escalabilidad)
9. [Integracion con Backend PHP](#integracion-con-backend-php)

---

## Introduccion

Bot Manager es una plataforma multi-tenant que permite gestionar multiples bots de WhatsApp desde un unico sistema centralizado. Elimina la necesidad de copiar carpetas manualmente para cada cliente.

### Caracteristicas Principales

- **Orquestacion Centralizada**: Un solo Manager controla N instancias de bots
- **API REST Completa**: Crear, iniciar, detener bots via HTTP
- **Dashboard Web**: Interfaz visual para administracion
- **QRs Centralizados**: Almacenamiento organizado por NIT en `storage/`
- **Auto-restart**: Recuperacion automatica de bots caidos
- **Logica Stateless**: Compatible con tu backend PHP existente

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        BOT MANAGER                               │
│                     (Puerto 4000)                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  API Server  │  │ ClientStore  │  │ BotManager   │          │
│  │  (Express)   │  │   (JSON)     │  │ (Orquestador)│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                  │                  │                  │
│         │    ┌─────────────┴──────────────┐   │                  │
│         │    │     config/clients.json    │   │                  │
│         │    └────────────────────────────┘   │                  │
│         │                                     │                  │
│         │         fork() / spawn              │                  │
└─────────┼─────────────────────────────────────┼──────────────────┘
          │                                     │
          ▼                                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   BOT WORKER    │  │   BOT WORKER    │  │   BOT WORKER    │
│   (Puerto 3001) │  │   (Puerto 3002) │  │   (Puerto 3003) │
│   NIT: 123456   │  │   NIT: 789012   │  │   NIT: 345678   │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ - Baileys       │  │ - Baileys       │  │ - Baileys       │
│ - Express       │  │ - Express       │  │ - Express       │
│ - Queue         │  │ - Queue         │  │ - Queue         │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     storage/                                     │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  123456/        │  789012/        │  345678/                    │
│  ├── qr.png     │  ├── qr.png     │  ├── qr.png                 │
│  └── sessions/  │  └── sessions/  │  └── sessions/              │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

### Componentes

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| **BotManager** | `src/manager/BotManager.ts` | Orquesta workers, health checks |
| **ApiServer** | `src/manager/ApiServer.ts` | API REST + Dashboard |
| **ClientStore** | `src/manager/ClientStore.ts` | CRUD de clientes en JSON |
| **BotWorker** | `src/worker/bot.ts` | Instancia individual de bot |

---

## Instalacion

### Requisitos

- Node.js >= 18
- npm o yarn

### Pasos

```bash
# 1. Clonar/navegar al proyecto
cd /path/to/bot

# 2. Instalar dependencias
npm install

# 3. Compilar TypeScript
npm run build

# 4. Crear configuracion inicial (opcional, se auto-crea)
mkdir -p config storage

# 5. Iniciar el Manager
npm start
```

### Estructura de Carpetas Resultante

```
bot/
├── config/
│   └── clients.json          # Configuracion de clientes
├── dist/
│   ├── manager/              # Manager compilado
│   └── worker/               # Worker compilado
├── public/
│   └── index.html            # Dashboard
├── src/
│   ├── manager/              # Codigo fuente Manager
│   └── worker/               # Codigo fuente Worker
├── storage/                  # QRs y sesiones por NIT
│   └── {NIT}/
│       ├── qr.png
│       └── sessions/
├── package.json
├── tsconfig.json
├── rollup.manager.config.js
└── rollup.worker.config.js
```

---

## Configuracion

### Variables de Entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `MANAGER_PORT` | 4000 | Puerto del API Manager |
| `STORAGE_PATH` | ./storage | Ruta base de almacenamiento |
| `CLIENTS_CONFIG` | ./config/clients.json | Archivo de clientes |
| `WORKER_SCRIPT` | ./dist/worker/bot.js | Script del worker |
| `AUTO_START` | true | Iniciar bots al arrancar |
| `HEALTH_CHECK_INTERVAL` | 30000 | Intervalo health check (ms) |
| `MAX_RESTART_ATTEMPTS` | 3 | Max reintentos por bot |

### Archivo clients.json

```json
{
  "version": "1.0.0",
  "clients": [
    {
      "nit": "1028008009",
      "puerto": 3001,
      "nombre": "Mi Empresa",
      "webhookUrl": "https://api.miempresa.com",
      "activo": true,
      "createdAt": "2025-01-28T00:00:00.000Z"
    },
    {
      "nit": "9876543210",
      "puerto": 3002,
      "nombre": "Otra Empresa",
      "activo": true
    }
  ]
}
```

---

## API Reference

Base URL: `http://localhost:4000/api`

### Informacion del Manager

```http
GET /api/info
```

**Response:**
```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "uptime": 3600,
    "totalClients": 5,
    "onlineClients": 3,
    "offlineClients": 2,
    "managerPort": 4000
  }
}
```

### Listar Clientes

```http
GET /api/clients
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "nit": "1028008009",
      "nombre": "Mi Empresa",
      "puerto": 3001,
      "status": "ONLINE",
      "authenticated": true,
      "hasQr": false,
      "uptime": 1200
    }
  ]
}
```

### Crear Cliente

```http
POST /api/clients
Content-Type: application/json

{
  "nit": "1234567890",
  "puerto": 3005,
  "nombre": "Nueva Empresa",
  "webhookUrl": "https://api.nueva.com",
  "autoStart": true
}
```

### Obtener Estado de Cliente

```http
GET /api/clients/:nit
```

### Actualizar Cliente

```http
PUT /api/clients/:nit
Content-Type: application/json

{
  "nombre": "Nuevo Nombre",
  "webhookUrl": "https://nuevo.url.com"
}
```

### Eliminar Cliente

```http
DELETE /api/clients/:nit
```

### Iniciar Bot

```http
POST /api/clients/:nit/start
```

### Detener Bot

```http
POST /api/clients/:nit/stop
```

### Reiniciar Bot

```http
POST /api/clients/:nit/restart
```

### Obtener QR

```http
GET /api/clients/:nit/qr
```
Retorna imagen PNG del QR.

**Alias corto:**
```http
GET /qrs/:nit
```

### Limpiar Sesion (Forzar nuevo QR)

```http
POST /api/clients/:nit/clear-session
```

---

## Solucion al Error ENOENT de QRs

### El Problema

El error `ENOENT: no such file or directory` ocurria porque:

1. Baileys genera el QR con nombre basado en el parametro `name` del provider
2. El QR se guardaba en el directorio de trabajo actual (cwd)
3. Cuando se buscaba desde el Manager, las rutas no coincidian

### La Solucion Implementada

1. **Almacenamiento Centralizado**:
   ```
   storage/
   └── {NIT}/
       ├── qr.png           # QR estandarizado
       └── sessions/        # Sesion de Baileys
   ```

2. **Rutas Absolutas**: El Manager calcula rutas absolutas con `resolve()`:
   ```typescript
   getQrPath(nit: string): string {
     return join(this.getClientStoragePath(nit), 'qr.png');
   }
   ```

3. **Watcher de QRs**: El Worker detecta cuando Baileys genera un QR y lo copia a la ubicacion centralizada:
   ```typescript
   function setupQrWatcher(): void {
     // Busca QRs generados por Baileys y los copia a BOT_QR_PATH
     const checkQr = () => {
       for (const qrName of possibleQrNames) {
         if (existsSync(qrInCwd)) {
           copyFileSync(qrInCwd, BOT_QR_PATH);
         }
       }
     };
     setInterval(checkQr, 2000);
   }
   ```

4. **Variables de Entorno**: Cada Worker recibe su ruta de QR:
   ```typescript
   const workerEnv = {
     BOT_NIT: client.nit,
     BOT_QR_PATH: this.getQrPath(client.nit),
     BOT_SESSION_PATH: this.getSessionPath(client.nit)
   };
   ```

### Verificar la Solucion

```bash
# Ver QRs almacenados
ls -la storage/*/qr.png

# Ver sesiones
ls -la storage/*/sessions/

# Obtener QR via API
curl http://localhost:4000/qrs/1028008009 > qr.png
```

---

## Depuracion

### Logs del Manager

El Manager imprime logs prefijados:
- `[BotManager]` - Operaciones del orquestador
- `[API]` - Requests HTTP
- `[Worker:NIT]` - Output del worker con NIT

### Logs del Worker

Cada Worker imprime:
- `[Worker]` - Operaciones generales
- Errores de Baileys
- Mensajes enviados/recibidos

### Comandos Utiles

```bash
# Ver logs en tiempo real
npm run dev

# Verificar procesos de bots
ps aux | grep "bot.js"

# Verificar puertos en uso
netstat -tlnp | grep -E "300[0-9]|4000"

# Probar endpoint de health
curl http://localhost:3001/health

# Ver estado de todos los bots
curl http://localhost:4000/api/clients | jq
```

### Problemas Comunes

| Problema | Causa | Solucion |
|----------|-------|----------|
| QR no aparece | Bot ya autenticado | Limpiar sesion con `/clear-session` |
| Puerto en uso | Otro proceso | Cambiar puerto o matar proceso |
| Worker no inicia | Script no compilado | Ejecutar `npm run build` |
| Sesion invalida | Baileys corrupto | Eliminar `storage/{NIT}/sessions/` |

---

## Escalabilidad

### Horizontal (Multiples Servidores)

Para escalar a multiples servidores:

1. **Base de Datos Compartida**: Reemplazar `clients.json` por MySQL/PostgreSQL
2. **Redis para Estado**: Compartir estado entre Managers
3. **Load Balancer**: Nginx/HAProxy frente a los Managers
4. **Storage Compartido**: NFS o S3 para QRs y sesiones

### Vertical (Un Servidor)

Recomendaciones para un solo servidor:

| Bots | RAM | CPU |
|------|-----|-----|
| 1-5 | 2GB | 2 cores |
| 6-20 | 4GB | 4 cores |
| 21-50 | 8GB | 8 cores |

### Limites de WhatsApp

- **Rate Limit**: ~1 mensaje cada 3 segundos (ya implementado con queue)
- **Sesiones**: Una sesion por numero de WhatsApp
- **Bans**: Evitar mensajes masivos no solicitados

---

## Integracion con Backend PHP

### Enviar Mensaje desde PHP

```php
<?php
$nit = '1028008009';
$puerto = 3001;

$data = [
    'number' => '573001234567',
    'message' => 'Hola desde PHP!',
    'urlMedia' => 'https://ejemplo.com/imagen.jpg' // opcional
];

$ch = curl_init("http://localhost:{$puerto}/v1/messages");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
curl_close($ch);

echo $response; // {"status": "queued", "nit": "1028008009"}
```

### Enviar Pregunta con Opciones

```php
<?php
$data = [
    'number' => '573001234567',
    'message' => [
        '¿Como desea pagar?',
        '',
        '1. Efectivo',
        '2. Tarjeta',
        '3. Transferencia'
    ],
    'answers' => [
        [
            'option' => 1,
            'action' => 'https://api.miempresa.com/webhook/pago-efectivo',
            'message' => 'Perfecto, pago en efectivo.'
        ],
        [
            'option' => 2,
            'action' => 'https://api.miempresa.com/webhook/pago-tarjeta',
            'message' => 'Procesando pago con tarjeta...'
        ],
        [
            'option' => 3,
            'action' => 'https://api.miempresa.com/webhook/pago-transferencia',
            'message' => 'Aqui estan los datos de transferencia.'
        ]
    ]
];

// POST a http://localhost:3001/v1/question
```

### Webhook de Respuesta

El bot hace POST al `action` con:

```json
{
  "respuesta": 1
}
```

Tu backend PHP recibe esto y procesa la logica de negocio.

### Obtener QR para mostrar en POS

```php
<?php
$nit = '1028008009';

// Opcion 1: Desde el Manager
$qrUrl = "http://localhost:4000/qrs/{$nit}";

// Opcion 2: Directamente del bot
$puerto = 3001;
$qrUrl = "http://localhost:{$puerto}/..."; // No disponible directamente

// Mostrar en HTML
echo "<img src='{$qrUrl}' alt='QR WhatsApp'>";
```

### Verificar Estado del Bot desde PHP

```php
<?php
$nit = '1028008009';
$response = file_get_contents("http://localhost:4000/api/clients/{$nit}");
$data = json_decode($response, true);

if ($data['success'] && $data['data']['status'] === 'ONLINE') {
    echo "Bot conectado!";
} else {
    echo "Bot desconectado - mostrar QR";
}
```

---

## Scripts Disponibles

```bash
# Produccion
npm start           # Iniciar Manager
npm run manager     # Alias de start

# Desarrollo
npm run dev         # Manager con hot-reload
npm run dev:worker  # Worker individual (para debug)

# Build
npm run build       # Compilar todo
npm run build:manager
npm run build:worker

# Otros
npm run clean       # Limpiar dist/
npm run lint        # Verificar codigo
```

---

## Soporte

Para reportar bugs o sugerir mejoras, documentar:

1. Logs del Manager y Worker
2. Contenido de `config/clients.json`
3. Estado de `storage/` (sin datos sensibles)
4. Version de Node.js (`node -v`)
