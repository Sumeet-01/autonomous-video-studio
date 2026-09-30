import { randomUUID } from 'crypto';
export const uid = (p='id')=>`${p}_${randomUUID().slice(0,8)}`;
export const nowIso = ()=> new Date().toISOString();
export function ok<T>(data:T, message?:string){ return Response.json({ success:true, data, message }); }
export function fail(error:string, status=400){ return Response.json({ success:false, error }, { status }); }
export const ALLOWED_IMAGE = new Set(['image/jpeg','image/png','image/webp']);
export const ALLOWED_VIDEO = new Set(['video/mp4','video/quicktime','video/webm']);
export function assertFile(file: File, kind:'image'|'video'|'audio'){
  const max = kind==='video'? 500*1024*1024 : kind==='audio'? 100*1024*1024 : 25*1024*1024;
  if (file.size>max) throw new Error(`${kind} exceeds size limit`);
  if (kind==='image' && !ALLOWED_IMAGE.has(file.type)) throw new Error('unsupported image type');
  if (kind==='video' && !ALLOWED_VIDEO.has(file.type)) throw new Error('unsupported video type');
}
