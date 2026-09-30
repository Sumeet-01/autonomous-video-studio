# ARCHITECTURE

`USER → Creative Input → Orchestration → Reference Analysis + Creative Planner → Prompt Engine → Video Provider → FFmpeg frames → Muse Spark QA → PASS→Audio→Mux→Export / FAIL→Mutation→Regenerate → Learning Memory`

- **Frontend**: Next.js App Router, Tailwind, R3F `StageBackdrop` (decorative, lazy, reduced-motion + WebGL fallback), workspace tabs (Analyze/Generate/Inspect/Audio/Export).
- **Backend**: Next.js Route Handlers; SQLite (`better-sqlite3`, WAL) tables: projects, scenes, assets, generation_attempts, reference_analyses, exports, generation_experiences, correction_patterns, generation_strategies, model_performance.
- **Muse Spark** (`lib/providers/muse-spark.ts`): Responses API, video+image input, JSON outputs, dedicated system prompts for analysis/inspection/mutation/planning. Audio understanding not used (documented limitation).
- **Video** (`lib/providers/video.ts`): `VideoProvider` interface + `FalProvider` / `ReplicateProvider` + factory; Wan 2.1 I2V first-class; capabilities-gated params; normalized errors.
- **Media** (`lib/media/ffmpeg.ts`): structured argv only (no shell interpolation), probe, scene detect, smart frame planning (scene-aware + budget), parallel bounded extraction, mux with ducking, concat.
- **Orchestration** (`lib/orchestration/`): prompt-engine (model-aware, learned boosters), mutation-dictionary (defect→targeted fix), learning (experiences, patterns, strategies, similarity retrieval, stats), orchestrator (bounded attempts=3 default, immutable raw analysis + separate learned strategy layer, per-attempt dirs never overwritten).
- **State machine**: draft→analyzing→planning→ready→generating→inspecting→repairing→approved→compiling→exporting→complete/failed/cancelled, persisted in DB.
- **Security**: keys server-only, masked previews, MIME/size limits, safe path joins, timeouts/retries everywhere, no secret logging.
