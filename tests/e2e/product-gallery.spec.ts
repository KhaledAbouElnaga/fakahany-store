import {expect,test} from '@playwright/test';
import {stableDemoSnapshot} from '../helpers/demo';
import {productImages,withProductImages} from '../../src/lib/productImages';

test.beforeEach(async({page})=>{
 const snapshot=stableDemoSnapshot();snapshot.products[0].image_url='';snapshot.products[0].image_urls=[];
 await page.addInitScript(snapshot=>{
  if(localStorage.getItem('gallery-seeded'))return;
  localStorage.setItem('fakahany-demo-snapshot-v1',JSON.stringify(snapshot));localStorage.setItem('gallery-seeded','1');
 },snapshot);
});
async function editor(page:any){
 await page.goto('/admin');
 await page.getByRole('button',{name:'دخول تجريبي كمدير'}).click();
 await page.locator('.admin-side nav').getByRole('button',{name:'المنتجات',exact:true}).click();
 await page.locator('.product-admin-table tbody tr').first().getByRole('button',{name:'تعديل',exact:true}).click();
}
async function files(page:any){
 const encoded=await page.evaluate(()=>['red','blue'].map(color=>{const c=document.createElement('canvas');c.width=20;c.height=20;const ctx=c.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,20,20);return c.toDataURL('image/png').split(',')[1]}));
 return encoded.map((image:string,i:number)=>({name:`photo-${i}.png`,mimeType:'image/png',buffer:Buffer.from(image,'base64')}));
}
test('upload a group, select cover, save, reload and browse the gallery',async({page})=>{
 await editor(page);
 await page.getByLabel('صور المنتج',{exact:true}).setInputFiles(await files(page));
 await expect(page.locator('.product-image-editor-item')).toHaveCount(2);
 await page.getByRole('button',{name:'تعيين الصورة 2 كغلاف',exact:true}).click();
 const cover=await page.locator('.product-image-editor-item img').first().getAttribute('src');
 await page.getByRole('button',{name:'حفظ المنتج',exact:true}).click();
 await expect(page.locator('.product-images-editor')).toHaveCount(0);
 await page.goto('/');
 await page.locator('.product-image-button').first().click();
 await expect(page.locator('.product-gallery .quick-view-image img')).toHaveAttribute('src',cover!);
 await expect(page.locator('.gallery-thumbnails button')).toHaveCount(2);
 await page.getByRole('button',{name:'الصورة التالية',exact:true}).click();
 await expect(page.locator('.gallery-navigation span')).toHaveText('2 / 2');
 await page.getByRole('button',{name:'عرض الصورة 1',exact:true}).click();
 await expect(page.locator('.gallery-navigation span')).toHaveText('1 / 2');
 await page.reload();await page.locator('.product-image-button').first().click();
 await expect(page.locator('.gallery-thumbnails button')).toHaveCount(2);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('cancel leaves the saved images intact; removing a cover promotes the next image',async({page})=>{
 await editor(page);await page.getByLabel('صور المنتج',{exact:true}).setInputFiles(await files(page));
 await expect(page.locator('.product-image-editor-item')).toHaveCount(2);
 await page.getByRole('button',{name:'حفظ المنتج',exact:true}).click();
 await expect(page.locator('.product-images-editor')).toHaveCount(0);
 await page.locator('.product-admin-table tbody tr').first().getByRole('button',{name:'تعديل',exact:true}).click();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'إزالة الصورة 1',exact:true}).click();
 await expect(page.locator('.product-image-editor-item')).toHaveCount(1);
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'إلغاء',exact:true}).click();
 await page.locator('.product-admin-table tbody tr').first().getByRole('button',{name:'تعديل',exact:true}).click();
 await expect(page.locator('.product-image-editor-item')).toHaveCount(2);
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'إزالة الصورة 1',exact:true}).click();
 const promoted=await page.locator('.product-image-editor-item img').getAttribute('src');
 await page.getByRole('button',{name:'حفظ المنتج',exact:true}).click();
 await expect(page.locator('.product-images-editor')).toHaveCount(0);
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('fakahany-demo-snapshot-v1')!).products[0]);
 expect(stored.image_url).toBe(promoted);expect(stored.image_urls).toHaveLength(1);
});
test('a failed batch does not save a partial gallery',async({page})=>{
 await editor(page);const good=await files(page);
 page.once('dialog',dialog=>dialog.accept());
 await page.getByLabel('صور المنتج',{exact:true}).setInputFiles([good[0],{name:'broken.png',mimeType:'image/png',buffer:Buffer.from('invalid image')}]);
 await expect(page.getByLabel('صور المنتج',{exact:true})).toBeEnabled();
 await expect(page.locator('.product-image-editor-item')).toHaveCount(0);
});
test('legacy cover remains compatible and the gallery limit does not silently drop photos',()=>{
 const product=stableDemoSnapshot().products[0];
 expect(productImages({...product,image_url:'old.jpg',image_urls:null})).toEqual(['old.jpg']);
 expect(productImages({...product,image_url:'old.jpg',image_urls:['old.jpg','second.jpg']})).toEqual(['old.jpg','second.jpg']);
 expect(()=>withProductImages(product,Array.from({length:11},(_,i)=>`${i}.jpg`))).toThrow();
});
