import { describe, it, expect } from 'vitest';
import { buildGenerationPrompt } from '@/lib/orchestration/prompt-engine';
import { applyMutations } from '@/lib/orchestration/mutation-dictionary';

const baseSettings:any = { aspectRatio:'16:9', duration:5, fps:24, model:'wan-2.1-14b-i2v', provider:'fal', maxAttempts:3, voiceEnabled:false, sfxEnabled:false, musicEnabled:false, resolution:'720p' };

describe('prompt engine', ()=>{
  it('builds model-aware prompt with locks', ()=>{
    const out = buildGenerationPrompt({ userPrompt:'reveal speaker on wooden table', settings: baseSettings, subjectDescription:'matte black speaker', environmentDescription:'warm living room' });
    expect(out.masterPrompt).toMatch(/geometry/);
    expect(out.parameters.width).toBeGreaterThan(0);
    expect(out.negativePrompt).toMatch(/extra limbs/);
  });
  it('caps prompt length after mutations', ()=>{
    const issues:any[] = [{ id:'1', type:'product_geometry_drift', description:'drift', severity:'high', likelyCause:'x', correctiveInstruction:'y' }];
    const r = applyMutations('base prompt','base neg',issues,[]);
    expect(r.prompt.length).toBeLessThanOrEqual(2000);
    expect(r.mutations.length).toBeGreaterThan(0);
  });
});
