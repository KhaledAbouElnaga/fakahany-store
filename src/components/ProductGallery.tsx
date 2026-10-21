import { useState, useRef } from 'react';
import type { Product } from '../types';
import { productImages } from '../lib/productImages';

export default function ProductGallery({product}:{product:Product}){
  const images=productImages(product);
  const [selected,setSelected]=useState(0);
  const touchStart=useRef<number|null>(null);
  const index=Math.min(selected,Math.max(0,images.length-1));
  const move=(delta:number)=>setSelected((index+delta+images.length)%images.length);
  return <section className="product-gallery" aria-label="صور المنتج">
    <div className="quick-view-image" onTouchStart={e=>{touchStart.current=e.changedTouches[0].clientX}} onTouchEnd={e=>{if(touchStart.current===null||images.length<2)return;const delta=e.changedTouches[0].clientX-touchStart.current;if(Math.abs(delta)>40)move(delta<0?1:-1);touchStart.current=null;}}>
      {images.length?<img src={images[index]} alt={images.length>1?`${product.name_ar} — صورة ${index+1}`:product.name_ar}/>:<div className="image-fallback">صورة المنتج</div>}
    </div>
    {images.length>1&&<>
      <div className="gallery-navigation"><button type="button" aria-label="الصورة السابقة" onClick={()=>move(-1)}>→</button><span aria-live="polite">{index+1} / {images.length}</span><button type="button" aria-label="الصورة التالية" onClick={()=>move(1)}>←</button></div>
      <div className="gallery-thumbnails">{images.map((url,i)=><button type="button" key={url} aria-label={`عرض الصورة ${i+1}`} aria-pressed={i===index} onClick={()=>setSelected(i)}><img src={url} alt="" loading="lazy"/></button>)}</div>
    </>}
  </section>;
}
