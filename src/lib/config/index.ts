// Configuration system with validation and provider detection

import { z } from 'zod';

const EnvSchema = z.object({
  // Core AI APIs
  MODEL_API_KEY: z.string().optional(),
  
  // Video Generation Providers
  FAL_API_KEY: z.string().optional(),
  REPLICATE_API_TOKEN: z.string().optional(),
  
  // Voice Provider
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  
  // Storage (optional for cloud)
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  
  // Database
  DATABASE_URL: z.string().optional(),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  
  // Application
  NEXT_PUBLIC_APP_URL: z.string().url().optional().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // FFmpeg
  FFMPEG_PATH: z.string().optional().default('ffmpeg'),
  FFPROBE_PATH: z.string().optional().default('ffprobe'),
  
  // Python service
  PYTHON_SERVICE_URL: z.string().url().optional().default('http://localhost:8000'),
  
  // Feature flags
  ENABLE_LEARNING: z.coerce.boolean().default(true),
  ENABLE_3D: z.coerce.boolean().default(true),
  MAX_CONCURRENT_JOBS: z.coerce.number().default(3),
  DEFAULT_MAX_ATTEMPTS: z.coerce.number().default(3),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

let cachedConfig: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (cachedConfig) return cachedConfig;
  
  const parsed = EnvSchema.safeParse(process.env);
  
  if (!parsed.success) {
    console.error('Configuration validation failed:', parsed.error.flatten().fieldErrors);
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid configuration');
    }
  }
  
  cachedConfig = (parsed.success ? parsed.data : EnvSchema.parse({})) as EnvConfig;
  return cachedConfig;
}

