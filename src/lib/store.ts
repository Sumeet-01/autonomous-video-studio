"use client";
import { create } from 'zustand';

interface StudioState {
  projectId: string | null;
  sceneId: string | null;
  setProject: (id: string | null) => void;
  setScene: (id: string | null) => void;
}
export const useStudio = create<StudioState>((set)=>({
  projectId: typeof window!=='undefined'? localStorage.getItem('lumen.projectId'): null,
  sceneId: null,
  setProject: (id)=>{ if(typeof window!=='undefined'){ if(id) localStorage.setItem('lumen.projectId',id); else localStorage.removeItem('lumen.projectId'); } set({ projectId:id }); },
  setScene: (id)=> set({ sceneId:id }),
}));
