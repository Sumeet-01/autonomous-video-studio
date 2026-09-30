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

## GPU generation plane (Lightning L4)

```
Mac / OpenCode (control plane)              Lightning L4 (generation worker)
  Next.js orchestrator                        FastAPI :8000 (gpu-worker/)
  VideoProviderFactory ──HTTP──> VACEWorkerProvider → VACEProvider (model x1)
  SQLite generation_attempts                  outputs/jobs/<job_id>/{job.json,output.mp4}
```

- **Worker** (`gpu-worker/`): `gpu_server.py` (async FIFO API), `vace_provider.py`
  (singleton Wan2.1-VACE-1.3B-diffusers: bf16, VAE tiled encode+decode, model CPU
  offload, repo-default scheduler, lazy load-once), `job_store.py` (atomic local
  JSON jobs), `config.py` (`VACE_*` env knobs, verified defaults).
- **Contract**: `POST /generate` → `202 {job_id, status: queued, video_url}` →
  poll `GET /jobs/{job_id}` (`queued/running/completed/failed/cancelled`) →
  `GET /video/{job_id}`. Single in-flight diffusion
  (`VACE_MAX_CONCURRENT_GENERATIONS=1`); extras queue honestly. No public
  networking, no paid providers, no other models.
- **Control plane** (`src/lib/providers/vace.ts`): `VACEWorkerProvider` behind the
  existing `VideoProvider` interface + factory (`'vace'`, opt-in via
  `GPU_WORKER_URL`). Text-to-video only — image/video conditioning and any
  unsupported field are rejected explicitly, never silently ignored.
- **Future providers** (`WanProvider`, `LTXProvider`, …) implement the same
  interface; the orchestrator is untouched. Verified model/memory details live
  in `gpu-worker/README.md`.
