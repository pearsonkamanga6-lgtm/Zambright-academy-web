/* ZamBright Academy secure owner dashboard. Permissions are enforced in Supabase RLS. */
(function () {
 "use strict";
 const config = window.ZAMBRIGHT_CONFIG || {};
 const $ = (id) => document.getElementById(id);
 const setup = $("setup"), loginPanel = $("login-panel"), dashboard = $("dashboard"), signOut = $("sign-out");
 const message = $("message");
 let client = null;
 let cache = {materials:[],posts:[],links:[]};
 const filesBucket = "zambright-materials";

 // Read the first page of a text-based exam PDF. If the year is ambiguous, ask for a manual check.
 async function detectExamYear(file){
   function findYears(text){
     return [...new Set([...String(text).matchAll(/\b(?:19[89]\d|20[0-3]\d)\b/g)]
       .map(match=>Number(match[0])).filter(year=>year<=new Date().getFullYear()+1))];
   }
   const fileYears=findYears(file.name.replace(/[_-]/g," "));
   if(!window.pdfjsLib){
     return fileYears.length===1 ? {year:fileYears[0],source:"filename"} : {year:null,reason:"Automatic PDF reading is unavailable. Enter the examination year manually."};
   }
   try {
     window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
     const task=window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())});
     let pdf;
     try{
       pdf=await task.promise;
       const page=await pdf.getPage(1);
       const text=await page.getTextContent();
       const coverYears=findYears(text.items.map(item=>item.str||"").join(" "));
       if(coverYears.length>1)return {year:null,reason:"Several years appear on the cover. Enter the actual examination year yourself."};
       if(coverYears.length===1)return {year:coverYears[0],source:"PDF cover"};
       if(fileYears.length===1)return {year:fileYears[0],source:"filename"};
       return {year:null,reason:"No readable year found on the PDF cover. Scanned papers may need manual entry."};
     }finally{
       if(pdf)await pdf.destroy().catch(()=>{});
       else await task.destroy().catch(()=>{});
     }
   }catch(error){
     console.warn("Could not read PDF examination year",error);
     return fileYears.length===1?{year:fileYears[0],source:"filename"}:{year:null,reason:"Could not read the PDF year. Enter the examination year manually."};
   }
 }
 function yearFeedback(message,warning){
   const node=$("year-detection");if(!node)return;
   node.textContent=message;node.classList.toggle("warning",Boolean(warning));
 }


 function notify(text, type) {
   message.textContent = text;
   message.className = "status" + (type === "error" ? " error" : type === "ok" ? " ok" : "");
 }
 function sayError(error){notify(error && error.message ? error.message : String(error),"error");}
 function publishMessage(message,kind,scroll){
   const box=$("publish-feedback");if(!box)return;
   box.replaceChildren();
   if(!message){box.hidden=true;return;}
   box.hidden=false;box.className="publish-feedback"+(kind?" "+kind:"");
   box.textContent=message;
   if(scroll)box.scrollIntoView({behavior:"smooth",block:"center"});
 }
 function safe(s){return s == null ? "" : String(s);}
 function field(form, name){return form.elements.namedItem(name);}
 function val(form,name){return safe(field(form,name).value).trim();}
 function clean(form){form.reset();if(field(form,"id"))field(form,"id").value="";if(field(form,"storage_path"))field(form,"storage_path").value="";if(form.id==="material-form" && $("chosen-pdf")){$("chosen-pdf").textContent="No PDF selected yet. Tap Choose File to select your PDF.";yearFeedback("Choose a PDF to look for its examination year, or enter the year manually.",false);}}
 function renderTag(name,content,cls){const e=document.createElement(name);if(content!==undefined)e.textContent=safe(content);if(cls)e.className=cls;return e;}
 function setBusy(form,busy){const b=form.querySelector('[type="submit"]');b.disabled=busy;b.textContent=busy?"Saving…":b.dataset.originalLabel||"Save";}
 function setBusyName(form){const b=form.querySelector('[type="submit"]');b.dataset.originalLabel=b.textContent;}
 function showTab(tab){
   document.querySelectorAll("[data-tab]").forEach((b)=>b.setAttribute("aria-selected",String(b.dataset.tab===tab)));
   document.querySelectorAll(".tab-page").forEach((p)=>p.classList.toggle("hidden",p.id!=="tab-"+tab));
 }

 function sciencePaperNum(text){
   const v=String(text||"").trim().toLowerCase();
   if(/^(?:paper\s*(?:0*1|one)|0*1)$/.test(v))return 1;
   if(/^(?:paper\s*(?:0*2|two)|0*2)$/.test(v))return 2;
   return null;
 }
 function scienceCollectionUrl(resource){
   if(resource.subject!=="Science"||resource.content_type!=="Past paper")return null;
   const num=sciencePaperNum(resource.paper_number);
   return num?"index.html?view=science&paper="+num:"index.html?view=science";
 }
 function syncScienceSelector(){
   const form=$("material-form"),panel=$("science-paper-selector-wrap"),select=$("science-paper-selector");
   if(!form||!panel||!select)return;
   const isScience=val(form,"subject")==="Science"&&val(form,"content_type")==="Past paper";
   panel.hidden=!isScience;
   select.required=isScience;
   select.value=isScience?(sciencePaperNum(val(form,"paper_number"))?"Paper "+sciencePaperNum(val(form,"paper_number")):""):"";
 }
  function validateUrl(s) {
   try {const u=new URL(s);return u.protocol==="https:" ? u.href : null;} catch(_) {return null;}
 }
 function configReady(){
   if(!window.supabase || !window.supabase.createClient || !config.supabaseUrl || !config.supabasePublishableKey) return false;
   return Boolean(validateUrl(config.supabaseUrl));
 }
 async function checkAdmin(){
   const u=await client.auth.getUser();
   if(u.error || !u.data.user) return false;
   const res=await client.from("zambright_admins").select("user_id").eq("user_id",u.data.user.id).maybeSingle();
   if(res.error) throw res.error;
   if(!res.data) return false;
   $("admin-email").textContent = u.data.user.email || "Owner";
   return true;
 }
 async function showAuthenticated(){
   if(await checkAdmin()){
     loginPanel.classList.add("hidden");
     dashboard.classList.remove("hidden");
     signOut.classList.remove("hidden");
     showTab("materials");
     notify("Owner access verified. Select your PDF in STEP 1 below, then choose its subject and publishing status.","ok");
     await Promise.all([loadRecords("materials"),loadRecords("posts"),loadRecords("links")]);
   } else {
     dashboard.classList.add("hidden");
     loginPanel.classList.remove("hidden");
     signOut.classList.remove("hidden");
     notify("This account is signed in but has not been granted ZamBright owner permissions. Add its user UUID to zambright_admins in the Supabase SQL Editor.","error");
   }
 }
 async function loadRecords(kind){
   const info = {
     materials:["zambright_materials","material-list"],
     posts:["zambright_posts","post-list"],
     links:["zambright_links","link-list"]
   }[kind];
   if(!info)return;
   const res=await client.from(info[0]).select("*").order("created_at",{ascending:false}).limit(300);
   if(res.error){sayError(res.error);return;}
   cache[kind]=res.data||[];
   drawRecords(kind,info[1]);
 }
 function drawRecords(kind,targetId){
   const holder=$(targetId);holder.replaceChildren();
   const rows=(cache[kind]||[]).slice();
   if(kind==="materials")rows.sort((a,b)=>(Number(b.exam_year)||0)-(Number(a.exam_year)||0)||String(a.subject).localeCompare(String(b.subject))||String(a.title).localeCompare(String(b.title)));
   if(!rows.length){holder.append(renderTag("p","Nothing saved here yet. Create your first "+(kind==="materials"?"paper":kind==="posts"?"article":"link")+" above."));return;}
   let lastYear=null;
   rows.forEach(function(row){
     if(kind==="materials"){
       const y=row.exam_year?String(row.exam_year):"Missing year";
       if(y!==lastYear){
         holder.append(renderTag("h3",row.exam_year?"Examination year "+y:"Year not yet recorded","form-subhead"));
         lastYear=y;
       }
     }
     const container=renderTag("article",undefined,"entry");
     const top=renderTag("h3",row.title || row.name);
     top.append(renderTag("span",row.status==="published"?"Published — visible to visitors":row.status==="review"?"Under review — PRIVATE":"Draft — PRIVATE, not on website","badge"));
     container.append(top);
     const details=kind==="materials" ?
       [row.subject,row.grade,row.exam_year,row.paper_number,row.content_type,row.access_type==="paid"?"K"+Number(row.price_zmw).toFixed(2):"Free"].filter(Boolean).join(" · ") :
       kind==="posts"?row.category:row.category + (row.is_affiliate?" · Affiliate":"");
     container.append(renderTag("p",details,"meta"));
     if(kind!=="materials"){
       container.append(renderTag("p", (kind==="posts"?row.body:row.description).slice(0,190)));
     }else if(row.description){container.append(renderTag("p",row.description));}
     const actions=renderTag("div",undefined,"buttons");
     const edit=renderTag("button","Edit","button secondary");edit.type="button";edit.addEventListener("click",function(){editRecord(kind,row);});
     actions.append(edit);
     if(kind==="materials"){
       if(row.status!=="published"){
         const publish=renderTag("button","Review checklist to publish →","button gold");
         publish.type="button";
         publish.addEventListener("click",function(){
           editRecord("materials",row);
           field($("material-form"),"status").value="published";
           notify("This paper is still PRIVATE. Select Published, check the four review items, then click Save or Publish PDF.");
           const checks=$("material-form").querySelector(".checks");
           publishMessage("NOT PUBLISHED YET: Review the PDF, tick the four quality checks after verifying them, and then press Save or Publish PDF. The Review & Publish button only opens the publishing form.",null,true);
         });
         actions.append(publish);
       }else{
         const publicLink=renderTag("a","View on live website ↗","button secondary");
         publicLink.href=scienceCollectionUrl(row)||"index.html?subject="+encodeURIComponent(row.subject)+"#library";
         publicLink.target="_blank";
         publicLink.rel="noopener noreferrer";
         actions.append(publicLink);
       }
     }
     if(kind==="materials"&&row.storage_path){
       const preview=renderTag("button","Open PDF","button secondary");
       preview.type="button";preview.addEventListener("click",async function(){
         preview.disabled=true;
         try{
           const signed=await client.storage.from(filesBucket).createSignedUrl(row.storage_path,120);
           if(signed.error)throw signed.error;
           window.open(signed.data.signedUrl,"_blank","noopener,noreferrer");
         }catch(err){sayError(err);}finally{preview.disabled=false;}
       });actions.append(preview);
     }
     const remove=renderTag("button","Delete","button danger");remove.type="button";
     remove.addEventListener("click",function(){removeRecord(kind,row);});actions.append(remove);
     container.append(actions);holder.append(container);
   });
 }
 function editRecord(kind,row){
   showTab(kind);
   const form=$(kind==="materials"?"material-form":kind==="posts"?"post-form":"link-form");
   const common=kind==="materials" ? ["id","title","subject","grade","topic","exam_year","paper_number","content_type","access_type","price_zmw","status","storage_path","description"] :
     kind==="posts"?["id","title","category","body","status"]:["id","name","url","category","status","description"];
   common.forEach(function(k){const f=field(form,k);if(f)f.value = row[k] === null ? "" : row[k];});
   if(kind==="materials"){
     syncScienceSelector();
     ["branding_checked","page_order_checked","diagrams_checked","answers_checked"].forEach(k=>field(form,k).checked=Boolean(row[k]));
     publishMessage(row.status==="published"?"This paper is already published. Save to update it.":"This paper is still PRIVATE. Review it, check all four items, select Published, and press Save or Publish PDF.",null,false);
     yearFeedback(row.exam_year?"Saved examination year: "+row.exam_year+". You may correct it by editing the year field.":"No examination year is saved for this paper. Please enter the correct year from its cover.",!row.exam_year);
   }
   if(kind==="links")field(form,"is_affiliate").value=row.is_affiliate?"yes":"no";
   form.scrollIntoView({behavior:"smooth",block:"start"});
   notify("Editing: "+(row.title||row.name)+(kind==="materials"&&row.status!=="published" ? ". This paper is PRIVATE. Select Published, finish the four review checks, then Save or Publish PDF to make it appear on the website." : ". Save changes when ready."));
 }
 async function removeRecord(kind,row){
   if(!window.confirm("Permanently delete '"+(row.title||row.name)+"'? This cannot be undone."))return;
   const table={materials:"zambright_materials",posts:"zambright_posts",links:"zambright_links"}[kind];
   try{
     const res=await client.from(table).delete().eq("id",row.id);
     if(res.error)throw res.error;
     let warning="";
     if(kind==="materials"&&row.storage_path){
       const del=await client.storage.from(filesBucket).remove([row.storage_path]);
       if(del.error)warning=" The file may remain in storage. Please inspect the storage bucket.";
     }
     notify("Deleted successfully."+warning,warning?"error":"ok");
     await loadRecords(kind);
   }catch(e){sayError(e);}
 }
 async function saveMaterial(event){
   event.preventDefault();
   const form=event.currentTarget;const id=val(form,"id");let storagePath=val(form,"storage_path");
   const file=field(form,"file").files[0];
   if(!storagePath && !file){notify("Select a PDF before creating a new resource.","error");return;}
   if(file && !(file.type==="application/pdf" || /\.pdf$/i.test(file.name))){notify("Only PDF files are supported.","error");return;}
   if(file && file.size>50*1024*1024){notify("This file exceeds the 50 MB upload limit.","error");return;}
   const status=val(form,"status"),access=val(form,"access_type"),price=Number(val(form,"price_zmw")||0);
   const checks=["branding_checked","page_order_checked","diagrams_checked","answers_checked"];
   if(status==="published"&&val(form,"subject")==="Science"&&val(form,"content_type")==="Past paper"&&!sciencePaperNum(val(form,"paper_number"))){
     const msg="Science past papers must be assigned to Paper 1 or Paper 2. Select the correct Science paper collection before publishing.";
     notify(msg,"error");publishMessage(msg,"error",true);return;
   }
   const yearRaw=val(form,"exam_year");
   if(status==="published" && val(form,"content_type")==="Past paper" && !yearRaw){
     const msg="Enter the examination year shown on the PDF (for example 2011). A past paper cannot be published without its year.";
     notify(msg,"error");publishMessage(msg,"error",true);yearFeedback(msg,true);return;
   }
   if(status==="published"&&!checks.every(k=>field(form,k).checked)){
     const missing=checks.filter(k=>!field(form,k).checked).map(k=>field(form,k).parentElement.textContent.trim());
     const msg="NOT PUBLISHED: Check these items after reviewing your PDF: "+missing.join("; ")+". Then press Save or Publish PDF.";
     notify(msg,"error");publishMessage(msg,"error",true);return;
   }
   if(access==="paid" && !(price>0)){notify("Enter a valid price greater than K0 for paid materials.","error");return;}
   if(status==="published"&&!window.confirm("Publish this reviewed paper to the public website now?")){publishMessage("Publication cancelled. The paper is still private.","error",true);return;}
   const data={
     title:val(form,"title"),subject:val(form,"subject"),grade:val(form,"grade"),topic:val(form,"topic"),
     exam_year:val(form,"exam_year")?Number(val(form,"exam_year")):null,
     paper_number:val(form,"paper_number"),content_type:val(form,"content_type"),
     description:val(form,"description"),access_type:access,price_zmw:access==="free"?0:price,
     status:status,storage_path:storagePath
   };
   checks.forEach(k=>data[k]=field(form,k).checked);
   let newPath=null;
   setBusy(form,true);
   try{
     if(file){
       const folder=String(data.subject).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"other";
       newPath="papers/"+folder+"/"+(data.exam_year||"year-pending")+"/"+crypto.randomUUID()+".pdf";
       const upload=await client.storage.from(filesBucket).upload(newPath,file,{contentType:"application/pdf",upsert:false});
       if(upload.error)throw upload.error;
       data.storage_path=newPath;
     }
     const res=id?await client.from("zambright_materials").update(data).eq("id",id).select("id").single():
       await client.from("zambright_materials").insert(data).select("id").single();
     if(res.error)throw res.error;
     if(newPath && storagePath && storagePath!==newPath){
       const removal=await client.storage.from(filesBucket).remove([storagePath]);
       if(removal.error)console.warn("Old PDF needs storage cleanup",removal.error);
     }
     clean(form);notify("Resource saved as "+status+". It will "+(status==="published"?"appear in the public library under "+data.subject+".":"remain private until you publish it.") ,"ok");
     if(status==="published"){
       const siteLink=renderTag("a"," View "+data.subject+" on public website ↗");
       siteLink.href=scienceCollectionUrl(data)||"index.html?subject="+encodeURIComponent(data.subject)+"#library";
       siteLink.target="_blank";siteLink.rel="noopener noreferrer";
       siteLink.style.display="inline-block";siteLink.style.marginTop="6px";siteLink.style.fontWeight="bold";
       message.append(siteLink);
     }
     await loadRecords("materials");
     publishMessage(status==="published"?"SUCCESS: "+data.title+" is published to the public "+data.subject+" library.":"Saved as a private draft. Visitors cannot see it yet.","ok",true);
     if(status==="published"){
       const target=$("publish-feedback");
       if(target){
         const link=document.createElement("a");
         link.href=scienceCollectionUrl(data)||"index.html?subject="+encodeURIComponent(data.subject)+"#library";
         link.target="_blank";link.rel="noopener noreferrer";
         link.textContent=" Open the public "+data.subject+" library ↗";
         target.append(document.createElement("br"),link);
       }
     }
     if(status==="published"){const preview=$("site-preview");if(preview)preview.src="index.html#library";}
   }catch(e){
     if(newPath){await client.storage.from(filesBucket).remove([newPath]).catch(()=>{});}
     sayError(e);
     publishMessage("Save failed: "+(e && e.message ? e.message : String(e))+". The paper has not been published.","error",true);
   }finally{setBusy(form,false);}
 }
 async function savePost(e){
   e.preventDefault();const form=e.currentTarget;setBusy(form,true);
   try{
     const id=val(form,"id");
     const data={title:val(form,"title"),category:val(form,"category"),body:val(form,"body"),status:val(form,"status")};
     const r=id?await client.from("zambright_posts").update(data).eq("id",id).select("id").single():await client.from("zambright_posts").insert(data).select("id").single();
     if(r.error)throw r.error;
     clean(form);notify("Article saved successfully.","ok");await loadRecords("posts");
   }catch(err){sayError(err);}finally{setBusy(form,false);}
 }
 async function saveLink(e){
   e.preventDefault();const form=e.currentTarget;
   const url=validateUrl(val(form,"url"));
   if(!url){notify("Enter a full, verified HTTPS URL.","error");return;}
   setBusy(form,true);
   try{
     const id=val(form,"id");
     const data={name:val(form,"name"),url,category:val(form,"category"),description:val(form,"description"),status:val(form,"status"),is_affiliate:val(form,"is_affiliate")==="yes"};
     const r=id?await client.from("zambright_links").update(data).eq("id",id).select("id").single():await client.from("zambright_links").insert(data).select("id").single();
     if(r.error)throw r.error;
     clean(form);notify("Partner link saved successfully.","ok");await loadRecords("links");
   }catch(err){sayError(err);}finally{setBusy(form,false);}
 }
 async function start(){
   ["material-form","post-form","link-form"].forEach(id=>setBusyName($(id)));
   if(!configReady()){setup.classList.remove("hidden");notify("Owner setup is incomplete. Create and connect a Supabase project before signing in.");return;}
   try{client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);}
   catch(err){setup.classList.remove("hidden");sayError(err);return;}
   $("login-form").addEventListener("submit",async function(e){
     e.preventDefault();const f=e.currentTarget;const btn=f.querySelector("button");btn.disabled=true;
     try{
       const r=await client.auth.signInWithPassword({email:val(f,"email"),password:val(f,"password")});
       if(r.error)throw r.error;
       await showAuthenticated();
     }catch(err){sayError(err);}finally{btn.disabled=false;field(f,"password").value="";}
   });
   signOut.addEventListener("click",async function(){
     const r=await client.auth.signOut();
     if(r.error){sayError(r.error);return;}
     dashboard.classList.add("hidden");loginPanel.classList.remove("hidden");signOut.classList.add("hidden");
     notify("Signed out.");
   });
   document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
   document.querySelectorAll("[data-go-tab]").forEach(b=>b.addEventListener("click",()=>{showTab(b.dataset.goTab);window.scrollTo({top:0,behavior:"smooth"});}));
   const pdfInput=$("pdf-file"), uploadedStatus=$("chosen-pdf"), uploadPanel=$("upload-panel");
   let latestSelection=0;
   if(pdfInput)pdfInput.addEventListener("change",async ()=>{
     const file=pdfInput.files && pdfInput.files[0];
     const selection=++latestSelection;
     uploadedStatus.textContent=file ? "Selected: "+file.name+" ("+(file.size/1024/1024).toFixed(2)+" MB). Complete steps 2 and 3 below." : "No PDF selected yet.";
     if(!file){yearFeedback("Choose a PDF, or type the examination year manually.",false);return;}
     if(!(file.type==="application/pdf" || /\.pdf$/i.test(file.name))){yearFeedback("Only PDF files are supported.",true);return;}
     yearFeedback("Checking the first page for its examination year…",false);
     const previousYear=val($("material-form"),"exam_year");
     const result=await detectExamYear(file);
     if(selection!==latestSelection)return;
     if(result.year){
       if(!previousYear && !val($("material-form"),"exam_year")){
         field($("material-form"),"exam_year").value=String(result.year);
         yearFeedback("Detected "+result.year+" from the "+result.source+". Please verify it against the exam cover before publishing.",false);
       }else{
         yearFeedback("Detected "+result.year+" from the "+result.source+". Your existing year entry was kept — verify which is correct.",false);
       }
     }else yearFeedback(result.reason,true);
   });
   const yearInput=field($("material-form"),"exam_year");
   yearInput.addEventListener("input",function(){
     if(this.value)yearFeedback("Examination year set to "+this.value+". Please confirm this matches the cover before publishing.",false);
   });
   function openUploader(openFilePicker){
     showTab("materials");
     uploadPanel.scrollIntoView({behavior:"smooth",block:"start"});
     if(openFilePicker && pdfInput)pdfInput.click();
   }
   const quickUpload=$("quick-upload");
   if(quickUpload)quickUpload.addEventListener("click",()=>openUploader(true));
   const sciencePreset=$("science-preset");
   if(sciencePreset)sciencePreset.addEventListener("click",()=>{
     clean($("material-form"));
     const form=$("material-form");
     field(form,"title").value="Science Paper 1";
     field(form,"subject").value="Science";
     field(form,"paper_number").value="Paper 1";
     field(form,"content_type").value="Past paper";
     field(form,"access_type").value="free";
     field(form,"status").value="draft";
     syncScienceSelector();
     notify("Science Paper 1 is selected. Choose the PDF file, enter the actual grade and year, then save it as a draft or publish after reviewing the checklist.");
     openUploader(true);
   });
   const science2Preset=$("science-2-preset");
   if(science2Preset)science2Preset.addEventListener("click",()=>{
     clean($("material-form"));
     const form=$("material-form");
     field(form,"title").value="Science Paper 2";
     field(form,"subject").value="Science";
     field(form,"paper_number").value="Paper 2";
     field(form,"content_type").value="Past paper";
     field(form,"access_type").value="free";
     field(form,"status").value="draft";
     syncScienceSelector();
     notify("Science Paper 2 selected. Choose the actual examination PDF and confirm its year before publishing.");
     openUploader(true);
   });
   const materialsForm=$("material-form");
   field(materialsForm,"subject").addEventListener("change",syncScienceSelector);
   field(materialsForm,"content_type").addEventListener("change",syncScienceSelector);
   field(materialsForm,"paper_number").addEventListener("input",syncScienceSelector);
   const scienceSelector=$("science-paper-selector");
   if(scienceSelector)scienceSelector.addEventListener("change",()=>{
     if(scienceSelector.value)field(materialsForm,"paper_number").value=scienceSelector.value;
   });
   syncScienceSelector();
   const refreshPreview=$("refresh-preview");
   if(refreshPreview)refreshPreview.addEventListener("click",()=>{const iframe=$("site-preview");if(iframe)iframe.src="index.html";});
   document.querySelectorAll("[data-refresh]").forEach(b=>b.addEventListener("click",()=>loadRecords(b.dataset.refresh)));
   $("material-form").addEventListener("submit",saveMaterial);
   field($("material-form"),"status").addEventListener("change",function(){
     publishMessage(this.value==="published"?"Published is selected, but you must review and tick all four checklist items, then click Save or Publish PDF.":"This paper will stay private until you select Published and save.",null,false);
   });
   $("post-form").addEventListener("submit",savePost);
   $("link-form").addEventListener("submit",saveLink);
   $("material-clear").addEventListener("click",()=>{clean($("material-form"));syncScienceSelector();});
   $("post-clear").addEventListener("click",()=>clean($("post-form")));
   $("link-clear").addEventListener("click",()=>clean($("link-form")));
   if(window.location.hash==="#upload")showTab("materials");
   const session=await client.auth.getSession();
   if(session.error){sayError(session.error);loginPanel.classList.remove("hidden");return;}
   if(session.data.session){
     try{await showAuthenticated();}catch(err){sayError(err);loginPanel.classList.remove("hidden");}
   }else{loginPanel.classList.remove("hidden");}
 }
 start();
})();