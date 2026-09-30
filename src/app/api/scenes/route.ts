import { NextRequest } from 'next/server';
import { sceneDb, attemptDb } from '@/lib/db';
import { ok, fail } from '@/lib/utils';
import { uid } from '@/lib/utils';
export async function POST(req: NextRequest){
  try { const body = await req.json();
    if (body.action==='create'){ const now=new Date(); const s:any={ id: uid('scene'), projectId: body.projectId, index: body.index??0, name: body.name||'New scene', prompt: body.prompt||'', duration: body.duration||5, status:'queued', attempts:[], createdAt:now, updatedAt:now }; sceneDb.create(s); return ok(s); }
    if (body.action==='approve'){ const s = sceneDb.get(body.sceneId); const att = attemptDb.get(body.attemptId); if(!s||!att) return fail('not found',404); s.approvedAttemptId=att.id; s.status='approved'; s.updatedAt=new Date(); sceneDb.update(s); att.status='approved'; attemptDb.update(att); return ok(s); }
    if (body.action==='reject'){ const att = attemptDb.get(body.attemptId); if(!att) return fail('not found',404); att.status='failed'; attemptDb.update(att); return ok(att); }
    return fail('unknown action');
  } catch(e:any){ return fail(String(e?.message||e),500); }
}
export async function GET(req: NextRequest){
  const projectId = new URL(req.url).searchParams.get('projectId')||'';
  try { return ok(sceneDb.getByProject(projectId)); } catch(e:any){ return fail(String(e?.message||e),500); }
}
