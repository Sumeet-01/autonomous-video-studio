import { NextRequest } from 'next/server';
import { getMuseClient } from '@/lib/providers/muse-spark';
import { attemptDb, assetDb } from '@/lib/db';
import { readFileSync } from 'fs';
import { ok, fail } from '@/lib/utils';
export async function POST(req: NextRequest){
  try { const { attemptId, userIntent } = await req.json(); const att = attemptDb.get(attemptId); if(!att) return fail('not found',404);
    const out = att.outputAssetId? assetDb.get(att.outputAssetId): null;
    let qa:any = att.qaReport;
    if (!qa && out){ // run inspection now from stored video frames would require extraction; return stored or heuristic
      qa = { passed:false, overallAssessment:'inspection pending - run generation pipeline for full QA', issues:[], inspectedAt:new Date() };
    }
    return ok(qa||{ passed:false, overallAssessment:'no report', issues:[] });
  } catch(e:any){ return fail(String(e?.message||e),500); }
}
export async function GET(req: NextRequest){
  const id = new URL(req.url).searchParams.get('id')||'';
  try { const a = attemptDb.get(id); return ok(a?.qaReport||null); } catch(e:any){ return fail(String(e?.message||e),500); }
}
