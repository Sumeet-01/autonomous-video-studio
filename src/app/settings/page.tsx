"use client";
import { useEffect, useState } from 'react';
import { TopBar, SectionTitle } from '@/components/workspace/chrome';

export default function SettingsPage(){
  const [sys, setSys] = useState<any>(null);
  const [learn, setLearn] = useState<any>(null);
  const load = async ()=>{
    const s = await fetch('/api/system/status?test=1').then(r=>r.json()).catch(()=>null);
    setSys(s?.data||null);
    const l = await fetch('/api/learning').then(r=>r.json()).catch(()=>null);
    setLearn(l?.data||null);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{ load(); },[]);
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <main className="max-w-[1100px] mx-auto px-4 md:px-6 py-8 w-full grid gap-6">
        <div>
          <SectionTitle k="CONFIGURATION" title="Connections & learning" hint="Keys come from .env.local only. Secrets are never sent to the browser. Use Test to perform a genuine provider check." />
          <button className="btn" onClick={load}>Test connections</button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {(sys?.providers||[]).map((p:any)=>(
            <div key={p.name} className="panel p-4">
              <div className="flex items-center justify-between"><div className="font-bold">{p.name}</div>
                <span className="badge"><span className="dot" style={{background:p.connected?'#51e0a5':p.configured?'#d8ff3e':'#ff6b6b'}}/>{p.connected?'Connected':p.configured?'Key present':'Not configured'}</span></div>
              <div className="mono text-[12px] text-[#9aa6b4] mt-2">key: {p.keyPreview||'—'} {p.extra||''}</div>
              {p.models && <div className="text-[12px] text-[#9aa6b4] mt-1">{p.models.slice(0,5).join(' · ')}</div>}
              {!p.configured && <div className="text-[12px] mt-2">Add the key to <span className="mono">.env.local</span> then re-test. Unrelated features keep working.</div>}
            </div>
          ))}
          <div className="panel p-4">
            <div className="font-bold">FFmpeg</div>
            <div className="mono text-[12px] text-[#9aa6b4] mt-2">{sys?.ffmpeg?.ffmpeg?'Installed':'Missing'} {sys?.ffmpeg?.version||''} · ffprobe: {sys?.ffmpeg?.ffprobe?'yes':'no'}</div>
            {!sys?.ffmpeg?.ffmpeg && <div className="text-[12px] mt-2">Install with <span className="mono">brew install ffmpeg</span> on macOS. Media features degrade gracefully until present.</div>}
          </div>
        </div>
        <div className="panel p-4">
          <div className="font-bold mb-2">Learning memory</div>
          {!learn?.total ? <div className="text-[13px] text-[#9aa6b4]">No experiences recorded yet. Approved and rejected generations will appear here with strategies, corrections and model performance.</div> : (
            <div className="grid md:grid-cols-4 gap-3 text-[13px]">
              <div><div className="mono text-2xl">{learn.total}</div><div className="text-[#9aa6b4]">experiences</div></div>
              <div><div className="mono text-2xl">{Math.round((learn.approvalRate||0)*100)}%</div><div className="text-[#9aa6b4]">approval</div></div>
              <div><div className="mono text-2xl">{(learn.avgAttempts||0).toFixed(1)}</div><div className="text-[#9aa6b4]">avg attempts</div></div>
              <div><div className="mono text-2xl">{Math.round((learn.avgTimeMs||0)/1000)}s</div><div className="text-[#9aa6b4]">avg gen time</div></div>
            </div>
          )}
          {!!learn?.commonDefects?.length && <div className="mt-3 text-[12px] mono text-[#9aa6b4]">Top defects: {learn.commonDefects.map((d:any)=>`${d[0]}×${d[1]}`).join(' · ')}</div>}
        </div>
        <div className="panel p-4 text-[12px] text-[#9aa6b4]">
          <div className="font-bold text-white mb-1">Environment template</div>
          <pre className="mono whitespace-pre-wrap">{`MODEL_API_KEY="..."\nFAL_API_KEY="..."\nREPLICATE_API_TOKEN="..."\nELEVENLABS_API_KEY="..."\nELEVENLABS_VOICE_ID="..."`}</pre>
        </div>
      </main>
    </div>
  );
}
