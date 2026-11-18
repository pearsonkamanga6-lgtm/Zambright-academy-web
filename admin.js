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

 function notify(text, type) {
   message.textContent = text;
   message.className = "status" + (type === "error" ? " error" : type === "ok" ? " ok" : "");
 }
 function sayError(error){notify(error && error.message ? error.message : String(error),"error");}
 function safe(s){return s == null ? "" : String(s);}
 function field(form, name){return form.elements.namedItem(name);}
 function val(form,name){return safe(field(form,name).value).trim();}
 function clean(form){form.reset();if(field(form,"id"))field(form,"id").value="";if(field(form,"storage_path"))field(form,"storage_path").value="";}
 function renderTag(name,content,cls){const e=document.createElement(name);if(content!==undefined)e.textContent=safe(content);if(cls)e.className=cls;return e;}
 function setBusy(form,busy){const b=form.querySelector('[type="submit"]');b.disabled=busy;b.textContent=busy?"Saving…":b.dataset.originalLabel||"Save";}
 function setBusyName(form){const b=form.querySelector('[type="submit"]');b.dataset.originalLabel=b.textContent;}
 function showTab(tab){
   document.querySelectorAll("[data-tab]").forEach((b)=>b.setAttribute("aria-selected",String(b.dataset.tab===tab)));
   document.querySelectorAll(".tab-page").forEach((p)=>p.classList.toggle("hidden",p.id!=="tab-"+tab));
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
     notify("Owner access verified. Your drafts and uploads are private.","ok");
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
   const rows=cache[kind]||[];
   if(!rows.length){holder.append(renderTag("p","Nothing saved here yet. Create your first "+(kind==="materials"?"paper":kind==="posts"?"article":"link")+" above."));return;}
   rows.forEach(function(row){
     const container=renderTag("article",undefined,"entry");
     const top=renderTag("h3",row.title || row.name);
     top.append(renderTag("span",row.status,"badge"));
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
   if(kind==="materials")["branding_checked","page_order_checked","diagrams_checked","answers_checked"].forEach(k=>field(form,k).checked=Boolean(row[k]));
   if(kind==="links")field(form,"is_affiliate").value=row.is_affiliate?"yes":"no";
   form.scrollIntoView({behavior:"smooth",block:"start"});
   notify("Editing: "+(row.title||row.name)+". Save changes when ready.");
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
   if(status==="published"&&!checks.every(k=>field(form,k).checked)){notify("Complete all four review checks before publishing.","error");return;}
   if(access==="paid" && !(price>0)){notify("Enter a valid price greater than K0 for paid materials.","error");return;}
   if(status==="published"&&!window.confirm("Publish this resource to the public website now?"))return;
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
       newPath="papers/"+crypto.randomUUID()+".pdf";
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
     clean(form);notify("Resource saved as "+status+". It will "+(status==="published"?"appear in the public library.":"remain private.") ,"ok");
     await loadRecords("materials");
   }catch(e){
     if(newPath){await client.storage.from(filesBucket).remove([newPath]).catch(()=>{});}
     sayError(e);
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
   document.querySelectorAll("[data-refresh]").forEach(b=>b.addEventListener("click",()=>loadRecords(b.dataset.refresh)));
   $("material-form").addEventListener("submit",saveMaterial);
   $("post-form").addEventListener("submit",savePost);
   $("link-form").addEventListener("submit",saveLink);
   $("material-clear").addEventListener("click",()=>clean($("material-form")));
   $("post-clear").addEventListener("click",()=>clean($("post-form")));
   $("link-clear").addEventListener("click",()=>clean($("link-form")));
   const session=await client.auth.getSession();
   if(session.error){sayError(session.error);loginPanel.classList.remove("hidden");return;}
   if(session.data.session){
     try{await showAuthenticated();}catch(err){sayError(err);loginPanel.classList.remove("hidden");}
   }else{loginPanel.classList.remove("hidden");}
 }
 start();
})();