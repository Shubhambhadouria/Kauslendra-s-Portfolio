import {readFile} from 'node:fs/promises';
import {createHash, sign} from 'node:crypto';
import path from 'node:path';

const endpoint = 'https://www.googleapis.com/drive/v3/files';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const limit = 10 * 1024 * 1024;
const error = (status,message) => Object.assign(new Error(message),{status});
const mimeTypes = {pdf:'application/pdf',txt:'text/plain',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};
function documentFor(file) {
  const extension = path.extname(file.name || '').slice(1).toLowerCase();
  const size = Number(file.size);
  if (!mimeTypes[extension] || mimeTypes[extension] !== file.mimeType || !Number.isSafeInteger(size) || size <= 0 || size > limit
    || !file.id || !file.name || file.name.length > 180 || /[\x00-\x1f\x7f/\\]/.test(file.name)) return null;
  const bytes = createHash('sha256').update('google-drive:' + file.id).digest().subarray(0,16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex'), id = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  return {id,name:file.name,extension,size,uploadedAt:file.createdTime || file.modifiedTime,
    remoteId:file.id,remoteVersion:String(file.version || file.modifiedTime || '')};
}

export function createGoogleDriveSource({folderId,credentialsPath,fetchImpl=fetch}) {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(folderId || '')) throw error(503,'Set a valid Google Drive folder ID.');
  let credentials, accessToken, expires = 0, tokenPromise;
  async function token() {
    if (accessToken && Date.now() < expires) return accessToken;
    if (tokenPromise) return tokenPromise;
    tokenPromise = (async () => {
      try {
        credentials ||= JSON.parse(await readFile(credentialsPath,'utf8'));
        if (credentials.type !== 'service_account' || !credentials.client_email || !credentials.private_key) throw Error();
        const now = Math.floor(Date.now()/1000);
        const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
        const assertion = encode({alg:'RS256',typ:'JWT'}) + '.' + encode({iss:credentials.client_email,
          scope:'https://www.googleapis.com/auth/drive.readonly',aud:tokenEndpoint,iat:now,exp:now+3600});
        const signature = sign('RSA-SHA256',Buffer.from(assertion),credentials.private_key).toString('base64url');
        const response = await fetchImpl(tokenEndpoint,{method:'POST',signal:AbortSignal.timeout(15000),
          headers:{'Content-Type':'application/x-www-form-urlencoded'},
          body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:assertion+'.'+signature})});
        if (!response.ok) throw Error();
        const result = await response.json(); if (!result.access_token) throw Error();
        accessToken = result.access_token; expires = Date.now() + Math.max(0,(Number(result.expires_in) || 3600)-60)*1000;
        return accessToken;
      } catch { throw error(503,'Google Drive connection is unavailable. Check the server credentials and Drive API setup.'); }
    })();
    try {return await tokenPromise;} finally {tokenPromise=null;}
  }
  async function request(url,retry=true) {
    try {
      const response = await fetchImpl(url,{headers:{Authorization:'Bearer '+await token()},signal:AbortSignal.timeout(20000)});
      if (response.status===401 && retry) {accessToken=null;return request(url,false);}
      if (response.status===404) throw error(404,'The Drive file or folder is unavailable.');
      if (!response.ok) throw error(503,'Google Drive is unavailable. Check folder sharing and try again.');
      return response;
    } catch (cause) {if(cause.status)throw cause;throw error(503,'Google Drive could not be reached. Try again shortly.');}
  }
  const urlFor = (id,parameters) => `${endpoint}/${encodeURIComponent(id)}?${new URLSearchParams({supportsAllDrives:'true',...parameters})}`;
  return {kind:'google-drive',readOnly:true,managementUrl:`https://drive.google.com/drive/folders/${folderId}`,
    async list() {
      const folder = await (await request(urlFor(folderId,{fields:'id,mimeType,trashed'}))).json();
      if(folder.trashed || folder.mimeType!=='application/vnd.google-apps.folder')throw error(503,'The configured Drive folder is unavailable.');
      const documents = []; let pageToken;
      do {
        const parameters = new URLSearchParams({q:`'${folderId}' in parents and trashed = false`,pageSize:'100',
          fields:'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,version)',
          orderBy:'name',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
        if(pageToken)parameters.set('pageToken',pageToken);
        const result = await (await request(endpoint+'?'+parameters)).json();
        for(const file of result.files || []) {const document=documentFor(file);if(document)documents.push(document);}
        pageToken=result.nextPageToken;
      } while(pageToken);
      return documents;
    },
    async read(document) {
      const metadata = await (await request(urlFor(document.remoteId,{fields:'id,name,mimeType,size,parents,trashed,version,modifiedTime'}))).json();
      if(metadata.trashed || !metadata.parents?.includes(folderId))throw error(404,'This document is no longer in the vault folder.');
      const current = documentFor(metadata);
      if(!current)throw error(415,'This Drive document has an unsupported type or size.');
      if(current.remoteVersion!==document.remoteVersion)throw error(409,'This Drive document changed. Reopen the vault before continuing.');
      const response = await request(urlFor(document.remoteId,{alt:'media'}));
      const chunks=[];let size=0;
      for await(const chunk of response.body) {size+=chunk.length;if(size>limit)throw error(413,'Drive documents must be no larger than 10 MB.');chunks.push(Buffer.from(chunk));}
      const bytes=Buffer.concat(chunks);
      const valid=current.extension==='pdf'?bytes.subarray(0,5).toString()==='%PDF-':current.extension==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
        ['jpg','jpeg'].includes(current.extension)?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:!bytes.includes(0)&&Buffer.from(bytes.toString('utf8')).equals(bytes);
      if(!bytes.length || !valid)throw error(415,'Drive file contents do not match the document type.');
      return bytes;
    }};
}
