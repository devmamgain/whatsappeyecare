# WhatsApp Appointment Booking Bot

A rule-based WhatsApp chatbot that lets clients request appointments through your business number.
Built with Node.js, Express, PostgreSQL, Prisma and the Meta WhatsApp Cloud API.

## Conversation flow

```
Client: Hi
Bot:    Welcome to <Company>! What is your full name?
Client: Priya Sharma
Bot:    What date would you like to book?            (25/11/2026, today, tomorrow)
Client: 25/11/2026
Bot:    What time would you prefer?                  (10:30 AM, 14:00)
Client: 10:30 AM
Bot:    Any notes or reason? (or "skip")
Client: Follow-up consultation
Bot:    [summary]  [✅ Confirm] [✏️ Start over] [❌ Cancel]
Client: ✅ Confirm
Bot:    Booking request received! Reference A1B2C3D4. Status: Pending.
```

The phone number is captured automatically from the WhatsApp sender, so the bot never asks for it.
Bookings are saved as `PENDING`; staff confirm them later and can assign a doctor.

Handled cases: invalid/past/closed/too-far dates, unreadable or out-of-hours times, times already
passed today, over-long notes, empty or unsupported messages (images, voice), `restart` / `cancel`
at any step, greetings mid-flow, sessions that expire after idle time, duplicate webhook deliveries,
and double-booking the same slot by the same client.

## Project structure

```
prisma/
  schema.prisma            Client, Doctor, Appointment, Conversation models
  seed.js                  sample doctors
src/
  server.js                startup + graceful shutdown
  app.js                   Express app (raw-body capture, routes, error handling)
  config/                  env validation, pino logger
  routes/ controllers/     webhook GET (verify) + POST (receive)
  middleware/              X-Hub-Signature-256 check, error handler
  bot/
    botHandler.js          conversation state machine
    intents.js             greeting / restart / cancel / skip / yes / no keywords
    messages.js            every message the bot sends
  services/
    whatsapp.service.js    Cloud API client (text, buttons, mark-as-read)
    conversation.service.js  per-user state in Postgres
    booking.service.js     find-or-create client + create appointment (transaction)
  utils/                   validators (pure), formatting, phone helpers, errors
tests/                     node:test unit tests
```

## Setup

1. Install and configure

   ```bash
   npm install
   cp .env.example .env      # then fill in the WhatsApp values
   ```

2. Create the database tables

   ```bash
   npx prisma migrate dev --name init
   npm run prisma:seed       # optional sample doctors
   ```

3. Run

   ```bash
   npm run dev               # or: npm start
   npm test
   ```

## Connecting to Meta

1. In [Meta for Developers](https://developers.facebook.com), create an app (type **Business**) and add
   the **WhatsApp** product.
2. Under **WhatsApp → API Setup**, copy the **Phone number ID** into `WHATSAPP_PHONE_NUMBER_ID`.
3. Token: the temporary token on that page expires in about 24 hours. For anything lasting, create a
   **System User** in Business Settings, grant it the app + WhatsApp account, and generate a permanent
   token with the `whatsapp_business_messaging` permission. Put it in `WHATSAPP_TOKEN`.
4. App secret (**App settings → Basic**) goes in `WHATSAPP_APP_SECRET`. It is used to verify
   `X-Hub-Signature-256` and is required when `NODE_ENV=production`.
5. Expose your server over HTTPS (for local testing: `ngrok http 3000`).
6. Under **WhatsApp → Configuration**, set the callback URL to `https://<your-host>/webhook` and the
   verify token to your `WHATSAPP_VERIFY_TOKEN`, then **subscribe to the `messages` field**.
7. While in development, add your own number as a test recipient, then message the business number.

## Notes and design choices

- **Conversation state lives in Postgres** (`Conversation` table), not memory, so it survives restarts
  and deploys. Idle sessions reset after `SESSION_TIMEOUT_MINUTES`.
- **Webhook acknowledgement**: the endpoint replies `200` immediately and processes afterwards, because
  Meta retries slow responses. Retries are de-duplicated by message id.
- **Per-user ordering**: messages from the same user are processed one at a time in-process. If you run
  several instances, replace this with a DB lock or a queue.
- **Dates and times** are interpreted in `BUSINESS_TIMEZONE`. Opening hours, slot length, working days
  and booking horizon are configurable via env.
- **Existing clients are reused** by phone number (`upsert`); the stored name is updated to the latest
  one provided.
- **Free-form replies** are only allowed within 24 hours of the user's last message. Every message this
  bot sends is a direct reply, so no template is needed. Proactive messages later on (for example,
  "your appointment is confirmed") will need an approved message template.
- **Logs** mask phone numbers and never include message bodies.
- The default Graph API version is `v26.0` (`WHATSAPP_API_VERSION`).
