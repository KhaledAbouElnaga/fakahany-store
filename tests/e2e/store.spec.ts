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

test('banner copy stays in a compact glass panel on desktop and mobile',async({page})=>{
  await page.setViewportSize({width:1395,height:900});
  await page.goto('/');
  const hero=page.locator('.storefront .hero');
  const panel=hero.locator('.hero-glass');
  const title=panel.locator('h1');
  await expect(title).toBeVisible();
  await expect(panel).toHaveCSS('backdrop-filter',/blur\\(/);

  const desktopHero=await hero.boundingBox();
  const desktopPanel=await panel.boundingBox();
  if(!desktopHero||!desktopPanel)throw new Error('Desktop hero or glass panel is missing');
  expect(desktopPanel.width).toBeLessThan(desktopHero.width*.38);
  expect(desktopPanel.x).toBeGreaterThanOrEqual(desktopHero.x);
  expect(desktopPanel.x+desktopPanel.width).toBeLessThanOrEqual(desktopHero.x+desktopHero.width+1);
  const desktopFont=Number.parseFloat(await title.evaluate(el=>getComputedStyle(el).fontSize));
  expect(desktopFont).toBeLessThanOrEqual(30);

  await page.setViewportSize({width:390,height:844});
  await expect(panel).toBeVisible();
  const mobileHero=await hero.boundingBox();
  const mobilePanel=await panel.boundingBox();
  if(!mobileHero||!mobilePanel)throw new Error('Mobile hero or glass panel is missing');
  expect(mobilePanel.width).toBeLessThanOrEqual(mobileHero.width-22);
  expect(mobilePanel.x).toBeGreaterThanOrEqual(mobileHero.x);
  expect(mobilePanel.x+mobilePanel.width).toBeLessThanOrEqual(mobileHero.x+mobileHero.width+1);
  expect(mobilePanel.y+mobilePanel.height).toBeLessThanOrEqual(mobileHero.y+mobileHero.height+1);
  const mobileFont=Number.parseFloat(await title.evaluate(el=>getComputedStyle(el).fontSize));
  expect(mobileFont).toBeLessThanOrEqual(24);
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
  await expect(page.getByRole('heading',{name:'الرئيسية',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'المنتجات'}).click();
  await expect(page.getByRole('heading',{name:'المنتجات',exact:true})).toBeVisible();
  await expect(page.getByText('إضافة سريعة')).toBeVisible();
  await expect(page.getByRole('button',{name:'نسخ'}).first()).toBeVisible();
  await expect(page.getByText('إدارة المنصة',{exact:true})).toHaveCount(0);
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
  await expect(page.getByRole('heading',{name:'الرئيسية',exact:true})).toBeVisible();
  await page.locator('.admin-side nav').getByRole('button',{name:/^الطلبات/}).click();
  await expect(page.getByRole('heading',{name:'الطلبات',exact:true})).toBeVisible();
  const firstOrder=page.locator('.orders-admin-table tbody tr').first();
  await expect(firstOrder).toBeVisible();
  await firstOrder.locator('select').selectOption({label:'جاري التجهيز'});
  await expect(page.getByText('تم تحديث حالة الطلب.')).toBeVisible();

  await page.goto('/track/'+trackingToken);
  await expect(page.getByRole('heading',{name:'تتبع الطلب'})).toBeVisible();
  await expect(page.getByText('جاري التجهيز',{exact:true})).toBeVisible();
});

test('platform owner console requires explicit login and stays tenant-neutral',async({page})=>{
  await page.goto('/platform');
  await expect(page.getByRole('heading',{name:'إدارة المنصة'})).toBeVisible();
  await expect(page.getByText('هذه الصفحة لمالك النظام فقط وليست مرتبطة باسم أي متجر.')).toBeVisible();
  await expect(page.getByText('الحاج أسامة',{exact:true})).toHaveCount(0);

  await page.getByLabel('البريد الإلكتروني').fill('owner@example.com');
  await page.getByLabel('كلمة المرور').fill('test-password');
  await page.getByRole('button',{name:'دخول'}).click();

  await expect(page.getByRole('heading',{name:'لوحة المنصة'})).toBeVisible();
  await expect(page.getByText('إدارة المتاجر والمستخدمين وإمكانيات كل متجر والدعم الفني. لا توجد اشتراكات أو دفعات تلقائية.')).toBeVisible();
  await expect(page.getByText('هذه المستويات تحدد المميزات وحدود الاستخدام فقط، ولا تمثل أسعارًا أو اشتراكات أو دفعات.')).toBeVisible();
  await expect(page.getByLabel('مستوى إمكانيات المتجر')).toBeVisible();
  await expect(page.getByRole('button',{name:/الاشتراك:/})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'إضافة متجر جديد'})).toBeVisible();
});

test('new merchant signup explains the eight-character strong password policy',async({page})=>{
  await page.goto('/signup');
  await expect(page.getByText('8 أحرف على الأقل، تشمل حرفًا كبيرًا وصغيرًا بالإنجليزية ورقمًا ورمزًا مثل @.')).toBeVisible();
});

test('self-service signup is neutral and ready for merchants',async({page})=>{
  await page.goto('/signup');
  await expect(page.getByRole('heading',{name:'ابدأ متجرك'})).toBeVisible();
  await expect(page.getByText('بدون دفع أو اشتراك تلقائي')).toBeVisible();
  await expect(page.getByLabel('اسم المتجر')).toBeVisible();
});

test('merchant support center loads from admin',async({page})=>{
  await page.goto('/admin');
  await page.getByRole('button',{name:'دخول تجريبي كمدير'}).click();
  await page.locator('.admin-side nav').getByRole('button',{name:'الدعم'}).click();
  await expect(page.getByRole('heading',{name:'الدعم',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'طلب دعم جديد'})).toBeVisible();
});

test('unknown route has a real 404 page',async({page})=>{
  await page.goto('/does-not-exist');
  await expect(page.getByText('404')).toBeVisible();
  await expect(page.getByRole('heading',{name:'الصفحة غير موجودة'})).toBeVisible();
});
