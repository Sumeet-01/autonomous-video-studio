"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStudio } from '@/lib/store';

export function TopBar({ status }: { status?: any }){
  const { projectId } = useStudio();
  const [sys, setSys] = useState<any>(null);
  useEffect(()=>{ fetch('/api/system/status').then(r=>r.json()).then(j=>setSys(j.data)).catch(()=>{}); },[]);
  return (
    <header className="h-[60px] shrink-0 border-b border-white/10 flex items-center gap-4 px-4 md:px-6 relative z-20 bg-[#0b0d10]/80 backdrop-blur">
      <Link href="/" className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg grid place-items-center font-black text-black" style={{background:'#d8ff3e'}}>L</div>
        <div className="leading-tight">
          <div className="font-bold tracking-tight">LUMEN Studio</div>
          <div className="text-[11px] text-[#9aa6b4] mono">Reference → Deliver</div>
        </div>
      </Link>
      <nav className="hidden md:flex items-center gap-1 text-[13px] ml-4">
        {[['Projects','/'],['Workspace', projectId?`/projects/${projectId}`:'/'],['Settings','/settings']].map(([l,h])=>(
          <Link key={l} href={h} className="px-3 py-1.5 rounded-md hover:bg-white/5 text-[#c7d0db]">{l}</Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {(sys?.providers||[]).slice(0,4).map((p:any)=>(
          <span key={p.name} className="badge" title={p.name}>
            <span className="dot" style={{background: p.configured?'#51e0a5':'#ff6b6b'}} />
            {p.name}
          </span>
        ))}
        {status && <span className="badge mono">{status}</span>}
      </div>
    </header>
  );
}

export function SectionTitle({ k, title, hint }: { k:string; title:string; hint?:string }){
  return (
    <div className="mb-3">
      <div className="mono text-[11px] tracking-[0.18em] text-[#9aa6b4]">{k}</div>
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {hint && <p className="text-[13px] text-[#9aa6b4] mt-1 max-w-[70ch]">{hint}</p>}
    </div>
  );
}
