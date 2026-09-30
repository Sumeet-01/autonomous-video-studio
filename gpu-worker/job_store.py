"""Local job persistence for the GPU worker.

Jobs live under ``<OUTPUTS_DIR>/jobs/<job_id>/`` as ``job.json`` plus the
``output.mp4`` artifact. Writes are atomic (temp file + rename) and guarded
by a process-wide lock so dispatcher threads cannot corrupt each other.

This is deliberately local-file storage: the control-plane job system
(SQLite ``generation_attempts``) lives on the Mac, while the worker runs on
Lightning. No Supabase job table exists in the current architecture, so
nothing is duplicated here.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from config import OUTPUTS_DIR

# Terminal + transient states. ``cancelled`` is a superset of the original
# queued/running/completed/failed model: cancelling a queued job needs a
# terminal state that is honest about what happened (it never ran).
JOB_QUEUED = "queued"
JOB_RUNNING = "running"
JOB_COMPLETED = "completed"
JOB_FAILED = "failed"
JOB_CANCELLED = "cancelled"

_lock = threading.Lock()


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _jobs_root() -> str:
    return os.path.join(OUTPUTS_DIR, "jobs")


def job_dir(job_id: str) -> str:
    return os.path.join(_jobs_root(), job_id)


def output_path(job_id: str) -> str:
    return os.path.join(job_dir(job_id), "output.mp4")


def create_job(job_id: str, prompt: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    job: Dict[str, Any] = {
        "job_id": job_id,
        "status": JOB_QUEUED,
        "prompt": prompt,
        "parameters": parameters,
        "created_at": _utcnow(),
        "started_at": None,
        "completed_at": None,
        "output_path": output_path(job_id),
        "video_url": "/video/{}".format(job_id),
        "duration_seconds": None,
        "generation_seconds": None,
        "error": None,
        "queue_position": None,
    }
    _write(job)
    return job


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    path = os.path.join(job_dir(job_id), "job.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def update_job(job_id: str, **fields: Any) -> Optional[Dict[str, Any]]:
    with _lock:
        job = get_job(job_id)
        if job is None:
            return None
        job.update(fields)
        _write(job)
        return job


def list_jobs() -> List[Dict[str, Any]]:
    root = _jobs_root()
    jobs: List[Dict[str, Any]] = []
    try:
        entries = sorted(os.listdir(root))
    except OSError:
        return jobs
    for entry in entries:
        job = get_job(entry)
        if job is not None:
            jobs.append(job)
    return jobs


def _write(job: Dict[str, Any]) -> None:
    directory = job_dir(job["job_id"])
    os.makedirs(directory, exist_ok=True)
    tmp_path = os.path.join(directory, "job.json.tmp")
    final_path = os.path.join(directory, "job.json")
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(job, fh, indent=2)
    os.replace(tmp_path, final_path)
