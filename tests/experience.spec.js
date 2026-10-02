import { test, expect } from '@playwright/test';
test('starts the 3D experience and opens accessible portfolio dialogs',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await expect(page.getByRole('button',{name:'START EXPLORING'})).toBeEnabled();
  await expect(page.locator('.loader')).not.toHaveClass(/departed/);
  await page.getByRole('button',{name:'START EXPLORING'}).click();
  await expect(page.locator('.loader')).toHaveClass(/departed/);await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button',{name:'The officer',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('heading',{name:'Kaushlendra Singh Chauhan'})).toBeVisible();await expect(page.getByRole('dialog')).toContainText('SBI');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button',{name:'Toggle emergency lights'}).click();await expect(page.getByRole('button',{name:'Toggle emergency lights'})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'Get in touch'}).click();await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth',await page.evaluate(()=>innerWidth));expect(errors).toEqual([]);
});
test('backend returns profile and rejects malformed contact messages',async({request})=>{
  expect((await request.get('/api/health')).status()).toBe(200);
  const profile=await request.get('/api/profile');expect(profile.status()).toBe(200);expect((await profile.json()).role).toBe('Fire Officer');
  const invalid=await request.post('/api/contact',{data:{name:'Test',email:'invalid',message:'short'}});expect(invalid.status()).toBe(400);
  expect((await request.get('/api/missing')).status()).toBe(404);
});
