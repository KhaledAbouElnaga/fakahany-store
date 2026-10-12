import { bannerStyle, normalizeBannerDisplay } from '../lib/bannerDisplay';
import type { BannerDisplaySettings } from '../types';

type Props={
  src:string;
  alt:string;
  display:BannerDisplaySettings;
  onDimensions?:(width:number,height:number)=>void;
};

/** Shared by the live storefront and merchant editor; neither can crop differently. */
export default function StoreBanner({src,alt,display,onDimensions}:Props){
  const config=normalizeBannerDisplay(display);
  return <div
    className={`store-banner${src?' has-image':''}`}
    data-fit={config.fit}
    data-ratio={config.ratio}
    style={bannerStyle(config)}
  >
    {src?<img src={src} alt={alt} onLoad={e=>onDimensions?.(e.currentTarget.naturalWidth,e.currentTarget.naturalHeight)}/>:<span className="store-banner-empty">صورة الغلاف ستظهر هنا</span>}
  </div>;
}
