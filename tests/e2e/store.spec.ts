import { expect, test } from '@playwright/test';
import { stableDemoSnapshot } from '../helpers/demo';

test.beforeEach(async({page})=>{
  const snapshot=stableDemoSnapshot();
  await page.addInitScript(({snapshot})=>{
    if(localStorage.getItem('fakahany-e2e-seeded')==='1')return;
    localStorage.setItem('fakahany-demo-snapshot-v1',JSON.stringify(snapshot));
    localStorage.setItem('fakahany-demo-orders-v1','[]');
    localStorage.removeItem('fakahany-cart-v1');
    localStorage.setItem('fakahany-e2e-seeded','1');
  },{snapshot});
});

test('storefront to cart to checkout works',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'الطازج لحد باب بيتك'})).toBeVisible();
  await page.locator('.product-card').first().getByRole('button',{name:/أضف .* للسلة/}).click();
  await page.getByRole('link',{name:/السلة:/}).click();
  await expect(page.getByRole('heading',{name:'سلة التسوق'})).toBeVisible();
  await page.getByRole('button',{name:'إتمام الطلب'}).click();
  await page.getByLabel(/الاسم/).fill('اختبار تلقائي');
  await page.getByLabel(/رقم الهاتف/).fill('01012345678');
  await page.getByLabel(/العنوان/).fill('عنوان اختبار');
  await page.getByRole('button',{name:'تسجيل الطلب وفتح واتساب'}).click();
  await expect(page.getByText(/تم استلام طلبك|تم تسجيل طلبك/)).toBeVisible();
});

test('admin demo login and product tools load',async({page})=>{
  await page.goto('/admin');
  await page.getByRole('button',{name:'دخول تجريبي كمدير'}).click();
  await expect(page.getByRole('heading',{name:'الرئيسية'})).toBeVisible();
  await page.getByRole('button',{name:'المنتجات'}).click();
  await expect(page.getByRole('heading',{name:'المنتجات',exact:true})).toBeVisible();
  await expect(page.getByText('إضافة سريعة')).toBeVisible();
  await expect(page.getByRole('button',{name:'نسخ'}).first()).toBeVisible();
});

test('full order lifecycle reaches admin status and public tracking',async({page})=>{
  await page.goto('/');
  await page.locator('.product-card').first().getByRole('button',{name:/أضف .* للسلة/}).click();
  await page.getByRole('link',{name:/السلة:/}).click();
  await page.getByRole('button',{name:'إتمام الطلب'}).click();
  await page.getByLabel(/الاسم/).fill('عميل دورة كاملة');
  await page.getByLabel(/رقم الهاتف/).fill('01012345678');
  await page.getByLabel(/العنوان/).fill('عنوان اختبار دورة كاملة');
  await page.getByRole('button',{name:'تسجيل الطلب وفتح واتساب'}).click();
  await expect(page.getByRole('heading',{name:'تم تسجيل طلبك بنجاح'})).toBeVisible();

  const trackingToken=await page.evaluate(()=>{
    const orders=JSON.parse(localStorage.getItem('fakahany-demo-orders-v1')||'[]');
    if(!orders.length)throw new Error('Expected a demo order after checkout');
    const token='e2e-public-tracking';
    orders[0].tracking_token=token;
    localStorage.setItem('fakahany-demo-orders-v1',JSON.stringify(orders));
    return token;
  });

  await page.goto('/admin');
  await page.getByRole('button',{name:'دخول تجريبي كمدير'}).click();
  await expect(page.getByRole('heading',{name:'الرئيسية'})).toBeVisible();
  await page.locator('.admin-side nav').getByRole('button',{name:'الطلبات',exact:true}).click();
  await expect(page.getByRole('heading',{name:'الطلبات',exact:true})).toBeVisible();
  const firstOrder=page.locator('.orders-admin-table tbody tr').first();
  await expect(firstOrder).toBeVisible();
  await firstOrder.locator('select').selectOption({label:'جاري التجهيز'});
  await expect(page.getByText('تم تحديث حالة الطلب.')).toBeVisible();

  await page.goto('/track/'+trackingToken);
  await expect(page.getByRole('heading',{name:'تتبع الطلب'})).toBeVisible();
  await expect(page.getByText('جاري التجهيز',{exact:true})).toBeVisible();
});

test('unknown route has a real 404 page',async({page})=>{
  await page.goto('/does-not-exist');
  await expect(page.getByText('404')).toBeVisible();
  await expect(page.getByRole('heading',{name:'الصفحة غير موجودة'})).toBeVisible();
});
