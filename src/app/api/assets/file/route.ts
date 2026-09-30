import { NextRequest } from 'next/server';
import { createReadStream, existsSync } from 'fs';
import { stat } from 'fs/promises';
import { assetDb } from '@/lib/db';
import { fail } from '@/lib/utils';

export async function GET(req: NextRequest){
  const id = new URL(req.url).searchParams.get('id')||'';
  const a = assetDb.get(id); if(!a||!existsSync(a.path)) return fail('not found',404);
  const st = await stat(a.path);
  const stream: any = createReadStream(a.path);
  return new Response(stream as any, { headers: { 'Content-Type': a.mimeType, 'Content-Length': String(st.size), 'Cache-Control':'public, max-age=3600' } });
}
