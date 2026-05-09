# Chatbot de Citas — WhatsApp + Google Calendar

Bot de Node.js que recibe mensajes por el webhook de WhatsApp Cloud API, conversa con el usuario y agenda citas en Google Calendar.

## Estructura

```
.
├── server.js              # Express + webhook
├── src/
│   ├── whatsapp.js        # Envío de mensajes (Graph API)
│   ├── calendar.js        # Google Calendar (Service Account)
│   └── conversation.js    # Máquina de estados del flujo de cita
├── .env.example
└── service-account.json   # (no se commitea)
```

## 1. Configurar Google Calendar

1. Ve a [Google Cloud Console](https://console.cloud.google.com/) → crea proyecto.
2. Habilita **Google Calendar API**.
3. Crea **Service Account**: IAM → Service Accounts → Create.
4. En la service account, pestaña **Keys** → Add Key → JSON. Guarda el archivo como `service-account.json` en la raíz del proyecto.
5. Copia el `client_email` del JSON.
6. Ve a [Google Calendar](https://calendar.google.com/) → crea un calendario nuevo o usa uno → Configuración → **Compartir con personas concretas** → añade el `client_email` con permiso "Hacer cambios en eventos".
7. En la misma pantalla, copia el **ID del calendario** (algo como `xxx@group.calendar.google.com`) y ponlo en `.env` como `GOOGLE_CALENDAR_ID`.

## 2. Configurar WhatsApp Cloud API

1. Ve a [developers.facebook.com](https://developers.facebook.com/) → My Apps → Create App → tipo **Business**.
2. Añade el producto **WhatsApp**.
3. En **API Setup** copia:
   - **Temporary access token** → `WHATSAPP_TOKEN` (para producción genera uno permanente con System User).
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
4. Añade tu número personal como **destinatario de prueba**.

## 3. Instalar y arrancar

```powershell
npm install
copy .env.example .env
# edita .env con tus credenciales
npm run dev
```

## 4. Exponer el webhook con ngrok

```powershell
ngrok http 3000
```

Copia la URL `https://xxx.ngrok-free.app`.

## 5. Configurar el webhook en Meta

1. En la app de Meta → WhatsApp → **Configuration** → Webhook → Edit.
2. **Callback URL**: `https://xxx.ngrok-free.app/webhook`
3. **Verify token**: el mismo valor que `WHATSAPP_VERIFY_TOKEN` en tu `.env`.
4. **Verify and save**.
5. Suscríbete al campo **messages**.

## 6. Probar

Envía un mensaje desde tu número de prueba al número de WhatsApp Business. Deberías recibir el saludo y poder completar el flujo de cita.

## Flujo de conversación

```
start → name → service → date → time → confirm → (evento creado)
```

En cualquier momento el usuario puede escribir `cancelar` para reiniciar.

## Próximos pasos

- Persistir sesiones en Redis o SQLite (ahora viven en memoria; se pierden al reiniciar).
- Añadir mensajes interactivos (botones/listas) en lugar de texto plano.
- Recordatorios automáticos antes de la cita.
- Reagendar / cancelar citas existentes.
- Validar firma `X-Hub-Signature-256` del webhook.
