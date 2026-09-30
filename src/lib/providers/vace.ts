// Lightning VACE worker provider.
//
// HTTP client for gpu-worker/ (FastAPI on the L4 box). Implements the
// existing VideoProvider interface so the orchestrator treats it like any
// other provider: generate() submits, getStatus() polls, download() fetches.
//
// Reads GPU_WORKER_URL (explicit opt-in), falling back to PYTHON_SERVICE_URL.
// Only text-to-video is supported: image/video conditioning is rejected with
// an explicit error, never silently dropped.
import { getConfig } from '@/lib/config';
import {
  BaseVideoProvider,
  type GenerateParams,
  type GenerateResult,
  type JobStatus,
  type ProviderCapabilities,
} from '@/lib/providers/video-base';
import type { GenerationParameters } from '@/lib/types';

export const VACE_MODEL_ID = 'wan2.1-vace-1.3b';

// Verified Lightning configuration (must match gpu-worker/config.py).
export const VACE_DEFAULTS = {
  width: 832,
  height: 480,
  frames: 33,
  steps: 30,
  guidance: 5.0,
  fps: 8,
} as const;

export class VACEWorkerProvider extends BaseVideoProvider {
  name = 'vace';
  private baseUrl: string;

  constructor(baseUrl?: string) {
    super();
    const config = getConfig();
    const raw =
      baseUrl || config.GPU_WORKER_URL || config.PYTHON_SERVICE_URL || '';
    this.baseUrl = raw.replace(/\/$/, '');
  }

  getSupportedModels(): string[] {
    return [VACE_MODEL_ID];
  }

  getDefaultParameters(): GenerationParameters {
    return {
      width: VACE_DEFAULTS.width,
      height: VACE_DEFAULTS.height,
      fps: VACE_DEFAULTS.fps,
      frameCount: VACE_DEFAULTS.frames,
      duration: VACE_DEFAULTS.frames / VACE_DEFAULTS.fps,
      guidanceScale: VACE_DEFAULTS.guidance,
      steps: VACE_DEFAULTS.steps,
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      // Text-to-video only. Reference image/video and mask conditioning are
      // not implemented in the worker; generate() rejects them explicitly.
      imageToVideo: false,
      videoToVideo: false,
      textToVideo: true,
      // Duration is derived (frames / fps), not requested; max derivable
      // from the worker's frame ceiling (81 @ 8 fps).
      maxDuration: 81 / VACE_DEFAULTS.fps,
      maxResolution: { width: 1024, height: 1024 },
      supportedAspectRatios: ['16:9'],
      supportedFps: [VACE_DEFAULTS.fps],
      seedSupport: true,
    };
  }

  // Duration/fps are worker-derived, so the base duration check does not
  // apply. Validate what the worker actually enforces instead.
  override validateParameters(params: GenerateParams): void {
    const p = params.parameters;
    for (const [label, value] of [
      ['width', p.width],
      ['height', p.height],
    ] as const) {
      if (value < 256 || value > 1024 || value % 16 !== 0) {
        throw new Error(
          `VACE ${label} must be a multiple of 16 within 256..1024 (got ${value})`
        );
      }
    }
    if (p.frameCount < 5 || p.frameCount > 81 || (p.frameCount - 1) % 4 !== 0) {
      throw new Error(
        `VACE frameCount must satisfy (n-1)%4==0 within 5..81 (got ${p.frameCount})`
      );
    }
    if ((p.steps ?? 30) < 1 || (p.steps ?? 30) > 50) {
      throw new Error(`VACE steps must be within 1..50 (got ${p.steps})`);
    }
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    if (params.image || params.video) {
      throw new Error(
        'VACE worker does not support image/video conditioning yet — ' +
          'text-to-video only. See gpu-worker/README.md.'
      );
    }
    if (params.model && params.model !== VACE_MODEL_ID) {
      throw new Error(
        `VACE worker serves only ${VACE_MODEL_ID} (requested ${params.model})`
      );
    }
    this.validateParameters(params);

    const body: Record<string, unknown> = {
      prompt: params.prompt,
      negative_prompt: params.negativePrompt ?? null,
      width: params.parameters.width,
      height: params.parameters.height,
      frames: params.parameters.frameCount,
      steps: params.parameters.steps ?? VACE_DEFAULTS.steps,
      guidance_scale:
        params.parameters.guidanceScale ?? VACE_DEFAULTS.guidance,
      seed: params.seed ?? params.parameters.seed ?? null,
    };

    const res = await this.makeRequest<{
      job_id: string;
      status: string;
    }>(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return { jobId: res.job_id, status: this.mapStatus(res.status) };
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    const res = await this.makeRequest<{ status: string }>(
      `${this.baseUrl}/jobs/${jobId}`,
      { method: 'GET' }
    );
    return this.mapStatus(res.status);
  }

  async cancel(jobId: string): Promise<boolean> {
    try {
      await this.makeRequest(`${this.baseUrl}/jobs/${jobId}/cancel`, {
        method: 'POST',
      });
      return true;
    } catch {
      // 404 unknown job, or 409 running job (cannot preempt mid-denoise).
      return false;
    }
  }

  async download(jobId: string, outputPath: string): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);
    try {
      const response = await fetch(`${this.baseUrl}/video/${jobId}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          `VACE download failed (${response.status}): ${detail.slice(0, 300)}`
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      const { writeFileSync } = await import('fs');
      writeFileSync(outputPath, Buffer.from(arrayBuffer));
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { status?: string };
      return body.status === 'ok';
    } catch {
      return false;
    }
  }

  private mapStatus(status: string): JobStatus {
    const statusMap: Record<string, JobStatus> = {
      queued: 'queued',
      running: 'generating',
      completed: 'completed',
      failed: 'failed',
      cancelled: 'cancelled',
    };
    return statusMap[status] ?? 'queued';
  }
}
