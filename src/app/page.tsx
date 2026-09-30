"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { TopBar } from '@/components/workspace/chrome';
import { useStudio } from '@/lib/store';
const StageBackdrop = dynamic(()=>import('@/components/three/StageBackdrop'), { ssr:false });

export default function Home(){
  const [projects, setProjects] = useState<any[]>([]);
  const [form, setForm] = useState({ name:'Neon Product Reveal', concept:'Recreate the camera movement and pacing of the reference, but use my product and my room.', aspectRatio:'16:9', duration:5, provider:'fal', model:'wan-2.1-14b-i2v' });
  const [busy, setBusy] = useState(false);
  const { setProject } = useStudio();
  const load = ()=> fetch('/api/projects').then(r=>r.json()).then(j=>setProjects(j.data||[])).catch(()=>{});
  useEffect(()=>{ load(); },[]);
  const create = async ()=>{
    setBusy(true);
    try {
      const r = await fetch('/api/projects',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
      const j = await r.json(); if(!j.success) throw new Error(j.error);
      setProject(j.data.id); window.location.href = `/projects/${j.data.id}`;
    } catch(e:any){ alert(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0"><StageBackdrop mode="idle" /></div>
        <div className="relative max-w-[1200px] mx-auto px-4 md:px-6 pt-14 pb-10 grid md:grid-cols-[1.2fr_0.8fr] gap-8 items-end">
          <div>
            <div className="mono text-[11px] tracking-[0.2em] text-[#9aa6b4]">AUTONOMOUS VIDEO CREATION STUDIO</div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tighter leading-none mt-3">Direct the reference.<br/>Deliver the original.</h1>
            <p className="text-[14px] text-[#9aa6b4] mt-3 max-w-[58ch]">Upload a reference, lock your subject and environment, then let the system analyze, generate, inspect with Muse Spark 1.3, self-correct and export — learning from every attempt.</p>
            <div className="flex gap-2 mt-5 flex-wrap">
              <span className="badge">Reference analysis</span><span className="badge">Image-to-video</span><span className="badge">Visual QA loop</span><span className="badge">FFmpeg mux</span><span className="badge">Learning memory</span>
            </div>
          </div>
          <div className="panel p-4">
            <div className="label">New production</div>
            <input className="input mb-2" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} aria-label="Project name" />
            <textarea className="textarea mb-2" rows={3} value={form.concept} onChange={e=>setForm({...form,concept:e.target.value})} aria-label="Concept" />
            <div className="grid grid-cols-3 gap-2 mb-2">
              <select className="select" value={form.aspectRatio} onChange={e=>setForm({...form,aspectRatio:e.target.value})} aria-label="Aspect ratio"><option>16:9</option><option>9:16</option><option>1:1</option><option>4:3</option></select>
              <select className="select" value={form.duration} onChange={e=>setForm({...form,duration:Number(e.target.value)})} aria-label="Duration">{[3,5,8,10].map(d=><option key={d} value={d}>{d}s</option>)}</select>
              <select className="select" value={form.provider} onChange={e=>setForm({...form,provider:e.target.value})} aria-label="Provider"><option value="fal">fal.ai</option><option value="replicate">replicate</option></select>
            </div>
            <input className="input mb-3 mono" value={form.model} onChange={e=>setForm({...form,model:e.target.value})} aria-label="Model" />
            <button className="btn btn-primary w-full justify-center" onClick={create} disabled={busy}>{busy?'Creating…':'Create production'}</button>
          </div>
        </div>
      </div>
      <main className="max-w-[1200px] mx-auto px-4 md:px-6 py-8 w-full">
        <h2 className="text-lg font-bold mb-3">Productions</h2>
        {!projects.length && <div className="panel p-8 text-center text-[#9aa6b4] text-sm">No productions yet. Create one above to start the journey: add reference → understand → generate → inspect → deliver.</div>}
        <div className="grid md:grid-cols-3 gap-3">
          {projects.map((p:any)=>(
            <Link key={p.id} href={`/projects/${p.id}`} className="panel p-4 hover:border-white/20 block">
              <div className="flex items-center justify-between"><div className="font-bold truncate">{p.name}</div><span className="badge mono">{p.status}</span></div>
              <div className="text-[12px] text-[#9aa6b4] mt-1 mono">{p.id} · {p.scenes?.length||0} scenes · {p.assets?.length||0} assets</div>
              <div className="text-[12px] text-[#9aa6b4] mt-2 line-clamp-2">{p.description||p.settings?.style||''}</div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
