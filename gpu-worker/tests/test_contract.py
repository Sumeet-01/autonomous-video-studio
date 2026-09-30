"""API contract tests — no GPU, no model, no network.

Covers request validation, job lifecycle bookkeeping, error shapes and the
health contract. Real diffusion is exercised ONLY by smoke_test.py on the
Lightning box. Run here (and in CI) with the dispatcher disabled so no
thread ever touches torch:

  cd gpu-worker
  VACE_DISABLE_DISPATCHER=1 python -m pytest tests/ -v
"""

from __future__ import annotations

import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["VACE_DISABLE_DISPATCHER"] = "1"
os.environ["OUTPUTS_DIR"] = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), ".test-outputs"
)

import gpu_server  # noqa: E402


@pytest.fixture()
def client() -> TestClient:
    return TestClient(gpu_server.app)


def test_health_shape(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is False  # cheap check, never loads
    assert isinstance(body["model_path"], str) and body["model_path"]
    assert body["queue_depth"] >= 0
    assert isinstance(body["active_jobs"], list)


def test_generate_enqueues_with_defaults(client: TestClient) -> None:
    res = client.post("/generate", json={"prompt": "a lighthouse at dusk"})
    assert res.status_code == 202
    body = res.json()
    assert body["job_id"]
    assert body["status"] == "queued"
    assert body["video_url"] == "/video/{}".format(body["job_id"])
    assert body["duration_seconds"] is None
    assert body["generation_seconds"] is None


def test_generate_accepts_valid_overrides(client: TestClient) -> None:
    res = client.post(
        "/generate",
        json={
            "prompt": "waves",
            "width": 512,
            "height": 320,
            "frames": 9,
            "steps": 2,
            "guidance_scale": 7.5,
            "seed": 42,
            "negative_prompt": "blurry",
        },
    )
    assert res.status_code == 202
    job_id = res.json()["job_id"]
    detail = client.get("/jobs/{}".format(job_id)).json()
    assert detail["parameters"]["width"] == 512
    assert detail["parameters"]["seed"] == 42
    assert detail["prompt"] == "waves"


def test_generate_rejects_bad_frames(client: TestClient) -> None:
    # 30 violates the (frames - 1) % 4 == 0 Wan constraint.
    res = client.post("/generate", json={"prompt": "x", "frames": 30})
    assert res.status_code == 422


def test_generate_rejects_non_multiple_of_16(client: TestClient) -> None:
    res = client.post("/generate", json={"prompt": "x", "width": 500})
    assert res.status_code == 422


def test_generate_rejects_unknown_fields(client: TestClient) -> None:
    # Unsupported capabilities (reference image, camera control, ...) must
    # fail loudly, never be silently ignored.
    res = client.post(
        "/generate", json={"prompt": "x", "reference_image": "data:..."}
    )
    assert res.status_code == 422
    res = client.post("/generate", json={"prompt": "x", "camera": "orbit"})
    assert res.status_code == 422


def test_generate_rejects_empty_prompt(client: TestClient) -> None:
    assert client.post("/generate", json={"prompt": ""}).status_code == 422
    assert client.post("/generate", json={}).status_code == 422


def test_job_poll_and_video_before_completion(client: TestClient) -> None:
    job_id = client.post("/generate", json={"prompt": "poll me"}).json()["job_id"]
    detail = client.get("/jobs/{}".format(job_id))
    assert detail.status_code == 200
    assert detail.json()["status"] == "queued"
    # No artifact yet: honest 409, not a fake video.
    video = client.get("/video/{}".format(job_id))
    assert video.status_code == 409


def test_unknown_job_ids_404(client: TestClient) -> None:
    assert client.get("/jobs/does-not-exist").status_code == 404
    assert client.get("/video/does-not-exist").status_code == 404
    assert client.post("/jobs/does-not-exist/cancel").status_code == 404


def test_cancel_queued_job(client: TestClient) -> None:
    job_id = client.post("/generate", json={"prompt": "cancel me"}).json()["job_id"]
    res = client.post("/jobs/{}/cancel".format(job_id))
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"
    assert client.get("/jobs/{}".format(job_id)).json()["status"] == "cancelled"
