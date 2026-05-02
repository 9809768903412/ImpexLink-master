Impex Engineering deployment notes:

- Frontend root: `afrontend`
- Backend root: `backend`
- Frontend env: `VITE_API_URL=https://api.<domain>/api`
- Backend env: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `PORT=4000`
- Backend AI env:
  - `AI_PROVIDER=ollama`
  - `OLLAMA_BASE_URL=http://ollama.railway.internal:11434/api`
  - `OLLAMA_MODEL=gemma3:270m`
  - optional `OLLAMA_NUM_CTX=512`
  - optional `OLLAMA_NUM_PREDICT=180`
  - optional `OLLAMA_API_KEY` if your Ollama endpoint is protected
  - optional `GROQ_API_KEY`, `GROQ_MODEL=openai/gpt-oss-20b`, `GROQ_FALLBACK_MODEL=llama-3.1-8b-instant`
  - optional xAI fallback: `XAI_API_KEY`, `XAI_MODEL=grok-4-fast-non-reasoning`

Demo read-only mode:

- Seed includes demo account: `demo.viewer@impex.com` / `password123`
- Set backend env:
  - `DEMO_USER_EMAILS=demo.viewer@impex.com`
- Demo users can view everything, but write requests are blocked (`POST/PUT/PATCH/DELETE`).
