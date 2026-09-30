import { describe, it, expect } from 'vitest';
import {
  VACEWorkerProvider,
  VACE_MODEL_ID,
  VACE_DEFAULTS,
} from '@/lib/providers/vace';
import type { GenerateParams } from '@/lib/providers/video-base';

function baseParams(overrides: Partial<GenerateParams> = {}): GenerateParams {
  return {
    prompt: 'a lighthouse at dusk, waves, cinematic',
    parameters: {
      width: 832,
      height: 480,
      fps: 8,
      frameCount: 33,
      duration: 33 / 8,
      guidanceScale: 5.0,
      steps: 30,
    },
    model: VACE_MODEL_ID,
    ...overrides,
  };
}

describe('VACEWorkerProvider', () => {
  it('exposes the verified Lightning defaults', () => {
    const provider = new VACEWorkerProvider('http://localhost:8000');
    expect(provider.name).toBe('vace');
    expect(provider.getSupportedModels()).toEqual([VACE_MODEL_ID]);
    expect(VACE_DEFAULTS).toMatchObject({
      width: 832,
      height: 480,
      frames: 33,
      steps: 30,
      guidance: 5.0,
    });
    const defaults = provider.getDefaultParameters();
    expect(defaults.width).toBe(832);
    expect(defaults.frameCount).toBe(33);
  });

  it('advertises text-to-video only', () => {
    const caps = new VACEWorkerProvider('http://localhost:8000').getCapabilities();
    expect(caps.textToVideo).toBe(true);
    expect(caps.imageToVideo).toBe(false);
    expect(caps.videoToVideo).toBe(false);
    expect(caps.seedSupport).toBe(true);
  });

  it('accepts the verified configuration', () => {
    const provider = new VACEWorkerProvider('http://localhost:8000');
    expect(() => provider.validateParameters(baseParams())).not.toThrow();
  });

  it('rejects frame counts violating the Wan 4k+1 constraint', () => {
    const provider = new VACEWorkerProvider('http://localhost:8000');
    expect(() =>
      provider.validateParameters(
        baseParams({ parameters: { ...baseParams().parameters, frameCount: 30 } })
      )
    ).toThrow(/frameCount/);
  });

  it('rejects dimensions that are not multiples of 16', () => {
    const provider = new VACEWorkerProvider('http://localhost:8000');
    expect(() =>
      provider.validateParameters(
        baseParams({ parameters: { ...baseParams().parameters, width: 500 } })
      )
    ).toThrow(/multiple of 16/);
  });

  it('rejects image/video conditioning explicitly without any network call', async () => {
    const provider = new VACEWorkerProvider('http://unreachable.invalid');
    await expect(
      provider.generate(baseParams({ image: 'data:image/png;base64,xxx' }))
    ).rejects.toThrow(/does not support image\/video conditioning/);
    await expect(
      provider.generate(baseParams({ video: 'http://x/y.mp4' }))
    ).rejects.toThrow(/does not support image\/video conditioning/);
  });

  it('rejects unknown models explicitly', async () => {
    const provider = new VACEWorkerProvider('http://unreachable.invalid');
    await expect(
      provider.generate(baseParams({ model: 'wan-2.1-14b-i2v' }))
    ).rejects.toThrow(/serves only/);
  });
});
