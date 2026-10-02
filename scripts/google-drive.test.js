import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {mkdtemp,writeFile,rm,readdir,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createGoogleDriveSource} from '../google-drive.js';
import {createVault} from '../vault.js';

async function temporary(t) {
  const directory=await mkdtemp(path.join(os.tmpdir(),'google-drive-vault-test-'));
  t.after(async()=>{assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('google-drive-vault-test-'));await rm(directory,{recursive:true,force:true});});
  return directory;
}
test('private Drive uses signed read-only authentication, pagination and bounded folder downloads',async t=>{
  const directory=await temporary(t),folderId='private_folder_1234';
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const credentialsPath=path.join(directory,'key.json');
  await writeFile(credentialsPath,JSON.stringify({type:'service_account',client_email:'test@example.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})}));
  let tokenRequests=0,outside=false,version='1',downloadRequests=0;
  const file={id:'drive_file_1234',name:'Instructions.txt',mimeType:'text/plain',size:'12',createdTime:'2026-10-01T00:00:00Z',version:'1'};
  const source=createGoogleDriveSource({folderId,credentialsPath,fetchImpl:async(input,options)=>{
    const url=new URL(input);
    if(url.hostname==='oauth2.googleapis.com') {
      tokenRequests++;const assertion=options.body.get('assertion'),[header,claims,signature]=assertion.split('.');
      assert.equal(verify('RSA-SHA256',Buffer.from(header+'.'+claims),publicKey,Buffer.from(signature,'base64url')),true);
      assert.equal(JSON.parse(Buffer.from(claims,'base64url')).scope,'https://www.googleapis.com/auth/drive.readonly');
      return Response.json({access_token:'test-access-token',expires_in:3600});
    }
    assert.equal(options.headers.Authorization,'Bearer test-access-token');
    if(url.pathname.endsWith('/'+folderId))return Response.json({id:folderId,mimeType:'application/vnd.google-apps.folder'});
    if(url.pathname.endsWith('/files')) {
      assert.equal(url.searchParams.get('q'),`'${folderId}' in parents and trashed = false`);
      if(url.searchParams.has('pageToken'))return Response.json({files:[file]});
      return Response.json({nextPageToken:'page2',files:[{...file,id:'unsupported',name:'script.html',mimeType:'text/html'},{...file,id:'oversized',size:'11000000'}]});
    }
    if(url.searchParams.get('alt')==='media'){downloadRequests++;return new Response('Keep exits clear.');}
    return Response.json({...file,version,parents:[outside?'another_folder':folderId],trashed:false});
  }});
  const documents=await source.list();assert.equal(documents.length,1);
  assert.match(documents[0].id,/^[a-f0-9-]{36}$/);assert.equal((await source.read(documents[0])).toString(),'Keep exits clear.');
  assert.equal(tokenRequests,1);assert.equal(downloadRequests,1);
  outside=true;await assert.rejects(source.read(documents[0]),{status:404});assert.equal(downloadRequests,1);
  outside=false;version='2';await assert.rejects(source.read(documents[0]),{status:409});assert.equal(downloadRequests,1);
});

test('Drive files remain behind vault login and CSRF; previews, highlights and local originals persist',async t=>{
  const directory=await temporary(t),id='11111111-1111-5111-8111-111111111111';
  let listingCalls=0,version='1',present=true;
  const source={kind:'google-drive',readOnly:true,managementUrl:'https://drive.google.com/drive/folders/private_folder',
    async list(){listingCalls++;return present?[{id,name:'Safety.txt',extension:'txt',size:17,uploadedAt:'2026-10-01T00:00:00Z',remoteId:'private-id',remoteVersion:version}]:[];},
    async read(){return Buffer.from('Keep exits clear.');}};
  const vault=await createVault(directory,{documentSource:source});
  await vault.createUser('officer','Officer-test-password-123','admin');await vault.createUser('vault','Viewer-test-password-123','viewer');
  const server=http.createServer(async(req,res)=>{if(!await vault.handle(req,res,new URL(req.url,'http://localhost')))res.end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const anonymous=await fetch(base+'/api/vault/documents');assert.equal(anonymous.status,401);assert.equal(listingCalls,0);
  assert.equal((await fetch(base+'/api/vault/documents/'+id)).status,401);
  async function login(mode,password) {
    const response=await fetch(base+'/api/vault/login',{method:'POST',headers:{'Content-Type':'application/json','X-Vault-Request':'1'},body:JSON.stringify({mode,password})});
    assert.equal(response.status,200);return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:(await response.json()).csrfToken};
  }
  const admin=await login('officer','Officer-test-password-123'),viewer=await login('viewer','Viewer-test-password-123');
  const headers={Cookie:admin.cookie,'X-Vault-CSRF':admin.csrf,'Content-Type':'application/json'};
  let response=await fetch(base+'/api/vault/documents',{headers:{Cookie:viewer.cookie}}),listing=await response.json();
  assert.equal(listing.storage,'google-drive');assert.equal(listing.readOnly,true);assert.equal(listing.documents.length,1);
  assert.equal(listing.managementUrl,undefined);assert.equal(listing.documents[0].remoteId,undefined);
  assert.equal(await (await fetch(base+'/api/vault/documents/'+id,{headers:{Cookie:viewer.cookie}})).text(),'Keep exits clear.');
  const highlights=[{kind:'text',start:0,end:4,color:'yellow'}],annotation='/api/vault/documents/'+id+'/annotations';
  assert.equal((await fetch(base+annotation,{method:'PUT',headers:{...headers,Cookie:viewer.cookie,'X-Vault-CSRF':viewer.csrf},body:JSON.stringify({revision:0,highlights})})).status,403);
  assert.equal((await fetch(base+annotation,{method:'PUT',headers:{Cookie:admin.cookie,'Content-Type':'application/json'},body:JSON.stringify({revision:0,highlights})})).status,403);
  assert.equal((await fetch(base+annotation,{method:'PUT',headers,body:JSON.stringify({revision:0,highlights})})).status,200);
  assert.deepEqual((await (await fetch(base+annotation,{headers:{Cookie:viewer.cookie}})).json()).highlights,highlights);
  assert.equal((await fetch(base+'/api/vault/documents/'+id+'/annotated',{headers:{Cookie:viewer.cookie}})).status,200);
  assert.equal((await fetch(base+'/api/vault/documents',{method:'POST',headers,body:'test'})).status,405);
  assert.equal((await fetch(base+'/api/vault/documents/'+id,{method:'DELETE',headers})).status,405);
  assert.deepEqual(await readdir(path.join(directory,'files')),[]);
  version='2';listing=await (await fetch(base+annotation,{headers:{Cookie:viewer.cookie}})).json();assert.deepEqual(listing.highlights,[]);assert.equal(listing.revision,2);
  present=false;assert.equal((await fetch(base+'/api/vault/documents/'+id,{headers:{Cookie:viewer.cookie}})).status,404);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory,'index.json'),'utf8')).documents,[]);
});

