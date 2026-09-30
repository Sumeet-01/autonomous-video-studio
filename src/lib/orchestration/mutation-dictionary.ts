import type { QualityIssue, PromptMutation } from '@/lib/types';

// Correction dictionary: defect -> targeted instructions (grows via learning DB at runtime)
export const CORRECTION_DICTIONARY: Record<string, string[]> = {
  product_geometry_drift: ['preserve exact physical geometry, dimensions, silhouette from reference image','maintain rigid product dimensions, button placement, surface boundaries','lock material boundaries, no warping of product edges'],
  camera_motion_too_fast: ['reduce camera tracking velocity to slow cinematic pace','use gradual acceleration and deceleration, avoid abrupt translation','maintain smooth stabilized movement'],
  hand_deformation: ['maintain anatomically correct hands, five fingers, natural articulation','reduce rapid hand movement, keep hand-object contact consistent','preserve finger count and joint structure'],
  extra_limbs: ['strict human anatomy: two arms, two legs, correct limb count','no duplicated limbs, clean silhouette'],
  missing_limbs: ['complete visible anatomy, no truncated limbs unless occluded naturally'],
  face_distortion: ['preserve facial structure, symmetry, identity from reference','stable facial features across frames, no morphing'],
  identity_drift: ['lock subject identity: clothing, hair, facial structure, proportions','consistent appearance across all frames'],
  texture_tearing: ['stable textures, no tearing or swimming surfaces','consistent material detail frame to frame'],
  floating_objects: ['objects rest on surfaces with correct contact shadows, obey gravity','no levitating elements unless intended'],
  inconsistent_shadows: ['consistent shadow direction matching key light','stable contact shadows, no flicker'],
  lighting_discontinuity: ['lock lighting direction, color temperature and contrast across shot','no sudden exposure shifts'],
  background_morphing: ['locked background architecture and layout, no morphing geometry','stable horizon and landmarks'],
  temporal_instability: ['temporally stable generation, minimal flicker, coherent motion','smooth frame-to-frame continuity'],
  composition_failure: ['follow reference composition: subject placement, negative space, rule of thirds','preserve depth layers foreground/mid/background'],
  reference_mismatch: ['match reference camera movement, framing and pacing','follow recreation specification for this shot'],
  physics_violation: ['physically plausible collisions, gravity and material behavior','no interpenetration of solid objects'],
};

export function correctionsFor(issueType: string): string[] {
  const key = issueType.toLowerCase().replace(/[^a-z0-9]+/g,'_');
  if (CORRECTION_DICTIONARY[key]) return CORRECTION_DICTIONARY[key];
  // fuzzy: find partial match
  for (const k of Object.keys(CORRECTION_DICTIONARY)) {
    if (key.includes(k) || k.includes(key)) return CORRECTION_DICTIONARY[k];
  }
  return [`preserve ${issueType.replace(/_/g,' ')} consistency, avoid artifacts`];
}

export function applyMutations(originalPrompt: string, originalNegative: string, issues: QualityIssue[], learnedCorrections: string[] = []): { prompt:string; negativePrompt:string; mutations: PromptMutation[] } {
  const additions: string[] = [];
  const mutations: PromptMutation[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    const cands = correctionsFor(issue.type);
    const pick = cands[0];
    if (!pick || seen.has(pick)) continue;
    seen.add(pick);
    additions.push(pick);
    mutations.push({ defectType: issue.type, originalInstruction: originalPrompt.slice(0,120), correctedInstruction: pick, confidence: 0.7 });
  }
  for (const lc of learnedCorrections.slice(0,3)) {
    if (!seen.has(lc)) { seen.add(lc); additions.push(lc); mutations.push({ defectType:'learned', originalInstruction:'', correctedInstruction: lc, confidence: 0.6 }); }
  }
  const prompt = additions.length ? `${originalPrompt} ${additions.join('. ')}.` : originalPrompt;
  const avoid = issues.map(i=>i.type.replace(/_/g,' ')).filter(Boolean).slice(0,6).join(', ');
  const negativePrompt = avoid ? `${originalNegative}, avoid: ${avoid}` : originalNegative;
  // De-dupe + cap length to avoid prompt bloat
  return { prompt: prompt.slice(0,2000), negativePrompt: negativePrompt.slice(0,800), mutations };
}

export function summarizeMutations(mutations: PromptMutation[]): string {
  if (!mutations.length) return 'No mutations applied.';
  return `Applied ${mutations.length} targeted correction(s): ` + mutations.map(m=>`${m.defectType} -> ${m.correctedInstruction.slice(0,80)}`).join('; ');
}
