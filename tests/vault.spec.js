import { test, expect, request as apiRequest } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../vault.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';

test('vault enforces passwords, officer permissions, private downloads and revocation',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'fire-vault-test-'));
  const vault=await createVault(directory);await vault.createUser('officer','Officer-test-password-123','admin');await vault.createUser('vault','Shared-test-password-123','viewer');
  const server=http.createServer(async(req,res)=>{if(!await vault.handle(req,res,new URL(req.url,'http://localhost')))res.end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseURL=`http://127.0.0.1:${server.address().port}`;
  const admin=await apiRequest.newContext({baseURL}),viewer=await apiRequest.newContext({baseURL}),outsider=await apiRequest.newContext({baseURL});
  try{
    expect((await outsider.get('/api/vault/documents')).status()).toBe(401);
    expect((await outsider.post('/api/vault/login',{data:{password:'bad'},headers:{'X-Vault-Request':'1'}})).status()).toBe(401);
    expect((await outsider.post('/api/vault/login',{data:{password:'bad'},headers:{'X-Vault-Request':'1',Origin:'https://evil.example'}})).status()).toBe(403);
    const login=await admin.post('/api/vault/login',{data:{mode:'officer',password:'Officer-test-password-123'},headers:{'X-Vault-Request':'1'}});expect(login.status()).toBe(200);
    expect(login.headers()['set-cookie']).toContain('HttpOnly');expect(login.headers()['set-cookie']).toContain('SameSite=Strict');
    const csrf=(await login.json()).csrfToken,headers={'X-Vault-CSRF':csrf,'X-File-Name':'fire-plan.pdf','Content-Type':'application/octet-stream'};
    expect((await admin.post('/api/vault/documents',{data:Buffer.from('%PDF-1.4\nTest document'),headers:{'X-File-Name':'fire-plan.pdf'}})).status()).toBe(403);
    expect((await admin.post('/api/vault/documents',{data:Buffer.from('not a PDF'),headers})).status()).toBe(415);
    expect((await admin.post('/api/vault/documents',{data:Buffer.from('script'),headers:{...headers,'X-File-Name':'attack.html'}})).status()).toBe(415);
    const sample=await PDFDocument.create();const font=await sample.embedFont(StandardFonts.Helvetica);sample.addPage([400,500]).drawText('Keep emergency exits clear.',{x:30,y:450,size:14,font});const bytes=Buffer.from(await sample.save());const upload=await admin.post('/api/vault/documents',{data:bytes,headers});expect(upload.status()).toBe(201);const document=(await upload.json()).document;
    expect((await outsider.get('/api/vault/documents/'+document.id)).status()).toBe(401);
    const viewerLogin=await viewer.post('/api/vault/login',{data:{mode:'viewer',password:'Shared-test-password-123'},headers:{'X-Vault-Request':'1'}});expect(viewerLogin.status()).toBe(200);const viewerCsrf=(await viewerLogin.json()).csrfToken;
    const listing=await viewer.get('/api/vault/documents');expect((await listing.json()).documents[0].name).toBe('fire-plan.pdf');
    const download=await viewer.get('/api/vault/documents/'+document.id);expect(download.status()).toBe(200);expect(await download.body()).toEqual(bytes);expect(download.headers()['content-disposition']).toContain('attachment');
    const annotationURL='/api/vault/documents/'+document.id+'/annotations';const highlight={kind:'region',page:1,x:.05,y:.06,width:.75,height:.07,color:'yellow'};
    expect((await outsider.get(annotationURL)).status()).toBe(401);
    expect((await viewer.put(annotationURL,{data:{revision:0,highlights:[highlight]},headers:{'X-Vault-CSRF':viewerCsrf}})).status()).toBe(403);
    expect((await admin.put(annotationURL,{data:{revision:0,highlights:[{...highlight,width:2}]},headers:{'X-Vault-CSRF':csrf}})).status()).toBe(400);
    expect((await admin.put(annotationURL,{data:{revision:0,highlights:[{...highlight,page:2}]},headers:{'X-Vault-CSRF':csrf}})).status()).toBe(400);
    const save=await admin.put(annotationURL,{data:{revision:0,highlights:[highlight]},headers:{'X-Vault-CSRF':csrf}});expect(save.status()).toBe(200);expect((await save.json()).revision).toBe(1);
    expect((await viewer.get(annotationURL)).status()).toBe(200);expect((await (await viewer.get(annotationURL)).json()).highlights).toEqual([highlight]);
    expect((await admin.put(annotationURL,{data:{revision:0,highlights:[]},headers:{'X-Vault-CSRF':csrf}})).status()).toBe(409);
    const highlighted=await viewer.get('/api/vault/documents/'+document.id+'/annotated');expect(highlighted.status()).toBe(200);const exported=await highlighted.body();expect(exported.equals(bytes)).toBe(false);expect((await PDFDocument.load(exported)).getPageCount()).toBe(1);
    expect(await (await viewer.get('/api/vault/documents/'+document.id)).body()).toEqual(bytes);
    expect((await viewer.post('/api/vault/documents',{data:bytes,headers:{...headers,'X-Vault-CSRF':viewerCsrf}})).status()).toBe(403);
    expect((await viewer.delete('/api/vault/documents/'+document.id,{headers:{'X-Vault-CSRF':viewerCsrf}})).status()).toBe(403);
    expect((await admin.post('/api/vault/access',{data:{password:'Updated-shared-password-456'},headers:{'X-Vault-CSRF':csrf}})).status()).toBe(200);
    expect((await viewer.get('/api/vault/documents/'+document.id)).status()).toBe(401);
    expect((await viewer.get(annotationURL)).status()).toBe(401);
    expect((await viewer.post('/api/vault/login',{data:{password:'Shared-test-password-123'},headers:{'X-Vault-Request':'1'}})).status()).toBe(401);
    expect((await viewer.post('/api/vault/login',{data:{password:'Updated-shared-password-456'},headers:{'X-Vault-Request':'1'}})).status()).toBe(200);
    const stored=await readFile(path.join(directory,'index.json'),'utf8');expect(stored).not.toContain('Officer-test-password');expect(stored).not.toContain('Updated-shared-password');
    expect((await admin.delete('/api/vault/documents/'+document.id,{headers:{'X-Vault-CSRF':csrf}})).status()).toBe(200);
    expect((await viewer.get('/api/vault/documents/'+document.id)).status()).toBe(404);
    expect((await admin.post('/api/vault/logout',{headers:{'X-Vault-CSRF':csrf}})).status()).toBe(200);expect((await admin.get('/api/vault/documents')).status()).toBe(401);
  }finally{
    await Promise.all([admin.dispose(),viewer.dispose(),outsider.dispose()]);await new Promise(resolve=>server.close(resolve));
    if(path.dirname(directory)===path.resolve(os.tmpdir())&&path.basename(directory).startsWith('fire-vault-test-'))await rm(directory,{recursive:true,force:true});
  }
});

