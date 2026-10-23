import {expect,test} from '@playwright/test';
import {stableDemoSnapshot} from '../helpers/demo';

test('unpriced catalog keeps numeric chronology and never offers a free purchase',async({page})=>{
 const snapshot=stableDemoSnapshot();
 const base=snapshot.products[0];
 snapshot.settings.phone='+213551415592';
 snapshot.settings.whatsapp_number='+213551415592';
 snapshot.settings.show_featured=false;snapshot.settings.show_offers=false;
 snapshot.products=[10,3,1,2].map(n=>({...base,id:'source-'+n,name_ar:'منشور '+n,display_order:n,options:[],available:false,hidden:false,featured:false}));
 await page.addInitScript(snapshot=>localStorage.setItem('fakahany-demo-snapshot-v1',JSON.stringify(snapshot)),snapshot);
 await page.goto('/');
 await expect(page.locator('.product-title-button h3')).toHaveText(['منشور 1','منشور 2','منشور 3','منشور 10']);
 await expect(page.locator('.product-card a').filter({hasText:'استفسر عن السعر والتوفر'})).toHaveCount(4);
 await expect(page.locator('.floating-cart-circle')).toHaveCount(0);
 await expect(page.locator('.product-card .stock-badge.out')).toHaveCount(0);
 await page.locator('.product-image-button').first().click();
 await expect(page.locator('.product-quick-card')).toContainText('السعر عند الاستفسار');
 await expect(page.locator('.product-quick-card .qty')).toHaveCount(0);
 await expect(page.locator('.product-quick-card a')).toHaveAttribute('href',/wa\.me\/213551415592\?text=/);
});
