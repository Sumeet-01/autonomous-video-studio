import type { ReferenceAnalysis, GenerationParameters, ContinuityConstraints, ProjectSettings } from '@/lib/types';

export interface PromptInput {
  referenceAnalysis?: ReferenceAnalysis | null;
  userPrompt: string;
  subjectDescription?: string;
  environmentDescription?: string;
  constraints?: ContinuityConstraints;
  settings: ProjectSettings;
  learnedBoosters?: string[];
  strategyPattern?: string;
  shotIndex?: number;
  totalShots?: number;
}
export interface PromptOutput { masterPrompt: string; shotPrompts: string[]; negativePrompt: string; parameters: GenerationParameters; continuity: ContinuityConstraints; }

const BASE_NEGATIVE = 'blurry, low quality, distorted anatomy, extra limbs, missing fingers, deformed hands, warped product geometry, floating objects, flickering, morphing background, watermark, text overlay, oversaturated, harsh shadows, inconsistent lighting';

function dimsFor(settings: ProjectSettings): {width:number;height:number} {
  if (settings.aspectRatio==='9:16') return settings.resolution==='1080p'?{width:1080,height:1920}:{width:720,height:1280};
  if (settings.aspectRatio==='1:1') return {width:1024,height:1024};
  if (settings.aspectRatio==='4:3') return {width:1280,height:960};
  if (settings.aspectRatio==='custom'&&settings.customWidth&&settings.customHeight) return {width:settings.customWidth,height:settings.customHeight};
  return settings.resolution==='1080p'?{width:1920,height:1080}:{width:1280,height:720};
}

export function buildGenerationPrompt(input: PromptInput): PromptOutput {
  const { referenceAnalysis, userPrompt, subjectDescription, environmentDescription, settings } = input;
  const dims = dimsFor(settings);
  const fps = settings.fps || 24;
  const duration = Math.min(Math.max(settings.duration||3,1),10);
  const frameCount = Math.round(duration*fps);
  const rec = referenceAnalysis?.recreationStrategy;
  const cam = referenceAnalysis?.cameraLanguage;
  const light = referenceAnalysis?.lighting;
  const rhythm = referenceAnalysis?.editingRhythm;

  const preserve: string[] = rec?.preserve?.length? rec.preserve : [
    cam?.dominantMovements?.length?`camera language: ${cam.dominantMovements.join(', ')}`:'slow cinematic camera movement',
    cam?.pacing?`${cam.pacing} pacing`:'measured pacing',
    light?.overallStyle?`lighting logic: ${light.overallStyle}`:'soft motivated lighting',
  ];
  const shotSpecs = rec?.perShotSpecifications || [];
  const learned = (input.learnedBoosters||[]).filter(Boolean).slice(0,4);

  const subject = subjectDescription?.trim() || 'subject as shown in reference subject image, exact identity preserved';
  const env = environmentDescription?.trim() || 'environment as shown in reference environment image';
  const style = settings.style?.trim() || referenceAnalysis?.visualStyle?.mood || 'cinematic photoreal';

  const masterPrompt = [
    `Cinematic ${style} video, ${duration}s.`,
    `Intent: ${userPrompt.slice(0,400)}.`,
    `Subject: ${subject}; lock geometry, silhouette, materials, proportions; no deformation.`,
    `Environment: ${env}; preserve architecture, furniture, surfaces.`,
    `Preserve from reference: ${preserve.join('; ')}.`,
    rhythm?`Editing rhythm: ${rhythm.pacingDescription||rhythm.cuttingStyle||'smooth continuity'}.`:'',
    cam?.compositionRules?.length?`Composition: ${cam.compositionRules.slice(0,3).join(', ')}.`:'',
    learned.length?`Proven directives: ${learned.join('; ')}.`:'',
    input.strategyPattern?`Strategy: ${input.strategyPattern}.`:'',
    `Photoreal, temporally stable, consistent shadows, natural motion, shallow depth where reference uses it.`,
  ].filter(Boolean).join(' ');

  const total = input.totalShots || Math.max(1, shotSpecs.length || 1);
  const shotPrompts: string[] = [];
  for (let i=0;i<total;i++){
    const spec = shotSpecs[i];
    if (spec?.generationPrompt) shotPrompts.push(`${spec.generationPrompt} | Subject: ${subject}. Environment: ${env}.`);
    else shotPrompts.push(`${masterPrompt} Shot ${i+1}/${total}: maintain continuity with previous shot, same subject lock and environment lock.`);
  }

  const negativePrompt = [BASE_NEGATIVE, settings.negativePrompt||'', rec?.negativePromptGuidance||''].filter(Boolean).join(', ');
  const parameters: GenerationParameters = { width:dims.width, height:dims.height, fps, frameCount, duration, seed: settings.seed, guidanceScale: 7.5, steps: 30 };
  const continuity: ContinuityConstraints = input.constraints || {};
  return { masterPrompt, shotPrompts, negativePrompt, parameters, continuity };
}

export function buildParamsForProvider(p: GenerationParameters, provider: string): Record<string,unknown> {
  if (provider==='replicate') return { width:p.width, height:p.height, num_frames:p.frameCount, fps:p.fps, guidance_scale:p.guidanceScale, num_inference_steps:p.steps };
  return { width:p.width, height:p.height, num_frames:p.frameCount, fps:p.fps, guidance_scale:p.guidanceScale, num_inference_steps:p.steps };
}
