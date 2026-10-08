import { expect, test } from '@playwright/test';

test('merchant demo is isolated from production and previews a WhatsApp order',async({page})=>{
  const externalRequests:string[]=[];
  page.on('request',request=>{
    if(request.url().startsWith('http')&&!request.url().startsWith('http://127.0.0.1:4173'))externalRequests.push(request.url());
  });
  await page.goto('/merchant-demo.html');
  await expect(page).toHaveTitle(/تجربة متجر واتساب/);
  await expect(page.getByText(/بيانات وأسعار افتراضية للتوضيح/)).toBeVisible();
  await expect(page.locator('.product')).toHaveCount(6);
  await expect(page.getByRole('button',{name:'معاينة رسالة واتساب'})).toBeDisabled();

  await page.getByRole('button',{name:'فواكه'}).click();
  await expect(page.locator('.product')).toHaveCount(3);
  await page.getByRole('button',{name:'أضف تفاح أحمر للسلة'}).click();
  await expect(page.locator('#count')).toHaveText('1');
  await page.getByRole('button',{name:'زيادة تفاح أحمر'}).click();
  await expect(page.locator('#count')).toHaveText('2');
  await page.getByRole('button',{name:'تقليل تفاح أحمر'}).click();
  await expect(page.locator('#count')).toHaveText('1');

  await page.getByRole('button',{name:'معاينة رسالة واتساب'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#preview')).toContainText('تفاح أحمر — 1 كيلو');
  await expect(page.locator('#preview')).toContainText('هذا مثال فقط وليس طلبًا فعليًا');
  await page.getByRole('button',{name:'تمام'}).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(externalRequests).toEqual([]);
});

test('demo can be used on mobile',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.goto('/merchant-demo.html');
  await expect(page.getByRole('heading',{name:/فاكهة وخضار من موبايلك/})).toBeVisible();
  await page.getByRole('button',{name:'أضف طماطم للسلة'}).click();
  await page.getByRole('button',{name:'معاينة رسالة واتساب'}).click();
  await expect(page.locator('#preview')).toContainText('طماطم — 1 كيلو');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  expect(overflow).toBe(false);
});