test('only officers can save folder links, validate connections and persist changes across restarts',async t=>{
  const directory=await temporary(t),folderId='private_folder_5678';let rejectConnection=false;
  const createDocumentSource=id=>({kind:'google-drive',managementUrl:`https://drive.google.com/drive/folders/${id}`,
    async list(){if(rejectConnection)throw Object.assign(Error('Drive connection unavailable'),{status:503});return [];},async read(){throw Error('Not used');}});
  const vault=await createVault(directory,{createDocumentSource});
  await vault.createUser('officer','Officer-test-password-123','admin');await vault.createUser('vault','Viewer-test-password-123','viewer');
  let active=vault;
  const server=http.createServer(async(req,res)=>{if(!await active.handle(req,res,new URL(req.url,'http://localhost')))res.end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  async function login(mode,password) {
    const response=await fetch(base+'/api/vault/login',{method:'POST',headers:{'Content-Type':'application/json','X-Vault-Request':'1'},body:JSON.stringify({mode,password})});
    return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:(await response.json()).csrfToken};
  }
  let admin=await login('officer','Officer-test-password-123');const viewer=await login('viewer','Viewer-test-password-123');
  const call=(user,method='GET',data)=>fetch(base+'/api/vault/storage',{method,headers:{Cookie:user.cookie,'X-Vault-CSRF':user.csrf,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  assert.equal((await fetch(base+'/api/vault/storage')).status,401);
  assert.equal((await call(viewer)).status,403);
  assert.equal((await call(viewer,'PUT',{folderUrl:`https://drive.google.com/drive/folders/${folderId}`,enabled:false})).status,403);
  assert.equal((await call({...admin,csrf:'bad'},'PUT',{folderUrl:'',enabled:false})).status,403);
  assert.equal((await call(admin,'PUT',{folderUrl:'https://example.com/drive/folders/'+folderId,enabled:false})).status,400);
  assert.equal((await call(admin,'PUT',{folderUrl:'https://drive.google.com.evil.test/drive/folders/'+folderId,enabled:false})).status,400);
  const folderUrl=`https://drive.google.com/drive/folders/${folderId}`;
  assert.equal((await call(admin,'PUT',{folderUrl:folderUrl+'?dmr=1',enabled:false})).status,200);
  assert.equal((await (await call(admin)).json()).folderUrl,folderUrl);
  rejectConnection=true;assert.equal((await call(admin,'PUT',{folderUrl,enabled:true})).status,503);
  assert.equal((await (await call(admin)).json()).enabled,false);
  rejectConnection=false;assert.equal((await call(admin,'PUT',{folderUrl,enabled:true})).status,200);
  assert.equal((await fetch(base+'/api/vault/documents',{headers:{Cookie:viewer.cookie}})).status,401);
  assert.equal((await (await fetch(base+'/api/vault/documents',{headers:{Cookie:admin.cookie}})).json()).storage,'google-drive');
  active=await createVault(directory,{createDocumentSource});admin=await login('officer','Officer-test-password-123');
  const restored=await (await call(admin)).json();assert.equal(restored.folderUrl,folderUrl);assert.equal(restored.enabled,true);
  assert.equal((await call(admin,'PUT',{folderUrl,enabled:false})).status,200);
  assert.equal((await (await fetch(base+'/api/vault/documents',{headers:{Cookie:admin.cookie}})).json()).storage,'local');
});
