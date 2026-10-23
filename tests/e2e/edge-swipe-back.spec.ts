import {expect,test} from '@playwright/test';
import {stableDemoSnapshot} from '../helpers/demo';

test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
test.beforeEach(async({page})=>{
 const snapshot=stableDemoSnapshot();
 snapshot.products[0].image_urls=['/icon-192.png','/icon-512.png'];
 snapshot.products[0].image_url='/icon-192.png';
 await page.addInitScript(s=>localStorage.setItem('fakahany-demo-snapshot-v1',JSON.stringify(s)),snapshot);
});

async function swipe(page:any,side:'left'|'right',dy=0,selector='body',cancelable=true){
 await page.locator(selector).first().evaluate((element:any,{side,dy,cancelable}:any)=>{
  const x=side==='left'?4:innerWidth-4,sign=side==='left'?1:-1;
  const touch=(dx:number,y:number)=>new Touch({identifier:1,target:element,clientX:x+dx*sign,clientY:200+y});
  element.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(0,0)],changedTouches:[touch(0,0)]}));
  element.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable,touches:[touch(110,dy)],changedTouches:[touch(110,dy)]}));
  element.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[touch(110,dy)]}));
 },{side,dy,cancelable});
}

for(const side of ['left','right'] as const){
 test(`direct store page returns home from the ${side} edge`,async({page})=>{
  await page.goto('/s/ibrahim-homeware/cart');
  await expect(page.getByRole('heading',{name:'سلة التسوق'})).toBeVisible();
  await swipe(page,side);
  await expect(page).toHaveURL(/\/s\/ibrahim-homeware$/);
 });
}
test('returns exactly one page in app history and keeps legacy store context',async({page})=>{
 await page.goto('/?store=demo-market');
 await page.locator('.floating-cart-circle').click();
 await expect(page).toHaveURL(/\/cart\?store=demo-market$/);
 await swipe(page,'left');
 await expect(page).toHaveURL(/\/\?store=demo-market$/);
});
test('vertical scrolling and browser-owned gestures do not navigate',async({page})=>{
 await page.goto('/s/demo-market/cart');
 await expect(page.getByRole('heading',{name:'سلة التسوق'})).toBeVisible();
 await swipe(page,'left',180);
 await expect(page).toHaveURL(/\/s\/demo-market\/cart$/);
 await swipe(page,'left',0,'body',false);
 await expect(page).toHaveURL(/\/s\/demo-market\/cart$/);
});
test('gallery swipes keep browsing photos; an edge swipe outside it closes details',async({page})=>{
 await page.goto('/s/demo-market');
 await page.locator('.product-image-button').first().click();
 await expect(page.locator('.product-quick-card')).toBeVisible();
 await swipe(page,'right',0,'.quick-view-image');
 await expect(page.locator('.product-quick-card')).toBeVisible();
 await expect(page.locator('.gallery-navigation span')).toHaveText('2 / 2');
 await swipe(page,'left',0,'.modal-backdrop');
 await expect(page.locator('.product-quick-card')).toHaveCount(0);
 await expect(page).toHaveURL(/\/s\/demo-market$/);
});
