"""VACE GPU worker API (replaces the temporary test_vace.py bridge).

Endpoints:
  GET  /health            cheap liveness check (never loads the model)
  POST /generate          enqueue a generation, returns 202 immediately
  GET  /jobs/{job_id}     poll job state until completed/failed
  GET  /video/{job_id}    download the finished MP4
  POST /jobs/{job_id}/cancel  cancel a still-queued job

Execution model: POST /generate is ASYNC by design. Diffusion on the L4
takes minutes and only one run fits in VRAM, so the request only enqueues
and a single background dispatcher thread (config
VACE_MAX_CONCURRENT_GENERATIONS, default 1) runs jobs FIFO. This mirrors
the control-plane contract exactly: submit -> poll status -> download.

The request schema accepts ONLY parameters the current VACE implementation
supports. Anything else (reference image/video, masks, camera or motion
controls, fps, duration, aspect presets) is rejected with 422
(extra="forbid") and documented in README.md — never silently ignored.
"""

from __future__ import annotations

import logging
import queue
import threading
import uuid
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

import config
import job_store
from job_store import (
    JOB_CANCELLED,
    JOB_COMPLETED,
    JOB_FAILED,
    JOB_QUEUED,
    JOB_RUNNING,
)

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s",'
    '"component":"gpu-worker","message":"%(message)s"}',
)
logger = logging.getLogger("gpu-worker")

app = FastAPI(title="VACE GPU worker", version="1.0.0")

# FIFO of job_ids awaiting diffusion. One dispatcher per configured slot;
# default 1, so at most one generation touches CUDA at any moment.
_pending: "queue.Queue[str]" = queue.Queue()
_active: Dict[str, bool] = {}
_active_lock = threading.Lock()


# -- schemas ------------------------------------------------------------------


class GenerateRequest(BaseModel):
    model_config = {"extra": "forbid"}

    prompt: str = Field(min_length=1, max_length=2000)
    width: int = Field(default=config.VACE_DEFAULT_WIDTH)
    height: int = Field(default=config.VACE_DEFAULT_HEIGHT)
    frames: int = Field(default=config.VACE_DEFAULT_FRAMES)
    steps: int = Field(default=config.VACE_DEFAULT_STEPS)
    guidance_scale: float = Field(default=config.VACE_DEFAULT_GUIDANCE)
    seed: Optional[int] = Field(default=None, ge=0)
    negative_prompt: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("width", "height")
    @classmethod
    def _dims(cls, value: int, info: Any) -> int:
        if not config.VACE_MIN_DIM <= value <= config.VACE_MAX_DIM:
            raise ValueError(
                "{} must be within [{}, {}]".format(
                    info.field_name, config.VACE_MIN_DIM, config.VACE_MAX_DIM
                )
            )
        if value % 16 != 0:
            raise ValueError(
                "{} must be a multiple of 16 (VAE/patch constraint)".format(
                    info.field_name
                )
            )
        return value

    @field_validator("frames")
    @classmethod
    def _frames(cls, value: int) -> int:
        if not config.VACE_MIN_FRAMES <= value <= config.VACE_MAX_FRAMES:
            raise ValueError(
                "frames must be within [{}, {}]".format(
                    config.VACE_MIN_FRAMES, config.VACE_MAX_FRAMES
                )
            )
        if (value - 1) % 4 != 0:
            raise ValueError("frames must satisfy (frames - 1) % 4 == 0")
        if value > config.VACE_DEFAULT_FRAMES:
            logger.warning(
                "frames=%d exceeds the L4-verified %d and may OOM",
                value,
                config.VACE_DEFAULT_FRAMES,
            )
        return value

    @field_validator("steps")
    @classmethod
    def _steps(cls, value: int) -> int:
        if not config.VACE_MIN_STEPS <= value <= config.VACE_MAX_STEPS:
            raise ValueError(
                "steps must be within [{}, {}]".format(
                    config.VACE_MIN_STEPS, config.VACE_MAX_STEPS
                )
            )
        return value

    @field_validator("guidance_scale")
    @classmethod
    def _guidance(cls, value: float) -> float:
        if not config.VACE_MIN_GUIDANCE <= value <= config.VACE_MAX_GUIDANCE:
            raise ValueError(
                "guidance_scale must be within [{}, {}]".format(
                    config.VACE_MIN_GUIDANCE, config.VACE_MAX_GUIDANCE
                )
            )
        return value


class JobResponse(BaseModel):
    job_id: str
    status: str
    video_url: str
    duration_seconds: Optional[float] = None
    generation_seconds: Optional[float] = None
    error: Optional[str] = None


class JobDetail(JobResponse):
    prompt: str
    parameters: Dict[str, Any]
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    queue_position: Optional[int] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_path: str
    queue_depth: int
    active_jobs: List[str]


def _to_response(job: Dict[str, Any]) -> JobResponse:
    return JobResponse(
        job_id=job["job_id"],
        status=job["status"],
        video_url=job["video_url"],
        duration_seconds=job.get("duration_seconds"),
        generation_seconds=job.get("generation_seconds"),
        error=job.get("error"),
    )


def _queue_positions() -> Dict[str, int]:
    with _active_lock:
        items = list(_pending.queue)
    return {job_id: index + 1 for index, job_id in enumerate(items)}


# -- dispatcher -----------------------------------------------------------------


