import { NextRequest } from 'next/server';
import { sceneDb } from '@/lib/db';
import { runSceneGeneration } from '@/lib/orchestration/orchestrator';
import { ok, fail } from '@/lib/utils';
export async function POST(req: NextRequest, { params }: { params: Promise<{id:string}> }){
  try { const { id } = await params; const body = await req.json().catch(()=>({})); const s = sceneDb.get(id); if(!s) return fail('not found',404);
    if (body.prompt){ s.prompt = body.prompt; s.updatedAt=new Date(); sceneDb.update(s); }
    const r = await runSceneGeneration(s.projectId, id); return ok(r);
  } catch(e:any){ return fail(String(e?.message||e),500); }
}
