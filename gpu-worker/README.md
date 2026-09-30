# VACE GPU worker

FastAPI worker that serves **Wan2.1-VACE-1.3B-diffusers** on the Lightning L4
box. The Mac control plane (Next.js) talks to it through the `VACEWorkerProvider`
(`src/lib/providers/vace.ts`), which implements the existing `VideoProvider`
interface — the orchestrator needs no changes.

```
Mac / OpenCode (control plane)          Lightning L4 (generation worker)
  Next.js orchestrator  --HTTP-->  FastAPI :8000 --> VACEProvider (model x1)
  SQLite attempts/jobs                  outputs/jobs/<job_id>/{job.json,output.mp4}
```

## Verified configuration

- Box: Lightning Studio `scratch-studio-devbox`, NVIDIA L4 24 GB, CUDA + PyTorch OK
- Model: `Wan-AI/Wan2.1-VACE-1.3B-diffusers` at `models/Wan2.1-VACE-1.3B-diffusers`
- `diffusers==0.40.0`, `transformers==5.17.0`, `accelerate==1.15.0`
- Memory recipe: bf16 pipeline, VAE tiled encode + tiled decode, model CPU
  offload, scheduler as shipped in the checkpoint (see `vace_provider.py`
  assumptions A1–A4 — re-check against `scripts/test_vace.py` on the box
  before deleting the old bridge)
- Proven artifact: 832x480, 33 frames, 30 steps → MP4

## API

| Method | Route | Meaning |
|---|---|---|
| GET | `/health` | `{status, model_loaded, model_path, queue_depth, active_jobs}` — cheap, never loads the model |
| POST | `/generate` | `202 {job_id, status:"queued", video_url, ...}` — async, FIFO queue |
| GET | `/jobs/{job_id}` | poll `queued → running → completed/failed/cancelled` + timings |
| GET | `/video/{job_id}` | MP4 download (409 until completed, 404 unknown, 410 artifact gone) |
| POST | `/jobs/{job_id}/cancel` | cancels queued jobs (running diffusion cannot be preempted on one L4) |

`POST /generate` schema (Pydantic, unknown fields → 422):

```json
{
  "prompt": "string (required)",
  "width": 832, "height": 480,
  "frames": 33, "steps": 30,
  "guidance_scale": 5.0, "seed": null,
  "negative_prompt": null
}
```

Constraints: dims multiple of 16 within 256–1024; `frames` must satisfy
`(frames-1) % 4 == 0` within 5–81 (`>33` warns: untested on L4, may OOM);
`steps` 1–50; `guidance_scale` 1–20.

**Explicitly NOT supported yet** (rejected loudly, never faked): reference
image/video, masks/control inputs, camera/motion instructions, fps, duration,
aspect presets. They will be added only when VACE conditioning is proven.

## Deploy on Lightning

```bash
cd <box-workdir>          # where models/ lives
# get the code (git pull, or copy the gpu-worker/ directory)
pip install -r gpu-worker/requirements.txt   # torch already present — do NOT reinstall torch
cd gpu-worker
export VACE_MODEL_PATH=/absolute/path/to/models/Wan2.1-VACE-1.3B-diffusers
python -m uvicorn gpu_server:app --host 0.0.0.0 --port 8000
```

First `POST /generate` lazily loads the model once (~19 GB, slow);
subsequent jobs reuse it. One generation runs at a time
(`VACE_MAX_CONCURRENT_GENERATIONS=1`); extra requests queue honestly.

## Test

```bash
# contract tests — no GPU, no model (runs anywhere):
cd gpu-worker
VACE_DISABLE_DISPATCHER=1 python -m pytest tests/ -v

# real end-to-end — Lightning box ONLY (loads the 19 GB model):
cd gpu-worker
VACE_MODEL_PATH=models/Wan2.1-VACE-1.3B-diffusers python smoke_test.py
# -> outputs/smoke/<run_id>/output.mp4
```

Manual check:

```bash
curl localhost:8000/health
curl -X POST localhost:8000/generate -H 'Content-Type: application/json' \
  -d '{"prompt":"a lighthouse at dusk, waves, cinematic"}'
curl localhost:8000/jobs/<job_id>      # poll to completed
curl -o out.mp4 localhost:8000/video/<job_id>
```

## Files

- `gpu_server.py` — FastAPI app, schemas, FIFO dispatcher, routes
- `vace_provider.py` — singleton `VACEProvider` (load-once, bf16, VAE tiling, offload)
- `job_store.py` — atomic JSON job persistence under `outputs/jobs/<job_id>/`
- `config.py` — all knobs via env (`VACE_*`), safe verified defaults
- `smoke_test.py` — real request→provider→MP4 regression (box only)
- `tests/test_contract.py` — GPU-free API contract suite
