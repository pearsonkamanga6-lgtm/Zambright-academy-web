/* Browser-only PDF cover text reading. Does not upload the PDF to a third-party service. */
(function(){
  "use strict";
  const yearRegex = /\b(?:19(?:8\d|9\d)|20(?:0\d|1\d|2\d))\b/g;
  function yearsIn(text){
    const found=[];let m;yearRegex.lastIndex=0;
    while((m=yearRegex.exec(text))!==null){
      const y=Number(m[0]);
      if(y>new Date().getFullYear()+1)continue;
      found.push({year:y,index:m.index});
    }
    return found;
  }
  function findFromCover(text){
    // Prefer a unique year on the examination cover; do not guess when conflicting years occur.
    const instances=yearsIn(text);
    const scores=new Map();
    for(const item of instances){
      const before=text.slice(Math.max(0,item.index-125),item.index).toLowerCase();
      const after=text.slice(item.index+4,item.index+65).toLowerCase();
      const context=(before+" "+after);
      const lastWords=before.slice(-80);
      const inCopyright=/copyright|©|all rights reserved|revised edition|first published|reprinted/i.test(lastWords);
      if(inCopyright)continue;
      let score=0;
      if(/(?:school certificate|general certificate|gce|examination|external examination|internal examination|ecz|examinations council)/i.test(context))score+=4;
      if(/(?:paper\s*[1-3]|science|physics|mathematics|biology|chemistry)/i.test(context))score+=2;
      if(/^\s*(?:\S+\s+){0,18}$/.test(before.slice(-80)))score+=1;
      if(item.index<850)score+=2;
      scores.set(item.year,Math.max(score,scores.get(item.year)||0));
    }
    const ranked=[...scores.entries()].sort((a,b)=>b[1]-a[1]);
    if(ranked.length===1)return {year:ranked[0][0],source:"PDF cover",confidence:"cover"};
    if(ranked.length>1 && ranked[0][1]>=5 && ranked[0][1]>=ranked[1][1]+5)
      return {year:ranked[0][0],source:"PDF cover",confidence:"cover"};
    return null;
  }
  function filenameYear(filename){
    const hits=[...new Set(yearsIn(filename).map(x=>x.year))];
    return hits.length===1?hits[0]:null;
  }
  async function detect(file){
    let failure="";
    if(window.pdfjsLib && file && typeof file.arrayBuffer==="function"){
      let documentHandle;
      try{
        window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        const data=new Uint8Array(await file.arrayBuffer());
        const task=window.pdfjsLib.getDocument({data:data,disableFontFace:true});
        documentHandle=await task.promise;
        const pages=Math.min(documentHandle.numPages,2);
        for(let i=1;i<=pages;i++){
          const page=await documentHandle.getPage(i);
          const text=await page.getTextContent();
          const content=text.items.map(x=>x.str||"").join(" ");
          const detection=findFromCover(content);
          if(detection)return Object.assign(detection,{page:i});
        }
      }catch(err){
        failure=err && err.message ? err.message : "The PDF could not be read";
      }finally{
        if(documentHandle)try{await documentHandle.destroy();}catch(_){}
      }
    } else {
      failure="Automatic PDF text extraction is unavailable";
    }
    const fromName=file && filenameYear(file.name);
    if(fromName)return {year:fromName,source:"filename only",confidence:"suggestion",warning:"Please verify this year against the paper's cover."};
    return {year:null,source:"none",confidence:"unknown",warning:failure || "This PDF may be a scanned image or the cover has no unambiguous year. Enter the year manually."};
  }
  window.ZamBrightPDFYear={detect};
})();