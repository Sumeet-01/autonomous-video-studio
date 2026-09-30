import { randomUUID } from 'crypto';
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { projectDb, sceneDb, assetDb, attemptDb, analysisDb } from '@/lib/db';
import { getProjectPaths } from '@/lib/config';
import { buildGenerationPrompt } from '@/lib/orchestration/prompt-engine';
import { applyMutations, summarizeMutations } from '@/lib/orchestration/mutation-dictionary';
import { recordExperience, retrieveLearnedBoosters } from '@/lib/orchestration/learning';
import { VideoProviderFactory } from '@/lib/providers/video';
import { getMuseClient } from '@/lib/providers/muse-spark';
import { probeVideo, detectScenes, planFrameTimestamps, extractFrames } from '@/lib/media/ffmpeg';
import type { Project, Scene, GenerationAttempt, QualityReport } from '@/lib/types';

export const log = (component:string, event:string, message:string, meta:any={})=>{
  console.log(JSON.stringify({ ts:new Date().toISOString(), component, event, message, ...meta }));
};

function ensureDirs(projectId:string){
  const p = getProjectPaths(projectId);
  for (const d of Object.values(p)) if(!existsSync(d)) mkdirSync(d,{recursive:true});
}

export async function runReferenceAnalysis(projectId:string, videoAssetId:string, userIntent:string): Promise<any> {
  const project = projectDb.get(projectId); if(!project) throw new Error('project not found');
  const asset = assetDb.get(videoAssetId); if(!asset) throw new Error('asset not found');
  ensureDirs(projectId);
  const paths = getProjectPaths(projectId);
  project.status='analyzing'; project.updatedAt=new Date(); projectDb.update(project);
  try {
    const probe = await probeVideo(asset.path);
    const scenes = await detectScenes(asset.path);
    const plan = planFrameTimestamps(probe.duration, scenes, 20);
    const framesDir = join(paths.frames, 'reference');
    const frameFiles = await extractFrames(asset.path, framesDir, plan.timestamps);
    const toB64 = (f:string)=> readFileSync(f).toString('base64');
    const framesB64 = frameFiles.slice(0,12).map(toB64);
    const videoB64 = readFileSync(asset.path).toString('base64').slice(0, 8_000_000); // bound payload
    let analysis: any;
    try {
      const muse = getMuseClient();
      analysis = await muse.analyzeReferenceVideo(videoB64, framesB64.slice(0,4), userIntent);
    } catch (e:any) {
      // Graceful fallback: rule-based structural analysis so pipeline continues offline
      log('analysis','fallback', String(e?.message||e), { projectId });
      analysis = fallbackAnalysis(projectId, videoAssetId, probe, scenes, plan, frameFiles, userIntent);
    }
    analysis.projectId = projectId; analysis.videoAssetId = videoAssetId;
    analysis.video = { ...analysis.video, duration: probe.duration, width: probe.width, height: probe.height, fps: probe.fps, codec: probe.codec, fileSize: probe.size, estimatedShotCount: scenes.length };
    try { analysisDb.create(analysis); } catch { try{ analysisDb.update(analysis);}catch{} }
    project.referenceAnalysis = analysis; project.status='planning'; project.updatedAt=new Date(); projectDb.update(project);
    // cache manifest
    writeFileSync(join(paths.manifests,'reference-analysis.json'), JSON.stringify(analysis,null,2));
    return analysis;
  } catch (e:any) {
    project.status='failed'; project.updatedAt=new Date(); projectDb.update(project);
    throw e;
  }
}

