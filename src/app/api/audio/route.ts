import { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { getProjectPaths } from '@/lib/config';
import { assetDb } from '@/lib/db';
import { getVoiceProvider, SFXProvider } from '@/lib/providers/audio';
import { ok, fail } from '@/lib/utils';
export async function POST(req: NextRequest){
  try { const { projectId, kind, text, description, duration, voiceId } = await req.json();
    if(!projectId||!kind) return fail('projectId and kind required');
    const paths = getProjectPaths(projectId);
    if(!existsSync(paths.audio)) await mkdir(paths.audio,{recursive:true});
    const id = randomUUID();
    if (kind==='voice'){
      const vp = getVoiceProvider(); if(!vp) return fail('voice provider not configured (ELEVENLABS_API_KEY)', 503);
      const buf = await vp.synthesize(text||'Narration', { voiceId });
      const out = join(paths.audio, `voice_${id}.mp3`); await writeFile(out, buf);
      const a:any={ id, projectId, type:'voice', filename:`voice_${id}.mp3`, mimeType:'audio/mpeg', size:buf.length, path:out, metadata:{}, createdAt:new Date() };
      assetDb.create(a); return ok({ ...a, url:`/api/assets/file?id=${id}` });
    } else {
      const sfx = new SFXProvider();
      const out = join(paths.audio, `sfx_${id}.m4a`);
      await sfx.generate({ description: description||'ambience', duration: Math.min(Math.max(duration||5,1),30), outputPath: out });
      const { statSync } = await import('fs');
      const a:any={ id, projectId, type:'sfx', filename:`sfx_${id}.m4a`, mimeType:'audio/mp4', size: statSync(out).size, path:out, metadata:{}, createdAt:new Date() };
      assetDb.create(a); return ok({ ...a, url:`/api/assets/file?id=${id}` });
    }
  } catch(e:any){ return fail(String(e?.message||e),500); }
}
