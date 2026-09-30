// Shared video-provider contract: interfaces + base class.
//
// Lives in its own module so concrete providers (fal, replicate, vace) and
// the factory can reference each other without import cycles.

import { getConfig } from '@/lib/config';
import type { GenerationParameters } from '@/lib/types';

export interface VideoProvider {
  name: string;
  generate(params: GenerateParams): Promise<GenerateResult>;
  getStatus(jobId: string): Promise<JobStatus>;
  cancel(jobId: string): Promise<boolean>;
  download(jobId: string, outputPath: string): Promise<void>;
  testConnection(): Promise<boolean>;
  getSupportedModels(): string[];
  getDefaultParameters(): GenerationParameters;
  getCapabilities(): ProviderCapabilities;
}

export interface GenerateParams {
  prompt: string;
  negativePrompt?: string;
  image?: string; // base64 or URL for image-to-video
  video?: string; // base64 or URL for video-to-video
  parameters: GenerationParameters;
  model: string;
  seed?: number;
  webhookUrl?: string;
}

export interface GenerateResult {
  jobId: string;
  status: JobStatus;
  estimatedTime?: number;
  outputUrl?: string;
}

export type JobStatus = 'queued' | 'preparing' | 'generating' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface ProviderCapabilities {
  imageToVideo: boolean;
  videoToVideo: boolean;
  textToVideo: boolean;
  maxDuration: number;
  maxResolution: { width: number; height: number };
  supportedAspectRatios: string[];
  supportedFps: number[];
  seedSupport: boolean;
}

// Base provider class with common functionality
export abstract class BaseVideoProvider implements VideoProvider {
  abstract name: string;
  abstract generate(params: GenerateParams): Promise<GenerateResult>;
  abstract getStatus(jobId: string): Promise<JobStatus>;
  abstract cancel(jobId: string): Promise<boolean>;
  abstract download(jobId: string, outputPath: string): Promise<void>;
  abstract testConnection(): Promise<boolean>;
  abstract getSupportedModels(): string[];
  abstract getDefaultParameters(): GenerationParameters;
  abstract getCapabilities(): ProviderCapabilities;

  protected config = getConfig();

  protected async makeRequest<T>(
    url: string,
    options: RequestInit,
    timeout = 300000
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${this.name} API error: ${response.status} - ${error}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`${this.name} request timeout`);
      }
      throw error;
    }
  }

  protected buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  validateParameters(params: GenerateParams): void {
    const caps = this.getCapabilities();

    if (params.parameters.duration > caps.maxDuration) {
      throw new Error(`Duration ${params.parameters.duration}s exceeds maximum ${caps.maxDuration}s`);
    }

    if (params.parameters.width > caps.maxResolution.width || params.parameters.height > caps.maxResolution.height) {
      throw new Error(`Resolution ${params.parameters.width}x${params.parameters.height} exceeds maximum ${caps.maxResolution.width}x${caps.maxResolution.height}`);
    }

    if (!caps.supportedAspectRatios.includes(`${params.parameters.width}:${params.parameters.height}`)) {
      const ratio = params.parameters.width / params.parameters.height;
      const supported = caps.supportedAspectRatios.map(r => {
        const [w, h] = r.split(':').map(Number);
        return w / h;
      });
      const closest = supported.reduce((prev, curr) =>
        Math.abs(curr - ratio) < Math.abs(prev - ratio) ? curr : prev
      );
      console.warn(`Aspect ratio ${params.parameters.width}:${params.parameters.height} not directly supported, closest: ${closest}`);
    }
  }
}