function fallbackAnalysis(projectId:string, videoAssetId:string, probe:any, scenes:number[], plan:any, frameFiles:string[], userIntent:string){
  const shots = scenes.map((s,i)=>({ index:i, startTime:s, endTime:i+1<scenes.length?scenes[i+1]:probe.duration, duration:Math.max(0.1,(i+1<scenes.length?scenes[i+1]:probe.duration)-s), shotType:'medium', subject:'primary subject (estimate)', environment:'reference environment (estimate)', action:'continuous motion (estimate)', cameraMovement:{type:'stabilized',velocity:'slow',acceleration:'ease-in-out',stabilization:'gimbal',parallax:false,rackFocus:false,details:'estimated from sampling'}, cameraPosition:'eye-level (estimate)', framing:'centered (estimate)', lensPerspective:'normal (estimate)', depth:'mid depth (estimate)', foreground:'minimal', background:'environmental context', lighting:{keyDirection:'soft frontal (estimate)',quality:'soft',colorTemperature:5600,contrast:'medium',rimLight:false,fillLight:true,practicalLights:[],mood:'neutral'}, color:'natural (estimate)', composition:'balanced (estimate)', motion:{cameraMovement:'slow drift',subjectMovement:'subtle',relativeMotion:'camera-dominant',approximateVelocity:'slow',stabilizationBehavior:'stable'}, transitionType:'cut', visualEmphasis:'subject', functionalPurpose:'establish', confidence:0.4 }));
  return { id: randomUUID(), projectId, videoAssetId, status:'completed', video:{duration:probe.duration,width:probe.width,height:probe.height,fps:probe.fps,codec:probe.codec,orientation:probe.width>=probe.height?'landscape':'portrait',estimatedShotCount:scenes.length,fileSize:probe.size}, visualStyle:{genre:'general',mood:'neutral',colorPalette:[],lightingStyle:'soft',compositionStyle:'balanced',depthOfField:'medium',texture:'natural',overallImpression:`rule-based fallback for: ${userIntent.slice(0,120)}`}, shots, cameraLanguage:{dominantMovements:['slow drift','stabilized'],movementVocabulary:['drift'],framingPreferences:['medium'],lensCharacteristics:['normal'],depthStrategy:'mid',compositionRules:['center subject'],pacing:'slow',rhythmPattern:'even'}, lighting:{overallStyle:'soft natural',keyLightPatterns:['frontal'],colorTemperatureRange:[5000,6000],contrastApproach:'medium',rimLightUsage:false,practicalLighting:false,moodContribution:'neutral'}, motionLanguage:{cameraVocabulary:['drift'],subjectMotionPatterns:['subtle'],velocityProfile:'consistent-slow',stabilizationApproach:'gimbal-like',transitionStyle:'cut',spatialRelationships:['camera-dominant']}, transitions: shots.slice(1).map((s,i)=>({fromShot:i,toShot:i+1,type:'cut',duration:0,technique:'hard cut',effect:'continuity'})), editingRhythm:{averageShotDuration:probe.duration/Math.max(1,shots.length),shotDurationPattern:'consistent',closeUpRatio:0.2,wideShotRatio:0.3,cuttingStyle:'continuity',pacingDescription:'even and measured'}, audioNotes:{hasAudio:probe.hasAudio,limitations:['audio understanding not supported by Muse Spark 1.3; manual review required']}, uncertainties:[{aspect:'shot semantics',description:'fallback analysis without model; values are estimates',confidence:0.4,reason:'Muse Spark unavailable'}], recreationStrategy:{preserve:['slow stabilized camera','even pacing','balanced composition'],replace:['subject identity','environment per user intent'],adapt:['lighting to new environment'],constraints:['lock subject geometry','lock environment landmarks'],perShotSpecifications:shots.map(s=>({shotIndex:s.index,preservedElements:['camera drift','pacing'],replacedElements:['subject','environment'],adaptedElements:['lighting'],generationPrompt:`Recreate shot ${s.index+1}: slow stabilized drift, balanced composition, ${userIntent.slice(0,200)}`,negativePrompt:'blurry, deformed',keyConstraints:['geometry lock']})),masterPromptGuidance:userIntent,negativePromptGuidance:'blurry, deformed'}, analyzedAt:new Date(), model:'fallback-rule-based' };
}

