import { NextRequest } from 'next/server';
import { learningStats } from '@/lib/orchestration/learning';
import { ok, fail } from '@/lib/utils';
export async function GET(req: NextRequest){
  try { const projectId = new URL(req.url).searchParams.get('projectId')||undefined; return ok(learningStats(projectId)); } catch(e:any){ return fail(String(e?.message||e),500); }
}
