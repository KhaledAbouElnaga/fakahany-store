import { expect, test } from '@playwright/test';

test('legacy merchant-demo link forwards visitors to the actual platform showroom store',async({page})=>{
  await page.goto('/merchant-demo.html');
  await expect(page).toHaveURL(/\/\?store=demo-market$/);
  await expect(page.locator('body')).toBeVisible();
});
