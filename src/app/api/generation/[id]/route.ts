import { NextRequest } from 'next/server';
import { attemptDb } from '@/lib/db';
import { ok, fail } from '@/lib/utils';
export async function GET(_req: NextRequest, { params }: { params: Promise<{id:string}> }){
  try { const { id } = await params; const a = attemptDb.get(id); if(!a) return fail('not found',404); return ok(a); } catch(e:any){ return fail(String(e?.message||e),500); }
}
export async function POST(req: NextRequest, { params }: { params: Promise<{id:string}> }){
  try { const { id } = await params; const a = attemptDb.get(id); if(!a) return fail('not found',404);
    a.status='cancelled'; (a as any).error='cancelled by user'; attemptDb.update(a); return ok(a);
  } catch(e:any){ return fail(String(e?.message||e),500); }
}
