# 🤖 API de Bot WhatsApp (BuilderBot Wrapper)

Este servicio levanta un bot de WhatsApp capaz de enviar mensajes proactivos y realizar flujos de preguntas/respuestas dinámicos controlados vía HTTP.

## 🚀 Características
- **Cola de Mensajes**: Implementa `queue-promise` para evitar baneos por envío masivo (rate limits).
- **Flujos Dinámicos**: No requiere re-desplegar para cambiar preguntas; la lógica se envía en el payload del request.
- **Provider**: Baileys (WhatsApp Web API gratuita).

## 🛠️ Instalación y Uso

1. **Instalar dependencias**:
   ```bash
   npm install
   ```

2. **Configurar Puerto**:
   Crea/Edita `config.json` en la raíz (opcional, por defecto 3999).

3. **Ejecutar**:
   ```bash
   npm run dev
   ```

---

## 📡 Endpoints API

### 1. Enviar Mensaje Simple / Archivo
**POST** `/v1/messages`

Envía un mensaje de texto o multimedia a un usuario.

**Body:**
```json
{
    "number": "573001234567",
    "message": "Hola, aquí tienes tu factura",
    "urlMedia": "https://mi-dominio.com/archivo.pdf" 
}
```
> `urlMedia` es opcional (null para solo texto).

### 2. Enviar Pregunta Interactiva
**POST** `/v1/question`

Inicia un flujo donde el bot hace una pregunta y, según la respuesta numérica del usuario ('1', '2'...), ejecuta un webhook externo.

**Body:**
```json
{
    "number": "573001234567",
    "message": [
        "👋 Hola, confirma tu asistencia:",
        "1️⃣ Si, asistiré",
        "2️⃣ No, no puedo"
    ],
    "answers": [
        {
            "option": 1,
            "action": "https://tu-api.com/confirmar-asistencia",
            "message": "¡Genial! Te esperamos."
        },
        {
            "option": 2,
            "action": "https://tu-api.com/cancelar-cita",
            "message": "Entendido, gracias por avisar."
        }
    ]
}
```

**Comportamiento:**
1. El bot envía las líneas de `message`.
2. Espera una respuesta numérica del usuario.
3. Si el usuario responde `1`, el bot hace un POST a `https://tu-api.com/confirmar-asistencia` enviando `{ "respuesta": 1 }`.
4. El bot responde al usuario con "¡Genial! Te esperamos.".

---

## 🏗️ Estructura del Proyecto
- `src/app.ts`: Servidor Express y configuración del bot.
- `src/flowQuestion.ts`: Lógica del flujo dinámico. Parsea el payload enviado en el evento `question` para configurar las respuestas en tiempo real.
