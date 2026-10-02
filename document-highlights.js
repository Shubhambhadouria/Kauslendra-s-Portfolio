const colors={yellow:[1,.85,.15],green:[.45,.9,.4],pink:[1,.4,.65]};
export function validateHighlights(value,extension){
  if(!Array.isArray(value)||value.length>500)return null;
  const result=[];
  for(const item of value){
    if(!item||typeof item.color!=='string'||!Object.hasOwn(colors,item.color))return null;
    if(extension==='txt'){
      if(item.kind!=='text'||!Number.isInteger(item.start)||!Number.isInteger(item.end)||item.start<0||item.end<=item.start||item.end>10*1024*1024)return null;
      result.push({kind:'text',start:item.start,end:item.end,color:item.color});
    }else{
      if(item.kind!=='region'||!Number.isInteger(item.page)||item.page<1||item.page>10000)return null;
      const {x,y,width,height}=item;
      if(![x,y,width,height].every(v=>typeof v==='number'&&Number.isFinite(v))||x<0||y<0||width<=0||height<=0||x+width>1.000001||y+height>1.000001)return null;
      if(extension!=='pdf'&&item.page!==1)return null;
      result.push({kind:'region',page:item.page,x,y,width,height,color:item.color});
    }
  }
  return result;
}
const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function exportHighlighted(bytes,document){
  const highlights=document.highlights||[];
  if(document.extension==='txt'){
    const text=bytes.toString('utf8'),boundaries=[...new Set([0,text.length,...highlights.flatMap(h=>[h.start,h.end])])].filter(v=>v<=text.length).sort((a,b)=>a-b);
    let content='';for(let i=0;i<boundaries.length-1;i++){const start=boundaries[i],end=boundaries[i+1],highlight=highlights.find(h=>h.start<=start&&h.end>=end);const segment=escape(text.slice(start,end));content+=highlight?`<mark style="background:${{yellow:'#ffe066',green:'#a8e68a',pink:'#ffa3c5'}[highlight.color]}">${segment}</mark>`:segment;}
    return {bytes:Buffer.from(`<!doctype html><html lang="en"><meta charset="UTF-8"><title>${escape(document.name)}</title><style>body{max-width:900px;margin:40px auto;padding:24px;font:16px/1.7 sans-serif}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}mark{color:inherit}</style><h1>${escape(document.name)}</h1><pre>${content}</pre></html>`),extension:'html'};
  }
  const { PDFDocument,rgb,BlendMode }=await import('pdf-lib');
  let pdf;
  if(document.extension==='pdf')pdf=await PDFDocument.load(bytes);
  else{pdf=await PDFDocument.create();const image=document.extension==='png'?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);const page=pdf.addPage([image.width,image.height]);page.drawImage(image,{x:0,y:0,width:image.width,height:image.height});}
  const pages=pdf.getPages();
  for(const highlight of highlights){const page=pages[highlight.page-1];if(!page)continue;const crop=page.getCropBox(),rotation=((page.getRotation().angle%360)+360)%360;
    const point=(x,y)=>rotation===90?[crop.x+y*crop.width,crop.y+x*crop.height]:rotation===180?[crop.x+(1-x)*crop.width,crop.y+y*crop.height]:rotation===270?[crop.x+(1-y)*crop.width,crop.y+(1-x)*crop.height]:[crop.x+x*crop.width,crop.y+(1-y)*crop.height];
    const a=point(highlight.x,highlight.y),b=point(highlight.x+highlight.width,highlight.y+highlight.height);const [r,g,bColor]=colors[highlight.color];page.drawRectangle({x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(a[0]-b[0]),height:Math.abs(a[1]-b[1]),color:rgb(r,g,bColor),opacity:.38,blendMode:BlendMode.Multiply});
  }
  return {bytes:Buffer.from(await pdf.save()),extension:'pdf'};
}
