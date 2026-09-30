"""Reusable Wan2.1-VACE-1.3B provider.

One process-wide instance owns the model. The ~19 GB checkpoint loads ONCE
(lazily, on first generation) and is reused for every subsequent request.

Memory recipe (verified on Lightning L4 24 GB for 832x480 / 33f / 30 steps):
  - transformer + text encoder in bfloat16
  - VAE tiled encode AND tiled decode (this is what fixed the earlier OOM)
  - model CPU offload so only the active submodule sits on CUDA
  - scheduler left exactly as shipped in the checkpoint repo
    (do not override it — the verified run used the repo default)

ASSUMPTIONS (verify against scripts/test_vace.py on Lightning before
deleting the old bridge):
  A1. ``diffusers.WanVACEPipeline`` exists in diffusers 0.40.0 and its
      ``__call__`` accepts prompt/negative_prompt/height/width/num_frames/
      guidance_scale/num_inference_steps/generator, returning an object
      with ``.frames`` (PIL list) — the standard Wan pipeline surface.
  A2. ``enable_model_cpu_offload()`` (not sequential) matches the proven run.
  A3. ``vae.enable_tiling()`` + ``vae.enable_slicing()`` matches the proven
      VAE configuration.
  A4. The scheduler is left exactly as shipped in the checkpoint
      (``from_pretrained`` default) — the verified run did not override it.

Only parameters the current implementation actually supports are accepted
(see gpu_server.GenerateRequest). Reference images/video, masks, camera and
motion controls are NOT exposed — they will be added when VACE conditioning
is proven, not before.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, List, Optional

import numpy as np

import config

logger = logging.getLogger("vace_provider")


class VACEGenerationError(RuntimeError):
    """A diffusion run failed after the model was correctly loaded."""


class VACEProvider:
    """Single reusable VACE pipeline instance per worker process."""

    def __init__(self, model_path: Optional[str] = None) -> None:
        self._model_path = model_path or config.VACE_MODEL_PATH
        self._pipe: Any = None
        self._load_lock = threading.Lock()

    # -- lifecycle ---------------------------------------------------------
    @property
    def model_path(self) -> str:
        return self._model_path

    @property
    def is_loaded(self) -> bool:
        return self._pipe is not None

    def ensure_loaded(self) -> None:
        """Load the checkpoint once, thread-safely. No-op when loaded."""
        if self._pipe is not None:
            return
        with self._load_lock:
            if self._pipe is not None:
                return
            import torch
            from diffusers import WanVACEPipeline  # see assumption A1

            started = time.monotonic()
            logger.info(
                "loading VACE model",
                extra={"extra": {"model_path": self._model_path}},
            )
            try:
                pipe = WanVACEPipeline.from_pretrained(
                    self._model_path,
                    torch_dtype=torch.bfloat16,
                )
                # OOM recipe: tiled VAE in both directions (assumption A3).
                pipe.vae.enable_tiling()
                pipe.vae.enable_slicing()
                # Keep only the active submodule on CUDA (assumption A2).
                # Scheduler intentionally untouched — repo default (A4 below).
                pipe.enable_model_cpu_offload()
            except Exception as exc:
                logger.exception("VACE model load failed")
                raise VACEGenerationError(
                    "failed to load VACE model from {}: {}".format(
                        self._model_path, exc
                    )
                ) from exc
            self._pipe = pipe
            elapsed = time.monotonic() - started
            logger.info(
                "VACE model loaded",
                extra={"extra": {"seconds": round(elapsed, 1)}},
            )

    # -- generation ----------------------------------------------------------
    def generate(
        self,
        prompt: str,
        *,
        width: int,
        height: int,
        frames: int,
        steps: int,
        guidance_scale: float,
        seed: Optional[int],
        negative_prompt: Optional[str],
        output_path: str,
        fps: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Run one diffusion job and write the MP4 artifact.

        Raises VACEGenerationError on any diffusion/encoding failure.
        """
        self.ensure_loaded()
        import torch

        if width % 16 != 0 or height % 16 != 0:
            raise ValueError("width and height must each be a multiple of 16")
        if (frames - 1) % 4 != 0:
            raise ValueError("frames must satisfy (frames - 1) % 4 == 0")

        fps = fps or config.VACE_VIDEO_FPS
        generator = None
        if seed is not None:
            generator = torch.Generator(device="cuda").manual_seed(int(seed))

        started = time.monotonic()
        logger.info(
            "generation started",
            extra={
                "extra": {
                    "width": width,
                    "height": height,
                    "frames": frames,
                    "steps": steps,
                    "guidance": guidance_scale,
                    "seed": seed,
                }
            },
        )
        try:
            torch.cuda.empty_cache()
            output = self._pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                height=height,
                width=width,
                num_frames=frames,
                guidance_scale=guidance_scale,
                num_inference_steps=steps,
                generator=generator,
            )
            pil_frames: List[Any] = list(output.frames[0])
            arrays = [np.asarray(frame) for frame in pil_frames]
            self._write_mp4(output_path, arrays, fps)
        except Exception as exc:
            logger.exception("generation failed")
            raise VACEGenerationError(
                "{}: {}".format(type(exc).__name__, exc)
            ) from exc
        finally:
            try:
                import torch as _torch

                _torch.cuda.empty_cache()
            except Exception:
                pass

        generation_seconds = time.monotonic() - started
        logger.info(
            "generation finished",
            extra={
                "extra": {
                    "output_path": output_path,
                    "seconds": round(generation_seconds, 1),
                }
            },
        )
        return {
            "output_path": output_path,
            "generation_seconds": generation_seconds,
            "duration_seconds": len(pil_frames) / float(fps),
        }

    # -- output ----------------------------------------------------------------
    @staticmethod
    def _write_mp4(path: str, arrays: List[Any], fps: int) -> None:
        import os

        import imageio.v2 as imageio

        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        # 832x480 (and any multiple-of-16 size) satisfies libx264's
        # macro-block requirement, so no silent rescaling occurs.
        with imageio.get_writer(
            path, fps=fps, codec="libx264", quality=8, macro_block_size=16
        ) as writer:
            for frame in arrays:
                writer.append_data(frame)


_provider: Optional[VACEProvider] = None
_provider_lock = threading.Lock()


def get_provider() -> VACEProvider:
    """Process-wide singleton accessor."""
    global _provider
    if _provider is None:
        with _provider_lock:
            if _provider is None:
                _provider = VACEProvider()
    return _provider
