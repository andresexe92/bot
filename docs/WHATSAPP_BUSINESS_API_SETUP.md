# Guia de Configuracion: WhatsApp Business API (Meta Cloud API)

## Introduccion

Esta guia te lleva paso a paso para configurar WhatsApp Business API con Meta Cloud API, la solucion oficial y mas estable para bots de WhatsApp en produccion.

### Ventajas vs Baileys

| Caracteristica | Baileys | Meta Cloud API |
|---------------|---------|----------------|
| Oficial | No | Si |
| Estabilidad | Media | Alta |
| Bloqueo de IP | Si (datacenters) | No |
| Costo | Gratis | Gratis hasta 1000 conv/mes |
| Requiere escanear QR | Si | No |
| Verificacion de negocio | No | Si |
| Soporte | Comunidad | Meta oficial |

---

## Paso 1: Crear Cuenta de Meta Developers

1. Ve a [developers.facebook.com](https://developers.facebook.com)
2. Inicia sesion con tu cuenta de Facebook
3. Acepta los terminos de desarrollador

---

## Paso 2: Crear una App

1. Ve a "My Apps" > "Create App"
2. Selecciona **"Business"** como tipo de app
3. Nombre: "Bot WhatsApp [Tu Empresa]"
4. Asocia a tu Business Account (o crea uno)

---

## Paso 3: Agregar WhatsApp a tu App

1. En el Dashboard de tu app, busca "Add Products"
2. Encuentra **"WhatsApp"** y click en "Set Up"
3. Sigue el wizard de configuracion

---

## Paso 4: Configurar WhatsApp Business

### 4.1 Numero de Telefono

**Opcion A: Numero de Prueba (Gratis)**
- Meta te da un numero temporal para testing
- Limitado a 5 numeros de destino
- Perfecto para desarrollo

**Opcion B: Tu Numero de Negocio (Produccion)**
- Usa un numero que NO este registrado en WhatsApp
- Debe ser capaz de recibir SMS o llamadas para verificacion
- Requiere verificacion de negocio

### 4.2 Obtener Credenciales

En la seccion de WhatsApp de tu app, encontraras:

```
Phone Number ID: 1234567890123456
WhatsApp Business Account ID: 9876543210987654
```

### 4.3 Generar Access Token

1. Ve a "API Setup" en la seccion de WhatsApp
2. Click en "Generate" para crear un token temporal (24h)
3. Para produccion, crea un **System User Token** (permanente):
   - Ve a Business Settings > System Users
   - Crea un System User
   - Asigna permisos: `whatsapp_business_messaging`, `whatsapp_business_management`
   - Genera token permanente

---

## Paso 5: Configurar Webhook

Tu bot necesita recibir mensajes de WhatsApp via webhook.

### 5.1 URL del Webhook

```
https://tu-dominio.com/webhook
```

**Requisitos:**
- HTTPS obligatorio (usa Let's Encrypt si es necesario)
- Puerto 443 (o usa reverse proxy con Nginx)

### 5.2 Verify Token

Crea un string aleatorio que usaras para verificar el webhook:

```bash
openssl rand -hex 32
# Ejemplo: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

### 5.3 Registrar Webhook en Meta

1. Ve a WhatsApp > Configuration > Webhook
2. Callback URL: `https://tu-dominio.com/webhook`
3. Verify Token: tu string aleatorio
4. Suscribete a: `messages`

---

## Paso 6: Variables de Entorno

Crea un archivo `.env` en tu proyecto:

```env
# Meta WhatsApp Business API
META_JWT_TOKEN=EAAxxxxxxxxxxxxxx
META_NUMBER_ID=1234567890123456
META_VERIFY_TOKEN=tu_verify_token_aleatorio
META_VERSION=v21.0

# Manager Config
MANAGER_PORT=4000
STORAGE_PATH=./storage
```

---

## Paso 7: Instalar Dependencias

```bash
npm install @builderbot/provider-meta dotenv
```

---

## Paso 8: Verificacion de Negocio (Produccion)

Para usar tu propio numero en produccion:

1. Ve a Meta Business Suite > Settings > Business Verification
2. Sube documentos:
   - Registro de empresa
   - Factura de servicios
   - Documento de identidad del representante
3. Espera aprobacion (1-5 dias habiles)

---

## Arquitectura con Meta Provider

```
┌─────────────────────────────────────────────────────────┐
│                    Tu VPS (Linux)                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐      ┌─────────────────────────┐  │
│  │   Bot Manager   │      │   Meta Worker           │  │
│  │   Puerto 4000   │      │   Puerto 3001+          │  │
│  │   (API/Dashboard)│◄────►│   (Webhook receiver)    │  │
│  └─────────────────┘      └───────────┬─────────────┘  │
│                                       │                 │
└───────────────────────────────────────┼─────────────────┘
                                        │ HTTPS
                                        ▼
                           ┌────────────────────────┐
                           │   Meta Cloud API       │
                           │   (WhatsApp servers)   │
                           └────────────────────────┘
```

---

## Precios WhatsApp Business API (2025)

### Conversaciones Gratuitas
- **1,000 conversaciones/mes** iniciadas por usuarios (service)
- **250 conversaciones/mes** de prueba

### Conversaciones de Pago (despues del tier gratuito)

| Tipo | Precio (USD) | Ejemplo |
|------|--------------|---------|
| Marketing | $0.0099 - $0.1253 | Promociones, ofertas |
| Utility | $0.0040 - $0.0858 | Confirmaciones, alertas |
| Authentication | $0.0045 - $0.0858 | Codigos OTP |
| Service | GRATIS | Respuestas a usuarios |

*Precios varian por pais. Colombia ~$0.02/mensaje marketing*

---

## Diferencias en el Codigo

### Antes (Baileys)
```typescript
import { BaileysProvider } from '@builderbot/provider-baileys';

const provider = createProvider(BaileysProvider, {
  name: 'bot',
  experimentalStore: true
});
```

### Despues (Meta)
```typescript
import { MetaProvider } from '@builderbot/provider-meta';

const provider = createProvider(MetaProvider, {
  jwtToken: process.env.META_JWT_TOKEN,
  numberId: process.env.META_NUMBER_ID,
  verifyToken: process.env.META_VERIFY_TOKEN,
  version: 'v21.0'
});
```

---

## Limitaciones

1. **Templates obligatorios** para mensajes iniciados por el bot (despues de 24h)
2. **Ventana de 24h** para conversaciones de servicio
3. **Verificacion de negocio** requerida para produccion
4. **Sin acceso a grupos** (solo chats 1:1)

---

## Timeline Estimado

| Fase | Tiempo | Descripcion |
|------|--------|-------------|
| Crear cuenta developer | 10 min | Registro en Meta |
| Crear app y configurar | 30 min | Setup basico |
| Testing con numero de prueba | 1 hora | Probar flujos |
| Verificacion de negocio | 1-5 dias | Documentos |
| Produccion | 1 dia | Deploy final |

---

## Referencias

- [Meta for Developers](https://developers.facebook.com)
- [WhatsApp Business Platform](https://business.whatsapp.com/developers)
- [BuilderBot Meta Provider](https://www.builderbot.app/en/providers/meta)
- [Cloud API Pricing](https://developers.facebook.com/docs/whatsapp/pricing)

---
*Ultima actualizacion: 2026-01-28*