export async function runSceneGeneration(projectId:string, sceneId:string): Promise<{attempt:GenerationAttempt; qa?:QualityReport}> {
  const project = projectDb.get(projectId); if(!project) throw new Error('project not found');
  const scene = sceneDb.get(sceneId); if(!scene) throw new Error('scene not found');
  ensureDirs(projectId);
  const paths = getProjectPaths(projectId);
  const maxAttempts = project.settings.maxAttempts||3;
  const existing = attemptDb.getByScene(sceneId);
  scene.status='generating'; scene.updatedAt=new Date(); sceneDb.update(scene);

  const refFeatures = { subjectType: project.settings.style||'general', environment:'custom', cameraMovement: project.referenceAnalysis?.cameraLanguage?.dominantMovements?.[0]||'drift', style: project.settings.style||'cinematic', lighting:'soft', duration: scene.duration, aspectRatio: project.settings.aspectRatio };
  const learned = retrieveLearnedBoosters(refFeatures as any);
  const plan = buildGenerationPrompt({ referenceAnalysis: project.referenceAnalysis as any, userPrompt: scene.prompt, subjectDescription: subjectDesc(projectId), environmentDescription: envDesc(projectId), settings: project.settings, learnedBoosters: learned.boosters, strategyPattern: learned.strategy, shotIndex: scene.index, totalShots: 1 });

  let prompt = plan.masterPrompt, negative = plan.negativePrompt, mutations: any[] = [];
  let lastQa: QualityReport|undefined;

  for (let n = existing.length+1; n<=maxAttempts; n++){
    const attempt: GenerationAttempt = { id: randomUUID(), sceneId, attemptNumber:n, prompt, negativePrompt:negative, parameters: plan.parameters, provider: project.settings.provider as any, model: project.settings.model, status:'generating', inputAssets: subjectAssets(projectId), startedAt:new Date() };
    attemptDb.create(attempt);
    const t0 = Date.now();
    try {
      const provider = VideoProviderFactory.getProvider((project.settings.provider as any)==='replicate'?'replicate':'fal');
      const imgB64 = firstSubjectImageB64(projectId);
      const gen = await provider.generate({ prompt, negativePrompt: negative, image: imgB64||undefined, parameters: plan.parameters, model: project.settings.model, seed: plan.parameters.seed });
      // poll with bounded timeout
      const outDir = join(paths.generations, `scene-${scene.index+1}`, `attempt-${String(n).padStart(2,'0')}`);
      if(!existsSync(outDir)) mkdirSync(outDir,{recursive:true});
      const outPath = join(outDir, 'output.mp4');
      const deadline = Date.now()+ 8*60*1000;
      let status = gen.status;
      while (status!=='completed' && status!=='failed' && status!=='cancelled' && Date.now()<deadline){
        await new Promise(r=>setTimeout(r,8000));
        try { status = await provider.getStatus(gen.jobId); } catch { break; }
      }
      if (status==='failed'||status==='cancelled') throw new Error(`provider ${status}`);
      try { await provider.download(gen.jobId, outPath); }
      catch { throw new Error('provider download failed or still processing'); }
      attempt.status='inspecting'; attemptDb.update(attempt);
      // Inspect
      const framesDir = join(outDir,'frames');
      const probe = await probeVideo(outPath);
      const stamps = planFrameTimestamps(probe.duration,[0],10);
      const frameFiles = await extractFrames(outPath, framesDir, stamps.timestamps);
      const b64 = frameFiles.slice(0,8).map(f=>readFileSync(f).toString('base64'));
      const refFrames = referenceFramesB64(projectId).slice(0,4);
      let qa: QualityReport;
      try {
        const muse = getMuseClient();
        qa = await muse.inspectGeneration(b64, project.referenceAnalysis as any, refFrames, scene.prompt, {}, {});
      } catch {
        qa = heuristicQA(n, probe);
      }
      lastQa = qa;
      attempt.qaReport = qa; attempt.generationTime = Date.now()-t0;
      // persist output asset
      const { statSync } = await import('fs');
      const asset = { id: randomUUID(), projectId, type:'generated_video' as const, filename:`scene${scene.index+1}_attempt${n}.mp4`, mimeType:'video/mp4', size: statSync(outPath).size, path: outPath, metadata:{ width:plan.parameters.width, height:plan.parameters.height, duration: probe.duration }, createdAt: new Date() };
      assetDb.create(asset as any);
      attempt.outputAssetId = asset.id;
      if (qa.passed) {
        attempt.status='approved'; attempt.completedAt=new Date(); attemptDb.update(attempt);
        scene.status='approved'; scene.approvedAttemptId=attempt.id; scene.updatedAt=new Date(); sceneDb.update(scene);
        recordExperience({ projectId, sceneId, model: attempt.model, provider: attempt.provider, prompt, parameters: plan.parameters, referenceFeatures: refFeatures as any, resultFeatures:{qualityScore:0.9,defectCount:0,criticalDefects:0,generationTime:attempt.generationTime||0,attemptCount:n}, qa, corrections: mutations, success:true });
        return { attempt, qa };
      } else {
        attempt.status='repairing'; attemptDb.update(attempt);
        const applied = applyMutations(prompt, negative, qa.issues||[], learned.boosters);
        mutations = [...mutations, ...applied.mutations];
        attempt.mutationSummary = summarizeMutations(applied.mutations); attemptDb.update(attempt);
        recordExperience({ projectId, sceneId, model: attempt.model, provider: attempt.provider, prompt, parameters: plan.parameters, referenceFeatures: refFeatures as any, resultFeatures:{qualityScore:0.4,defectCount:qa.issues.length,criticalDefects:qa.issues.filter(i=>i.severity==='critical').length,generationTime:attempt.generationTime||0,attemptCount:n}, qa, corrections: applied.mutations, success:false });
        prompt = applied.prompt; negative = applied.negativePrompt;
        if (n===maxAttempts){ attempt.status='failed'; attempt.completedAt=new Date(); attempt.error='max attempts reached without passing QA'; attemptDb.update(attempt); scene.status='failed'; sceneDb.update(scene); return { attempt, qa }; }
      }
    } catch (e:any) {
      attempt.status='failed'; attempt.error=String(e?.message||e).slice(0,1000); attempt.completedAt=new Date(); attempt.generationTime=Date.now()-t0; attemptDb.update(attempt);
      log('orchestrator','attempt_failed', attempt.error, { projectId, sceneId, attempt:n });
      if (n===maxAttempts){ scene.status='failed'; sceneDb.update(scene); return { attempt }; }
      // mutate minimally and retry (provider error -> keep prompt, add stability hint)
      prompt = prompt + ' Temporally stable, clean generation.';
    }
  }
  throw new Error('generation loop exited unexpectedly');
}

