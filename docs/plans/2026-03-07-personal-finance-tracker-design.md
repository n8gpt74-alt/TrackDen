# Personal Finance Tracker MVP Design

## Summary

This MVP is a Telegram Mini App that lets a user add a finance record in a few taps, upload a receipt image, and receive mock OCR plus mock AI categorization. The repository is split into `frontend/`, `backend/`, and `bot/` to keep the Mini App client, API, and Telegram launcher isolated but deployable as one product.

## Architecture

- `frontend/` uses React 19, TypeScript strict mode, Vite, Konsta UI, Tailwind CSS, React Query, and Recharts.
- `backend/` uses FastAPI, async SQLAlchemy, Alembic, PostgreSQL, and Redis.
- `bot/` exposes a Telegram WebApp button pointing to the Mini App URL.
- OCR runs through a Redis-backed worker so the upload request stays decoupled from recognition work.
- AI categorization is handled by a service abstraction with a deterministic mock implementation.

## Data model

- `users` stores Telegram identity and profile defaults.
- `categories` supports system categories plus future user-defined categories.
- `transactions` stores expense and income events, optionally linked to a receipt.
- `receipts` stores upload metadata, OCR status, and extracted fields.

## Security decisions

- Telegram WebApp `initData` is validated on the backend.
- PostgreSQL row-level security is enabled on all user-scoped tables.
- Each authenticated transaction sets `app.user_id` in PostgreSQL before querying.
- API errors follow one consistent shape with request IDs for tracing.

## UX decisions

- Mobile-first shell with Telegram-aware theme variables.
- Fast add form is available immediately on the transactions screen.
- Dashboard focuses on current-month balance, category mix, and daily trend.
- Receipt upload screen polls processing status and can turn OCR output into a transaction draft.
