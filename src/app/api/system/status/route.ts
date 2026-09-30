import { getProviderStatus, testProviderConnections } from '@/lib/config';
import { checkFFmpeg } from '@/lib/media/ffmpeg';
import { ok, fail } from '@/lib/utils';
export async function GET(req: Request){
  const url = new URL(req.url);
  const test = url.searchParams.get('test')==='1';
  try {
    const providers = test? await testProviderConnections() : getProviderStatus();
    const ff = await checkFFmpeg().catch(()=>({ffmpeg:false,ffprobe:false}));
    return ok({ providers, ffmpeg: ff, time: new Date().toISOString() });
  } catch(e:any){ return fail(String(e?.message||e),500); }
}
