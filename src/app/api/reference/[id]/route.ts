import { NextRequest } from 'next/server';
import { analysisDb } from '@/lib/db';
import { ok, fail } from '@/lib/utils';
export async function GET(req: NextRequest){
  const id = new URL(req.url).searchParams.get('id')||'';
  const projectId = new URL(req.url).searchParams.get('projectId')||'';
  try { const a = id? analysisDb.get(id) : analysisDb.getByProject(projectId); if(!a) return fail('not found',404); return ok(a); } catch(e:any){ return fail(String(e?.message||e),500); }
}
