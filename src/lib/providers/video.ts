// Video Generation Provider Implementations: Fal.ai + Replicate.
//
// The shared contract (VideoProvider, GenerateParams, BaseVideoProvider, …)
// lives in ./video-base and is re-exported here, so existing imports keep
// working unchanged.

import { getConfig } from '@/lib/config';
import {
  BaseVideoProvider,
  type GenerateParams,
  type GenerateResult,
  type JobStatus,
  type ProviderCapabilities,
} from '@/lib/providers/video-base';
import { VACEWorkerProvider } from '@/lib/providers/vace';
import type { GenerationParameters } from '@/lib/types';
import type { VideoProvider } from '@/lib/providers/video-base';

export {
  BaseVideoProvider,
  type GenerateParams,
  type GenerateResult,
  type JobStatus,
  type ProviderCapabilities,
  type VideoProvider,
} from '@/lib/providers/video-base';

// Fal.ai Provider
export class FalProvider extends BaseVideoProvider {
  name = 'fal';
  private apiKey: string;
  private baseUrl = 'https://fal.run/fal-ai';

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey || getConfig().FAL_API_KEY || '';
  }

  getSupportedModels(): string[] {
    return [
      'wan-2.1-14b-i2v',
      'wan-2.1-14b-t2v',
      'stable-video-diffusion',
      'luma-dream-machine',
      'runway-gen3',
      'pika',
      'minimax-video-01',
      'kling-video',
    ];
  }

  getDefaultParameters(): GenerationParameters {
    return {
      width: 1280,
      height: 720,
      fps: 24,
      frameCount: 72,
      duration: 3,
      guidanceScale: 7.5,
      steps: 30,
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      imageToVideo: true,
      videoToVideo: true,
      textToVideo: true,
      maxDuration: 10,
      maxResolution: { width: 1920, height: 1080 },
      supportedAspectRatios: ['16:9', '9:16', '4:3', '1:1', '21:9'],
      supportedFps: [24, 30],
      seedSupport: true,
    };
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    this.validateParameters(params);

    let endpoint: string;
    let payload: any;

    if (params.image && params.model.includes('i2v')) {
      endpoint = `${this.baseUrl}/${params.model}`;
      payload = {
        prompt: params.prompt,
        negative_prompt: params.negativePrompt,
        image_url: params.image,
        ...this.mapParameters(params.parameters),
      };
      if (params.seed) payload.seed = params.seed;
    } else if (params.video && params.model.includes('v2v')) {
      endpoint = `${this.baseUrl}/${params.model}`;
      payload = {
        prompt: params.prompt,
        negative_prompt: params.negativePrompt,
        video_url: params.video,
        ...this.mapParameters(params.parameters),
      };
    } else {
      endpoint = `${this.baseUrl}/${params.model}`;
      payload = {
        prompt: params.prompt,
        negative_prompt: params.negativePrompt,
        ...this.mapParameters(params.parameters),
      };
      if (params.seed) payload.seed = params.seed;
    }

    if (params.webhookUrl) {
      payload.webhook_url = params.webhookUrl;
    }

    const response = await this.makeRequest<{ request_id: string; status: string }>(
      endpoint,
      {
        method: 'POST',
        headers: this.buildHeaders(this.apiKey),
        body: JSON.stringify(payload),
      }
    );

    return {
      jobId: response.request_id,
      status: this.mapStatus(response.status),
    };
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    const response = await this.makeRequest<{ status: string; video?: { url: string } }>(
      `${this.baseUrl}/requests/${jobId}/status`,
      { method: 'GET', headers: this.buildHeaders(this.apiKey) }
    );

    if (response.video?.url) {
      return 'completed';
    }

    return this.mapStatus(response.status);
  }

  async cancel(jobId: string): Promise<boolean> {
    try {
      await this.makeRequest(
        `${this.baseUrl}/requests/${jobId}/cancel`,
        { method: 'POST', headers: this.buildHeaders(this.apiKey) }
      );
      return true;
    } catch {
      return false;
    }
  }

  async download(jobId: string, outputPath: string): Promise<void> {
    const status = await this.getStatus(jobId);
    if (status !== 'completed') {
      throw new Error(`Job not completed: ${status}`);
    }

    const response = await this.makeRequest<{ video: { url: string } }>(
      `${this.baseUrl}/requests/${jobId}/result`,
      { method: 'GET', headers: this.buildHeaders(this.apiKey) }
    );

    const videoUrl = response.video.url;
    const videoResponse = await fetch(videoUrl);
    const arrayBuffer = await videoResponse.arrayBuffer();
    
    const { writeFileSync } = await import('fs');
    writeFileSync(outputPath, Buffer.from(arrayBuffer));
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest(
        'https://fal.run/fal-ai/health',
        { method: 'GET', headers: this.buildHeaders(this.apiKey) },
        10000
      );
      return true;
    } catch {
      return false;
    }
  }

  private mapParameters(params: GenerationParameters): any {
    return {
      width: params.width,
      height: params.height,
      num_frames: params.frameCount,
      fps: params.fps,
      guidance_scale: params.guidanceScale,
      num_inference_steps: params.steps,
      ...params.providerSpecific,
    };
  }

  private mapStatus(status: string): JobStatus {
    const statusMap: Record<string, JobStatus> = {
      'IN_QUEUE': 'queued',
      'IN_PROGRESS': 'generating',
      'COMPLETED': 'completed',
      'FAILED': 'failed',
      'CANCELLED': 'cancelled',
    };
    return statusMap[status] || 'queued';
  }
}

