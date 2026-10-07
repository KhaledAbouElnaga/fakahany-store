import { useEffect, useRef } from 'react';

const dirtyScopes=new Set<string>();

export function hasUnsavedChanges(){return dirtyScopes.size>0}

export function confirmUnsavedNavigation(){
  return !hasUnsavedChanges()||confirm('لديك تعديلات غير محفوظة. هل تريد المغادرة بدون حفظها؟');
}

export function useUnsavedChanges(dirty:boolean){
  const key=useRef('dirty-'+Math.random().toString(36).slice(2));
  useEffect(()=>{
    if(dirty)dirtyScopes.add(key.current);else dirtyScopes.delete(key.current);
    return()=>{dirtyScopes.delete(key.current)};
  },[dirty]);
  useEffect(()=>{
    const fn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue=''}};
    window.addEventListener('beforeunload',fn);
    return()=>window.removeEventListener('beforeunload',fn);
  },[dirty]);
}
