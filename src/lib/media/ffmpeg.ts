import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, basename, normalize } from 'path';
import { getConfig } from '@/lib/config';

function ffmpegBin(){ return getConfig().FFMPEG_PATH || 'ffmpeg'; }
function ffprobeBin(){ return getConfig().FFPROBE_PATH || 'ffprobe'; }
function runFFmpeg(args: string[], timeout = 120000): Promise<{code:number}> {
  return new Promise((resolve, reject)=>{
    const p = spawn(ffmpegBin(), args, { stdio: ['ignore','pipe','pipe'] });
    let err='';
    p.stderr.on('data', d=>{ err+=d.toString().slice(0,4000); });
    const t = setTimeout(()=>{ try{p.kill('SIGKILL');}catch{} reject(new Error('ffmpeg timeout: '+err.slice(0,500))); }, timeout);
    p.on('close', code=>{ clearTimeout(t); if(code===0) resolve({code}); else reject(new Error(`ffmpeg exit ${code}: ${err.slice(0,800)}`)); });
    p.on('error', e=>{ clearTimeout(t); reject(e); });
  });
}
function runFFprobe(args: string[]): Promise<string> {
  return new Promise((resolve,reject)=>{
    const p = spawn(ffprobeBin(), args, { stdio: ['ignore','pipe','pipe'] });
    let out='', err='';
    p.stdout.on('data', d=>{ out+=d.toString(); });
    p.stderr.on('data', d=>{ err+=d.toString(); });
    const t = setTimeout(()=>{ try{p.kill();}catch{} reject(new Error('ffprobe timeout')); }, 20000);
    p.on('close', c=>{ clearTimeout(t); if(c===0) resolve(out); else reject(new Error('ffprobe failed: '+err.slice(0,500))); });
    p.on('error', e=>{ clearTimeout(t); reject(e); });
  });
}

export interface MediaProbe { duration:number; width:number; height:number; fps:number; codec:string; size:number; hasAudio:boolean; }

export async function probeVideo(path: string): Promise<MediaProbe> {
  const { statSync } = await import('fs');
  const size = statSync(path).size;
  const json = await runFFprobe(['-v','quiet','-print_format','json','-show_format','-show_streams', path]);
  const j = JSON.parse(json);
  const vs = (j.streams||[]).find((s:any)=>s.codec_type==='video');
  const as = (j.streams||[]).find((s:any)=>s.codec_type==='audio');
  let fps = 0;
  if (vs?.avg_frame_rate) { const [n,d] = String(vs.avg_frame_rate).split('/').map(Number); if(d) fps = n/d; }
  if (!fps && vs?.r_frame_rate) { const [n,d] = String(vs.r_frame_rate).split('/').map(Number); if(d) fps = n/d; }
  return { duration: parseFloat(j.format?.duration||'0'), width: vs?.width||0, height: vs?.height||0, fps: Math.round(fps*100)/100, codec: vs?.codec_name||'unknown', size, hasAudio: !!as };
}

export async function detectScenes(path: string, threshold = 0.3): Promise<number[]> {
  // Returns scene-change timestamps via select filter metadata.
  return new Promise((resolve)=>{
    const p = spawn(ffmpegBin(), ['-i', path, '-filter:v', `select='gte(scene,${threshold})',showinfo`, '-f','null','-'], { stdio: ['ignore','ignore','pipe'] });
    let err='';
    p.stderr.on('data', d=>{ err+=d.toString(); });
    const t = setTimeout(()=>{ try{p.kill();}catch{} resolve([0]); }, 60000);
    p.on('close', ()=>{
      clearTimeout(t);
      const times: number[] = [0];
      const re = /pts_time:([\d.]+)/g;
      let m; while((m=re.exec(err))){ const v=parseFloat(m[1]); if(!isNaN(v)) times.push(v); }
      resolve([...new Set(times)].sort((a,b)=>a-b));
    });
    p.on('error', ()=>{ clearTimeout(t); resolve([0]); });
  });
}

export interface FramePlan { timestamps:number[]; strategy:string; }
export function planFrameTimestamps(duration:number, scenes:number[], maxFrames=24): FramePlan {
  if (duration<=0) return { timestamps:[0], strategy:'fallback' };
  const stamps = new Set<number>();
  // Always include scene boundaries + midpoints (scene-aware)
  for (let i=0;i<scenes.length;i++){
    const s = scenes[i]; const e = i+1<scenes.length?scenes[i+1]:duration;
    stamps.add(Math.min(s, Math.max(0,duration-0.1)));
    const mid = (s+e)/2; if (mid<duration) stamps.add(mid);
  }
  // Uniform fill up to budget
  if (stamps.size < maxFrames) {
    const need = maxFrames - stamps.size;
    for (let i=0;i<need;i++){ const t = (duration*(i+1))/(need+1); stamps.add(Math.round(t*10)/10); }
  }
  const arr = [...stamps].filter(t=>t>=0&&t<duration).sort((a,b)=>a-b).slice(0,maxFrames);
  return { timestamps: arr.length?arr:[0], strategy: scenes.length>1?'scene-aware+uniform':'uniform' };
}