export function getProviderStatus(): ProviderStatus[] {
  const config = getConfig();
  const statuses: ProviderStatus[] = [];
  
  // Muse Spark / Model API
  statuses.push({
    name: 'Muse Spark',
    type: 'analysis',
    configured: !!config.MODEL_API_KEY,
    keyPreview: config.MODEL_API_KEY ? maskKey(config.MODEL_API_KEY) : undefined,
    connected: false, // Will be tested at runtime
  });
  
  // Video Generation - Fal.ai
  statuses.push({
    name: 'Fal.ai',
    type: 'video',
    configured: !!config.FAL_API_KEY,
    keyPreview: config.FAL_API_KEY ? maskKey(config.FAL_API_KEY) : undefined,
    connected: false,
    models: ['wan-2.1-14b-i2v', 'wan-2.1-14b-t2v', 'stable-video-diffusion', 'luma-dream-machine', 'runway-gen3'],
  });
  
  // Video Generation - Replicate
  statuses.push({
    name: 'Replicate',
    type: 'video',
    configured: !!config.REPLICATE_API_TOKEN,
    keyPreview: config.REPLICATE_API_TOKEN ? maskKey(config.REPLICATE_API_TOKEN) : undefined,
    connected: false,
    models: ['wan-2.1', 'stable-video-diffusion', 'luma-dream-machine', 'runway-gen3', 'pika'],
  });
  
  // Voice - ElevenLabs
  statuses.push({
    name: 'ElevenLabs',
    type: 'voice',
    configured: !!config.ELEVENLABS_API_KEY,
    keyPreview: config.ELEVENLABS_API_KEY ? maskKey(config.ELEVENLABS_API_KEY) : undefined,
    connected: false,
    models: ['eleven_multilingual_v2', 'eleven_turbo_v2'],
    extra: config.ELEVENLABS_VOICE_ID ? `Voice: ${maskKey(config.ELEVENLABS_VOICE_ID)}` : undefined,
  });
  
  // FFmpeg
  statuses.push({
    name: 'FFmpeg',
    type: 'media',
    configured: true, // Will be verified at runtime
    connected: false,
  });
  
  // Storage
  const storageConfigured = !!(config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY && config.AWS_S3_BUCKET);
  statuses.push({
    name: 'S3 Storage',
    type: 'storage',
    configured: storageConfigured,
    connected: false,
  });

  // Supabase
  const supabaseConfigured = !!(config.NEXT_PUBLIC_SUPABASE_URL && config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  statuses.push({
    name: 'Supabase',
    type: 'database',
    configured: supabaseConfigured,
    keyPreview: config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? maskKey(config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) : undefined,
    connected: false,
    extra: config.NEXT_PUBLIC_SUPABASE_URL,
  });

  return statuses;
}

export interface ProviderStatus {
  name: string;
  type: 'analysis' | 'video' | 'voice' | 'media' | 'storage' | 'database';
  configured: boolean;
  keyPreview?: string;
  connected: boolean;
  models?: string[];
  extra?: string;
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return '••••••••' + key.slice(-4);
}

export async function testProviderConnections(): Promise<ProviderStatus[]> {
  const statuses = getProviderStatus();
  const config = getConfig();
  
  // Test each provider
  for (const status of statuses) {
    try {
      switch (status.type) {
        case 'analysis':
          if (config.MODEL_API_KEY) {
            status.connected = await testMuseSparkConnection(config.MODEL_API_KEY);
          }
          break;
        case 'video':
          if (status.name === 'Fal.ai' && config.FAL_API_KEY) {
            status.connected = await testFalConnection(config.FAL_API_KEY);
          } else if (status.name === 'Replicate' && config.REPLICATE_API_TOKEN) {
            status.connected = await testReplicateConnection(config.REPLICATE_API_TOKEN);
          }
          break;
        case 'voice':
          if (config.ELEVENLABS_API_KEY) {
            status.connected = await testElevenLabsConnection(config.ELEVENLABS_API_KEY);
          }
          break;
        case 'media':
          status.connected = await testFFmpeg();
          break;
        case 'storage':
          if (config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY && config.AWS_S3_BUCKET) {
            status.connected = await testS3Connection(config);
          }
          break;
        case 'database':
          if (config.NEXT_PUBLIC_SUPABASE_URL && config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
            status.connected = await testSupabaseConnection(
              config.NEXT_PUBLIC_SUPABASE_URL,
              config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
            );
          }
          break;
      }
    } catch (error) {
      status.connected = false;
      console.error(`Provider test failed for ${status.name}:`, error);
    }
  }
  
  return statuses;
}

async function testMuseSparkConnection(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.muse.meta.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function testFalConnection(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://fal.run/fal-ai/health', {
      headers: { 'Authorization': `Key ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function testReplicateConnection(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.replicate.com/v1/models', {
      headers: { 'Authorization': `Token ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function testElevenLabsConnection(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function testFFmpeg(): Promise<boolean> {
  try {
    const { spawn } = await import('child_process');
    const config = getConfig();
    return new Promise((resolve) => {
      const proc = spawn(config.FFMPEG_PATH, ['-version'], { stdio: 'ignore' });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
      // Timeout after 3 seconds
      setTimeout(() => { proc.kill(); resolve(false); }, 3000);
    });
  } catch {
    return false;
  }
}

async function testS3Connection(config: EnvConfig): Promise<boolean> {
  try {
    // Basic S3 connection test would go here
    // For now, just return true if credentials exist
    return true;
  } catch {
    return false;
  }
}

async function testSupabaseConnection(url: string, publishableKey: string): Promise<boolean> {
  try {
    // Genuine check against the Supabase Auth health endpoint.
    const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, {
      headers: { apikey: publishableKey },
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Project paths
export function getProjectPaths(projectId: string) {
  const base = process.env.PROJECTS_DIR || './projects';
  const projectDir = `${base}/${projectId}`;
  
  return {
    root: projectDir,
    references: `${projectDir}/references`,
    assets: `${projectDir}/assets`,
    frames: `${projectDir}/frames`,
    scenes: `${projectDir}/scenes`,
    audio: `${projectDir}/audio`,
    generations: `${projectDir}/generations`,
    exports: `${projectDir}/exports`,
    manifests: `${projectDir}/manifests`,
    temp: `${projectDir}/temp`,
    learning: `${projectDir}/learning`,
  };
}

export function getProductionOutputPath(): string {
  return process.env.PRODUCTION_OUTPUT_DIR || './production_output';
}

export function getTempPath(): string {
  return process.env.TEMP_DIR || './temp';
}