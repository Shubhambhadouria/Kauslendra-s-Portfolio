import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { exportHighlighted, validateHighlights } from '../document-highlights.js';

test('officer previews a PDF, saves a highlight, and sees it after reopening',async({page})=>{
  test.setTimeout(60000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage([400,500]).drawText('Important fire safety instructions',{x:25,y:450,size:16,font});pdf.addPage([400,500]).drawText('Second page',{x:25,y:450,size:16,font});const bytes=Buffer.from(await pdf.save());
  const document={id:'22222222-2222-2222-2222-222222222222',name:'Safety.pdf',extension:'pdf',size:bytes.length,uploadedAt:new Date().toISOString()};let highlights=[],revision=0;
  await page.route('**/api/vault/session',route=>route.fulfill({json:{configured:true,user:{role:'admin'},csrfToken:'preview-test'}}));
  await page.route('**/api/vault/documents',route=>route.fulfill({json:{documents:[document]}}));
  await page.route('**/api/vault/documents/'+document.id,route=>route.fulfill({body:bytes,contentType:'application/octet-stream'}));
  await page.route('**/api/vault/documents/'+document.id+'/annotations',route=>{if(route.request().method()==='PUT'){const data=route.request().postDataJSON();highlights=data.highlights;revision++;return route.fulfill({json:{revision,message:'Highlights saved to Fire Vault.'}});}return route.fulfill({json:{highlights,revision}});});
  await page.goto('/');await page.getByRole('button',{name:'START EXPLORING'}).click();await expect(page.locator('.loader')).toHaveClass(/departed/);await page.getByRole('button',{name:'Fire Vault'}).click();await page.getByRole('button',{name:'Preview Safety.pdf'}).click();
  await expect(page.locator('#page-number')).toHaveText('Page 1 of 2',{timeout:15000});await expect(page.locator('.preview-stage canvas')).toBeVisible();
  await page.getByRole('button',{name:'Highlight mode',exact:true}).click();await expect(page.locator('.preview-stage')).not.toHaveClass(/can-highlight/);await page.getByRole('button',{name:'Highlight mode',exact:true}).click();await expect(page.locator('.preview-stage')).toHaveClass(/can-highlight/);
  const bounds=await page.locator('.preview-stage').boundingBox();await page.mouse.move(bounds.x+bounds.width*.1,bounds.y+bounds.height*.1);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.75,bounds.y+bounds.height*.15,{steps:5});await page.mouse.up();
  await expect(page.locator('.saved-highlight')).toHaveCount(1);await expect(page.getByRole('button',{name:'Save highlights',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Save highlights',exact:true}).click();await expect(page.getByRole('status')).toContainText('saved');expect(highlights).toHaveLength(1);
  await page.getByRole('button',{name:'Next page',exact:true}).click();await expect(page.locator('#page-number')).toHaveText('Page 2 of 2');await expect(page.locator('.saved-highlight')).toHaveCount(0);
  await page.getByRole('button',{name:'Back to vault'}).click();expect(errors).toEqual([]);await page.getByRole('button',{name:'Preview Safety.pdf'}).click();await expect(page.locator('.saved-highlight')).toHaveCount(1);
  await page.getByRole('button',{name:'Clear highlights',exact:true}).click();page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Back to vault'}).click();await expect(page.getByRole('button',{name:'Save highlights',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByRole('button',{name:'Save highlights',exact:true}).click();await page.keyboard.press('Escape');expect(errors).toEqual([]);
});

test('viewer can preview saved text highlights but cannot edit them',async({page})=>{
  const id='33333333-3333-3333-3333-333333333333';
  await page.route('**/api/vault/session',route=>route.fulfill({json:{configured:true,user:{role:'viewer'},csrfToken:'test'}}));
  await page.route('**/api/vault/documents',route=>route.fulfill({json:{documents:[{id,name:'Instructions.txt',extension:'txt',size:25,uploadedAt:new Date().toISOString()}]}}));
  await page.route('**/api/vault/documents/'+id,route=>route.fulfill({body:'Keep emergency exits clear.'}));
  await page.route('**/api/vault/documents/'+id+'/annotations',route=>route.fulfill({json:{revision:1,highlights:[{kind:'text',start:5,end:20,color:'yellow'}]}}));
  await page.goto('/');await page.getByRole('button',{name:'START EXPLORING'}).click();await expect(page.locator('.loader')).toHaveClass(/departed/);await page.getByRole('button',{name:'Fire Vault'}).click();await page.getByRole('button',{name:'Preview Instructions.txt'}).click();
  await expect(page.locator('.preview-text mark')).toHaveText('emergency exits');await expect(page.getByRole('button',{name:'Save highlights'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Download highlighted copy'})).toBeVisible();
});

test('highlight validation and exports retain text safely',async()=>{
  expect(validateHighlights([{kind:'region',page:1,x:0,y:0,width:Infinity,height:.1,color:'yellow'}],'pdf')).toBeNull();
  expect(validateHighlights([{kind:'text',start:0,end:2,color:'__proto__'}],'txt')).toBeNull();
  const output=await exportHighlighted(Buffer.from('Important <script>alert(1)</script>'),{name:'notes.txt',extension:'txt',highlights:[{kind:'text',start:0,end:9,color:'yellow'}]});
  expect(output.extension).toBe('html');expect(output.bytes.toString()).toContain('<mark');expect(output.bytes.toString()).not.toContain('<script>');
});

test('officer can select text, save it, and download the highlighted document',async({page})=>{
  const id='44444444-4444-4444-4444-444444444444',text='Important evacuation instructions.';let highlights=[];
  await page.route('**/api/vault/session',route=>route.fulfill({json:{configured:true,user:{role:'admin'},csrfToken:'test'}}));
  await page.route('**/api/vault/documents',route=>route.fulfill({json:{documents:[{id,name:'Evacuation.txt',extension:'txt',size:text.length,uploadedAt:new Date().toISOString()}]}}));
  await page.route('**/api/vault/documents/'+id,route=>route.fulfill({body:text}));
  await page.route('**/api/vault/documents/'+id+'/annotations',route=>{if(route.request().method()==='PUT'){highlights=route.request().postDataJSON().highlights;return route.fulfill({json:{revision:1,message:'Highlights saved to Fire Vault.'}});}return route.fulfill({json:{revision:0,highlights}});});
  await page.route('**/api/vault/documents/'+id+'/annotated',async route=>{const result=await exportHighlighted(Buffer.from(text),{name:'Evacuation.txt',extension:'txt',highlights});await route.fulfill({body:result.bytes});});
  await page.goto('/');await page.getByRole('button',{name:'START EXPLORING'}).click();await expect(page.locator('.loader')).toHaveClass(/departed/);await page.getByRole('button',{name:'Fire Vault'}).click();await page.getByRole('button',{name:'Preview Evacuation.txt'}).click();await expect(page.locator('#preview-text')).toHaveText(text);
  await page.locator('#preview-text').evaluate(element=>{const range=document.createRange();range.setStart(element.firstChild,0);range.setEnd(element.firstChild,9);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
  await page.getByRole('button',{name:'Highlight selection',exact:true}).click();await expect(page.locator('.preview-text mark')).toHaveText('Important');await page.getByRole('button',{name:'Save highlights',exact:true}).click();await expect(page.getByRole('status')).toContainText('Highlights saved');expect(highlights).toEqual([{kind:'text',start:0,end:9,color:'yellow'}]);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download highlighted copy',exact:true}).click();expect((await download).suggestedFilename()).toBe('Evacuation-highlighted.html');
});

test('siren casts alternating screen light and stops when switched off',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'START EXPLORING'}).click();await expect(page.locator('.loader')).toHaveClass(/departed/);await page.getByRole('button',{name:'Toggle emergency lights'}).click();await expect(page.locator('.siren-glow')).toHaveClass(/is-on/);
  const first=await page.locator('.siren-red').evaluate(element=>({opacity:element.style.opacity,x:element.style.getPropertyValue('--light-x')}));expect(first.x).toContain('%');
  await expect.poll(()=>page.locator('.siren-red').evaluate((element,initial)=>Math.abs(Number(element.style.opacity)-Number(initial)),first.opacity)).toBeGreaterThan(.1);
  await page.getByRole('button',{name:'Toggle emergency lights'}).click();await expect(page.locator('.siren-glow')).not.toHaveClass(/is-on/);await expect.poll(()=>page.locator('.siren-red').evaluate(element=>Number(element.style.opacity))).toBe(0);
});
