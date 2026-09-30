# LUMEN Studio — Autonomous Video Creation

**Reference → Understand → Generate → Inspect → Correct → Deliver.**

LUMEN is a production-grade autonomous video workspace. Upload a reference video, lock subject/environment, analyze cinematography with Muse Spark 1.3, generate via fal.ai / Replicate (Wan 2.1 image-to-video first-class), inspect frames with Muse Spark, auto-mutate prompts and regenerate up to a bounded retry limit, then mux voice + SFX with FFmpeg and export. Every attempt feeds a persistent learning memory so future generations start better.

## Quick start
```bash
cp .env.local.example .env.local
# put keys into .env.local (only what you use)
npm install
npm run dev
# open http://localhost:3000
```

Requires Node 20+ and FFmpeg (`brew install ffmpeg` on macOS). Heavy video generation stays in the cloud; local machine does orchestration, FFmpeg and inspection support.

## What to configure
- `MODEL_API_KEY` — Muse Spark 1.3 (reference analysis + visual QA + planning)
- `FAL_API_KEY` — video generation (Wan 2.1 14B I2V recommended)
- `REPLICATE_API_TOKEN` — alternative video provider
- `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` — narration (optional)
- Without keys the app still runs; capabilities show as unavailable and unrelated features keep working. Use Settings → Test connections for genuine provider checks.

## Workflow
1. Create production → 2. Upload reference video + subject/environment → 3. Run reference analysis → 4. Generate (auto QA loop) → 5. Inspect side-by-side → 6. Voice/SFX → 7. Export MP4 to `production_output/`.

See `SETUP.md` and `ARCHITECTURE.md`.
