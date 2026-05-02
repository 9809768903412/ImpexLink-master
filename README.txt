Impex Engineering deployment notes:

- Frontend root: `afrontend`
- Backend root: `backend`
- Frontend env: `VITE_API_URL=https://api.<domain>/api`
- Backend env: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `PORT=4000`
- Backend AI env:
  - `AI_PROVIDER=groq`
  - `GROQ_API_KEY`
  - `GROQ_MODEL=openai/gpt-oss-20b`
  - optional xAI fallback: `XAI_API_KEY`, `XAI_MODEL=grok-4-fast-non-reasoning`

Demo read-only mode:

- Seed includes demo account: `demo.viewer@impex.com` / `password123`
- Set backend env:
  - `DEMO_USER_EMAILS=demo.viewer@impex.com`
- Demo users can view everything, but write requests are blocked (`POST/PUT/PATCH/DELETE`).
