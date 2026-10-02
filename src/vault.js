import { openPreview, leavePreview } from './preview.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let csrf=null;
async function request(url,options={}){
  const response=await fetch('/api/vault'+url,{...options,headers:{'X-Vault-Request':'1',...(csrf?{'X-Vault-CSRF':csrf}:{}),...options.headers}});
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Vault request failed.'),{status:response.status});return data;
}
const jsonOptions=value=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
export async function renderVault(container){
  if(!leavePreview())return;
  container.innerHTML='<div class="eyebrow">AUTHORIZED ACCESS</div><h2 id="modal-title">Fire Vault</h2><p role="status">Checking vault access…</p>';
  try{
    const session=await request('/session');csrf=session.csrfToken;
    if(!container.isConnected)return;
    if(!session.configured){container.innerHTML='<div class="eyebrow">PRIVATE DOCUMENT LIBRARY</div><h2 id="modal-title">Fire Vault</h2><div class="vault-empty"><span class="vault-lock">⌑</span><h3>The vault is locked.</h3><p>The officer has not configured access yet. Documents stay private until setup is complete.</p></div>';return;}
    if(!session.user){renderLogin(container);return;}
    const admin=session.user.role==='admin';let library,libraryError;
    try{library=await request('/documents');}catch(error){if(!admin)throw error;library={documents:[],readOnly:true};libraryError=error;}
    const {documents,storage='local',readOnly=false,managementUrl=null}=library;const canManage=admin&&!readOnly;
    container.innerHTML=`<div class="eyebrow">PRIVATE DOCUMENT LIBRARY</div><div class="vault-heading"><h2 id="modal-title">Fire Vault</h2><button class="vault-secondary" id="vault-logout">Lock vault ↗</button></div><p class="vault-description">${admin?'Officer management · Upload and manage your documents.':'Authorized access · Documents shared by Kaushlendra Singh Chauhan.'}</p><div class="vault-summary"><span>${documents.length} DOCUMENT${documents.length===1?'':'S'}</span><span>⌑ ${admin?'OFFICER ACCESS':'SHARED ACCESS'}</span></div>${canManage?'<form id="vault-upload" class="vault-upload"><label for="vault-file">Add a document</label><input id="vault-file" name="file" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg" required><small>PDF, TXT, PNG or JPG · Up to 10 MB</small><button class="submit">Upload document ↗</button></form>':''}<div class="vault-grid">${documents.length?documents.map(document=>`<article class="vault-tile"><div class="vault-file-icon">${escape(document.extension.toUpperCase())}</div><h3 title="${escape(document.name)}">${escape(document.name)}</h3><p>${(document.size/1024).toFixed(1)} KB · ${new Date(document.uploadedAt).toLocaleDateString()}</p><a class="vault-download" href="/api/vault/documents/${document.id}" download>Download ↗</a>${canManage?`<button class="vault-delete" data-delete="${document.id}" aria-label="Delete ${escape(document.name)}">Delete</button>`:''}</article>`).join(''):'<div class="vault-empty"><h3>A place for important documents.</h3><p>'+ (admin?'Upload your first document to start the library.':'No documents have been shared yet.')+'</p></div>'}</div><div class="form-status" id="vault-status" role="status"></div>${admin?'<details class="vault-access"><summary>Manage shared access</summary><p>Change the password to revoke all existing viewer sessions. Share the new password only with authorized people.</p><form id="vault-access"><label>New shared password<input name="password" type="password" minlength="12" maxlength="256" autocomplete="new-password" required></label><button class="submit">Update shared password</button><div class="form-status" role="status"></div></form></details>':''}`;
    if(storage==='google-drive') {
      container.querySelector('.vault-description').textContent=admin?'Officer management · Documents from your private Google Drive folder.':'Authorized access · Private documents shared by the officer.';
      if(admin)container.querySelector('.vault-summary').insertAdjacentHTML('afterend',`<p class="vault-description">Add or remove files in Google Drive. <a href="${escape(managementUrl)}" target="_blank" rel="noopener noreferrer">Manage documents in Drive</a></p>`);
      if(!documents.length)container.querySelector('.vault-empty p').textContent=admin?'Add PDF, TXT, PNG or JPG files up to 10 MB to your Drive folder, then refresh this library.':'No documents have been shared yet.';
      const refresh=window.document.createElement('button');refresh.className='vault-secondary';refresh.textContent='Refresh documents';
      refresh.onclick=()=>renderVault(container);container.querySelector('.vault-summary').append(refresh);
    }
    container.querySelectorAll('.vault-tile').forEach((tile,index)=>{const button=window.document.createElement('button');button.className='vault-preview';button.textContent='Preview & highlights';button.setAttribute('aria-label','Preview '+documents[index].name);tile.insertBefore(button,tile.querySelector('.vault-download'));button.onclick=()=>openPreview(container,documents[index],admin,request,()=>renderVault(container));});
    document.querySelector('#vault-logout').onclick=async()=>{try{await request('/logout',{method:'POST'});csrf=null;await renderVault(container);}catch(error){showError(error);}};
    async function showError(error){if(error.status===401){await renderVault(container);return;}const status=container.querySelector('#vault-status');if(status)status.textContent=error.message;}
    if(admin){
      renderDriveSettings(container);
      if(libraryError)container.querySelector('#vault-status').textContent=libraryError.message;
      if(canManage)container.querySelector('#vault-upload').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,file=form.elements.file.files[0],button=form.querySelector('button');if(!file)return;if(file.size>10*1024*1024){container.querySelector('#vault-status').textContent='Choose a file no larger than 10 MB.';return;}button.disabled=true;button.textContent='Uploading…';try{await request('/documents',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file});await renderVault(container);container.querySelector('#vault-status').textContent='Document uploaded.';}catch(error){await showError(error);button.disabled=false;button.textContent='Upload document ↗';}};
      container.querySelectorAll('[data-delete]').forEach(button=>button.onclick=async()=>{if(!confirm('Delete this document from Fire Vault?'))return;button.disabled=true;try{await request('/documents/'+button.dataset.delete,{method:'DELETE'});await renderVault(container);container.querySelector('#vault-status').textContent='Document deleted.';}catch(error){await showError(error);button.disabled=false;}});
      container.querySelector('#vault-access').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),status=form.querySelector('.form-status');button.disabled=true;try{const result=await request('/access',jsonOptions({password:form.elements.password.value}));form.reset();status.textContent=result.message;}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
    }
  }catch(error){container.innerHTML=`<h2 id="modal-title">Fire Vault</h2><p role="alert">${escape(error.message)}</p><button class="submit" id="vault-retry">Try again</button>`;container.querySelector('#vault-retry').onclick=()=>renderVault(container);}
}
async function renderDriveSettings(container) {
  const panel=window.document.createElement('details');panel.className='vault-access';panel.id='vault-drive-settings';
  panel.innerHTML='<summary>Google Drive settings</summary><p>Choose the private folder used by Fire Vault. Visitors still need the vault password.</p><form id="vault-drive-form"><label>Google Drive folder link<input name="folderUrl" type="url" maxlength="1000" placeholder="https://drive.google.com/drive/folders/…"></label><label class="drive-toggle"><input name="enabled" type="checkbox"> Use Google Drive documents</label><small>Keep this folder private and share it with the website’s Google service account. Leave this unchecked to save the link while using local documents.</small><button class="submit" disabled>Save Drive settings</button><div class="form-status" role="status"></div></form>';
  container.append(panel);const form=panel.querySelector('form'),button=form.querySelector('button'),status=form.querySelector('.form-status');
  try {
    const settings=await request('/storage');if(!panel.isConnected)return;
    form.elements.folderUrl.value=settings.folderUrl;form.elements.enabled.checked=settings.enabled;button.disabled=false;
    if(!settings.available){form.elements.enabled.disabled=true;status.textContent='Drive connection setup is needed before enabling this folder.';}
  }catch(error){status.textContent=error.message;return;}
  form.onsubmit=async event=>{
    event.preventDefault();button.disabled=true;status.textContent='Saving folder settings…';
    try {
      const result=await request('/storage',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({folderUrl:form.elements.folderUrl.value,enabled:form.elements.enabled.checked})});
      await renderVault(container);const nextPanel=container.querySelector('#vault-drive-settings');if(nextPanel)nextPanel.open=true;
      container.querySelector('#vault-status').textContent=result.message;
    }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  };
}
function renderLogin(container){
  container.innerHTML='<div class="eyebrow">AUTHORIZED ACCESS ONLY</div><h2 id="modal-title">Fire Vault</h2><p>Private documents, securely kept. Enter the shared password provided by the officer to open the library.</p><form id="vault-login"><label>Access mode<select name="mode"><option value="viewer">View documents</option><option value="officer">Officer management</option></select></label><label>Vault password<input name="password" type="password" required maxlength="256" autocomplete="current-password"></label><button class="submit">Unlock vault ↗</button><div class="form-status" role="status"></div></form><small class="vault-login-note">Need access? Request the password directly from Kaushlendra Singh Chauhan.</small>';
  container.querySelector('#vault-login').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),status=form.querySelector('.form-status');button.disabled=true;status.textContent='Verifying access…';try{const data=await request('/login',jsonOptions(Object.fromEntries(new FormData(form))));csrf=data.csrfToken;await renderVault(container);container.querySelector('#vault-logout')?.focus();}catch(error){status.textContent=error.message;form.elements.password.value='';button.disabled=false;}};
}
