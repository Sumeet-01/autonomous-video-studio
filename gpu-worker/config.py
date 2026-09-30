"""GPU worker configuration.

Every value is overridable by environment variable. Defaults match the
verified Lightning L4 configuration (Wan2.1-VACE-1.3B, 832x480, 33 frames,
30 steps). No model paths or tuning constants are hard-coded elsewhere.
"""

from __future__ import annotations

import os


def _get_str(name: str, default: str) -> str:
    value = os.getenv(name)
    return value if value not in (None, "") else default


def _get_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _get_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


# --- Model -----------------------------------------------------------------
# Path on the worker machine. Relative paths resolve against the worker's
# current working directory. Verified on Lightning:
#   models/Wan2.1-VACE-1.3B-diffusers
VACE_MODEL_PATH: str = _get_str(
    "VACE_MODEL_PATH", "models/Wan2.1-VACE-1.3B-diffusers"
)

# --- Verified defaults (Lightning L4, 24 GB) --------------------------------
VACE_DEFAULT_WIDTH: int = _get_int("VACE_DEFAULT_WIDTH", 832)
VACE_DEFAULT_HEIGHT: int = _get_int("VACE_DEFAULT_HEIGHT", 480)
VACE_DEFAULT_FRAMES: int = _get_int("VACE_DEFAULT_FRAMES", 33)
VACE_DEFAULT_STEPS: int = _get_int("VACE_DEFAULT_STEPS", 30)
VACE_DEFAULT_GUIDANCE: float = _get_float("VACE_DEFAULT_GUIDANCE", 5.0)

# MP4 assembly frame rate. The verified artifact was 33 frames; at 8 fps that
# is ~4.1 s of video. Duration reported by the API is frames / fps.
VACE_VIDEO_FPS: int = _get_int("VACE_VIDEO_FPS", 8)

# --- Request validation bounds ----------------------------------------------
# Wan's VAE downsamples 8x and the transformer patches 2x on top of that, so
# both dimensions must be multiples of 16. Upper bounds are conservative for
# the L4: 832x480 is verified; larger is allowed but untested (may OOM).
VACE_MIN_DIM: int = _get_int("VACE_MIN_DIM", 256)
VACE_MAX_DIM: int = _get_int("VACE_MAX_DIM", 1024)
# Wan video length constraint: num_frames = 4k + 1.
VACE_MIN_FRAMES: int = _get_int("VACE_MIN_FRAMES", 5)
VACE_MAX_FRAMES: int = _get_int("VACE_MAX_FRAMES", 81)
VACE_MIN_STEPS: int = _get_int("VACE_MIN_STEPS", 1)
VACE_MAX_STEPS: int = _get_int("VACE_MAX_STEPS", 50)
VACE_MIN_GUIDANCE: float = _get_float("VACE_MIN_GUIDANCE", 1.0)
VACE_MAX_GUIDANCE: float = _get_float("VACE_MAX_GUIDANCE", 20.0)

# --- Concurrency --------------------------------------------------------------
# Number of dispatcher threads pulling the generation queue. Default 1: only
# one diffusion run at a time, which is what fits in L4 VRAM. Raising this
# without a bigger GPU will cause CUDA OOM — the lock/queue exists precisely
# to prevent that.
VACE_MAX_CONCURRENT_GENERATIONS: int = _get_int(
    "VACE_MAX_CONCURRENT_GENERATIONS", 1
)

# --- Storage ------------------------------------------------------------------
OUTPUTS_DIR: str = _get_str("OUTPUTS_DIR", "outputs")

# --- HTTP ---------------------------------------------------------------------
WORKER_HOST: str = _get_str("WORKER_HOST", "0.0.0.0")
WORKER_PORT: int = _get_int("WORKER_PORT", 8000)

# Test-only escape hatch: when "1", background dispatcher threads are not
# started, so contract tests can assert enqueue/validation behaviour without
# loading the model. Never set in production.
DISABLE_DISPATCHER: bool = os.getenv("VACE_DISABLE_DISPATCHER") == "1"
