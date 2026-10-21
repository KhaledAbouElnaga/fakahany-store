import type { Product } from '../types';

export const MAX_PRODUCT_IMAGES=10;

/** Keep legacy image_url as the cover for older clients and backups. */
export function productImages(product:Pick<Product,'image_url'|'image_urls'>):string[]{
  return [...new Set([product.image_url,...(Array.isArray(product.image_urls)?product.image_urls:[])].filter((url):url is string=>typeof url==='string'&&Boolean(url.trim())).map(url=>url.trim()))];
}

export function withProductImages(product:Product,images:string[]):Product{
  const urls=[...new Set(images.filter(Boolean))];
  if(urls.length>MAX_PRODUCT_IMAGES)throw new Error(`يمكن إضافة ${MAX_PRODUCT_IMAGES} صور لكل منتج كحد أقصى.`);
  return {...product,image_url:urls[0]||'',image_urls:urls};
}