export async function extractFrames(videoPath:string, outDir:string, timestamps:number[], scale='640:-1', quality=2): Promise<string[]> {
  if(!existsSync(outDir)) mkdirSync(outDir,{recursive:true});
  const files:string[] = [];
  // Parallelize in small batches to bound memory
  const batch = 4;
  for (let i=0;i<timestamps.length;i+=batch){
    const chunk = timestamps.slice(i,i+batch);
    await Promise.all(chunk.map(async (t,bi)=>{
      const idx = i+bi;
      const out = join(outDir, `frame_${String(idx).padStart(3,'0')}_t${t.toFixed(2)}.jpg`);
      await runFFmpeg(['-y','-ss',String(t),'-i',videoPath,'-frames:v','1','-vf',`scale=${scale}`,`-q:v`,String(quality), out], 60000);
      files.push(out);
    }));
  }
  return files.sort();
}

export async function makeThumbnail(videoOrImage:string, out:string, w=320): Promise<string> {
  const dir = join(out,'..');
  await runFFmpeg(['-y','-i',videoOrImage,'-frames:v','1','-vf',`scale=${w}:-1`, out], 30000);
  return out;
}

export interface MuxOpts { video:string; voice?:string; sfx?:string; music?:string; output:string; voiceVolume?:number; sfxVolume?:number; musicVolume?:number; fadeIn?:number; fadeOut?:number; }
export async function muxFinal(o:MuxOpts): Promise<string> {
  const inputs:string[] = ['-i', o.video];
  const amix:string[] = [];
  let aIdx = 1;
  if (o.voice){ inputs.push('-i', o.voice); amix.push(`[${aIdx}:a]volume=${o.voiceVolume??1.0},afade=t=in:st=0:d=${o.fadeIn??0.3}[v]`); aIdx++; }
  if (o.sfx){ inputs.push('-i', o.sfx); amix.push(`[${aIdx}:a]volume=${o.sfxVolume??0.35}[s]`); aIdx++; }
  if (o.music){ inputs.push('-i', o.music); amix.push(`[${aIdx}:a]volume=${o.musicVolume??0.18}[m]`); aIdx++; }
  const args = ['-y', ...inputs];
  if (amix.length===0){
    args.push('-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest', o.output);
  } else {
    const labels = amix.map(s=>s.match(/\[[a-z]\]$/)?.[0]||'').filter(Boolean);
    // simpler: amix all secondaries then aac
    const filter = amix.join(';') + (labels.length? `;${labels.join('')}amix=inputs=${labels.length}:duration=longest:dropout_transition=0[aout]`:'');
    args.push('-filter_complex', filter || 'anull', '-map','0:v:0');
    if (labels.length) args.push('-map','[aout]');
    args.push('-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-shortest', o.output);
  }
  await runFFmpeg(args, 180000);
  return o.output;
}

export async function concatScenes(inputs:string[], output:string): Promise<string> {
  const { writeFileSync } = await import('fs');
  const list = output+'.list.txt';
  writeFileSync(list, inputs.map(p=>`file '${p.replace(/'/g,"'\\''")}'`).join('\n'));
  await runFFmpeg(['-y','-f','concat','-safe','0','-i',list,'-c','copy', output], 120000);
  return output;
}

export async function checkFFmpeg(): Promise<{ffmpeg:boolean; ffprobe:boolean; version?:string}> {
  const out = { ffmpeg:false, ffprobe:false, version: undefined as string|undefined };
  try { const p = spawn(ffmpegBin(), ['-version'], { stdio:['ignore','pipe','ignore'] }); const v = await new Promise<string>(res=>{ let s=''; p.stdout.on('data',d=>s+=d); p.on('close',()=>res(s)); p.on('error',()=>res('')); setTimeout(()=>res(s),3000); }); if(v){ out.ffmpeg=true; out.version=v.split('\n')[0]?.slice(0,120); } } catch {}
  try { const p2 = spawn(ffprobeBin(), ['-version'], { stdio:['ignore','pipe','ignore'] }); const v2 = await new Promise<string>(res=>{ let s=''; p2.stdout.on('data',d=>s+=d); p2.on('close',()=>res(s)); p2.on('error',()=>res('')); setTimeout(()=>res(s),3000); }); if(v2) out.ffprobe=true; } catch {}
  return out;
}

export function safeJoin(base:string, ...parts:string[]): string {
  const joined = join(base, ...parts);
  const n = normalize(joined);
  const nb = normalize(base);
  if (!n.startsWith(nb)) throw new Error('unsafe path');
  return n;
}
