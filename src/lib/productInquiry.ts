import type { Product } from '../types';

// No sale option means no verified price. Never synthesize a zero-price option.
export function needsPriceInquiry(product:Product){return product.options.length===0;}
export function priceInquiryHref(phone:string,product:Product){
  const digits=phone.replace(/\D/g,'');
  return digits?`https://wa.me/${digits}?text=${encodeURIComponent('مرحبًا، أريد الاستفسار عن السعر والتوفر: '+product.name_ar)}`:'';
}
