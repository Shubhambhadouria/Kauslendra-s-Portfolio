import {test,expect} from '@playwright/test';

async function openLibrary(page,role,{failed=false}={}) {
  let settings={enabled:false,folderUrl:'https://drive.google.com/drive/folders/private_folder_1234',available:true},storageCalls=0;
  await page.route('**/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><title>Vault settings test</title></head><body><section id="library"></section></body></html>'}));
  await page.route('**/api/vault/session',route=>route.fulfill({json:{configured:true,user:{role},csrfToken:'test-csrf'}}));
  await page.route('**/api/vault/documents',route=>failed&&!settings.enabled?route.fulfill({status:503,json:{error:'Drive is unavailable.'}}):route.fulfill({json:{documents:[],storage:settings.enabled?'google-drive':'local',readOnly:settings.enabled,managementUrl:settings.folderUrl}}));
  await page.route('**/api/vault/storage',route=>{
    storageCalls++;
    if(route.request().method()==='PUT') {
      expect(route.request().headers()['x-vault-csrf']).toBe('test-csrf');
      settings={...settings,...route.request().postDataJSON()};return route.fulfill({json:{...settings,message:'Private folder settings saved.'}});
    }
    return route.fulfill({json:settings});
  });
  await page.goto('/');
  await page.evaluate(async()=>{const {renderVault}=await import('/src/vault.js');await renderVault(document.querySelector('#library'));});
  return {calls:()=>storageCalls,settings:()=>settings};
}

test('officer can change Drive settings even when the document library is unavailable',async({page})=>{
  const state=await openLibrary(page,'admin',{failed:true});
  await page.getByText('Google Drive settings',{exact:true}).click();
  const field=page.getByLabel('Google Drive folder link');await expect(field).toHaveValue(/private_folder_1234/);
  await field.fill('https://drive.google.com/drive/folders/new_private_folder_5678');
  await page.getByLabel('Use Google Drive documents').check();
  await page.getByRole('button',{name:'Save Drive settings'}).click();
  await expect(page.locator('#vault-status')).toContainText('saved');
  expect(state.settings().folderUrl).toContain('new_private_folder_5678');
  await expect(page.getByRole('button',{name:'Upload document'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Manage documents in Drive'})).toBeVisible();
});

test('viewer has no Drive configuration controls or configuration requests',async({page})=>{
  const state=await openLibrary(page,'viewer');
  await expect(page.getByText('Google Drive settings',{exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Google Drive folder link')).toHaveCount(0);
  expect(state.calls()).toBe(0);
});
