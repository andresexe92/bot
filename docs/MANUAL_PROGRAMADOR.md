# Manual del Programador - Bot Manager Multi-Tenant

**Version:** 2.0.0
**Ultima actualizacion:** 2026-01-28

## Tabla de Contenidos

1. [Introduccion](#introduccion)
2. [Arquitectura](#arquitectura)
3. [Providers Disponibles](#providers-disponibles)
4. [Instalacion](#instalacion)
5. [Configuracion](#configuracion)
6. [API Reference](#api-reference)
7. [WhatsApp Business API (Meta)](#whatsapp-business-api-meta)
8. [Baileys Provider](#baileys-provider)
9. [Depuracion](#depuracion)
10. [Integracion con Backend PHP](#integracion-con-backend-php)
11. [Escalabilidad](#escalabilidad)
12. [Troubleshooting](#troubleshooting)

---

## Introduccion

Bot Manager es una plataforma multi-tenant que permite gestionar multiples bots de WhatsApp desde un unico sistema centralizado.

### Caracteristicas Principales

- **Multi-Tenant**: Un Manager controla N instancias de bots
- **Dual Provider**: Soporte para Baileys (no oficial) y Meta Cloud API (oficial)
- **API REST Completa**: CRUD de clientes via HTTP
- **Dashboard Web**: Interfaz visual de administracion
- **Auto-restart**: Recuperacion automatica de bots caidos
- **Logica Stateless**: Compatible con backends externos (PHP, etc.)

### Comparacion de Providers

| Caracteristica | Baileys | Meta Cloud API |
|---------------|---------|----------------|
| Tipo | No oficial | Oficial |
| Requiere QR | Si | No |
| Funciona en VPS | Problematico (Error 405) | Si |
| Costo | Gratis | Gratis hasta 1000 conv/mes |
| Estabilidad | Media | Alta |
| Grupos | Si | No |
| Verificacion | No | Si (negocio) |

**Recomendacion**: Usar **Meta Cloud API** para produccion en VPS.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BOT MANAGER (Puerto 4000)                    │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  API Server  │  │ ClientStore  │  │ BotManager   │              │
│  │  (Express)   │  │ (clients.json)│  │ (Orquestador)│              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│         │                                     │                      │
│         │              fork()                 │                      │
└─────────┼─────────────────────────────────────┼──────────────────────┘
          │                                     │
          ▼                                     ▼
┌─────────────────────┐          ┌─────────────────────┐
│   WORKER BAILEYS    │          │    WORKER META      │
│   (bot.js)          │          │    (bot-meta.js)    │
│   Puerto: 3001      │          │    Puerto: 3002     │
├─────────────────────┤          ├─────────────────────┤
│ - BaileysProvider   │          │ - MetaProvider      │
│ - Genera QR         │          │ - Webhook receiver  │
│ - WebSocket local   │          │ - Cloud API         │
└─────────┬───────────┘          └─────────┬───────────┘
          │                                 │
          ▼                                 ▼
┌─────────────────────┐          ┌─────────────────────┐
│   WhatsApp Web      │          │   Meta Cloud API    │
│   (via WebSocket)   │          │   (HTTPS oficial)   │
└─────────────────────┘          └─────────────────────┘
```

### Componentes

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| **BotManager** | `src/manager/BotManager.ts` | Orquesta workers, health checks |
| **ApiServer** | `src/manager/ApiServer.ts` | API REST + Dashboard |
| **ClientStore** | `src/manager/ClientStore.ts` | CRUD de clientes |
| **BotWorker Baileys** | `src/worker/bot.ts` | Bot con Baileys |
| **BotWorker Meta** | `src/worker/bot-meta.ts` | Bot con Meta API |
| **Types** | `src/manager/types.ts` | Interfaces TypeScript |

---

## Providers Disponibles

### 1. Meta Cloud API (Recomendado)

Provider oficial de WhatsApp Business. No tiene problemas de bloqueo de IP.

**Ventajas:**
- Funciona en cualquier VPS
- No requiere escanear QR
- API oficial y estable
- Soporte de Meta

**Desventajas:**
- Requiere verificacion de negocio
- No soporta grupos
- Templates obligatorios despues de 24h

### 2. Baileys

Provider no oficial que usa WhatsApp Web via WebSocket.

**Ventajas:**
- Gratis
- Soporta grupos
- Sin verificacion

**Desventajas:**
- Bloqueado en IPs de datacenter (Error 405)
- Requiere escanear QR
- Puede ser baneado

---

## Instalacion

### Requisitos

- Node.js >= 18
- npm >= 9
- (Para Meta) Cuenta de Meta Developers

### Pasos

```bash
# 1. Clonar/navegar al proyecto
cd /path/to/bot

# 2. Instalar dependencias
npm install

# 3. Compilar TypeScript
npm run build

# 4. Configurar clientes (ver seccion Configuracion)
nano config/clients.json

# 5. Iniciar el Manager
npm start
```

### Estructura de Carpetas

```
bot/
├── config/
│   └── clients.json              # Configuracion de clientes
├── dist/
│   ├── manager/                  # Manager compilado
│   └── worker/
│       ├── bot.js                # Worker Baileys
│       └── bot-meta.js           # Worker Meta
├── docs/
│   ├── MANUAL_PROGRAMADOR.md     # Este documento
│   └── WHATSAPP_BUSINESS_API_SETUP.md
├── public/
│   └── index.html                # Dashboard
├── src/
│   ├── manager/
│   │   ├── index.ts
│   │   ├── BotManager.ts
│   │   ├── ApiServer.ts
│   │   ├── ClientStore.ts
│   │   └── types.ts
│   └── worker/
│       ├── bot.ts                # Worker Baileys
│       └── bot-meta.ts           # Worker Meta
├── storage/                      # Datos por cliente
│   └── {NIT}/
│       ├── qr.png                # QR (solo Baileys)
│       └── sessions/             # Sesion
├── .env.example
├── package.json
├── tsconfig.json
├── rollup.manager.config.js
├── rollup.worker.config.js
└── rollup.worker-meta.config.js
```

---

## Configuracion

### Variables de Entorno (.env)

```env
# Manager
MANAGER_PORT=4000
STORAGE_PATH=./storage
CLIENTS_CONFIG=./config/clients.json
AUTO_START=true

# Meta (si usas provider meta)
META_JWT_TOKEN=EAAxxxxxxxx
META_NUMBER_ID=123456789012345
META_VERIFY_TOKEN=mi_secreto
META_VERSION=v21.0
```

### Archivo clients.json

```json
{
  "version": "1.0.0",
  "clients": [
    {
      "nit": "EMPRESA_META",
      "puerto": 3001,
      "nombre": "Mi Empresa (Meta)",
      "provider": "meta",
      "metaConfig": {
        "jwtToken": "EAAxxxxxxxxxxxxxxxx",
        "numberId": "123456789012345",
        "verifyToken": "mi_verify_token",
        "version": "v21.0"
      },
      "webhookUrl": "https://mi-backend.com",
      "activo": true
    },
    {
      "nit": "EMPRESA_BAILEYS",
      "puerto": 3002,
      "nombre": "Mi Empresa (Baileys)",
      "provider": "baileys",
      "webhookUrl": "https://mi-backend.com",
      "activo": false
    }
  ]
}
```

### Campos de ClientConfig

| Campo | Tipo | Requerido | Descripcion |
|-------|------|-----------|-------------|
| `nit` | string | Si | ID unico del cliente |
| `puerto` | number | Si | Puerto del worker (3001-65535) |
| `nombre` | string | Si | Nombre visible |
| `provider` | "baileys" \| "meta" | Si | Tipo de provider |
| `metaConfig` | object | Solo si provider=meta | Configuracion de Meta |
| `webhookUrl` | string | No | URL de tu backend |
| `activo` | boolean | Si | Si debe iniciar |

### Campos de MetaConfig

| Campo | Tipo | Requerido | Descripcion |
|-------|------|-----------|-------------|
| `jwtToken` | string | Si | Access Token de Meta |
| `numberId` | string | Si | Phone Number ID |
| `verifyToken` | string | Si | Token para webhook |
| `version` | string | No | Version API (default: v21.0) |

---

## API Reference

**Base URL:** `http://localhost:4000/api`

### Manager

#### GET /api/info
Informacion del manager.

```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "uptime": 3600,
    "totalClients": 5,
    "onlineClients": 3,
    "offlineClients": 2
  }
}
```

### Clientes

#### GET /api/clients
Lista todos los clientes con estado.

#### POST /api/clients
Crear nuevo cliente.

```json
{
  "nit": "NUEVO_CLIENTE",
  "puerto": 3005,
  "nombre": "Nuevo Cliente",
  "provider": "meta",
  "metaConfig": {
    "jwtToken": "EAAxxxx",
    "numberId": "123456",
    "verifyToken": "secreto"
  },
  "autoStart": true
}
```

#### GET /api/clients/:nit
Estado de un cliente.

#### PUT /api/clients/:nit
Actualizar cliente.

#### DELETE /api/clients/:nit
Eliminar cliente.

### Control de Bots

#### POST /api/clients/:nit/start
Iniciar bot.

#### POST /api/clients/:nit/stop
Detener bot.

#### POST /api/clients/:nit/restart
Reiniciar bot.

#### GET /api/clients/:nit/qr
Obtener QR (solo Baileys).

#### GET /qrs/:nit
Alias para obtener QR.

#### POST /api/clients/:nit/clear-session
Limpiar sesion (forzar nuevo QR).

### Endpoints del Worker

Cada worker expone en su puerto:

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/v1/messages` | Enviar mensaje |
| POST | `/v1/question` | Enviar pregunta interactiva |
| GET | `/health` | Health check |
| GET | `/status` | Estado detallado |

---

## WhatsApp Business API (Meta)

### Configuracion Paso a Paso

Ver documento completo: `docs/WHATSAPP_BUSINESS_API_SETUP.md`

### Resumen Rapido

1. Crear cuenta en [developers.facebook.com](https://developers.facebook.com)
2. Crear App tipo "Business"
3. Agregar producto "WhatsApp"
4. Obtener credenciales:
   - Phone Number ID
   - Access Token (System User para produccion)
5. Configurar webhook en tu dominio

### Precios (2025-2026)

| Tipo | Precio | Ejemplo |
|------|--------|---------|
| Service (usuario inicia) | GRATIS | Soporte al cliente |
| Marketing | ~$0.01-0.12/msg | Promociones |
| Utility | ~$0.004-0.08/msg | Confirmaciones |
| Authentication | ~$0.004-0.08/msg | OTPs |

**Tier gratuito:** 1000 conversaciones/mes iniciadas por usuarios.

---

## Baileys Provider

### Problemas Conocidos

#### Error 405 Connection Failure

**Causa:** WhatsApp bloquea IPs de datacenters (AWS, DigitalOcean, etc.)

**Soluciones:**
1. **Usar Meta Cloud API** (recomendado)
2. Usar proxy residencial
3. Correr en maquina local con IP residencial

#### QR No Se Genera

**Causas posibles:**
- Sesion existente (limpiar con `/clear-session`)
- Error de red
- Baileys desactualizado

### Cuando Usar Baileys

- Desarrollo local
- Pruebas
- Casos donde necesites grupos
- IP residencial disponible

---

## Depuracion

### Logs

```bash
# Manager logs
[BotManager] Iniciando bot: Mi Bot (NIT: 123, Puerto: 3001)
[BotManager] Provider: meta, Worker: ./dist/worker/bot-meta.js

# Worker Baileys logs
[Worker] Iniciando bot: Mi Bot
[Worker] BAILEYS connection.update: {"qr": "..."}

# Worker Meta logs
[Worker-Meta] Iniciando bot: Mi Bot
[Worker-Meta] Provider: Meta Cloud API v21.0
```

### Comandos Utiles

```bash
# Ver logs en tiempo real
npm run dev

# Verificar procesos
ps aux | grep "bot"

# Verificar puertos
netstat -tlnp | grep -E "300[0-9]|4000"

# Probar health
curl http://localhost:3001/health

# Ver todos los clientes
curl http://localhost:4000/api/clients | jq
```

---

## Integracion con Backend PHP

### Enviar Mensaje

```php
<?php
$puerto = 3001; // Puerto del worker

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

// {"status": "queued", "nit": "..."}
```

### Enviar Pregunta Interactiva

```php
<?php
$data = [
    'number' => '573001234567',
    'message' => [
        'Como desea pagar?',
        '1. Efectivo',
        '2. Tarjeta'
    ],
    'answers' => [
        ['option' => 1, 'action' => 'https://api.com/efectivo', 'message' => 'Pago en efectivo'],
        ['option' => 2, 'action' => 'https://api.com/tarjeta', 'message' => 'Pago con tarjeta']
    ]
];

// POST a http://localhost:3001/v1/question
```

### Verificar Estado

```php
<?php
$nit = 'MI_EMPRESA';
$response = file_get_contents("http://localhost:4000/api/clients/{$nit}");
$data = json_decode($response, true);

if ($data['success'] && $data['data']['status'] === 'ONLINE') {
    echo "Bot conectado!";
}
```

---

## Escalabilidad

### Recursos por Bot

| Bots | RAM | CPU |
|------|-----|-----|
| 1-5 | 2GB | 2 cores |
| 6-20 | 4GB | 4 cores |
| 21-50 | 8GB | 8 cores |

### Limites

- **Rate Limit**: 1 mensaje cada 3 segundos (implementado)
- **Sesiones**: Una por numero de WhatsApp
- **Meta API**: 80 mensajes/segundo por numero

---

## Troubleshooting

| Problema | Causa | Solucion |
|----------|-------|----------|
| Error 405 (Baileys) | IP de datacenter | Usar Meta API |
| QR no aparece | Sesion existente | POST /clear-session |
| Worker no inicia | No compilado | npm run build |
| Puerto en uso | Conflicto | Cambiar puerto |
| Meta: Token invalido | Token expirado | Regenerar en Meta |
| Meta: Webhook falla | URL incorrecta | Verificar HTTPS |

---

## Scripts NPM

```bash
# Produccion
npm start                  # Iniciar manager
npm run manager            # Alias

# Workers individuales
npm run worker             # Worker Baileys
npm run worker:meta        # Worker Meta

# Desarrollo
npm run dev                # Manager con hot-reload
npm run dev:worker         # Worker Baileys dev
npm run dev:worker:meta    # Worker Meta dev

# Build
npm run build              # Todo
npm run build:manager      # Solo manager
npm run build:worker       # Solo worker Baileys
npm run build:worker:meta  # Solo worker Meta

# Otros
npm run clean              # Limpiar dist/
npm run lint               # Verificar codigo
```

---

## Soporte

Para reportar issues, incluir:

1. Tipo de provider (Baileys/Meta)
2. Logs del Manager y Worker
3. `config/clients.json` (sin tokens)
4. Version de Node.js (`node -v`)
5. Sistema operativo

---

*Documentacion generada: 2026-01-28*
