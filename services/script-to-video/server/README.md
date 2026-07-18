Script2Video backend

Quick start

1. Copy `.env.example` to `.env` and fill keys.
2. Install dependencies inside `server`:

```bash
cd server
npm install
npm run dev
```

Endpoints:
- `POST /api/script/process` { script }
- `GET /api/videos/search?query=...&keywords=kw1,kw2`
- `POST /api/saved` save payload
- `GET /api/saved` list saved
- `DELETE /api/saved/:id` delete saved
