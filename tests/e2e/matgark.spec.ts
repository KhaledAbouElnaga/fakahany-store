import { expect,test } from '@playwright/test';
import { stableDemoSnapshot } from '../helpers/demo';
import { pathStoreSlug,requestedStoreSlug,scopedStoreHref,storePath } from '../../src/lib/storeLinks';

test('explicit paths win, legacy query links and hashes survive',()=>{
 expect(requestedStoreSlug({pathname:'/s/home/admin',search:'?store=fakahany'})).toBe('home');
 expect(pathStoreSlug('/signup')).toBe('');
 expect(scopedStoreHref('/cart?x=1#items',{pathname:'/s/home',search:''})).toBe('/s/home/cart?x=1#items');
 expect(scopedStoreHref('/cart?x=1#items',{pathname:'/',search:'?store=home'})).toBe('/cart?x=1&store=home#items');
 expect(scopedStoreHref('/cart',{pathname:'/',search:''})).toBe('/cart');
 expect(storePath('fakahany')).toBe('/s/fakahany');
});

test.beforeEach(async({page})=>{
 await page.addInitScript(snapshot=>{
  localStorage.setItem('fakahany-demo-snapshot-v1',JSON.stringify(snapshot));
  sessionStorage.setItem('fakahany-preview-store','stale-store');
 },stableDemoSnapshot());
});

test('path storefront, cart, checkout and admin retain store context',async({page})=>{
 await page.goto('/s/fakahany');
 await expect(page.locator('.storefront')).toBeVisible();
 await expect(page.locator('a[href="/s/fakahany/cart"]').first()).toBeVisible();
 await page.goto('/s/fakahany/cart');
 await expect(page.getByRole('heading',{name:'سلة التسوق'})).toBeVisible();
 await expect(page.getByRole('link',{name:'ابدأ التسوق'})).toHaveAttribute('href','/s/fakahany');
 await page.goto('/s/fakahany/admin');
 await expect(page.getByRole('button',{name:'دخول تجريبي كمدير'})).toBeVisible();
 await page.goto('/s/home/checkout');
 await expect(page.locator('body')).not.toContainText('الصفحة غير موجودة');
});

test('carts stay separate and old root data survives',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{
  const item={key:'test',product_id:'p',product_name:'منتج الفكهاني',option_id:'o',option_name:'واحد',unit_price:12,quantity:1};
  localStorage.setItem('fakahany-cart-v1',JSON.stringify([item]));
  localStorage.setItem('fakahany-cart-v1:store:fakahany',JSON.stringify([item]));
 });
 await page.goto('/s/fakahany/cart');
 await expect(page.locator('main')).toContainText('منتج الفكهاني');
 await page.goto('/s/home/cart');
 await expect(page.locator('main')).toContainText('السلة فارغة');
 await page.goto('/cart');
 await expect(page.locator('main')).toContainText('منتج الفكهاني');
 await expect(page.getByRole('link',{name:'متابعة التسوق'})).toHaveAttribute('href','/');
});

test('platform branding does not rename store metadata',async({page})=>{
 await page.goto('/signup');
 await expect(page).toHaveTitle(/Matgark/);
 await page.goto('/');
 await expect(page).not.toHaveTitle(/Matgark/);
});