def _run_job(job_id: str) -> None:
    job = job_store.get_job(job_id)
    if job is None or job["status"] != JOB_QUEUED:
        return  # cancelled (or vanished) while waiting
    # Lazy import: keeps `import gpu_server` torch-free so contract tests
    # and --help style imports work without a GPU.
    from vace_provider import VACEGenerationError, get_provider

    job_store.update_job(job_id, status=JOB_RUNNING, started_at=_now())
    params = job["parameters"]
    try:
        result = get_provider().generate(
            job["prompt"],
            width=params["width"],
            height=params["height"],
            frames=params["frames"],
            steps=params["steps"],
            guidance_scale=params["guidance_scale"],
            seed=params.get("seed"),
            negative_prompt=params.get("negative_prompt"),
            output_path=job_store.output_path(job_id),
        )
        job_store.update_job(
            job_id,
            status=JOB_COMPLETED,
            completed_at=_now(),
            duration_seconds=result["duration_seconds"],
            generation_seconds=result["generation_seconds"],
        )
        logger.info("job completed job_id=%s", job_id)
    except VACEGenerationError as exc:
        job_store.update_job(
            job_id, status=JOB_FAILED, completed_at=_now(), error=str(exc)
        )
        logger.error("job failed job_id=%s error=%s", job_id, exc)
    except Exception as exc:  # defensive: a job must never kill the dispatcher
        job_store.update_job(
            job_id,
            status=JOB_FAILED,
            completed_at=_now(),
            error="{}: {}".format(type(exc).__name__, exc),
        )
        logger.exception("job crashed job_id=%s", job_id)


def _now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def _dispatcher() -> None:
    while True:
        job_id = _pending.get()
        with _active_lock:
            _active[job_id] = True
        try:
            _run_job(job_id)
        finally:
            with _active_lock:
                _active.pop(job_id, None)
            _pending.task_done()


def _start_dispatchers() -> None:
    slots = max(1, config.VACE_MAX_CONCURRENT_GENERATIONS)
    for index in range(slots):
        thread = threading.Thread(
            target=_dispatcher, name="vace-dispatcher-{}".format(index), daemon=True
        )
        thread.start()
    logger.info("dispatchers started slots=%d", slots)


if not config.DISABLE_DISPATCHER:
    _start_dispatchers()


# -- routes -----------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    # Cheap by design: reports load state, never triggers a load.
    try:
        from vace_provider import get_provider

        loaded = get_provider().is_loaded
    except Exception:
        loaded = False
    with _active_lock:
        active = sorted(_active.keys())
    return HealthResponse(
        status="ok",
        model_loaded=loaded,
        model_path=config.VACE_MODEL_PATH,
        queue_depth=_pending.qsize(),
        active_jobs=active,
    )


@app.post("/generate", response_model=JobResponse, status_code=202)
def generate(body: GenerateRequest) -> JobResponse:
    job_id = uuid.uuid4().hex
    parameters = {
        "width": body.width,
        "height": body.height,
        "frames": body.frames,
        "steps": body.steps,
        "guidance_scale": body.guidance_scale,
        "seed": body.seed,
        "negative_prompt": body.negative_prompt,
    }
    job = job_store.create_job(job_id, body.prompt, parameters)
    _pending.put(job_id)
    job = job_store.update_job(
        job_id, queue_position=_queue_positions().get(job_id)
    ) or job
    logger.info(
        "job enqueued job_id=%s queue_depth=%d", job_id, _pending.qsize()
    )
    return _to_response(job)


@app.get("/jobs/{job_id}", response_model=JobDetail)
def get_job(job_id: str) -> JobDetail:
    job = job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job_id")
    position = _queue_positions().get(job_id)
    if position is not None and job["status"] == JOB_QUEUED:
        job = job_store.update_job(job_id, queue_position=position) or job
    return JobDetail(
        **_to_response(job).model_dump(),
        prompt=job["prompt"],
        parameters=job["parameters"],
        created_at=job["created_at"],
        started_at=job.get("started_at"),
        completed_at=job.get("completed_at"),
        queue_position=job.get("queue_position"),
    )


@app.get("/video/{job_id}")
def get_video(job_id: str) -> FileResponse:
    job = job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job_id")
    if job["status"] != JOB_COMPLETED:
        raise HTTPException(
            status_code=409,
            detail="job is {} — video available only after completion".format(
                job["status"]
            ),
        )
    path = job["output_path"]
    import os

    if not os.path.isfile(path):
        raise HTTPException(status_code=410, detail="artifact missing on disk")
    return FileResponse(path, media_type="video/mp4", filename="{}.mp4".format(job_id))


@app.post("/jobs/{job_id}/cancel", response_model=JobResponse)
def cancel_job(job_id: str) -> JobResponse:
    job = job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job_id")
    if job["status"] != JOB_QUEUED:
        # A running diffusion pass cannot be safely preempted mid-denoise
        # on a single L4, so only queued jobs are cancellable.
        raise HTTPException(
            status_code=409,
            detail="only queued jobs can be cancelled (job is {})".format(
                job["status"]
            ),
        )
    # Remove from the FIFO so the dispatcher skips it, then mark terminal.
    with _active_lock:
        try:
            _pending.queue.remove(job_id)
        except ValueError:
            pass
    job = job_store.update_job(
        job_id, status=JOB_CANCELLED, completed_at=_now(), error="cancelled by user"
    ) or job
    logger.info("job cancelled job_id=%s", job_id)
    return _to_response(job)


# Backwards-compatible alias: some clients address the singleton app module.
app.title = "VACE GPU worker"
