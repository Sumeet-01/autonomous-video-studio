import { NextRequest } from 'next/server';
import { runReferenceAnalysis } from '@/lib/orchestration/orchestrator';
import { ok, fail } from '@/lib/utils';
export async function POST(req: NextRequest){
  try { const { projectId, videoAssetId, userIntent } = await req.json();
    if(!projectId||!videoAssetId) return fail('projectId and videoAssetId required');
    const analysis = await runReferenceAnalysis(projectId, videoAssetId, userIntent||'Recreate cinematography with new subject and environment');
    return ok(analysis);
  } catch(e:any){ return fail(String(e?.message||e),500); }
}
