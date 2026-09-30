# LUMEN Studio — Autonomous Video Creation

**Reference → Understand → Generate → Inspect → Correct → Deliver.**

LUMEN Studio is a production-grade autonomous video workspace. Give it a creative
request plus reference media and it orchestrates the whole pipeline: reverse-engineer
a reference video's cinematography, translate it into a generation plan for your own
subject and environment, submit jobs to a cloud video model, inspect results with
**Muse Spark 1.3**, auto-detect defects, mutate the prompt, regenerate until it passes
QA (or hits the retry limit), then mux voice + ambience with FFmpeg and export the
finished MP4. Every attempt feeds a **persistent learning memory**, so future
generations start better and need fewer retries.

---

## 1. What it does

- **Projects** with scenes, assets, attempts, audio and exports — persisted in SQLite,
  surviving restarts.
- **Reference video analysis** — FFmpeg scene detection + smart frame sampling, then
  Muse Spark 1.3 produces shot-by-shot structure: timing, framing, camera movement,
  subject/environment/action, lighting, color, composition, transitions and a
  recreation strategy (rule-based fallback keeps the pipeline alive offline).
- **Creative translation** — preserves camera language, pacing and composition from
  the reference while replacing subject, environment and identity with yours.
  Subject/environment "geometry locks" protect products, characters and locations.
- **Video generation** — provider abstraction (`VideoProvider`) with **fal.ai**
  (Wan 2.1 14B image-to-video first-class) and **Replicate** adapters. Capabilities
  gate every parameter; vendor errors normalize to common categories.
- **Self-correction loop** — Muse Spark inspects generated frames against intent,
  reference and locks (anatomy, deformation, drift, flicker, physics, continuity…),
  writes a structured quality report, and the mutation engine applies *targeted*
  fixes (never generic "more realistic"). Bounded retries, default 3.
- **Audio** — ElevenLabs narration when configured, offline procedural ambience
  otherwise. Muse Spark is deliberately *not* used for audio.
- **Export** — scene stitching + voice/SFX/music mux with ducking and fades via
  FFmpeg into `production_output/`. Presets: vertical short, landscape, YouTube, custom.
- **Learning system** — every attempt stores input → prompt → defects → correction →
  result, with user approvals weighted highest. Similarity retrieval boosts new
  prompts; correction patterns, strategies and per-model performance are tracked and
  visible in Settings.
- **Cinematic workstation UI** — dark creative-tool aesthetic, subtle R3F spatial
  backdrop (lazy, reduced-motion + no-WebGL safe), workflow tabs
  Analyze → Generate → Inspect → Audio → Export, side-by-side QA view, timeline,
  learning dashboard.

## 2. Requirements

| Tool | Version verified | Install |
|---|---|---|
| Node.js | v22.23.1 | https://nodejs.org |
| npm | 10.9.8 | ships with Node |
| Python | 3.9.6 (media helpers only) | preinstalled on macOS |
| Git | 2.54.0 | preinstalled / `brew install git` |
| FFmpeg + ffprobe | **9.0.2** | `brew install ffmpeg` |

Heavy video generation runs on **cloud GPUs** (fal.ai / Replicate) — never locally,
so a MacBook Air stays responsive. Local work is orchestration, FFmpeg and inspection.

## 3. Quick start

```bash
cd autonomous-video-studio
cp .env.local.example .env.local   # add only the keys you use
npm install
npm run dev                        # http://localhost:3000
```

Open the app → **Create production** → upload reference video + subject/environment
images → **Run reference analysis** → **Generate** (auto QA loop) → **Inspect** →
voice/ambience → **Export**.

## 4. Configuration (bring keys once)

`.env.local` (never committed — guarded by `.gitignore`):

```env
MODEL_API_KEY="..."            # Muse Spark 1.3 (analysis + visual QA)
FAL_API_KEY="..."              # video generation (Wan 2.1 14B I2V)
REPLICATE_API_TOKEN="..."      # alternative video provider
ELEVENLABS_API_KEY="..."       # narration
ELEVENLABS_VOICE_ID="..."      # narration voice
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
```

Missing keys never crash the app — **Settings → Test connections** performs genuine
provider checks and shows exactly which capability is unavailable.

## 5. Supabase

Connected via the official `@supabase/ssr` helpers (App Router):

- `src/utils/supabase/client.ts` — browser client
- `src/utils/supabase/server.ts` — server client (RSC / Route Handlers / Actions)
- `src/utils/supabase/middleware.ts` + `src/middleware.ts` — session refresh on
  every request (skipped gracefully when keys are absent)
- `supabase/schema.sql` — Postgres schema mirroring all 10 local tables
  (projects, scenes, assets, attempts, analyses, exports + 4 learning tables).
  Run it in the Supabase SQL editor when ready to move persistence to the cloud.

Local development still uses SQLite (`./data/studio.db`); Supabase is wired for
auth/session plus future cloud persistence.
Usage: `import { createClient } from '@/utils/supabase/client'` (components) or
`'@/utils/supabase/server'` (server code).

## 6. Project structure

```
src/app/            # routes: / (home), /projects/[id] (workspace), /settings
src/app/api/        # projects, assets, reference, generation, inspection,
                    # scenes, audio, export, system, learning
src/components/     # three/ (R3F backdrop), workspace/ (chrome), ui/
src/lib/types/      # full domain model
src/lib/config/     # typed env + provider status/tests
src/lib/db/         # SQLite layer (better-sqlite3, WAL)
src/lib/providers/  # muse-spark, video (fal/replicate), audio (elevenlabs/sfx)
src/lib/media/      # ffmpeg: probe, scenes, frames, mux, concat
src/lib/orchestration/ # prompt-engine, mutation-dictionary, learning, orchestrator
src/utils/supabase/ # Supabase clients + session middleware
supabase/schema.sql # Postgres mirror schema
projects/           # per-project media (git-ignored)
production_output/  # final MP4s (git-ignored)
tests/              # vitest suite
```

## 7. Commands

```bash
npm run dev        # start workstation
npm run build      # production build
npm run lint       # eslint (0 errors)
npm run test       # vitest
npm run typecheck  # tsc --noEmit
```

## 8. API overview

```
POST /api/projects            GET /api/projects/[id]
POST /api/assets (multipart)  GET /api/assets/file?id=
POST /api/reference/analyze   GET /api/reference/[id]
POST /api/generation          GET /api/generation?sceneId=
POST /api/scenes (create/approve/reject)   POST /api/scenes/[id] (regenerate)
POST /api/inspection          POST /api/audio (voice|sfx)
POST /api/export              GET /api/system/status?test=1
GET  /api/learning?projectId=
```

## 9. Security

Secrets are server-only and masked (`••••8A3F`) everywhere in UI/logs. Uploads have
MIME + size validation, paths are joined safely, FFmpeg always receives structured
argv (no shell interpolation), every external call has timeouts/retries, and
`.env.local` + all media/output dirs are git-ignored.

## 10. Docs

- `SETUP.md` — setup + troubleshooting
- `ARCHITECTURE.md` — modules, state machine, data flow
- `supabase/schema.sql` — cloud schema