test('private storage cannot be fetched through the web server',async({request})=>{
  for(const target of ['/.vault/index.json','/data/messages.ndjson','/@fs/E:/Portfolio/.vault/index.json','/.vault/index.json?raw'])expect((await request.get(target)).status()).toBe(404);
});

test('Fire Vault opens and displays the password gate on desktop and mobile',async({page})=>{
  await page.route('**/api/vault/session',route=>route.fulfill({json:{configured:true,user:null,csrfToken:null}}));
  await page.route('**/api/vault/login',route=>route.fulfill({status:401,json:{error:'The vault password is incorrect.'}}));
  await page.goto('/');await page.getByRole('button',{name:'START EXPLORING'}).click();await expect(page.locator('.loader')).toHaveClass(/departed/);await page.getByRole('button',{name:'Fire Vault'}).click();
  await expect(page.getByRole('heading',{name:'Fire Vault'})).toBeVisible();await expect(page.getByLabel('Vault password')).toBeVisible();
  await page.getByLabel('Vault password').fill('wrong-password');await page.getByRole('button',{name:'Unlock vault'}).click();await expect(page.getByRole('status')).toContainText('incorrect');
  await expect(page.locator('.vault-grid')).toHaveCount(0);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeHidden();
});

test('authorized vault shows document tiles and officer upload controls',async({page})=>{
  await page.route('**/api/vault/session',route=>route.fulfill({json:{configured:true,user:{role:'admin'},csrfToken:'test-token'}}));
  await page.route('**/api/vault/documents',route=>route.fulfill({json:{documents:[{id:'11111111-1111-1111-1111-111111111111',name:'Fire Safety Plan.pdf',extension:'pdf',size:2048,uploadedAt:'2026-10-01T00:00:00Z'}]}}));
  await page.goto('/');await page.getByRole('button',{name:'START EXPLORING'}).click();await expect(page.locator('.loader')).toHaveClass(/departed/);await page.getByRole('button',{name:'Fire Vault'}).click();
  await expect(page.locator('.vault-tile')).toContainText('Fire Safety Plan.pdf');await expect(page.getByRole('link',{name:'Download'})).toBeVisible();await expect(page.getByRole('button',{name:'Upload document'})).toBeVisible();await expect(page.getByText('Manage shared access')).toBeVisible();
});
