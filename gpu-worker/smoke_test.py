"""Lightning-only smoke test: request -> VACEProvider -> MP4.

Runs the REAL diffusion stack end-to-end (no mocks, no placeholders) with a
tiny-but-valid configuration so it finishes quickly:

  frames=9  ((9-1) % 4 == 0, valid Wan length)
  steps=1   (single denoise pass — exercises the full pipeline)
  256x160   (multiples of 16)

It still loads the ~19 GB checkpoint once, so run it ONLY on the GPU box:

  cd gpu-worker
  VACE_MODEL_PATH=models/Wan2.1-VACE-1.3B-diffusers python smoke_test.py

Exits 0 with artifact at outputs/smoke/<run_id>/output.mp4 on success,
non-zero with the provider error otherwise. Not part of `pytest`: normal
unit tests must never trigger a model load.
"""

from __future__ import annotations

import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from vace_provider import VACEGenerationError, get_provider  # noqa: E402


def main() -> int:
    run_id = uuid.uuid4().hex[:8]
    out_dir = os.path.join("outputs", "smoke", run_id)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "output.mp4")

    prompt = "a calm lake at dawn, soft light, gentle ripples, cinematic"
    print("[smoke] prompt={!r}".format(prompt), flush=True)
    started = time.monotonic()
    try:
        result = get_provider().generate(
            prompt,
            width=256,
            height=160,
            frames=9,
            steps=1,
            guidance_scale=5.0,
            seed=0,
            negative_prompt=None,
            output_path=out_path,
        )
    except VACEGenerationError as exc:
        print("[smoke] FAILED: {}".format(exc), flush=True)
        return 1

    size = os.path.getsize(out_path)
    with open(out_path, "rb") as fh:
        magic = fh.read(12)
    # MP4 files carry an 'ftyp' box within the first bytes.
    assert b"ftyp" in magic, "output is not a valid MP4 container"
    assert size > 10_000, "output suspiciously small ({} bytes)".format(size)
    print(
        "[smoke] OK in {:.1f}s -> {} ({} bytes, {:.2f}s video)".format(
            time.monotonic() - started,
            out_path,
            size,
            result["duration_seconds"],
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
