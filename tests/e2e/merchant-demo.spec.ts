import { expect, test } from '@playwright/test';

test('mini market has real photo links, multiple categories and WhatsApp order preview',async({page})=>{
  await page.goto('/merchant-demo.html');
  await expect(page).toHaveTitle(/صور حقيقية/);
  await expect(page.locator('.product')).toHaveCount(12);
  await expect(page.getByRole('button',{name:'ميني ماركت / سوبر ماركت'})).toHaveAttribute('aria-pressed','true');
  const photo=page.locator('.product img').first();
  await expect(photo).toHaveAttribute('src',/images\.pexels\.com/);
  await expect(photo).toHaveAttribute('alt',/.+/);
  await page.getByRole('button',{name:'مشروبات'}).click();
  await expect(page.locator('.product')).toHaveCount(2);
  await page.getByRole('button',{name:'أضف مياه معدنية للسلة'}).click();
  await expect(page.locator('#count')).toHaveText('1');
  await page.getByRole('button',{name:'معاينة رسالة واتساب'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#preview')).toContainText('مياه معدنية — 1 عبوة');
  await expect(page.locator('#preview')).toContainText('هذا مثال فقط وليس طلبًا فعليًا');
  await page.getByRole('button',{name:'تمام'}).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('fresh market switches product groups without retaining mini-market cart',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.goto('/merchant-demo.html');
  await page.getByRole('button',{name:'أضف لبن كامل الدسم للسلة'}).click();
  await expect(page.locator('#count')).toHaveText('1');
  await page.getByRole('button',{name:'فريش ماركت / خضار وفاكهة'}).click();
  await expect(page.locator('#brand-name')).toHaveText('سلة الخير فريش');
  await expect(page.locator('#count')).toHaveText('0');
  await expect(page.locator('.product')).toHaveCount(8);
  await page.getByRole('button',{name:'خضروات'}).click();
  await expect(page.locator('.product')).toHaveCount(4);
  await page.getByRole('button',{name:'أضف طماطم للسلة'}).click();
  await page.getByRole('button',{name:'معاينة رسالة واتساب'}).click();
  await expect(page.locator('#preview')).toContainText('طماطم — 1 كيلو');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  expect(overflow).toBe(false);
});