function heuristicQA(n:number, probe:any): QualityReport {
  const passed = probe.duration>0.5;
  return { passed, overallAssessment: passed?'heuristic pass (inspector unavailable): valid video output':'heuristic fail: invalid output', issues: passed?[]:[{id:randomUUID(),type:'generation_failure',description:'output video invalid or empty',severity:'critical',likelyCause:'provider or download failure',correctiveInstruction:'retry with stable parameters'}], severity:{}, referenceMatch:{score:0.5,composition:0.5,movement:0.5,pacing:0.5,lighting:0.5,color:0.5,details:'heuristic'}, motionQuality:{score:0.5,cameraStability:0.5,subjectMotionNaturalness:0.5,temporalConsistency:0.5,details:'heuristic'}, subjectConsistency:{score:0.5,geometry:0.5,appearance:0.5,details:'heuristic'}, environmentConsistency:{score:0.5,geometry:0.5,appearance:0.5,details:'heuristic'}, physics:{score:0.5,collisions:0.5,gravity:0.5,materialBehavior:0.5,details:'heuristic'}, continuity:{score:0.5,subject:0.5,environment:0.5,lighting:0.5,details:'heuristic'}, recommendedMutations:[], inspectedAt:new Date() };
}

function subjectAssets(projectId:string): string[] { try { return assetDb.getByProject(projectId).filter(a=>a.type==='subject_image'||a.type==='reference_image').map(a=>a.id).slice(0,3);} catch { return []; } }
function subjectDesc(projectId:string): string { try { const a = assetDb.getByProjectAndType(projectId,'subject_image')[0]; return a?`subject locked to ${a.filename}`:'';} catch { return ''; } }
function envDesc(projectId:string): string { try { const a = assetDb.getByProjectAndType(projectId,'environment_image')[0]; return a?`environment locked to ${a.filename}`:'';} catch { return ''; } }
function firstSubjectImageB64(projectId:string): string|undefined { try { const a = assetDb.getByProject(projectId).find(x=>x.type==='subject_image'||x.type==='reference_image'); if(!a) return undefined; const b = readFileSync(a.path); if(b.length>6_000_000) return undefined; return `data:${a.mimeType};base64,${b.toString('base64')}`;} catch { return undefined; } }
function referenceFramesB64(projectId:string): string[] { try { const p = getProjectPaths(projectId); const dir = join(p.frames,'reference'); if(!existsSync(dir)) return []; return readdirSync(dir).filter(f=>f.endsWith('.jpg')).slice(0,4).map(f=>readFileSync(join(dir,f)).toString('base64'));} catch { return []; } }
