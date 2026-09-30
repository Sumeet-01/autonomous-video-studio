import { NextRequest } from 'next/server';
import { runSceneGeneration } from '@/lib/orchestration/orchestrator';
import { buildGenerationPrompt } from '@/lib/orchestration/prompt-engine';
import { projectDb, sceneDb } from '@/lib/db';
import { ok, fail } from '@/lib/utils';
export async function POST(req: NextRequest){
  try { const { projectId, sceneId, promptOverride } = await req.json();
    if(!projectId||!sceneId) return fail('projectId and sceneId required');
    if (promptOverride){ const s = sceneDb.get(sceneId); if(s){ s.prompt = promptOverride; s.updatedAt=new Date(); sceneDb.update(s); } }
    const result = await runSceneGeneration(projectId, sceneId);
    return ok(result);
  } catch(e:any){ return fail(String(e?.message||e),500); }
}
export async function GET(req: NextRequest){
  try {
    const projectId = new URL(req.url).searchParams.get('projectId')||'';
    const sceneId = new URL(req.url).searchParams.get('sceneId')||'';
    const { attemptDb } = await import('@/lib/db');
    if (sceneId) return ok(attemptDb.getByScene(sceneId));
    return ok([]);
  } catch(e:any){ return fail(String(e?.message||e),500); }
}
