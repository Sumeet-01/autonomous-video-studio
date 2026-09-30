# SETUP

1. Copy env: `cp .env.local.example .env.local` and fill only the keys you have.
2. Install FFmpeg: macOS `brew install ffmpeg`; Ubuntu `sudo apt install ffmpeg`; verify in Settings (shows Installed/Missing, never crashes).
3. `npm install && npm run dev` → http://localhost:3000
4. Create a production, upload reference video, run analysis, generate, export.

## Troubleshooting
- **Muse 401**: invalid `MODEL_API_KEY`; analysis falls back to rule-based structure so pipeline continues.
- **Provider 401/429/timeout**: mapped to `PROVIDER_AUTH_ERROR / RATE_LIMIT / TIMEOUT`; check Settings → Test, retry later.
- **FFmpeg missing**: media steps report precise install hint; project data unaffected.
- **No GPU needed**: video models run on fal.ai / Replicate.
- Data: SQLite `./data/studio.db`, media under `./projects/<id>/`, finals under `./production_output/`. Never commit `.env.local`.
