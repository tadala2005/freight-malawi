# Freight Malawi deployment

## Production layout

- **Frontend:** Vercel (`frontend/`)
- **Backend + Socket.IO:** Render (`backend/`)
- **MySQL:** any reachable MySQL 8 provider; Aiven works for a prototype.

## 1. Database

Create the MySQL database and import `schema.sql`, then run the included trip migration if it is present.

For a TLS-enabled provider set:

```text
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
```

or provide a trusted CA in `DB_SSL_CA` and set `DB_SSL_REJECT_UNAUTHORIZED=true`.

## 2. Render backend

Create a Render Web Service from this repository or use `render.yaml`.

- Root directory: `backend`
- Build command: `npm ci`
- Start command: `npm start`
- Health check: `/api/health`

Render provides `PORT`; the server binds to `0.0.0.0`.

Set `CORS_ORIGIN` to your Vercel production URL. Multiple origins can be comma-separated.

## 3. Vercel frontend

Create a Vercel project with root directory `frontend`.

Set:

```text
VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com
VITE_SOCKET_URL=https://YOUR-RENDER-SERVICE.onrender.com
```

Build command:

```text
npm run build
```

Output directory:

```text
dist
```

`frontend/vercel.json` provides the SPA fallback for React Router refreshes.

## 4. Secrets

Never commit `.env` files. Store production secrets only in the hosting provider's environment-variable settings.

## 5. ESP32 / simulator

Point the simulator and ESP32 HTTP endpoint at the public Render backend URL. The existing `/api/telemetry/device` endpoint remains the telemetry entry point.
