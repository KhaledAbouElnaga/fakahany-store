import type { CSSProperties } from 'react';
import type { HeroCopyStyle } from '../types';

export const DEFAULT_HERO_COPY_STYLE: HeroCopyStyle = {
  background_mode: 'solid',
  background_color: '#FFFFFF',
  background_opacity: 35,
  glass_blur: 12,
  title_color: '#163523',
  subtitle_color: '#52675B',
  font_family: 'system',
  text_align: 'center',
  radius: 18,
  shadow: true,
};

export const HERO_COPY_PRESETS: { id:string; label:string; style:HeroCopyStyle }[] = [
  { id:'clean', label:'أبيض أنيق', style:{...DEFAULT_HERO_COPY_STYLE} },
  { id:'glass', label:'زجاج مائي', style:{...DEFAULT_HERO_COPY_STYLE,background_mode:'glass',background_color:'#DDF5FF',background_opacity:40,glass_blur:14,title_color:'#153748',subtitle_color:'#315867'} },
  { id:'dark', label:'داكن فاخر', style:{...DEFAULT_HERO_COPY_STYLE,background_color:'#163523',title_color:'#FFFFFF',subtitle_color:'#E4F1E8',radius:18} },
  { id:'none', label:'بدون خلفية', style:{...DEFAULT_HERO_COPY_STYLE,background_mode:'none',shadow:false,radius:0} },
];

const modes:HeroCopyStyle['background_mode'][]=['solid','translucent','glass','none'];
const families:HeroCopyStyle['font_family'][]=['system','cairo','tajawal','almarai','tahoma'];
const aligns:HeroCopyStyle['text_align'][]=['center','right','left'];
const hex=(raw:unknown,fallback:string)=>typeof raw==='string'&&/^#[0-9a-fA-F]{6}$/.test(raw)?raw.toUpperCase():fallback;
const bounded=(raw:unknown,fallback:number,min:number,max:number)=>{
  if(raw==null||raw==='')return fallback;
  const num=Number(raw);
  return Number.isFinite(num)?Math.min(max,Math.max(min,Math.round(num))):fallback;
};

export function normalizeHeroCopyStyle(input:unknown):HeroCopyStyle{
  const v=input&&typeof input==='object'&&!Array.isArray(input)?input as Partial<HeroCopyStyle>:{};
  const d=DEFAULT_HERO_COPY_STYLE;
  return {
    background_mode:modes.includes(v.background_mode as HeroCopyStyle['background_mode'])?v.background_mode!:d.background_mode,
    background_color:hex(v.background_color,d.background_color),
    background_opacity:bounded(v.background_opacity,d.background_opacity,5,95),
    glass_blur:bounded(v.glass_blur,d.glass_blur,0,24),
    title_color:hex(v.title_color,d.title_color),
    subtitle_color:hex(v.subtitle_color,d.subtitle_color),
    font_family:families.includes(v.font_family as HeroCopyStyle['font_family'])?v.font_family!:d.font_family,
    text_align:aligns.includes(v.text_align as HeroCopyStyle['text_align'])?v.text_align!:d.text_align,
    radius:bounded(v.radius,d.radius,0,32),
    shadow:typeof v.shadow==='boolean'?v.shadow:d.shadow,
  };
}

const fonts:Record<HeroCopyStyle['font_family'],string>={
  system:'"Segoe UI", Tahoma, Arial, sans-serif',
  cairo:'"Cairo", Tahoma, Arial, sans-serif',
  tajawal:'"Tajawal", Tahoma, Arial, sans-serif',
  almarai:'"Almarai", Tahoma, Arial, sans-serif',
  tahoma:'Tahoma, Arial, sans-serif',
};

function rgba(hexColor:string,opacity:number){
  const v=hexColor.substring(1);
  return `rgba(${Number.parseInt(v.substring(0,2),16)}, ${Number.parseInt(v.substring(2,4),16)}, ${Number.parseInt(v.substring(4,6),16)}, ${opacity/100})`;
}

/** Shared between storefront and merchant preview to prevent style drift. */
export function heroCopyCss(styleInput:unknown,titleSize:number,subtitleSize:number):CSSProperties{
  const style=normalizeHeroCopyStyle(styleInput);
  const glass=style.background_mode==='glass';
  const none=style.background_mode==='none';
  const transparent=glass||style.background_mode==='translucent';
  return {
    '--hero-title-size':`${titleSize}px`,
    '--hero-subtitle-size':`${subtitleSize}px`,
    '--hero-card-bg':none?'transparent':transparent?rgba(style.background_color,style.background_opacity):style.background_color,
    '--hero-card-border':none?'transparent':glass?'rgba(255,255,255,.65)':'var(--border)',
    '--hero-card-blur':glass?`blur(${style.glass_blur}px) saturate(145%)`:'none',
    '--hero-card-shadow':style.shadow&&!none?'0 8px 24px rgba(17,43,32,.13)':'none',
    '--hero-title-color':style.title_color,
    '--hero-subtitle-color':style.subtitle_color,
    '--hero-card-font':fonts[style.font_family],
    '--hero-card-align':style.text_align,
    '--hero-card-radius':`${style.radius}px`,
  } as CSSProperties;
}

export function heroTextContrast(textColor:string,bgColor:string):number{
  const luminance=(value:string)=>{
    const components=[1,3,5].map(i=>Number.parseInt(value.slice(i,i+2),16)/255);
    const linear=components.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
  };
  const a=luminance(textColor),b=luminance(bgColor);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
