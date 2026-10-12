import type { CSSProperties } from 'react';
import type { BannerDisplaySettings } from '../types';

export const DEFAULT_BANNER_DISPLAY:BannerDisplaySettings={
  fit:'full',
  ratio:'5/1',
  position_x:50,
  position_y:50,
};

const fits:BannerDisplaySettings['fit'][]=['full','contain','cover'];
const ratios:BannerDisplaySettings['ratio'][]=['5/1','4/1','3/1','16/9'];
const clamp=(v:unknown,fallback:number)=>{
  if(v==null||v==='')return fallback;
  const n=Number(v);
  return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):fallback;
};

/** Discard unknown values from older store records rather than using untrusted CSS. */
export function normalizeBannerDisplay(raw:unknown):BannerDisplaySettings{
  const s=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Partial<BannerDisplaySettings>:{};
  return {
    fit:fits.includes(s.fit as BannerDisplaySettings['fit'])?s.fit!:DEFAULT_BANNER_DISPLAY.fit,
    ratio:ratios.includes(s.ratio as BannerDisplaySettings['ratio'])?s.ratio!:DEFAULT_BANNER_DISPLAY.ratio,
    position_x:clamp(s.position_x,50),
    position_y:clamp(s.position_y,50),
  };
}

export function bannerStyle(raw:unknown):CSSProperties{
  const s=normalizeBannerDisplay(raw);
  return {
    '--store-banner-ratio':s.ratio,
    '--store-banner-x':`${s.position_x}%`,
    '--store-banner-y':`${s.position_y}%`,
  } as CSSProperties;
}
