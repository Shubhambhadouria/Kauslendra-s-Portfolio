import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palette={yellow:'#ffe066',green:'#a8e68a',pink:'#ffa3c5'};
let active=null;
export function leavePreview(){
  if(active?.dirty&&!confirm('Leave without saving your document highlights?'))return false;
  active?.dispose();active=null;return true;
}
window.addEventListener('beforeunload',event=>{if(active?.dirty){event.preventDefault();event.returnValue='';}});
export async function openPreview(container,document,admin,request,onBack){
  if(!leavePreview())return;
  let cancelled=false,pdf=null,pdfTask=null,blobUrl=null,renderTask=null,page=1,totalPages=1,rendering=false,saving=false,highlightMode=true,revision=0,highlights=[],undo=[],dirty=false,text='',pdfPage=null;
  const state={dirty:false,dispose(){cancelled=true;renderTask?.cancel();pdfTask?.destroy().catch(()=>{});if(blobUrl)URL.revokeObjectURL(blobUrl);}};active=state;
  container.innerHTML=`<div class="eyebrow">FIRE VAULT · DOCUMENT PREVIEW</div><h2 id="modal-title" class="preview-title">${escape(document.name)}</h2><div class="preview-toolbar"><button class="vault-secondary" id="preview-back">← Back to vault</button>${admin?'<label class="highlight-color">Highlight color<select id="highlight-color"><option value="yellow">Yellow</option><option value="green">Green</option><option value="pink">Pink</option></select></label><button class="vault-secondary" id="highlight-undo" disabled>Undo</button><button class="vault-secondary" id="highlight-clear">Clear highlights</button><button class="submit" id="highlight-save" disabled>Save highlights</button>':''}<button class="vault-secondary" id="highlight-download">Download highlighted copy</button></div><p class="preview-help">${admin?(document.extension==='txt'?'Select important text, then click Highlight selection.':'Drag over an important section to highlight it. Save changes here in the vault.'):'Saved officer highlights are shown below.'}</p><div class="preview-pagination" hidden><button class="vault-secondary" id="page-prev" aria-label="Previous page">←</button><span id="page-number"></span><button class="vault-secondary" id="page-next" aria-label="Next page">→</button></div>${admin&&document.extension==='txt'?'<button class="vault-secondary" id="text-highlight">Highlight selection</button>':''}<div id="preview-status" class="form-status" role="status">Loading document…</div><div class="preview-scroll"><div id="preview-content"></div></div><small class="preview-original-note">The original upload is preserved. ${document.extension==='txt'?'Highlighted text downloads as an HTML document.':'Highlighted copies download as PDF.'}</small>`;
  const content=container.querySelector('#preview-content'),status=container.querySelector('#preview-status');
  container.querySelector('#preview-back').onclick=()=>{if(leavePreview())onBack();};
  function controls(){state.dirty=dirty;if(admin){container.querySelector('#highlight-save').disabled=!dirty||rendering||saving;container.querySelector('#highlight-undo').disabled=!undo.length||rendering||saving;container.querySelector('#highlight-clear').disabled=!highlights.length||rendering||saving;if(document.extension==='txt')container.querySelector('#text-highlight').disabled=saving;}container.querySelector('#highlight-download').disabled=rendering||saving;}
  function change(next){if(saving)return;undo.push(structuredClone(highlights));highlights=next;dirty=true;status.textContent='Unsaved changes';controls();paint();}
  function textMarkup(){const boundaries=[...new Set([0,text.length,...highlights.flatMap(h=>[h.start,h.end])])].sort((a,b)=>a-b);let html='';for(let i=0;i<boundaries.length-1;i++){const start=boundaries[i],end=boundaries[i+1],h=highlights.find(h=>h.start<=start&&h.end>=end);const value=escape(text.slice(start,end));html+=h?`<mark style="background:${palette[h.color]}">${value}</mark>`:value;}return html;}
  function paint(){if(cancelled)return;if(document.extension==='txt'){content.innerHTML=`<pre class="preview-text" id="preview-text">${textMarkup()}</pre>`;return;}const layer=content.querySelector('.highlight-layer');if(!layer)return;layer.innerHTML=highlights.filter(h=>h.page===page).map(h=>`<div class="saved-highlight" style="left:${h.x*100}%;top:${h.y*100}%;width:${h.width*100}%;height:${h.height*100}%;background:${palette[h.color]}"></div>`).join('');}
  async function save(){
    if(!admin||!dirty)return true;if(saving)return false;saving=true;controls();status.textContent='Saving highlights…';
    try{const result=await request('/documents/'+document.id+'/annotations',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,highlights})});revision=result.revision;dirty=false;undo=[];status.textContent=result.message;return true;}catch(error){status.textContent=error.message;return false;}finally{saving=false;if(!cancelled)controls();}
  }
  if(admin){container.querySelector('#highlight-save').onclick=save;container.querySelector('#highlight-undo').onclick=()=>{if(!undo.length)return;highlights=undo.pop();dirty=true;status.textContent='Unsaved changes';controls();paint();};container.querySelector('#highlight-clear').onclick=()=>{if(highlights.length)change([]);};}
  // The parameter is a document record; DOM creation uses the browser's document.
  const dom=window.document;
  if(admin&&document.extension!=='txt'){
    const mode=dom.createElement('button');mode.className='vault-secondary';mode.id='highlight-mode';mode.textContent='Highlight mode';mode.setAttribute('aria-pressed','true');
    container.querySelector('.preview-toolbar').insertBefore(mode,container.querySelector('.highlight-color'));
    mode.onclick=()=>{highlightMode=!highlightMode;mode.setAttribute('aria-pressed',String(highlightMode));content.querySelector('.preview-stage')?.classList.toggle('can-highlight',highlightMode);};
    container.querySelector('.preview-help').textContent='Drag over an important section to highlight it. Turn off Highlight mode to scroll, then save your changes here.';
  }
  container.querySelector('#highlight-download').onclick=async()=>{
    if(dirty&&!await save())return;const button=container.querySelector('#highlight-download');button.disabled=true;status.textContent='Preparing highlighted copy…';
    try{const response=await fetch('/api/vault/documents/'+document.id+'/annotated');if(!response.ok)throw Error((await response.json()).error);const url=URL.createObjectURL(await response.blob()),link=dom.createElement('a');link.href=url;link.download=document.name.replace(/\.[^.]+$/,'')+'-highlighted.'+(document.extension==='txt'?'html':'pdf');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Highlighted copy downloaded.';}catch(error){status.textContent=error.message;}finally{if(!cancelled)button.disabled=false;}
  };
  function attachRegionDrawing(stage){
    if(!admin)return;stage.classList.toggle('can-highlight',highlightMode);let start=null,draft=null;
    const point=event=>{const bounds=stage.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width)),y:Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height))};};
    stage.onpointerdown=event=>{if(rendering||saving||!highlightMode||event.button!==0)return;event.preventDefault();start=point(event);draft=dom.createElement('div');draft.className='draft-highlight';draft.style.background=palette[container.querySelector('#highlight-color').value];stage.append(draft);stage.setPointerCapture(event.pointerId);};
    stage.onpointermove=event=>{if(!start||!draft)return;const end=point(event);Object.assign(draft.style,{left:Math.min(start.x,end.x)*100+'%',top:Math.min(start.y,end.y)*100+'%',width:Math.abs(end.x-start.x)*100+'%',height:Math.abs(end.y-start.y)*100+'%'});};
    stage.onpointerup=event=>{if(!start)return;const end=point(event),rect={kind:'region',page,x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y),color:container.querySelector('#highlight-color').value};draft?.remove();draft=null;start=null;if(rect.width>.003&&rect.height>.003)change([...highlights,rect]);};
    stage.onpointercancel=()=>{draft?.remove();draft=null;start=null;};
  }
  async function renderPage(){
    rendering=true;controls();content.innerHTML='<div class="preview-stage"><canvas aria-label="Document page"></canvas><div class="highlight-layer"></div></div>';const stage=content.firstElementChild,canvas=stage.querySelector('canvas');
    try{pdfPage=await pdf.getPage(page);if(cancelled)return;const width=Math.min(670,container.clientWidth-42);const viewport=pdfPage.getViewport({scale:width/pdfPage.getViewport({scale:1}).width});const ratio=Math.min(devicePixelRatio,1.5);canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);stage.style.width=viewport.width+'px';canvas.style.width='100%';canvas.style.height='auto';renderTask=pdfPage.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});await renderTask.promise;if(cancelled)return;paint();attachRegionDrawing(stage);container.querySelector('#page-number').textContent=`Page ${page} of ${totalPages}`;container.querySelector('#page-prev').disabled=page===1;container.querySelector('#page-next').disabled=page===totalPages;status.textContent=dirty?'Unsaved changes':highlights.length?`${highlights.length} saved highlight${highlights.length===1?'':'s'}`:'Ready to preview';}
    catch(error){if(!cancelled)status.textContent='This page could not be rendered. Download the original document instead.';}
    finally{rendering=false;if(!cancelled)controls();}
  }
  try{
    const [annotations,response]=await Promise.all([request('/documents/'+document.id+'/annotations'),fetch('/api/vault/documents/'+document.id)]);
    if(!response.ok)throw Error((await response.json()).error);const bytes=await response.arrayBuffer();if(cancelled)return;highlights=annotations.highlights;revision=annotations.revision;
    if(document.extension==='pdf'){
      const pdfjs=await import('pdfjs-dist/build/pdf.mjs');if(cancelled)return;pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;pdfTask=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true});pdf=await pdfTask.promise;if(cancelled)return;totalPages=pdf.numPages;container.querySelector('.preview-pagination').hidden=false;
      container.querySelector('#page-prev').onclick=()=>{if(page>1&&!rendering){page--;renderPage();}};container.querySelector('#page-next').onclick=()=>{if(page<totalPages&&!rendering){page++;renderPage();}};await renderPage();
    }else if(document.extension==='txt'){
      text=new TextDecoder().decode(bytes);paint();if(admin)container.querySelector('#text-highlight').onclick=()=>{const selection=getSelection(),pre=container.querySelector('#preview-text');if(!selection?.rangeCount||selection.isCollapsed){status.textContent='Select a section of text first.';return;}const range=selection.getRangeAt(0);if(!pre.contains(range.startContainer)||!pre.contains(range.endContainer)){status.textContent='Select text inside this document.';return;}const before=range.cloneRange();before.selectNodeContents(pre);before.setEnd(range.startContainer,range.startOffset);const start=before.toString().length,end=start+range.toString().length;change([...highlights,{kind:'text',start,end,color:container.querySelector('#highlight-color').value}]);selection.removeAllRanges();};status.textContent=highlights.length?`${highlights.length} saved highlights`:'Ready to preview';controls();
    }else{
      blobUrl=URL.createObjectURL(new Blob([bytes],{type:document.extension==='png'?'image/png':'image/jpeg'}));content.innerHTML='<div class="preview-stage"><img alt="Document preview"><div class="highlight-layer"></div></div>';const stage=content.firstElementChild,image=stage.querySelector('img');await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('This image could not be previewed.'));image.src=blobUrl;});if(cancelled)return;paint();attachRegionDrawing(stage);status.textContent=highlights.length?`${highlights.length} saved highlights`:'Ready to preview';controls();
    }
  }catch(error){if(!cancelled){status.textContent='Preview unavailable: '+error.message;container.querySelector('#highlight-download').disabled=true;}}
}
