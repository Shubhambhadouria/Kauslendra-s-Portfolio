import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { validateHighlights, exportHighlighted } from './document-highlights.js';

const derive = promisify(scrypt);
const passwordValid = password => typeof password === 'string' && password.length >= 12 && password.length <= 256;
const usernameValid = username => typeof username === 'string' && /^[a-zA-Z0-9._-]{3,64}$/.test(username);
const hashPassword = async (password, salt) => (await derive(password, salt, 64, { N:32768, r:8, p:1, maxmem:64*1024*1024 })).toString('hex');
const publicUser = ({id,username,role}) => ({id,username,role});
const fail = (status, message) => Object.assign(new Error(message), {status});
export async function createVault(directory, {documentSource=null,createDocumentSource=null,defaultDriveFolderId=''}={}) {
  await mkdir(path.join(directory, 'files'), {recursive:true});
  const storePath = path.join(directory, 'index.json');
  let store; try { store = JSON.parse(await readFile(storePath, 'utf8')); } catch(error) { if(error.code !== 'ENOENT') throw error; store = {users:[],documents:[]}; }
  const configPath=path.join(directory,'drive-config.json');
  let driveConfig={folderId:defaultDriveFolderId,enabled:!!documentSource};
  try{driveConfig=JSON.parse(await readFile(configPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(createDocumentSource)documentSource=driveConfig.enabled?createDocumentSource(driveConfig.folderId):null;
  let queue = Promise.resolve();
  const mutate = operation => { const result = queue.then(async () => { const next = structuredClone(store); const value = await operation(next); await writeFile(storePath+'.tmp',JSON.stringify(next,null,2),{mode:0o600}); await rename(storePath+'.tmp',storePath); store=next; return value; }); queue=result.catch(()=>{});return result; };
  const records = () => documentSource ? store.driveDocuments || [] : store.documents;
  async function refreshDocuments() {
    if(!documentSource)return;
    const source=documentSource,documents=await source.list();
    await mutate(next=>{
      if(source!==documentSource)throw fail(409,'The vault folder changed. Refresh the library.');
      next.driveDocuments=documents.map(document=>{
      const previous=(next.driveDocuments||[]).find(item=>item.id===document.id);
      return {...document,highlights:previous?.remoteVersion===document.remoteVersion?previous.highlights||[]:[],
        revision:previous ? (previous.revision||0)+(previous.remoteVersion===document.remoteVersion?0:1):0,
        savedAt:previous?.remoteVersion===document.remoteVersion?previous.savedAt||null:null};
    });});
  }
  const readDocument = document => documentSource ? documentSource.read(document) : readFile(path.join(directory,'files',document.id));
  async function createUser(username,password,role='viewer') {
    if(!usernameValid(username)||!passwordValid(password)||!['admin','viewer'].includes(role)) throw fail(400,'Use a 3–64 character username and a password of 12–256 characters.');
    const salt=randomBytes(32).toString('hex'); const hash=await hashPassword(password,salt);
    return mutate(next=>{if(next.users.some(u=>u.username.toLowerCase()===username.toLowerCase()))throw fail(409,'That username is already in use.');const user={id:randomUUID(),username,role,salt,hash};next.users.push(user);return publicUser(user);});
  }
  const sessions=new Map(), attempts=new Map();
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  async function body(req,limit=16000){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw fail(413,'File or request is too large.');chunks.push(chunk);}return Buffer.concat(chunks);}
  async function jsonBody(req,limit=16000){if(!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'JSON is required.');try{const value=JSON.parse((await body(req,limit)).toString());if(!value||typeof value!=='object'||Array.isArray(value))throw fail(400,'A JSON object is required.');return value;}catch(error){if(error.status)throw error;throw fail(400,'Invalid JSON.');}}
  function session(req){const token=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('fire_vault='))?.slice(11);const entry=sessions.get(token);if(!entry)return null;if(entry.expires<Date.now()||!store.users.some(u=>u.id===entry.userId)){sessions.delete(token);return null;}return {...entry,token,user:store.users.find(u=>u.id===entry.userId)};}
  const cookie=(token,production,maxAge=28800)=>`fire_vault=${token}; HttpOnly; SameSite=Strict; Path=/api/vault; Max-Age=${maxAge}${production?'; Secure':''}`;
  function checkOrigin(req,production){const expected=process.env.PUBLIC_ORIGIN || `${production?'https':'http'}://${req.headers.host}`;if(req.headers.origin && req.headers.origin!==expected)throw fail(403,'This request origin is not allowed.');if(req.headers['sec-fetch-site']==='cross-site')throw fail(403,'Cross-site requests are not allowed.');}
  async function handle(req,res,url,production=false){
    if(!url.pathname.startsWith('/api/vault'))return false;
    try{
      checkOrigin(req,production);
      if(url.pathname==='/api/vault/session'&&req.method==='GET'){const current=session(req);send(res,200,{configured:store.users.some(u=>u.role==='admin'),user:current?publicUser(current.user):null,csrfToken:current?.csrf||null});return true;}
      if(url.pathname==='/api/vault/login'&&req.method==='POST'){
        if(req.headers['x-vault-request']!=='1')throw fail(403,'Request verification failed.');
        const key=req.socket.remoteAddress;const now=Date.now();for(const [address,list]of attempts)if(!list.some(t=>now-t<900000))attempts.delete(address);
        const recent=(attempts.get(key)||[]).filter(t=>now-t<900000);if(recent.length>=8)throw fail(429,'Too many attempts. Try again in 15 minutes.');recent.push(now);attempts.set(key,recent);
        const value=await jsonBody(req);const user=store.users.find(u=>u.username===(value.mode==='officer'?'officer':'vault'));
        const password=typeof value.password==='string'&&value.password.length<=256?value.password:'';
        const candidate=await hashPassword(password,user?.salt||'0'.repeat(64));const expected=user?.hash||'0'.repeat(128);
        if(!timingSafeEqual(Buffer.from(candidate,'hex'),Buffer.from(expected,'hex'))||!user)throw fail(401,'The vault password is incorrect.');
        for(const [token,entry]of sessions)if(entry.expires<now)sessions.delete(token);
        const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');sessions.set(token,{userId:user.id,csrf,expires:now+28800000});
        res.setHeader('Set-Cookie',cookie(token,production));send(res,200,{user:publicUser(user),csrfToken:csrf});return true;
      }
      const current=session(req);if(!current)throw fail(401,'Sign in to access Fire Vault.');
      if(!['GET','HEAD'].includes(req.method)&&req.headers['x-vault-csrf']!==current.csrf)throw fail(403,'Request verification failed. Refresh and sign in again.');
      if(url.pathname==='/api/vault/storage') {
        if(current.user.role!=='admin')throw fail(403,'Only the officer can access storage settings.');
        if(req.method==='GET'){send(res,200,{enabled:driveConfig.enabled,folderUrl:driveConfig.folderId?`https://drive.google.com/drive/folders/${driveConfig.folderId}`:'',available:!!createDocumentSource});return true;}
        if(req.method==='PUT') {
          const value=await jsonBody(req);if(typeof value.enabled!=='boolean'||typeof value.folderUrl!=='string'||value.folderUrl.length>1000)throw fail(400,'Enter a Google Drive folder link.');
          let folderId='';
          if(value.folderUrl.trim()) {
            let parsed;try{parsed=new URL(value.folderUrl.trim());}catch{throw fail(400,'Enter a valid Google Drive folder link.');}
            const match=parsed.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,200})\/?$/);
            if(parsed.protocol!=='https:'||parsed.hostname!=='drive.google.com'||parsed.username||parsed.password||parsed.port||!match)throw fail(400,'Use a link beginning with https://drive.google.com/drive/folders/.');
            folderId=match[1];
          }
          if(value.enabled&&!folderId)throw fail(400,'Enter a folder link before enabling Google Drive.');
          if(value.enabled&&!createDocumentSource)throw fail(503,'Google Drive is not configured on this server.');
          const source=value.enabled?createDocumentSource(folderId):null;
          if(source)await source.list();
          const next={folderId,enabled:value.enabled};
          const operation=queue.then(async()=>{
            await writeFile(configPath+'.tmp',JSON.stringify(next,null,2),{mode:0o600});await rename(configPath+'.tmp',configPath);
            driveConfig=next;documentSource=source;
          });queue=operation.catch(()=>{});await operation;
          for(const [token,entry]of sessions)if(entry.userId!==current.user.id)sessions.delete(token);
          send(res,200,{message:value.enabled?'Private Google Drive connected. Viewers must sign in again.':'Folder link saved. Local documents remain active.',enabled:value.enabled,folderUrl:folderId?`https://drive.google.com/drive/folders/${folderId}`:''});return true;
        }
        throw fail(405,'Storage settings support GET and PUT.');
      }
      if(url.pathname==='/api/vault/logout'&&req.method==='POST'){sessions.delete(current.token);res.setHeader('Set-Cookie',cookie('',production,0));send(res,200,{message:'Signed out.'});return true;}
      if(url.pathname==='/api/vault/documents'&&req.method==='GET'){
        await refreshDocuments();send(res,200,{storage:documentSource?.kind||'local',readOnly:!!documentSource,
          ...(current.user.role==='admin'&&documentSource?{managementUrl:documentSource.managementUrl}:{}),
          documents:records().map(({highlights,remoteId,remoteVersion,...document})=>({...document,highlightCount:highlights?.length||0}))});return true;
      }
      const highlightMatch=url.pathname.match(/^\/api\/vault\/documents\/([a-f0-9-]{36})\/(annotations|annotated)$/);
      if(highlightMatch){
        await refreshDocuments();const document=records().find(d=>d.id===highlightMatch[1]);if(!document)throw fail(404,'Document not found.');
        if(highlightMatch[2]==='annotations'&&req.method==='GET'){send(res,200,{highlights:document.highlights||[],revision:document.revision||0,savedAt:document.savedAt||null});return true;}
        if(highlightMatch[2]==='annotations'&&req.method==='PUT'){
          if(current.user.role!=='admin')throw fail(403,'Only the officer can save highlights.');
          const value=await jsonBody(req,128*1024),highlights=validateHighlights(value.highlights,document.extension);if(!highlights||!Number.isInteger(value.revision))throw fail(400,'Invalid document highlights.');
          if(document.extension==='txt'){const text=(await readDocument(document)).toString('utf8');if(highlights.some(h=>h.end>text.length))throw fail(400,'Text highlights must stay inside the document.');}
          else if(document.extension==='pdf'){try{const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.load(await readDocument(document));if(highlights.some(h=>h.page>pdf.getPageCount()))throw fail(400,'Highlight page does not exist.');}catch(error){if(error.status)throw error;throw fail(422,'This PDF cannot be edited. It may be encrypted or damaged.');}}
          const result=await mutate(next=>{const target=(documentSource?next.driveDocuments:next.documents).find(d=>d.id===document.id);if(!target)throw fail(404,'Document not found.');if((target.revision||0)!==value.revision)throw fail(409,'This document was updated elsewhere. Reopen it before saving your changes.');target.highlights=highlights;target.revision=(target.revision||0)+1;target.savedAt=new Date().toISOString();return {revision:target.revision,savedAt:target.savedAt};});send(res,200,{...result,message:'Highlights saved to Fire Vault.'});return true;
        }
        if(highlightMatch[2]==='annotated'&&req.method==='GET'){
          let exported;try{exported=await exportHighlighted(await readDocument(document),document);}catch(error){if(error.status)throw error;throw fail(422,'Could not export this document. Download the original instead.');}
          const name=path.parse(document.name).name+'-highlighted.'+exported.extension;res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="highlighted.${exported.extension}"; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g,'%27')}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Length':exported.bytes.length});res.end(exported.bytes);return true;
        }
        throw fail(404,'Vault endpoint not found.');
      }
      const documentMatch=url.pathname.match(/^\/api\/vault\/documents\/([a-f0-9-]{36})$/);
      if(documentMatch&&req.method==='GET'){
        await refreshDocuments();const document=records().find(d=>d.id===documentMatch[1]);if(!document)throw fail(404,'Document not found.');
        const bytes=await readDocument(document);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="document.${document.extension}"; filename*=UTF-8''${encodeURIComponent(document.name).replace(/'/g,'%27')}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Length':bytes.length});res.end(bytes);return true;
      }
      if(current.user.role!=='admin')throw fail(403,'Only the officer administrator can manage the vault.');
      if(url.pathname==='/api/vault/access'&&req.method==='POST'){
        const value=await jsonBody(req);if(!passwordValid(value.password))throw fail(400,'Use a shared password of 12–256 characters.');
        if(await hashPassword(value.password,current.user.salt)===current.user.hash)throw fail(400,'Use a different password from the officer management password.');
        const salt=randomBytes(32).toString('hex'),hash=await hashPassword(value.password,salt);
        let viewerId;await mutate(next=>{let viewer=next.users.find(u=>u.username==='vault');if(!viewer){viewer={id:randomUUID(),username:'vault',role:'viewer'};next.users.push(viewer);}Object.assign(viewer,{salt,hash});viewerId=viewer.id;});
        for(const [token,entry]of sessions)if(entry.userId===viewerId)sessions.delete(token);
        send(res,200,{message:'Shared password updated. Existing viewer sessions have been signed out.'});return true;
      }
      if(url.pathname==='/api/vault/documents'&&req.method==='POST'){
        if(documentSource)throw fail(405,'Add documents in your Google Drive folder, then reopen Fire Vault.');
        let name;try{name=decodeURIComponent(req.headers['x-file-name']||'');}catch{throw fail(400,'Invalid filename.');}
        if(!name||name.length>180||/[\x00-\x1f\x7f/\\]/.test(name))throw fail(400,'Use a valid filename of up to 180 characters.');
        const extension=path.extname(name).slice(1).toLowerCase();if(!['pdf','txt','png','jpg','jpeg'].includes(extension))throw fail(415,'Supported files: PDF, TXT, PNG, and JPG.');
        const bytes=await body(req,10*1024*1024);if(!bytes.length)throw fail(400,'The file is empty.');
        const valid=extension==='pdf'?bytes.subarray(0,5).toString()==='%PDF-':extension==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):['jpg','jpeg'].includes(extension)?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:!bytes.includes(0)&&Buffer.from(bytes.toString('utf8')).equals(bytes);
        if(!valid)throw fail(415,'File contents do not match the selected document type.');
        const document={id:randomUUID(),name,extension,size:bytes.length,uploadedAt:new Date().toISOString()};const filePath=path.join(directory,'files',document.id);
        await writeFile(filePath,bytes,{flag:'wx',mode:0o600});try{await mutate(next=>{next.documents.push(document);});}catch(error){await unlink(filePath);throw error;}send(res,201,{document});return true;
      }
      if(documentMatch&&req.method==='DELETE'){if(documentSource)throw fail(405,'Remove documents in your Google Drive folder.');await mutate(async next=>{const document=next.documents.find(d=>d.id===documentMatch[1]);if(!document)throw fail(404,'Document not found.');next.documents=next.documents.filter(d=>d.id!==document.id);});await unlink(path.join(directory,'files',documentMatch[1])).catch(error=>{if(error.code!=='ENOENT')throw error;});send(res,200,{message:'Document deleted.'});return true;}
      throw fail(404,'Vault endpoint not found.');
    }catch(error){if(!error.status)console.error(error);send(res,error.status||500,{error:error.status?error.message:'Vault request failed. Please try again.'});return true;}
  }
  return {handle,createUser,hasAdmin:()=>store.users.some(u=>u.role==='admin')};
}
