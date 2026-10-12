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

test('storefront banner shows artwork without text overlay on desktop and mobile',async({page})=>{
  await page.setViewportSize({width:1395,height:900});
  await page.goto('/');
  const banner=page.locator('.storefront .hero');
  const copy=page.locator('.storefront .hero-copy');
  await expect(banner).toBeVisible();
  await expect(copy.locator('h1')).toBeVisible();
  await expect(banner.locator('h1,p,.hero-glass')).toHaveCount(0);

  for(const width of [1395,390]){
    await page.setViewportSize({width,height:900});
    const imageBox=await banner.boundingBox();
    const copyBox=await copy.boundingBox();
    if(!imageBox||!copyBox)throw new Error('Banner or separate copy section is missing');
    expect(copyBox.y).toBeGreaterThanOrEqual(imageBox.y+imageBox.height+8);
    expect(copyBox.x).toBeGreaterThanOrEqual(imageBox.x-1);
    expect(copyBox.x+copyBox.width).toBeLessThanOrEqual(imageBox.x+imageBox.width+1);
    const pageOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
    expect(pageOverflow).toBe(false);
  }
});

test('font controls update the separate title card and persist after save',async({page})=>{
  await page.goto('/admin');
  await page.getByRole('button',{name:'دخول تجريبي كمدير'}).click();
  await page.locator('.admin-side nav').getByRole('button',{name:'إعدادات المتجر'}).click();
  const headingSlider=page.getByRole('slider',{name:'حجم العنوان أسفل الغلاف'});
  const descriptionSlider=page.getByRole('slider',{name:'حجم الوصف أسفل الغلاف'});
  await expect(headingSlider).toBeVisible();
  await expect(descriptionSlider).toBeVisible();
  await expect(page.getByRole('slider',{name:'شفافية خلفية النص الزجاجية'})).toHaveCount(0);
  const preview=page.locator('.hero-appearance-preview');
  await expect(preview.locator('.hero-appearance-banner')).toBeVisible();
  await expect(preview.locator('.hero-copy h1')).toBeVisible();
  await expect(preview.locator('.hero-appearance-banner .hero-copy')).toHaveCount(0);

  const oldHeading=Number(await headingSlider.inputValue());
  await headingSlider.focus();
  await headingSlider.press('ArrowLeft'); // In RTL, ArrowLeft increases the range.
  await expect(headingSlider).toHaveValue(String(oldHeading+1));
  await expect(preview.locator('.hero-copy h1')).toHaveCSS('font-size',`${oldHeading+1}px`);

  await page.getByRole('button',{name:'حفظ كل الإعدادات'}).click();
  await expect(page.getByText('تم حفظ التعديلات بنجاح')).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.storefront .hero-copy h1')).toHaveCSS('font-size',`${oldHeading+1}px`);
});

test('merchant design studio saves glass, font and alignment independently per store',async({page})=>{
  await page.goto('/admin');
  await page.getByRole('button',{name:'دخول تجريبي كمدير'}).click();
  await page.locator('.admin-side nav').getByRole('button',{name:'إعدادات المتجر'}).click();

  const preview=page.locator('.hero-appearance-preview .hero-copy');
  await page.getByRole('button',{name:'زجاج مائي'}).click();
  await expect(preview).toHaveAttribute('data-appearance','glass');
  await expect(preview).toHaveCSS('backdrop-filter',/blur\(14px\)/);
  await expect(page.getByRole('slider',{name:'درجة شفافية خلفية العنوان'})).toBeVisible();
  await expect(page.getByRole('slider',{name:'ضبابية الزجاج المائي'})).toBeVisible();

  await page.getByRole('combobox',{name:'نوع خط العنوان'}).selectOption('tajawal');
  await page.getByRole('combobox',{name:'محاذاة العنوان'}).selectOption('right');
  await expect(preview).toHaveCSS('text-align','right');
  await expect(preview).toHaveCSS('font-family',/Tajawal/);

  await page.getByRole('button',{name:'حفظ كل الإعدادات'}).click();
  await expect(page.getByText('تم حفظ التعديلات بنجاح')).toBeVisible();
  await page.goto('/');
  const card=page.locator('.storefront .hero-copy');
  await expect(card).toHaveAttribute('data-appearance','glass');
  await expect(card).toHaveCSS('text-align','right');
  await expect(card).toHaveCSS('font-family',/Tajawal/);
  await expect(card).toHaveCSS('backdrop-filter',/blur\(14px\)/);
  await expect(page.locator('.storefront .hero h1')).toHaveCount(0);

  await page.goto('/admin');
  await page.locator('.admin-side nav').getByRole('button',{name:'إعدادات المتجر'}).click();
  await page.getByRole('button',{name:'داكن فاخر'}).click();
  await expect(preview).toHaveCSS('background-color','rgb(22, 53, 35)');
  await expect(preview.locator('h1')).toHaveCSS('color','rgb(255, 255, 255)');
  await page.getByRole('button',{name:'بدون خلفية'}).click();
  await expect(preview).toHaveAttribute('data-appearance','none');
  await expect(preview).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(page.getByRole('slider',{name:'درجة شفافية خلفية العنوان'})).toHaveCount(0);
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
