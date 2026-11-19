/* ZamBright Academy: authenticated question bank editor. Supabase RLS enforces owner permissions. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const section=$("tab-questions");
if(!section)return;
const config=window.ZAMBRIGHT_CONFIG||{};
let client=null,rows=[],busy=false,initialized=false;
const form=$("question-form");
function field(name){return form.elements.namedItem(name);}
function value(name){const f=field(name);return f?String(f.value||"").trim():"";}
function node(tag,cls,text){
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text!==undefined)el.textContent=String(text);
 return el;
}
function feedback(message,error){
 const box=$("question-admin-feedback");
 box.textContent=message;
 box.className="status"+(error?" error":" ok");
 box.hidden=false;
}
function setBusy(flag){
 busy=flag;
 const submit=$("question-save");
 submit.disabled=flag;submit.textContent=flag?"Saving question…":"Save question";
}
function updateOptions(){
 const multi=value("question_type")==="multiple_choice";
 $("question-mc-fields").hidden=!multi;
 for(const k of ["option_a","option_b","option_c","option_d","correct_option"])field(k).required=multi;
}
function emptyForm(){
 form.reset();
 field("id").value="";
 field("question_type").value="short_answer";
 field("difficulty").value="medium";
 field("status").value="draft";
 field("grade").value="Form 1";
 field("subject").value="Physics";
 field("source_label").value="ZamBright original practice question";
 field("verified").checked=false;
 updateOptions();
 $("question-save").textContent="Save new question";
 feedback("New question. Drafts remain private until reviewed and published.",false);
}
function loadIntoForm(r){
 ["id","subject","grade","topic","competency","question_text","question_type","option_a","option_b","option_c","option_d",
   "correct_option","model_answer","explanation","difficulty","source_label","status"].forEach(k=>{
     const el=field(k);if(el)el.value=r[k]===null?"":String(r[k]||"");
   });
 field("verified").checked=Boolean(r.verified);
 updateOptions();
 feedback("Editing "+r.subject+" · "+r.grade+" · "+r.topic+". Review the question, answer and explanation before publication.",false);
 $("question-form").scrollIntoView({behavior:"smooth",block:"start"});
}
function readForm(){
 const output={
   subject:value("subject"),grade:value("grade"),topic:value("topic"),competency:value("competency"),
   question_text:value("question_text"),question_type:value("question_type"),
   option_a:value("option_a"),option_b:value("option_b"),option_c:value("option_c"),option_d:value("option_d"),
   correct_option:value("question_type")==="multiple_choice"?value("correct_option"):null,
   model_answer:value("model_answer"),explanation:value("explanation"),difficulty:value("difficulty"),
   source_label:value("source_label")||"ZamBright original practice question",
   status:value("status"),verified:field("verified").checked
 };
 if(output.question_type!=="multiple_choice"){
   output.option_a="";output.option_b="";output.option_c="";output.option_d="";
 }
 return output;
}
function isValid(data){
 if(!data.topic||!data.grade||!data.subject)return "Enter the subject, grade/form and topic.";
 if(data.question_text.length<12)return "Enter the complete question, including its context or scenario.";
 if(data.model_answer.length<2||data.explanation.length<8)return "Provide a complete model answer and a meaningful explanation.";
 if(data.question_type==="multiple_choice"){
   if(!["A","B","C","D"].includes(data.correct_option))return "Choose the correct multiple-choice option.";
   if(![data.option_a,data.option_b,data.option_c,data.option_d].every(Boolean))return "Enter all four multiple-choice options.";
 }
 if(data.status==="published"&&!data.verified)return "Check the Verified box only after checking the answer, explanation, and syllabus alignment. Publishing unverified questions is not allowed.";
 return "";
}
function listQuestions(){
 const holder=$("question-admin-list");
 holder.replaceChildren();
 const published=rows.filter(r=>r.status==="published").length;
 const drafts=rows.length-published;
 $("question-admin-count").textContent=rows.length+" saved question"+(rows.length===1?"":"s")+" · "+published+" published · "+drafts+" drafts";
 if(!rows.length){holder.append(node("p","hint","No saved questions yet. Create a scenario-based or multiple-choice question above."));return;}
 for(const q of rows){
   const card=node("article","entry");
   const top=node("h3","",q.subject+" · "+q.grade+" · "+q.topic);
   top.append(node("span","badge",q.status==="published"?"PUBLISHED":"DRAFT — PRIVATE"));
   card.append(top);
   card.append(node("p","meta",[q.difficulty,q.question_type==="multiple_choice"?"Auto-marked MCQ":"Written answer / self-mark",q.verified?"Verified":"Not verified"].join(" · ")));
   const question=node("p","");question.textContent=q.question_text;card.append(question);
   const answers=node("details");
   const summary=node("summary","","Show stored answer and explanation");
   answers.append(summary,node("p","","Model answer: "+q.model_answer),node("p","","Explanation: "+q.explanation));
   card.append(answers);
   const actions=node("div","buttons");
   const edit=node("button","button secondary","Edit");
   edit.type="button";edit.addEventListener("click",()=>loadIntoForm(q));
   const copy=node("button","button secondary","Duplicate as draft");
   copy.type="button";copy.addEventListener("click",()=>{
     const draft={...q,id:"",status:"draft",verified:false};
     loadIntoForm(draft);
     feedback("Duplicate ready as a private, unverified draft. Edit and save it to create a new question.",false);
   });
   const remove=node("button","button danger","Delete");
   remove.type="button";
   remove.addEventListener("click",()=>deleteQuestion(q));
   actions.append(edit,copy,remove);
   card.append(actions);holder.append(card);
 }
}
async function ownerClient(){
 if(!window.supabase?.createClient||!config.supabaseUrl||!config.supabasePublishableKey)throw Error("Supabase configuration is unavailable.");
 if(!client)client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);
 const current=await client.auth.getUser();
 if(current.error||!current.data?.user)throw Error("Please sign in to the ZamBright Academy owner dashboard first.");
 const membership=await client.from("zambright_admins").select("user_id").eq("user_id",current.data.user.id).maybeSingle();
 if(membership.error||!membership.data)throw Error("This account has not been approved as a ZamBright owner.");
 return client;
}
async function loadQuestions(){
 try{
   const db=await ownerClient();
   const out=[];
   for(let offset=0;offset<10000;offset+=200){
     const result=await db.from("zambright_questions").select("*")
       .order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+199);
     if(result.error)throw result.error;
     out.push(...(result.data||[]));
     if((result.data||[]).length<200)break;
   }
   rows=out;listQuestions();
 }catch(e){feedback("Unable to load questions: "+(e.message||String(e)),true);}
}
async function saveQuestion(event){
 event.preventDefault();if(busy)return;
 const data=readForm();const problem=isValid(data);
 if(problem){feedback(problem,true);return;}
 const id=value("id");
 if(data.status==="published"){
   if(!window.confirm("Have you personally checked the complete question, model answer, explanation and appropriate syllabus topic? Publish it for all pupils now?"))return;
 }
 setBusy(true);
 try{
   const db=await ownerClient();
   const res=id?
     await db.from("zambright_questions").update(data).eq("id",id).select("id").single():
     await db.from("zambright_questions").insert(data).select("id").single();
   if(res.error)throw res.error;
   emptyForm();
   feedback(data.status==="published"?"Question published successfully. It now appears in the public Practice section.":"Draft saved privately. Review and verify it before publishing.",false);
   await loadQuestions();
 }catch(e){feedback("Save failed: "+(e.message||String(e)),true);}
 finally{setBusy(false);}
}
async function deleteQuestion(q){
 if(!window.confirm("Permanently delete this question? It cannot be recovered."))return;
 try{
   const db=await ownerClient();
   const res=await db.from("zambright_questions").delete().eq("id",q.id);
   if(res.error)throw res.error;
   if(value("id")===q.id)emptyForm();
   await loadQuestions();
   feedback("Question deleted.",false);
 }catch(e){feedback("Delete failed: "+(e.message||String(e)),true);}
}
function init(){
 if(initialized)return;initialized=true;
 form.addEventListener("submit",saveQuestion);
 field("question_type").addEventListener("change",updateOptions);
 $("question-new").addEventListener("click",emptyForm);
 $("question-refresh").addEventListener("click",loadQuestions);
 document.querySelectorAll('[data-tab="questions"]').forEach(tab=>tab.addEventListener("click",loadQuestions));
 const first=new URLSearchParams(window.location.search).get("admin");
 if(first==="questions"){
   const dashboard=$("dashboard");
   const observer=new MutationObserver(()=>{
     if(!dashboard.classList.contains("hidden")){
       const tab=document.querySelector('[data-tab="questions"]');
       if(tab)tab.click();observer.disconnect();
     }
   });
   observer.observe(dashboard,{attributes:true,attributeFilter:["class"]});
 }
 updateOptions();
}
init();
})();