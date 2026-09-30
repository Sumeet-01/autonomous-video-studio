import { randomUUID } from 'crypto';
import { learningDb } from '@/lib/db';
import type { ReferenceFeatures, ResultFeatures, GenerationExperience, QualityReport, GenerationParameters, PromptMutation } from '@/lib/types';

export function signatureOf(parts: Record<string,unknown>): string {
  const s = JSON.stringify(parts);
  let h = 0; for (let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i))|0; }
  return 'sig_'+Math.abs(h).toString(36);
}

export function recordExperience(args: {
  projectId:string; sceneId:string; model:string; provider:any; prompt:string; parameters:GenerationParameters;
  referenceFeatures:ReferenceFeatures; resultFeatures:ResultFeatures; qa:QualityReport; corrections:PromptMutation[]; userFeedback?:any; success:boolean;
}): GenerationExperience {
  const exp: GenerationExperience = {
    id: randomUUID(), projectId: args.projectId, sceneId: args.sceneId, model: args.model, provider: args.provider,
    inputSignature: signatureOf({ prompt: args.prompt.slice(0,200), model: args.model, ref: args.referenceFeatures }),
    prompt: args.prompt, parameters: args.parameters, referenceFeatures: args.referenceFeatures, resultFeatures: args.resultFeatures,
    qaResult: args.qa, defects: args.qa.issues||[], corrections: args.corrections, userFeedback: args.userFeedback,
    successScore: args.success?1:0, confidence: args.userFeedback?0.95:0.7, createdAt: new Date(),
  };
  try { learningDb.createExperience(exp); } catch {}
  // Update correction patterns + model performance (best-effort)
  try {
    for (const c of args.corrections) {
      const existing = learningDb.getCorrectionPattern(c.defectType) as any;
      const ok = args.success;
      if (existing) {
        learningDb.upsertCorrectionPattern({ defectType: c.defectType, correction: c.correctedInstruction, successfulCount: existing.successful_count+(ok?1:0), failedCount: existing.failed_count+(ok?0:1), confidence: Math.min(0.99,(existing.successful_count+(ok?1:0))/Math.max(1,(existing.successful_count+existing.failed_count+1))), lastUsed: new Date().toISOString(), examples: [...JSON.parse(existing.examples||'[]')].slice(-4) });
      } else {
        learningDb.upsertCorrectionPattern({ id: randomUUID(), defectType: c.defectType, correction: c.correctedInstruction, successfulCount: ok?1:0, failedCount: ok?0:1, confidence: ok?0.6:0.4, lastUsed: new Date().toISOString(), examples: [] });
      }
    }
    const perf = learningDb.getModelPerformance(args.model, String(args.provider), args.referenceFeatures.subjectType||'general') as any;
    const gen = (perf?.generations||0)+1;
    const appr = (perf?.approved||0)+(args.success?1:0);
    learningDb.upsertModelPerformance({ id: perf?.id||randomUUID(), model: args.model, provider: String(args.provider), taskType: args.referenceFeatures.subjectType||'general', generations: gen, approved: appr, rejected: gen-appr, averageAttempts: perf?.average_attempts||args.resultFeatures.attemptCount||1, averageGenerationTime: args.resultFeatures.generationTime||0, commonDefects: [...new Set([...JSON.parse(perf?.common_defects||'[]'), ...(args.qa.issues||[]).map((i:any)=>i.type)])].slice(0,10), lastUpdated: new Date().toISOString() });
  } catch {}
  return exp;
}

export function retrieveLearnedBoosters(features: ReferenceFeatures): { boosters:string[]; strategy?:string; confidence:number } {
  try {
    const sims = learningDb.getSimilarExperiences(features, 8) as GenerationExperience[];
    const good = sims.filter(s=>s.successScore>=0.8);
    const boosters: string[] = [];
    for (const g of good.slice(0,3)) {
      for (const c of (g.corrections||[]).slice(0,2)) { if (c.correctedInstruction && !boosters.includes(c.correctedInstruction)) boosters.push(c.correctedInstruction); }
    }
    // Include high-confidence correction patterns matching past defects
    const patterns = learningDb.getAllCorrectionPatterns() as any[];
    for (const p of patterns.slice(0,5)) {
      if (p.confidence>0.6 && !boosters.includes(p.correction)) boosters.push(p.correction);
      if (boosters.length>=4) break;
    }
    const strategies = learningDb.getStrategies() as any[];
    const strat = strategies.find((s:any)=>{ try{ const c=JSON.parse(s.conditions); return !c.subjectType||c.subjectType===features.subjectType; }catch{ return true; } });
    return { boosters: boosters.slice(0,4), strategy: strat?JSON.parse(strat.prompt_pattern||'null')?.hint||strat.name:undefined, confidence: good.length?0.7:0.3 };
  } catch { return { boosters: [], confidence: 0.2 }; }
}

export function learningStats(projectId?: string): any {
  try {
    const exps = projectId ? learningDb.getExperiencesByProject(projectId) : [];
    const all = exps as GenerationExperience[];
    const approved = all.filter(e=>e.successScore>=0.8).length;
    const avgAttempts = all.length? all.reduce((a,e)=>a+(e.resultFeatures?.attemptCount||1),0)/all.length : 0;
    const avgTime = all.length? all.reduce((a,e)=>a+(e.resultFeatures?.generationTime||0),0)/all.length : 0;
    const defectCounts: Record<string,number> = {};
    for (const e of all) for (const d of (e.defects||[])) defectCounts[d.type]=(defectCounts[d.type]||0)+1;
    return { total: all.length, approved, approvalRate: all.length?approved/all.length:0, avgAttempts, avgTimeMs: avgTime, commonDefects: Object.entries(defectCounts).sort((a,b)=>b[1]-a[1]).slice(0,8), patterns: learningDb.getAllCorrectionPatterns().slice(0,10), modelPerf: learningDb.getAllModelPerformance().slice(0,10), strategies: learningDb.getStrategies().slice(0,10) };
  } catch { return { total:0 }; }
}
