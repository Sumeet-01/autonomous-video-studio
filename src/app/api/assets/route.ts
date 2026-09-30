import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { assetDb } from '@/lib/db';
import { getProjectPaths } from '@/lib/config';
import { ok, fail, assertFile } from '@/lib/utils';

export async function POST(req: NextRequest){
  try {
    const form = await req.formData();
    const projectId = String(form.get('projectId')||'');
    const type = String(form.get('type')||'reference_image') as any;
    const file = form.get('file') as File | null;
    if(!projectId) return fail('projectId required');
    if(!file) return fail('file required');
    const kind = type.includes('video')?'video': type.includes('audio')||type==='voice'||type==='sfx'?'audio':'image';
    try { assertFile(file, kind as any); } catch(e:any){ return fail(e.message); }
    const paths = getProjectPaths(projectId);
    const dir = type.includes('video')?paths.references:paths.assets;
    if(!existsSync(dir)) mkdirSync(dir,{recursive:true});
    const id = randomUUID();
    const ext = extname((file as any).name||'') || (kind==='video'?'.mp4':kind==='audio'?'.mp3':'.jpg');
    const filename = `${type}_${id}${ext}`;
    const dest = join(dir, filename);
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(dest, buf);
    const asset:any = { id, projectId, type, filename, mimeType: file.type||'application/octet-stream', size: buf.length, path: dest, metadata:{}, createdAt:new Date() };
    assetDb.create(asset);
    return ok({ ...asset, url: `/api/assets/file?id=${id}` });
  } catch(e:any){ return fail(String(e?.message||e),500); }
}
export async function GET(req: NextRequest){
  const projectId = new URL(req.url).searchParams.get('projectId')||'';
  try { const { assetDb } = await import('@/lib/db'); return ok(assetDb.getByProject(projectId)); } catch(e:any){ return fail(String(e?.message||e),500); }
}
