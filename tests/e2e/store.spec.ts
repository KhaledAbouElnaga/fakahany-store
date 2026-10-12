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

test('storefront banner never places copy on the image',async({page})=>{
  await page.setViewportSize({width:1395,height:900});
  await page.goto('/');
  const banner=page.locator('.storefront .store-banner');
  const copy=page.locator('.storefront .hero-copy');
  await expect(banner).toBeVisible();
  await expect(copy.locator('h1')).toBeVisible();
  await expect(banner.locator('h1,p,.hero-glass')).toHaveCount(0);
  await expect(banner).toHaveAttribute('data-fit','full');

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

test('banner full-image preview uses the same renderer and dimensions on storefront',async({page})=>{
  const imageSvg='<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="300"><rect width="1500" height="300" fill="blue"/><rect y="260" width="1500" height="40" fill="red"/></svg>';
  const bannerUrl='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(imageSvg);
  await page.goto('/');
  await page.evaluate(src=>{
    const snapshot=JSON.parse(localStorage.getItem('fakahany-demo-snapshot-v1')||'null');
    if(!snapshot)throw Error('Missing demo snapshot');
    snapshot.settings.banner_url=src;
    snapshot.settings.banner_display={fit:'full',ratio:'5/1',position_x:50,position_y:50};
    localStorage.setItem('fakahany-demo-snapshot-v1',JSON.stringify(snapshot));
  },bannerUrl);
  await page.reload();
  const image=page.locator('.storefront .store-banner img');
  await expect(image).toBeVisible();
  const dimensions=await image.evaluate(el=>({width:el.naturalWidth,height:el.naturalHeight,fit:getComputedStyle(el).objectFit}));
  expect(dimensions).toEqual({width:1500,height:300,fit:'contain'});
  let live=await image.boundingBox();
  if(!live)throw Error('Missing storefront banner image');
  expect(live.width/live.height).toBeCloseTo(5,1);

  await page.goto('/admin');
  await page.getByRole('button',{name:'دخول تجريبي كمدير'}).click();
  await page.locator('.admin-side nav').getByRole('button',{name:'إعدادات المتجر'}).click();
  const preview=page.locator('.banner-layout-preview .store-banner');
  await expect(preview).toHaveAttribute('data-fit','full');
  const previewImg=preview.locator('img');
  await expect(previewImg).toBeVisible();
  const previewBox=await previewImg.boundingBox();
  if(!previewBox)throw Error('Missing preview image');
  expect(previewBox.width/previewBox.height).toBeCloseTo(live.width/live.height,2);
  await expect(page.getByText('الوضع الحالي يحافظ على كل أجزاء الصورة دون قص.')).toBeVisible();
  await page.getByRole('button',{name:'موبايل'}).click();
  await expect(page.locator('.banner-layout-preview.preview-mobile')).toBeVisible();
  const mobilePreviewBox=await previewImg.boundingBox();
  if(!mobilePreviewBox)throw Error('Missing mobile preview image');
  expect(mobilePreviewBox.width/mobilePreviewBox.height).toBeCloseTo(5,1);
});

test('merchant can choose contain or cropped cover with a saved focal point',async({page})=>{
  await page.goto('/admin');
  await page.getByRole('button',{name:'دخول تجريبي كمدير'}).click();
  await page.locator('.admin-side nav').getByRole('button',{name:'إعدادات المتجر'}).click();
  const mode=page.getByRole('combobox',{name:'طريقة عرض صورة الغلاف'});
  const preview=page.locator('.banner-layout-preview .store-banner');
  await mode.selectOption('contain');
  await page.getByRole('combobox',{name:'نسبة أبعاد إطار الغلاف'}).selectOption('16/9');
  await expect(preview).toHaveAttribute('data-fit','contain');
  await expect(preview).toHaveCSS('aspect-ratio','16 / 9');

  await mode.selectOption('cover');
  await page.getByRole('slider',{name:'موضع الغلاف رأسيًا'}).fill('85');
  await page.getByRole('slider',{name:'موضع الغلاف أفقيًا'}).fill('30');
  await expect(preview).toHaveAttribute('data-fit','cover');
  await page.getByRole('button',{name:'حفظ كل الإعدادات'}).click();
  await expect(page.getByText('تم حفظ التعديلات بنجاح')).toBeVisible();
  await page.goto('/');
  const storefront=page.locator('.storefront .store-banner');
  await expect(storefront).toHaveAttribute('data-fit','cover');
  await expect(storefront).toHaveCSS('aspect-ratio','16 / 9');
  await expect(storefront).toHaveCSS('--store-banner-y','85%');
  await expect(storefront).toHaveCSS('--store-banner-x','30%');

  await page.goto('/admin');
  await page.locator('.admin-side nav').getByRole('button',{name:'إعدادات المتجر'}).click();
  await expect(mode).toHaveValue('cover');
  await expect(page.getByRole('slider',{name:'موضع الغلاف رأسيًا'})).toHaveValue('85');
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
  await expect(preview.locator('.store-banner')).toBeVisible();
  await expect(preview.locator('.hero-copy h1')).toBeVisible();
  await expect(preview.locator('.store-banner .hero-copy')).toHaveCount(0);

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
