import { getConfig } from '@/lib/config';

export interface VoiceProvider {
  name: string;
  synthesize(text: string, opts?: VoiceOpts): Promise<Buffer>;
  testConnection(): Promise<boolean>;
  getVoices(): Promise<VoiceInfo[]>;
}
export interface VoiceOpts { voiceId?: string; model?: string; stability?: number; similarity?: number; style?: number; speed?: number; }
export interface VoiceInfo { id: string; name: string; labels?: Record<string,string>; }

export class ElevenLabsProvider implements VoiceProvider {
  name = 'elevenlabs';
  private apiKey: string;
  private base = 'https://api.elevenlabs.io/v1';
  constructor(apiKey?: string){ this.apiKey = apiKey || getConfig().ELEVENLABS_API_KEY || ''; }
  async synthesize(text: string, opts?: VoiceOpts): Promise<Buffer> {
    const voiceId = opts?.voiceId || getConfig().ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    const model = opts?.model || 'eleven_multilingual_v2';
    const res = await fetch(`${this.base}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: model, voice_settings: { stability: opts?.stability ?? 0.5, similarity_boost: opts?.similarity ?? 0.75, style: opts?.style ?? 0.3, use_speaker_boost: true } }),
    });
    if (!res.ok) throw new Error(`ElevenLabs error ${res.status}: ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }
  async testConnection(): Promise<boolean> {
    try { const r = await fetch(`${this.base}/user`, { headers: { 'xi-api-key': this.apiKey }, signal: AbortSignal.timeout(8000) }); return r.ok; } catch { return false; }
  }
  async getVoices(): Promise<VoiceInfo[]> {
    const r = await fetch(`${this.base}/voices`, { headers: { 'xi-api-key': this.apiKey } });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.voices || []).map((v: any)=>({ id: v.voice_id, name: v.name, labels: v.labels }));
  }
}

export interface SFXRequest { description: string; duration: number; outputPath: string; }
export class SFXProvider {
  name = 'procedural-sfx';
  async generate(req: SFXRequest): Promise<string> {
    const { spawn } = await import('child_process');
    const { getConfig } = await import('@/lib/config');
    const ffmpeg = getConfig().FFMPEG_PATH || 'ffmpeg';
    // Procedural ambience: filtered noise bed + fade, deterministic and offline-capable.
    // Real AudioCraft / cloud SFX can replace this adapter later without changing callers.
    await new Promise<void>((resolve, reject)=>{
      const args = ['-y','-f','lavfi',`-i=anoisesrc=d=${req.duration}:c=brown:a=0.25`,'-f','lavfi',`-i=sine=frequency=110:duration=${req.duration}`, '-filter_complex','[0:a]lowpass=f=800,volume=0.5[bed];[1:a]volume=0.08[hum];[bed][hum]amix=inputs=2:duration=longest,afade=t=in:st=0:d=0.5,afade=t=out:st='+Math.max(0,req.duration-1)+':d=1','-c:a','aac','-b:a','128k', req.outputPath];
      const p = spawn(ffmpeg, args, { stdio: 'ignore' });
      p.on('close', c=> c===0?resolve():reject(new Error('sfx ffmpeg failed')));
      p.on('error', reject);
      setTimeout(()=>{ try{p.kill();}catch{} reject(new Error('sfx timeout')); }, 60000);
    });
    return req.outputPath;
  }
  async testConnection(): Promise<boolean> { return true; }
}

export function getVoiceProvider(): VoiceProvider | null {
  const c = getConfig();
  if (!c.ELEVENLABS_API_KEY) return null;
  return new ElevenLabsProvider();
}
