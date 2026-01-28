# Bot Manager Multi-Tenant

Plataforma escalable para gestionar multiples bots de WhatsApp desde un sistema centralizado. Basado en [@builderbot/bot](https://github.com/builderbot-js/builderbot).

## Caracteristicas

- **Multi-Tenant**: Un Manager controla N instancias de bots
- **API REST**: Crear, iniciar, detener bots via HTTP
- **Dashboard Web**: Interfaz visual de administracion
- **QRs Centralizados**: Almacenamiento organizado en `storage/{NIT}/`
- **Auto-Restart**: Recuperacion automatica de bots caidos
- **Flujos Dinamicos/Stateless**: Logica controlada desde backend PHP

## Inicio Rapido

```bash
# Instalar dependencias
npm install

# Compilar
npm run build

# Iniciar Manager (puerto 4000)
npm start
```

Abrir http://localhost:4000 para acceder al Dashboard.

## Arquitectura

```
Manager (Puerto 4000)
├── API REST (/api/*)
├── Dashboard HTML
└── Orquestador de Workers
    │
    ├── Worker Bot 1 (Puerto 3001) ─── storage/NIT_1/
    ├── Worker Bot 2 (Puerto 3002) ─── storage/NIT_2/
    └── Worker Bot N (Puerto 300N) ─── storage/NIT_N/
```

## API Endpoints

### Gestion de Clientes

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/clients` | Listar todos los clientes |
| POST | `/api/clients` | Crear nuevo cliente |
| GET | `/api/clients/:nit` | Estado de un cliente |
| PUT | `/api/clients/:nit` | Actualizar cliente |
| DELETE | `/api/clients/:nit` | Eliminar cliente |

### Control de Bots

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/clients/:nit/start` | Iniciar bot |
| POST | `/api/clients/:nit/stop` | Detener bot |
| POST | `/api/clients/:nit/restart` | Reiniciar bot |
| GET | `/api/clients/:nit/qr` | Obtener imagen QR |
| GET | `/qrs/:nit` | Alias corto para QR |

### Endpoints de los Workers

Cada bot expone en su puerto:

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/v1/messages` | Enviar mensaje simple |
| POST | `/v1/question` | Enviar pregunta con opciones |
| GET | `/health` | Health check |

## Crear un Cliente

```bash
curl -X POST http://localhost:4000/api/clients \
  -H "Content-Type: application/json" \
  -d '{
    "nit": "1234567890",
    "puerto": 3005,
    "nombre": "Mi Empresa",
    "autoStart": true
  }'
```

## Enviar Mensaje

```bash
curl -X POST http://localhost:3005/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "number": "573001234567",
    "message": "Hola desde el bot!"
  }'
```

## Enviar Pregunta Interactiva

```bash
curl -X POST http://localhost:3005/v1/question \
  -H "Content-Type: application/json" \
  -d '{
    "number": "573001234567",
    "message": ["Como desea pagar?", "1. Efectivo", "2. Tarjeta"],
    "answers": [
      {"option": 1, "action": "https://api.com/webhook", "message": "Pago en efectivo"},
      {"option": 2, "action": "https://api.com/webhook", "message": "Pago con tarjeta"}
    ]
  }'
```

## Estructura del Proyecto

```
bot/
├── config/
│   └── clients.json         # Configuracion de clientes
├── dist/                    # Codigo compilado
├── docs/
│   └── MANUAL_PROGRAMADOR.md
├── public/
│   └── index.html           # Dashboard
├── src/
│   ├── manager/             # Orquestador
│   │   ├── index.ts
│   │   ├── BotManager.ts
│   │   ├── ApiServer.ts
│   │   ├── ClientStore.ts
│   │   └── types.ts
│   └── worker/              # Bot individual
│       └── bot.ts
├── storage/                 # QRs y sesiones por NIT
├── package.json
└── tsconfig.json
```

## Variables de Entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `MANAGER_PORT` | 4000 | Puerto del Manager |
| `STORAGE_PATH` | ./storage | Ruta de almacenamiento |
| `AUTO_START` | true | Auto-iniciar bots |

## Scripts

```bash
npm start        # Produccion
npm run dev      # Desarrollo con hot-reload
npm run build    # Compilar TypeScript
```

## Documentacion

Ver [docs/MANUAL_PROGRAMADOR.md](docs/MANUAL_PROGRAMADOR.md) para documentacion tecnica completa.

## Licencia

ISC
