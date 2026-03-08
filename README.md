# Personal Finance Tracker

MVP Telegram Mini App for tracking personal finances with fast transaction entry, mock OCR receipts, and mock AI categorization.

## Stack

- Frontend: React 19 + TypeScript + Vite + Konsta UI + Tailwind CSS
- Backend: FastAPI + SQLAlchemy + Alembic + PostgreSQL + Redis
- Bot: Python Telegram bot launcher for Mini App entry point
- Infra: Docker + Docker Compose

## Repository layout

```text
frontend/  React 19 Mini App, Konsta UI, Tailwind, Recharts
backend/   FastAPI API, SQLAlchemy models, Alembic migrations, Redis worker
bot/       Telegram bot entry point for launching the Mini App
```

## Key capabilities

- Telegram WebApp auth validated on the backend via `X-Telegram-Init-Data`
- CRUD transactions with automatic mock AI categorization fallback
- Receipt upload with Redis-backed OCR processing worker
- Dashboard analytics for the current month with category and time-series charts
- Row-level security in PostgreSQL using `SET LOCAL app.user_id`


## Local-first mode

- Frontend now works in `local-first` mode by default and stores user data in browser storage per Telegram user
- Transactions, receipts, AI categorization, and analytics work without backend or cloud database
- Backups are available from Settings inside the Mini App: export/import JSON plus local data reset for the active profile
- To switch frontend back to API mode, set `VITE_DATA_MODE=remote` and provide `VITE_API_BASE_URL`

## Quick start with Docker

1. Copy `.env.example` to `.env`
2. Run `docker compose up --build`
3. Open frontend at `http://localhost:5173`
4. API docs are available at `http://localhost:8000/docs`

## Local development without Docker

### One-command start on Windows PowerShell

1. Make sure PostgreSQL is installed, Redis files exist in `.runtime/redis`, and dependencies are already installed in `.venv` and `frontend/node_modules`
2. Run: `powershell -ExecutionPolicy Bypass -File .\start-local.ps1`
3. Open `http://127.0.0.1:5173`
4. API docs are available at `http://127.0.0.1:8000/docs`
5. Stop everything with: `powershell -ExecutionPolicy Bypass -File .\stop-local.ps1`

### Manual backend/frontend start

#### Backend

1. Create a PostgreSQL database and Redis instance
2. Install dependencies: `python -m pip install -r backend/requirements.txt`
3. Export environment variables from `.env.example`
4. Run migrations: `alembic upgrade head`
5. Start API: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
6. Start OCR worker: `python -m app.workers.worker`

#### Frontend

1. Install dependencies: `npm install`
2. Set `VITE_API_BASE_URL=http://localhost:8000/api/v1`
3. Start dev server: `npm run dev`

### Bot

1. Install dependencies: `python -m pip install -r bot/requirements.txt`
2. Set `BOT_TOKEN` and `BOT_WEBAPP_URL`
3. Start bot: `python -m bot.main`

## Dev auth

For local browser development outside Telegram, backend debug mode can fall back to a configured demo user via:

- `BACKEND_DEV_AUTH_ENABLED=true`
- `BACKEND_DEV_AUTH_USER_ID=777000`

In Telegram, the frontend sends real init data and the backend validates it against `BACKEND_TELEGRAM_BOT_TOKEN`.

## Main API routes

- `GET /api/v1/auth/session`
- `GET|POST /api/v1/transactions`
- `PATCH|DELETE /api/v1/transactions/{transaction_id}`
- `POST /api/v1/receipts`
- `GET /api/v1/receipts/{receipt_id}`
- `GET /api/v1/analytics/overview`

## Notes

- OCR and AI providers are abstracted behind service interfaces and default to mock implementations
- The worker processes receipt jobs from Redis list `receipt_ocr_jobs`
- Database security is enforced both in API dependencies and through PostgreSQL RLS policies


## Deploy on GitHub + Vercel

### Frontend project

- Create a Vercel project with `frontend/` as the Root Directory
- Add build-time variable `VITE_API_BASE_URL=https://<your-backend-project>.vercel.app/api/v1`
- `frontend/vercel.json` already rewrites all SPA routes to `index.html`

### Backend project

- Create a second Vercel project with `backend/` as the Root Directory
- The Vercel FastAPI entrypoint is `backend/app.py`
- Required environment variables: `BACKEND_DATABASE_URL`, `BACKEND_SYNC_DATABASE_URL`, `BACKEND_CORS_ORIGINS`, `BACKEND_UPLOAD_DIR=/tmp/trackden-uploads`
- Optional: `BACKEND_REDIS_URL`; if Redis is absent, mock OCR falls back to synchronous inline processing on upload
- For production Telegram auth set `BACKEND_DEV_AUTH_ENABLED=false` and provide `BACKEND_TELEGRAM_BOT_TOKEN`

### Important note

- A fully working public deployment still needs a public PostgreSQL instance
- Redis is optional for Vercel now, but still recommended if you later move OCR processing back into a dedicated worker