// Replicate Provider
export class ReplicateProvider extends BaseVideoProvider {
  name = 'replicate';
  private apiToken: string;
  private baseUrl = 'https://api.replicate.com/v1';

  constructor(apiToken?: string) {
    super();
    this.apiToken = apiToken || getConfig().REPLICATE_API_TOKEN || '';
  }

  getSupportedModels(): string[] {
    return [
      'wan-2.1',
      'stable-video-diffusion',
      'luma-dream-machine',
      'runway-gen3',
      'pika',
      'minimax-video-01',
      'kling-video-v1.5',
      'hunyuan-video',
    ];
  }

  getDefaultParameters(): GenerationParameters {
    return {
      width: 1280,
      height: 720,
      fps: 24,
      frameCount: 72,
      duration: 3,
      guidanceScale: 7.5,
      steps: 30,
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      imageToVideo: true,
      videoToVideo: false,
      textToVideo: true,
      maxDuration: 10,
      maxResolution: { width: 1920, height: 1080 },
      supportedAspectRatios: ['16:9', '9:16', '4:3', '1:1'],
      supportedFps: [24, 30],
      seedSupport: true,
    };
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    this.validateParameters(params);

    // Map model names to Replicate model versions
    const modelMap: Record<string, string> = {
      'wan-2.1': 'wan-video/wan-2.1-14b:latest',
      'stable-video-diffusion': 'stability-ai/stable-video-diffusion:latest',
      'luma-dream-machine': 'luma/dream-machine:latest',
      'runway-gen3': 'runwayml/gen3:latest',
      'pika': 'pika/pika:latest',
      'minimax-video-01': 'minimax/video-01:latest',
      'kling-video-v1.5': 'kling/kling-v1.5:latest',
      'hunyuan-video': 'tencent/hunyuan-video:latest',
    };

    const modelVersion = modelMap[params.model] || params.model;

    const input: any = {
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      width: params.parameters.width,
      height: params.parameters.height,
      num_frames: params.parameters.frameCount,
      fps: params.parameters.fps,
      guidance_scale: params.parameters.guidanceScale,
      num_inference_steps: params.parameters.steps,
    };

    if (params.seed) input.seed = params.seed;
    if (params.image) input.image = params.image;
    if (params.video) input.video = params.video;

    const response = await this.makeRequest<{ id: string; status: string }>(
      `${this.baseUrl}/models/${modelVersion}/predictions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input, webhook: params.webhookUrl }),
      }
    );

    return {
      jobId: response.id,
      status: this.mapStatus(response.status),
    };
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    const response = await this.makeRequest<{ status: string; output?: string }>(
      `${this.baseUrl}/predictions/${jobId}`,
      { method: 'GET', headers: { 'Authorization': `Token ${this.apiToken}` } }
    );

    if (response.output) return 'completed';
    return this.mapStatus(response.status);
  }

  async cancel(jobId: string): Promise<boolean> {
    try {
      await this.makeRequest(
        `${this.baseUrl}/predictions/${jobId}/cancel`,
        { method: 'POST', headers: { 'Authorization': `Token ${this.apiToken}` } }
      );
      return true;
    } catch {
      return false;
    }
  }

  async download(jobId: string, outputPath: string): Promise<void> {
    const response = await this.makeRequest<{ output: string }>(
      `${this.baseUrl}/predictions/${jobId}`,
      { method: 'GET', headers: { 'Authorization': `Token ${this.apiToken}` } }
    );

    if (!response.output) {
      throw new Error('No output URL available');
    }

    const videoResponse = await fetch(response.output);
    const arrayBuffer = await videoResponse.arrayBuffer();
    
    const { writeFileSync } = await import('fs');
    writeFileSync(outputPath, Buffer.from(arrayBuffer));
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest(
        `${this.baseUrl}/models`,
        { method: 'GET', headers: { 'Authorization': `Token ${this.apiToken}` } },
        10000
      );
      return true;
    } catch {
      return false;
    }
  }

  private mapStatus(status: string): JobStatus {
    const statusMap: Record<string, JobStatus> = {
      'starting': 'preparing',
      'processing': 'generating',
      'succeeded': 'completed',
      'failed': 'failed',
      'canceled': 'cancelled',
    };
    return statusMap[status] || 'queued';
  }
}

// Provider Factory
export class VideoProviderFactory {
  private static providers: Map<string, VideoProvider> = new Map();

  static getProvider(
    type: 'fal' | 'replicate' | 'vace',
    apiKey?: string
  ): VideoProvider {
    const key = `${type}:${apiKey || 'default'}`;

    if (!this.providers.has(key)) {
      let provider: VideoProvider;

      switch (type) {
        case 'fal':
          provider = new FalProvider(apiKey);
          break;
        case 'replicate':
          provider = new ReplicateProvider(apiKey);
          break;
        case 'vace': {
          provider = new VACEWorkerProvider();
          break;
        }
        default:
          throw new Error(`Unknown provider: ${type}`);
      }

      this.providers.set(key, provider);
    }

    return this.providers.get(key)!;
  }

  static getAvailableProviders(): VideoProvider[] {
    const config = getConfig();
    const providers: VideoProvider[] = [];

    if (config.FAL_API_KEY) {
      providers.push(this.getProvider('fal'));
    }
    if (config.REPLICATE_API_TOKEN) {
      providers.push(this.getProvider('replicate'));
    }
    // Explicit opt-in only: the Lightning worker is not assumed present.
    if (config.GPU_WORKER_URL) {
      providers.push(this.getProvider('vace'));
    }

    return providers;
  }

  static getBestProvider(forTask: 'i2v' | 't2v' | 'v2v'): VideoProvider | null {
    const providers = this.getAvailableProviders();
    
    // Score providers based on capabilities for the task
    let best: VideoProvider | null = null;
    let bestScore = -1;
    
    for (const provider of providers) {
      const caps = provider.getCapabilities();
      let score = 0;
      
      if (forTask === 'i2v' && caps.imageToVideo) score += 10;
      if (forTask === 't2v' && caps.textToVideo) score += 10;
      if (forTask === 'v2v' && caps.videoToVideo) score += 10;
      
      // Prefer higher max duration and resolution
      score += Math.min(caps.maxDuration, 10);
      score += caps.maxResolution.width / 100;
      
      if (score > bestScore) {
        bestScore = score;
        best = provider;
      }
    }
    
    return best;
  }

  static clearCache() {
    this.providers.clear();
  }
}