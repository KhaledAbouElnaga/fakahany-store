import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{outcome:'accepted'|'dismissed'}> };

export default function InstallPwaButton(){
  const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null);
  const [iosHint,setIosHint]=useState(false);
  useEffect(()=>{
    const standalone=window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone;
    if(standalone)return;
    const onPrompt=(e:Event)=>{e.preventDefault();setPrompt(e as InstallPromptEvent)};
    window.addEventListener('beforeinstallprompt',onPrompt);
    const ua=navigator.userAgent.toLowerCase(); setIosHint(/iphone|ipad|ipod/.test(ua));
    return()=>window.removeEventListener('beforeinstallprompt',onPrompt);
  },[]);
  if(!prompt&&!iosHint)return null;
  if(iosHint&&!prompt)return <span className="pwa-hint">لإضافة المتجر للشاشة الرئيسية على iPhone: مشاركة ← إضافة إلى الشاشة الرئيسية</span>;
  return <button className="install-app-btn" onClick={async()=>{if(!prompt)return;await prompt.prompt();await prompt.userChoice;setPrompt(null)}}>تثبيت المتجر على الهاتف</button>;
}
