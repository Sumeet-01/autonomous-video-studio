import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { exportDb, sceneDb, attemptDb, assetDb } from '@/lib/db';
import { getProjectPaths, getProductionOutputPath } from '@/lib/config';
import { muxFinal, concatScenes } from '@/lib/media/ffmpeg';
import { ok, fail } from '@/lib/utils';

export async function POST(req: NextRequest){
  try { const { projectId, preset, voiceAssetId, sfxAssetId, musicAssetId } = await req.json();
    if(!projectId) return fail('projectId required');
    const id = randomUUID();
    const exp:any = { id, projectId, name:`Export ${preset||'master'}`, preset: preset||'custom', status:'processing', createdAt:new Date() };
    exportDb.create(exp);
    try {
      const scenes = sceneDb.getByProject(projectId);
      const clips: string[] = [];
      for (const s of scenes){
        const atts = attemptDb.getByScene(s.id);
        const approved = atts.find(a=>a.id===s.approvedAttemptId) || atts.filter(a=>a.status==='approved').pop() || atts.filter(a=>a.outputAssetId).pop();
        if (approved?.outputAssetId){ const a = assetDb.get(approved.outputAssetId); if(a&&existsSync(a.path)) clips.push(a.path); }
      }
      if(!clips.length) throw new Error('no approved clips to export');
      const paths = getProjectPaths(projectId);
      if(!existsSync(paths.exports)) mkdirSync(paths.exports,{recursive:true});
      const outRoot = getProductionOutputPath(); if(!existsSync(outRoot)) mkdirSync(outRoot,{recursive:true});
      const video = clips.length>1 ? await concatScenes(clips, join(paths.exports, `concat_${id}.mp4`)) : clips[0];
      const voice = voiceAssetId? assetDb.get(voiceAssetId)?.path : assetDb.getByProject(projectId).find(a=>a.type==='voice')?.path;
      const sfx = sfxAssetId? assetDb.get(sfxAssetId)?.path : assetDb.getByProject(projectId).find(a=>a.type==='sfx')?.path;
      const music = musicAssetId? assetDb.get(musicAssetId)?.path : undefined;
      const finalName = `lumen_${projectId.slice(0,6)}_${id.slice(0,6)}.mp4`;
      const finalPath = join(outRoot, finalName);
      await muxFinal({ video, voice, sfx, music, output: finalPath });
      exp.status='completed'; exp.outputPath=finalPath; exp.completedAt=new Date(); exportDb.update(exp);
      const { statSync } = await import('fs');
      const asset:any={ id: randomUUID(), projectId, type:'export', filename: finalName, mimeType:'video/mp4', size: statSync(finalPath).size, path: finalPath, metadata:{ preset }, createdAt:new Date() };
      try{ assetDb.create(asset);}catch{}
      return ok({ ...exp, asset });
    } catch(e:any){ exp.status='failed'; exp.error=String(e?.message||e).slice(0,1000); exp.completedAt=new Date(); exportDb.update(exp); return fail(exp.error,500); }
  } catch(e:any){ return fail(String(e?.message||e),500); }
}
export async function GET(req: NextRequest){
  const projectId = new URL(req.url).searchParams.get('projectId')||'';
  const id = new URL(req.url).searchParams.get('id')||'';
  try { if(id){ const e = exportDb.get(id); return ok(e); } return ok(exportDb.getByProject(projectId)); } catch(e:any){ return fail(String(e?.message||e),500); }
}
