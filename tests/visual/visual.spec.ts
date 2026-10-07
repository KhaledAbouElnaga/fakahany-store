import { expect, test } from '@playwright/test';
import { stableDemoSnapshot } from '../helpers/demo';

test.beforeEach(async({page})=>{
  const snapshot=stableDemoSnapshot();
  await page.addInitScript(({snapshot})=>{
    localStorage.setItem('fakahany-demo-snapshot-v1',JSON.stringify(snapshot));
    localStorage.setItem('fakahany-demo-orders-v1','[]');
    localStorage.setItem('fakahany-auto-backup-date','visual-test');
    sessionStorage.setItem('fakahany-demo-admin','1');
  },{snapshot});
});

test('storefront desktop visual',async({page})=>{
  await page.setViewportSize({width:1366,height:900});
  await page.goto('/');
  await page.locator('.product-card').first().waitFor();
  await expect(page).toHaveScreenshot('storefront-desktop.png',{fullPage:true,maxDiffPixelRatio:0.015});
});

test('storefront mobile visual',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.locator('.product-card').first().waitFor();
  await expect(page).toHaveScreenshot('storefront-mobile.png',{fullPage:true,maxDiffPixelRatio:0.015});
});

test('admin desktop visual',async({page})=>{
  await page.setViewportSize({width:1366,height:900});
  await page.goto('/admin');
  await page.getByRole('heading',{name:'الرئيسية'}).waitFor();
  await expect(page).toHaveScreenshot('admin-desktop.png',{fullPage:true,maxDiffPixelRatio:0.015});
});
