import {test,expect} from '@playwright/test';
import {isPlatformHost,platformAdminUrl,platformStoreUrl} from '../../src/lib/storeLinks';

test('Matgark host is separate from legacy merchant hosts',()=>{
 expect(isPlatformHost('matgark.pages.dev')).toBe(true);
 expect(isPlatformHost('07f2ac77.matgark.pages.dev')).toBe(true);
 expect(isPlatformHost('fakahany-store.pages.dev')).toBe(false);
 expect(isPlatformHost('shop.example.com')).toBe(false);
});

test('store links retain custom domains and valid admin query strings',()=>{
 const settings={base_domain:'matgark.pages.dev',default_trial_days:14,support_session_minutes:30};
 expect(platformStoreUrl('https://matgark.pages.dev',{slug:'home'},settings)).toBe('https://matgark.pages.dev/s/home');
 expect(platformStoreUrl('https://matgark.pages.dev',{slug:'home',custom_domain:'shop.example.com'},settings)).toBe('https://shop.example.com');
 expect(new URL(platformAdminUrl('https://matgark.pages.dev',{slug:'home'})+'?join=1').pathname).toBe('/s/home/admin');
});

test('Matgark home has platform actions without a merchant storefront',async({page})=>{
 await page.goto('/');
 // Exercise the actual production hostname routing while serving the local build.
 await page.route('https://matgark.pages.dev/**',async route=>{
  const u=new URL(route.request().url());
  const response=await route.fetch({url:'http://127.0.0.1:4173'+u.pathname+u.search});
  await route.fulfill({response});
 });
 await page.goto('https://matgark.pages.dev/');
 await expect(page.getByRole('heading',{name:'كل متجرك في مكان واحد'})).toBeVisible();
 await expect(page.getByRole('link',{name:'دخول إدارة المنصة'})).toHaveAttribute('href','/platform');
 await expect(page.locator('.storefront')).toHaveCount(0);
 await expect(page).toHaveTitle('Matgark — متجرك');
});
