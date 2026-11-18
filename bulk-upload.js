/* ZamBright Academy V2.1 — secure, review-first multi-PDF upload.
 * Uses the existing authenticated Supabase client and never contains service keys.
 * All submitted papers remain private DRAFTS until the owner reviews them.
 */
(function(){
"use strict";
const subjects=["Mathematics","Science","Physics","Biology","Chemistry","Civic Education","Religious Education","English","Literature"];
const types=["Past paper","Test / assessment","Revision notes","Worked questions","Lesson plan","Weekly forecast","Scheme of work"];
const papers=["","Paper 1","Paper 2","Paper 3"];
const bucket="zambright-materials", maxFiles=30, maxFileBytes=50*1024*1024;
let client=null,onSaved=null,queue=[],started=false,busy=false,analyzing=false;
const $=id=>document.getElementById(id);
const text=(x)=>x==null?"":String(x);
function element(tag,cls,content){
 const n=document.createElement(tag);if(cls)n.className=cls;
 if(content!==undefined)n.textContent=text(content);
 return n;
}
function status(message,kind){
 const n=$("bulk-status");if(!n)return;
 n.className="bulk-status"+(kind?" "+kind:"");n.textContent=message;
}
function setControlsBusy(value){
 busy=value;
 for(const id of ["bulk-files","bulk-default-grade","bulk-start","bulk-clear"]){
   const n=$(id);if(n)n.disabled=value||analyzing;
 }
}
function sizeOf(bytes){return (Number(bytes)/1048576).toFixed(1)+" MB";}
function possibleYears(str){
 const raw=String(str||""),matches=[...raw.matchAll(/\b(?:19(?:8\d|9\d)|20(?:0\d|1\d|2\d|3\d))\b/g)];
 return [...new Set(matches.map(m=>Number(m[0])).filter(y=>y>=1980 && y<=new Date().getFullYear()+1))];
}
function detectSubject(str,limit){
 const value=String(str||"").slice(0,limit||2000);
 const options=subjects.filter(subject=>{
   const pattern=new RegExp("\\b"+subject.replace(/\s+/g,"\\s+")+"\\b","i");
   return pattern.test(value);
 });
 // "English Literature" isn't an English Language paper: avoid double classification.
 if(options.includes("Literature")&&options.includes("English")&&/\benglish literature\b/i.test(value)){
   return options.filter(x=>x!=="English");
 }
 return options;
}
function detectPaper(str,filename){
 const value=String(str||"");
 const patterns=[
   /\bpaper\s*(?:number|no\.?)?\s*[:.\-]?\s*(0?[123]|one|two|three)\b/ig,
   /\b(?:p|paper)[\s_-]*([123])\b/ig,
   /\b\d{4}[\/_]([123])\b/g
 ];
 const found=new Set();
 for(const regex of patterns){
   let m;
   while((m=regex.exec(value))!==null){
     const number=({one:1,two:2,three:3})[m[1].toLowerCase()]||Number(m[1]);
     if(number>=1&&number<=3)found.add(number);
   }
 }
 return [...found];
}
function detectGrade(str){
 const value=String(str||"");
 const match=value.match(/\b(?:grade|g)\s*[-_.:]?\s*(\d{1,2})\b/i);
 if(match)return String(Number(match[1]));
 const form=value.match(/\b(?:form|f)\s*[-_.:]?\s*(\d{1,2})\b/i);
 return form?"Form "+Number(form[1]):"";
}
function safeFilenameTitle(filename){
 const raw=String(filename||"Past paper").replace(/\.pdf$/i,"")
   .replace(/^(?:watermarked|scanned|downloaded)[_\s-]+/i,"")
   .replace(/[_]+/g," ").replace(/\s+/g," ").trim();
 return raw.slice(0,180)||"Untitled PDF";
}
function chooseUnique(cover,filename,field){
 const a=[...new Set(cover)],b=[...new Set(filename)];
 if(a.length===1 && b.length===1 && String(a[0])!==String(b[0]))
   return {value:null,note:field+" conflicts between PDF cover ("+a[0]+") and filename ("+b[0]+"); choose manually.",warn:true};
 if(a.length===1 && b.length<=1)return {value:a[0],note:field+" detected from PDF cover.",warn:false};
 if(a.length>1)return {value:null,note:"Several possible "+field.toLowerCase()+" values on the cover; choose manually.",warn:true};
 if(b.length===1)return {value:b[0],note:field+" suggested from filename; verify the PDF cover.",warn:true};
 if(b.length>1)return {value:null,note:"Ambiguous "+field.toLowerCase()+" in filename; choose manually.",warn:true};
 return {value:null,note:"No clear "+field.toLowerCase()+" detected; enter manually.",warn:true};
}
async function inspect(item,defaultGrade){
 const filename=item.file.name.replace(/[_-]/g," ");
 const notes=[],coverTexts=[];
 let pages=null;
 if(window.pdfjsLib){
   let pdf=null,task=null;
   try{
     window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
     task=window.pdfjsLib.getDocument({data:new Uint8Array(await item.file.arrayBuffer()),disableFontFace:true});
     pdf=await task.promise;pages=pdf.numPages;
     for(let p=1;p<=Math.min(2,pages);p++){
       const page=await pdf.getPage(p);
       const content=await page.getTextContent();
       coverTexts.push(content.items.map(x=>x.str||"").join(" "));
     }
   }catch(e){
     notes.push("PDF cover text could not be read"+(e.message?": "+e.message:"")+".");
   }finally{
     try{if(pdf)await pdf.destroy();else if(task)await task.destroy();}catch(_){}
   }
 }else notes.push("Automatic PDF text reading is unavailable; using filename only.");
 const cover=coverTexts.join(" ").slice(0,3600),coverTitle=coverTexts[0]||cover;
 const year=chooseUnique(possibleYears(coverTitle),possibleYears(filename),"Year");
 // Prefer explicit subject heading near the top of the cover; avoid mentions buried in question instructions.
 const subject=chooseUnique(detectSubject(cover.slice(0,550)),detectSubject(filename),"Subject");
 const paper=chooseUnique(detectPaper(cover.slice(0,900),false),detectPaper(filename,true),"Paper number");
 const grade=chooseUnique([detectGrade(cover.slice(0,1000))].filter(Boolean),[detectGrade(filename)].filter(Boolean),"Grade");
 item.subject=subject.value||"";
 item.year=year.value?String(year.value):"";
 item.paper=paper.value?"Paper "+paper.value:"";
 item.grade=grade.value||defaultGrade||"12";
 item.pageCount=pages;
 if(!subject.value)notes.push(subject.note);
 if(!year.value)notes.push(year.note);
 if(!paper.value)notes.push(paper.note);
 if(subject.warn&&subject.value)notes.push(subject.note);
 if(year.warn&&year.value)notes.push(year.note);
 if(paper.warn&&paper.value)notes.push(paper.note);
 if(grade.warn&&grade.value)notes.push(grade.note);
 if(!grade.value)notes.push("Grade defaulted to "+item.grade+"; check and correct if necessary.");
 if(item.subject&&item.paper&&item.year){
   const condition=/\bgce\b/i.test(filename+" "+cover.slice(0,450))?" GCE":
     /\bspecimen\b/i.test(filename+" "+cover.slice(0,450))?" Specimen":
     /\binternal\b/i.test(filename+" "+cover.slice(0,450))?" Internal":"";
   item.title=(item.subject+" "+item.year+" "+item.paper+condition).slice(0,180);
 }
 item.notes=notes;
 item.analyzed=true;
 item.status="ready";
}
function examVariant(title){
 const s=text(title).toLowerCase();
 if(/\bgce\b/.test(s))return "gce";
 if(/\bspecimen\b/.test(s))return "specimen";
 // Internal / School Certificate papers belong to the regular exam stream.
 return "regular";
}
function uniqueKey(item){
 const kind=text(item.type).trim().toLowerCase();
 const variant=kind==="past paper"?examVariant(item.title):text(item.title).trim().toLowerCase();
 return [text(item.subject).trim().toLowerCase(),text(item.grade).trim().toLowerCase().replace(/^grade\s*/,""),
   text(item.year),text(item.paper).trim().toLowerCase(),kind,variant].join("|");
}
function validate(item){
 const errors=[];
 if(!item.title.trim())errors.push("Enter a title.");
 if(!subjects.includes(item.subject))errors.push("Select the correct subject.");
 if(!item.grade.trim())errors.push("Enter the grade/form.");
 if(item.type==="Past paper"){
   const y=Number(item.year);
   if(!item.year||!Number.isInteger(y)||y<1980||y>new Date().getFullYear()+1)errors.push("Enter a valid exam year.");
   if(!papers.slice(1).includes(item.paper))errors.push("Select Paper 1, Paper 2 or Paper 3.");
   if(item.subject==="Science"&&item.paper==="Paper 3")errors.push("Science currently has Paper 1 and Paper 2 collections; choose the correct paper.");
   const match=item.title.match(/\bpaper[\s:-]*(0?[123])\b/i);
   if(match&&item.paper&&Number(match[1])!==Number(item.paper.slice(-1)))errors.push("Title and paper number disagree.");
   const titleYears=possibleYears(item.title);
   if(titleYears.length===1&&item.year&&Number(item.year)!==titleYears[0])errors.push("Title and year disagree.");
   const titleSubjects=detectSubject(item.title);
   if(titleSubjects.length===1&&item.subject&&titleSubjects[0]!==item.subject)errors.push("Title and subject disagree.");
 }
 if(item.access==="paid" && !(Number(item.price)>0))errors.push("Enter a price greater than K0 for a paid PDF.");
 return errors;
}
function wrapLabel(label,node,cls){
 const n=element("label",cls);
 n.append(document.createTextNode(label),node);
 return n;
}
function fieldInput(item,label,key,type,options,cls){
 const input=options?document.createElement("select"):document.createElement("input");
 input.value=text(item[key]);
 if(options){
   for(const [v,word] of options){
     const o=document.createElement("option");o.value=v;o.textContent=word;input.append(o);
   }
   input.value=text(item[key]);
 }else{
   input.type=type||"text";
   if(type==="number"){input.min=key==="year"?"1980":"0";input.max=key==="year"?"2100":"999999";}
   if(key==="title")input.maxLength=180;
   if(key==="grade")input.maxLength=40;
 }
 input.disabled=busy||item.status==="saved"||item.skip;
 input.setAttribute("aria-label",label+" for "+item.file.name);
 input.addEventListener("input",function(){item[key]=input.value;item.error="";});
 input.addEventListener("change",function(){
   item[key]=input.value;item.error="";
   if(key==="type"||key==="access")renderQueue();
 });
 return wrapLabel(label,input,cls);
}
function createRow(item,i){
 const box=element("article","bulk-item");box.dataset.status=item.status;
 const top=element("div","bulk-item-head");
 const nameBox=element("div");
 nameBox.append(element("div","bulk-file-title",(i+1)+". "+item.file.name));
 nameBox.append(element("div","bulk-file-meta",sizeOf(item.file.size)+(item.pageCount?" · "+item.pageCount+" pages":"")));
 top.append(nameBox);
 const state=element("span","bulk-item-status "+item.status,item.status==="saved"?"Saved as private draft":
   item.status==="analyzing"?"Reading PDF…":item.status==="uploading"?"Uploading…":
   item.status==="error"?"Upload failed":item.skip?"Skipped":"Ready to review");
 top.append(state);box.append(top);
 if(item.status!=="saved"){
   const fields=element("div","bulk-fields");
   fields.append(
     fieldInput(item,"Title","title","text",null,"bulk-wide"),
     fieldInput(item,"Subject","subject",null,[["","Choose subject"],...subjects.map(s=>[s,s])]),
     fieldInput(item,"Examination year","year","number"),
     fieldInput(item,"Paper number","paper",null,[["","Choose paper"],...papers.slice(1).map(p=>[p,p])]),
     fieldInput(item,"Grade / Form","grade","text"),
     fieldInput(item,"Resource type","type",null,types.map(t=>[t,t])),
     fieldInput(item,"Access","access",null,[["free","Free download"],["paid","Paid / enquiry"]])
   );
   if(item.access==="paid")fields.append(fieldInput(item,"Price (ZMW)","price","number"));
   box.append(fields);
   const notes=item.notes||[];
   const detection=element("div","bulk-detection"+(notes.length?" warn":" ok"),
     notes.length?notes.join(" "):"Information detected. Confirm every field against the paper before saving.");
   box.append(detection);
   const controls=element("div","bulk-item-bottom");
   const exception=wrapLabel("Skip this PDF (do not upload)",document.createElement("input"),"bulk-exception");
   const cb=exception.querySelector("input");cb.type="checkbox";cb.checked=Boolean(item.skip);cb.disabled=busy;
   cb.addEventListener("change",()=>{item.skip=cb.checked;item.error="";renderQueue();});
   controls.append(exception);
   const buttons=element("div");
   const preview=element("button","button secondary","Preview PDF ↗");preview.type="button";preview.disabled=busy;
   preview.addEventListener("click",function(){
     const url=URL.createObjectURL(item.file);
     window.open(url,"_blank","noopener,noreferrer");
     window.setTimeout(()=>URL.revokeObjectURL(url),120000);
   });
   const remove=element("button","button danger","Remove");remove.type="button";remove.disabled=busy;
   remove.addEventListener("click",function(){queue=queue.filter(x=>x!==item);renderQueue();});
   buttons.append(preview,document.createTextNode(" "),remove);
   controls.append(buttons);box.append(controls);
 }else{
   box.append(element("div","bulk-detection ok",
     [item.subject,item.year,item.paper,item.grade].filter(Boolean).join(" · ")+" · Ready for owner review in Saved resources."));
   const review=element("button","button secondary","Review and publish this draft →");
   review.type="button";
   review.addEventListener("click",function(){
     if(window.ZamBrightAdminReview)window.ZamBrightAdminReview(item.savedId);
     else $("material-list")?.scrollIntoView({behavior:"smooth"});
   });
   box.append(review);
 }
 if(item.error)box.append(element("div","bulk-detection fail",item.error));
 return box;
}
function renderQueue(){
 const list=$("bulk-items"),summary=$("bulk-summary");
 if(!list)return;
 list.replaceChildren();
 queue.forEach((item,index)=>list.append(createRow(item,index)));
 const waiting=queue.filter(q=>!q.skip&&q.status!=="saved");
 const completed=queue.filter(q=>q.status==="saved").length;
 if(summary)summary.textContent=queue.length
   ?queue.length+" selected · "+completed+" uploaded as drafts · "+waiting.length+" awaiting upload"+(analyzing?" · reading PDFs…":"")
   :"No PDFs selected yet. Choose multiple documents to begin.";
 const upload=$("bulk-start");if(upload)upload.disabled=busy||analyzing||!waiting.length;
 const clear=$("bulk-clear");if(clear)clear.disabled=busy||analyzing||!queue.length;
 const input=$("bulk-files");if(input)input.disabled=busy||analyzing;
 const defaults=$("bulk-default-grade");if(defaults)defaults.disabled=busy||analyzing;
}
async function addFiles(files){
 if(busy||analyzing)return;
 const chosen=Array.from(files||[]);
 if(!chosen.length)return;
 if(queue.length+chosen.length>maxFiles){
   status("A batch can contain up to "+maxFiles+" PDFs. Upload these first, then add another batch.","error");return;
 }
 const defaultGrade=($("bulk-default-grade")?.value||"12").trim();
 let added=0;
 for(const file of chosen){
   if(queue.some(x=>x.file.name===file.name&&x.file.size===file.size&&x.file.lastModified===file.lastModified))continue;
   const item={file,title:safeFilenameTitle(file.name),subject:"",year:"",paper:"",grade:defaultGrade,
     type:"Past paper",access:"free",price:"0",pageCount:null,notes:[],analyzed:false,
     status:"analyzing",skip:false,error:"",savedId:null};
   if(!/\.pdf$/i.test(file.name)&&file.type!=="application/pdf"){
     item.status="error";item.error="Only PDF documents are supported.";
   }else if(!file.size||file.size>maxFileBytes){
     item.status="error";item.error="Each PDF must be larger than 0 and no more than 50 MB.";
   }
   queue.push(item);added++;
 }
 $("bulk-files").value="";
 if(!added){status("Those PDFs are already in the selection.","error");return;}
 analyzing=true;renderQueue();
 status("Reading the PDF covers locally on your device. This can take longer for scanned files.");
 for(const item of queue.filter(x=>x.status==="analyzing")){
   try{await inspect(item,defaultGrade);}
   catch(err){item.status="ready";item.notes.push("Automatic detection failed: "+(err.message||"Please fill in the details manually."));}
   renderQueue();
 }
 analyzing=false;renderQueue();
 status("PDFs added. Check each subject, year, paper number, grade and exam stream (GCE, Internal or Specimen) in the title. Fix uncertain results before uploading. All uploads remain PRIVATE drafts.");
}
async function fetchExisting(){
 const all=[],step=250;
 for(let start=0;start<20000;start+=step){
   const res=await client.from("zambright_materials")
     .select("id,title,subject,grade,exam_year,paper_number,content_type,status")
     .order("created_at",{ascending:false}).order("id",{ascending:false}).range(start,start+step-1);
   if(res.error)throw res.error;
   all.push(...(res.data||[]));
   if((res.data||[]).length<step)break;
 }
 return all;
}
function duplicateMatches(item,records){
 const value=uniqueKey(item);
 return records.filter(record=>{
   const similar={
     subject:text(record.subject),grade:text(record.grade),
     year:text(record.exam_year||""),paper:text(record.paper_number),
     type:text(record.content_type)
   };
   return uniqueKey(similar)===value;
 });
}
async function startUpload(){
 if(busy||analyzing||!client)return;
 const target=queue.filter(i=>!i.skip&&i.status!=="saved");
 if(!target.length){status("There are no unsaved PDFs in the upload queue.");return;}
 let invalidCount=0;
 for(const item of target){
   const errors=[];
   if(item.error&&(/Only PDF|more than 50 MB|larger than 0/.test(item.error)))errors.push(item.error);
   errors.push(...validate(item));
   item.error=errors.join(" ");
   if(errors.length)invalidCount++;
 }
 if(invalidCount){
   renderQueue();status("Please correct "+invalidCount+" file"+(invalidCount===1?"":"s")+
     " marked with errors. All subjects, years and paper numbers must be checked before uploading.","error");
   return;
 }
 let existing;
 try{existing=await fetchExisting();}
 catch(err){status("Couldn't check for duplicates: "+(err.message||err)+". Nothing has been uploaded. Please try again.","error");return;}
 let foundDuplicates=0;
 const allTarget=target.slice();
 for(const item of allTarget){
   const matches=duplicateMatches(item,existing);
   const earlier=allTarget.filter(x=>x!==item&&allTarget.indexOf(x)<allTarget.indexOf(item)&&uniqueKey(x)===uniqueKey(item));
   if(matches.length||earlier.length){
     item.error="Possible duplicate: a paper with the same subject, grade, year, number and type already exists in the library or this batch. Remove/skip it or change the metadata if genuinely different.";
     foundDuplicates++;
   }else item.error="";
 }
 if(foundDuplicates){
   renderQueue();
   status("Upload paused: "+foundDuplicates+" possible duplicate"+(foundDuplicates===1?"":"s")+
     ". Please remove duplicates or correct the matching metadata before uploading. No files were uploaded.","error");
   return;
 }
 if(!window.confirm("Upload "+target.length+" PDF"+(target.length===1?"":"s")+
   " to ZamBright Academy as PRIVATE DRAFTS? Each paper must be reviewed and published before pupils can see it."))return;
 setControlsBusy(true);renderQueue();
 const progress=$("bulk-progress");
 if(progress){progress.hidden=false;progress.max=target.length;progress.value=0;}
 let completed=0,failures=0,finished=0;
 status("Uploading 0 of "+target.length+" PDFs…");
 for(const item of target){
   item.status="uploading";item.error="";renderQueue();
   let storagePath="";
   try{
     const folder=item.subject.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"other";
     storagePath="papers/"+folder+"/"+(item.year||"year-pending")+"/"+crypto.randomUUID()+".pdf";
     const upload=await client.storage.from(bucket).upload(storagePath,item.file,{
       contentType:"application/pdf",upsert:false
     });
     if(upload.error)throw upload.error;
     const row={
       title:item.title.trim(),subject:item.subject,grade:item.grade.trim(),topic:"",
       exam_year:item.year?Number(item.year):null,paper_number:item.paper||"",
       content_type:item.type,description:"",access_type:item.access,
       price_zmw:item.access==="paid"?Number(item.price||0):0,
       status:"draft",storage_path:storagePath,branding_checked:false,
       page_order_checked:false,diagrams_checked:false,answers_checked:false,
       file_size_bytes:item.file.size,page_count:item.pageCount||null
     };
     const saved=await client.from("zambright_materials").insert(row).select("id").single();
     if(saved.error)throw saved.error;
     item.savedId=saved.data.id;item.status="saved";completed++;
     existing.push({...row,id:item.savedId});
     storagePath="";
   }catch(err){
     if(storagePath){
       try{await client.storage.from(bucket).remove([storagePath]);}catch(_){}
     }
     item.status="error";item.error="Upload failed: "+(err.message||String(err))+". You may retry this file.";
     failures++;
   }
   finished++;if(progress)progress.value=finished;
   renderQueue();
   status("Processed "+finished+" of "+target.length+" · "+completed+" saved as drafts · "+failures+
     " failed"+(failures?" (failed rows can be retried)":"")+".",failures?"error":null);
 }
 setControlsBusy(false);renderQueue();
 if(completed&&onSaved){
   try{await onSaved();}catch(err){status("PDF uploads completed, but the Saved resources list couldn't refresh. Refresh the dashboard to see them. "+(err.message||""),"error");}
 }
 const finish=$("bulk-finish");if(finish){
   finish.hidden=!completed;
   finish.textContent=completed+" PDF"+(completed===1?"":"s")+
     " saved privately. Scroll to Saved resources and use Review checklist to publish after checking each document. "+
     (failures?failures+" failed and can be retried.":"");
 }
 if(completed){
   status(completed+" PDF"+(completed===1?"":"s")+" saved as PRIVATE DRAFTS. "+
     (failures?failures+" failed; correct the errors and click Upload again. ":"")+
     "They will not appear on the public site until individually reviewed and published.",failures?"error":"ok");
 }
}
function clearQueue(){
 if(busy||analyzing||!queue.length)return;
 if(queue.some(i=>i.status!=="saved")&&!window.confirm("Clear the selection? Uploaded drafts will remain saved in ZamBright Academy."))return;
 queue=[];$("bulk-files").value="";renderQueue();
 const done=$("bulk-finish");if(done)done.hidden=true;
 const progress=$("bulk-progress");if(progress)progress.hidden=true;
 status("Queue cleared. Saved drafts remain available in Saved resources.");
}
function mount(api,afterSave){
 client=api;onSaved=afterSave;
 if(started)return;
 started=true;
 const fileInput=$("bulk-files");
 if(fileInput)fileInput.addEventListener("change",()=>addFiles(fileInput.files));
 $("bulk-start")?.addEventListener("click",startUpload);
 $("bulk-clear")?.addEventListener("click",clearQueue);
 renderQueue();
}
function unmount(){
 client=null;onSaved=null;queue=[];busy=false;analyzing=false;
 const files=$("bulk-files");if(files)files.value="";
 const finish=$("bulk-finish");if(finish)finish.hidden=true;
 const progress=$("bulk-progress");if(progress)progress.hidden=true;
 renderQueue();
 status("Sign in as the ZamBright Academy administrator to upload papers.");
}
window.ZamBrightBulkUploader={mount,unmount};
})();