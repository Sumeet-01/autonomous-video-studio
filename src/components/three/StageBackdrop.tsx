"use client";
import { useRef, useEffect } from 'react';
import * as THREE from 'three';

export default function StageBackdrop({ mode = 'idle' }: { mode?: 'idle'|'working'|'error'|'done' }){
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    if(!ref.current) return;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf=0; let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: ref.current, alpha:true, antialias:true, powerPreference:'low-power' });
    } catch { return; }
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100); cam.position.set(0,0.6,6);
    const geo = new THREE.PlaneGeometry(14,7,60,30);
    const mat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, uniforms:{ uT:{value:0}, uMode:{value: mode==='working'?1: mode==='done'?2:0} },
      vertexShader:`varying vec2 vUv; uniform float uT; void main(){ vUv=uv; vec3 p=position; p.z += sin(p.x*1.2+uT*0.6)*0.12 + cos(p.y*1.6+uT*0.4)*0.1; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
      fragmentShader:`varying vec2 vUv; uniform float uT; uniform float uMode; void main(){ float g = smoothstep(0.0,1.0,vUv.y); vec3 base = mix(vec3(0.08,0.10,0.13), vec3(0.10,0.14,0.17), g); float line = smoothstep(0.48,0.5,abs(fract(vUv.x*8.0+uT*0.02)-0.5)); float glow = 0.05 + 0.04*sin(uT*0.8+vUv.x*6.0); vec3 acc = uMode>1.5? vec3(0.32,0.88,0.65) : uMode>0.5? vec3(0.49,0.89,1.0) : vec3(0.85,1.0,0.24); vec3 col = base + acc*glow*(1.0-vUv.y)*0.35; col += vec3(1.0)*line*0.015; gl_FragColor=vec4(col,0.9);}` });
    const mesh = new THREE.Mesh(geo, mat); mesh.rotation.x=-0.35; scene.add(mesh);
    const resize=()=>{ const c=ref.current!; const w=c.clientWidth||800, h=c.clientHeight||300; renderer!.setSize(w,h,false); renderer!.setPixelRatio(Math.min(2, window.devicePixelRatio||1)); cam.aspect=w/h; cam.updateProjectionMatrix(); };
    resize(); window.addEventListener('resize', resize);
    const t0=performance.now();
    const tick=()=>{ mat.uniforms.uT.value=(performance.now()-t0)/1000; mat.uniforms.uMode.value = mode==='working'?1: mode==='done'?2:0; renderer!.render(scene,cam); raf=requestAnimationFrame(tick); };
    tick();
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener('resize',resize); geo.dispose(); mat.dispose(); renderer?.dispose(); };
  },[mode]);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full opacity-90 pointer-events-none" aria-hidden />;
}
