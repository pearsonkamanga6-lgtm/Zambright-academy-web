/* ZamBright Academy Learn • Practice • Improve: public, no-login learner experience. */
(function(){
"use strict";
const root=document.getElementById("practice-workspace");
if(!root)return;
const $=id=>document.getElementById(id);
const settings=window.ZAMBRIGHT_CONFIG||{};
const supportedSubjects=["Mathematics","Science","Physics","Biology","Chemistry","Civic Education","Religious Education","English","Literature"];
let client=null,questions=[],loaded=false,loadingError="",session=[],position=0,results=[],marked=false,demo=false;
const examples=[
 {id:"demo-stability-1",subject:"Physics",grade:"Form 1",topic:"Stability",competency:"Explain factors affecting the stability of objects",question_type:"short_answer",difficulty:"medium",
  question_text:"A bus carries several heavy bags on its roof while another bus carries the same bags low inside the bus. Which bus is more stable? Explain your answer.",
  model_answer:"The bus with the heavy bags low inside is more stable. Keeping heavy loads low lowers the combined centre of gravity, reducing the tendency to overturn.",
  explanation:"A lower centre of gravity generally increases stability because the line of action of the weight is less likely to pass outside the base when the bus tilts.",source_label:"ZamBright original demonstration"},
 {id:"demo-stability-2",subject:"Physics",grade:"Form 1",topic:"Stability",competency:"Suggest practical ways to improve stability",question_type:"multiple_choice",difficulty:"easy",
  question_text:"A school wants to make a tall bookcase less likely to topple. Which change would best improve its stability?",
  option_a:"Put the heaviest books on the highest shelf.",
  option_b:"Keep the heavier books on lower shelves and secure the bookcase to the wall.",
  option_c:"Place the bookcase on a narrower stand.",
  option_d:"Tilt the bookcase away from the wall.",
  correct_option:"B",model_answer:"B — Keep heavy books low and secure the bookcase to the wall.",
  explanation:"Low-placed heavy books lower the centre of gravity. Proper wall anchoring adds protection against tipping.",source_label:"ZamBright original demonstration"}
];
function element(tag,cls,text){
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=String(text);
 return node;
}
function setText(id,value){const n=$(id);if(n)n.textContent=value;}
function reveal(id,yes){const n=$(id);if(n)n.hidden=!yes;}
function refill(select,values,placeholder){
 const prior=select.value;
 select.replaceChildren();
 const all=element("option","",placeholder);all.value="";select.append(all);
 for(const value of values){
   const option=element("option","",value);option.value=value;select.append(option);
 }
 select.value=values.includes(prior)?prior:"";
}
function selectedQuestions(){
 const subject=$("practice-subject").value,grade=$("practice-grade").value,topic=$("practice-topic").value,difficulty=$("practice-difficulty").value;
 return questions.filter(q=>(!subject||q.subject===subject)&&(!grade||q.grade===grade)&&(!topic||q.topic===topic)&&(!difficulty||q.difficulty===difficulty));
}
function refreshOptions(change){
 const sub=$("practice-subject").value;
 if(change==="subject"){
   const grades=[...new Set(questions.filter(q=>!sub||q.subject===sub).map(q=>q.grade))].sort();
   refill($("practice-grade"),grades,"All grades / forms");
 }
 if(change==="subject"||change==="grade"){
   const grade=$("practice-grade").value;
   const topics=[...new Set(questions.filter(q=>(!sub||q.subject===sub)&&(!grade||q.grade===grade)).map(q=>q.topic))].sort();
   refill($("practice-topic"),topics,"All topics");
 }
 const count=selectedQuestions().length;
 setText("practice-count",!loaded?"Loading available questions…":loadingError?"Unable to load question bank":count+" published question"+(count===1?"":"s")+" match your filters");
 $("practice-start").disabled=!loaded||count===0;
 $("practice-print").disabled=!loaded||count===0;
}
function closeSession(){
 session=[];position=0;results=[];marked=false;demo=false;
 reveal("practice-filter-panel",true);reveal("practice-stage",false);reveal("practice-finish",false);
}
function startPractice(isDemo){
 const available=isDemo?examples:selectedQuestions();
 if(!available.length)return;
 // A session uses up to ten selected questions; keep predictable order for printing.
 session=available.slice(0,10);position=0;results=[];marked=false;demo=isDemo;
 reveal("practice-filter-panel",false);reveal("practice-stage",true);reveal("practice-finish",false);
 drawQuestion();
 window.scrollTo({top:0,behavior:"instant"});
}
function statusLabel(q){
 return [q.subject,q.grade,q.topic,q.difficulty].filter(Boolean).join(" · ");
}
function optionLine(letter,value,group){
 const label=element("label","zb-practice-option");
 const radio=element("input");radio.type="radio";radio.name=group;radio.value=letter;radio.setAttribute("aria-label",letter);
 label.append(radio,element("span","",letter+". "+value));return label;
}
function drawQuestion(){
 marked=false;
 const q=session[position];
 if(!q){finish();return;}
 setText("practice-progress-label","Question "+(position+1)+" of "+session.length);
 $("practice-progress-bar").style.width=((position)/session.length*100)+"%";
 setText("practice-question-meta",statusLabel(q)+(demo?" · DEMONSTRATION":"")+(q.competency?" · Learning objective: "+q.competency:""));
 setText("practice-question-text",q.question_text);
 setText("practice-question-source",q.source_label||"ZamBright original question");
 const area=$("practice-response");area.replaceChildren();
 if(q.question_type==="multiple_choice"){
   const form=element("div","zb-practice-options");form.setAttribute("role","radiogroup");form.setAttribute("aria-label","Select the best answer");
   ["A","B","C","D"].forEach(k=>form.append(optionLine(k,q["option_"+k.toLowerCase()],"zb-answer")));
   area.append(form);
 }else{
   const input=element("textarea","zb-practice-answer");
   input.id="practice-written-answer";input.rows=4;input.placeholder="Write your answer here before checking the worked solution…";
   input.setAttribute("aria-label","Your written answer");area.append(input);
 }
 reveal("practice-feedback",false);
 setText("practice-check",q.question_type==="multiple_choice"?"Check answer":"Show model answer");
 reveal("practice-check",true);
 reveal("practice-self-mark",false);
 reveal("practice-next",false);
 $("practice-check").disabled=false;
}
function showAnswer(){
 if(marked)return;
 const q=session[position];
 let chosen=null;
 if(q.question_type==="multiple_choice"){
   const selected=$("practice-response").querySelector('input[name="zb-answer"]:checked');
   if(!selected){setText("practice-message","Choose an answer before checking.");return;}
   chosen=selected.value;
   $("practice-response").querySelectorAll("input").forEach(x=>x.disabled=true);
 }else{
   const input=$("practice-written-answer");
   if(!input.value.trim()){setText("practice-message","Try writing an answer first, even if you are not sure.");return;}
   input.disabled=true;
 }
 setText("practice-message","");
 marked=true;
 const feedback=$("practice-feedback");feedback.replaceChildren();
 feedback.className="zb-practice-feedback";
 const result=q.question_type==="multiple_choice"?chosen===q.correct_option:null;
 feedback.classList.add(result===true?"correct":result===false?"incorrect":"");
 feedback.append(element("strong","",result===true?"Correct!":result===false?"Not quite — check the explanation.":"Compare your work with the model answer."));
 const answer=element("p");answer.append(element("strong","","Model answer: "),document.createTextNode(q.model_answer));feedback.append(answer);
 const reason=element("p");reason.append(element("strong","","Why: "),document.createTextNode(q.explanation));feedback.append(reason);
 reveal("practice-feedback",true);
 reveal("practice-check",false);
 if(q.question_type==="multiple_choice"){
   registerResult(result);
   reveal("practice-next",true);
 }else{
   reveal("practice-self-mark",true);
 }
}
function updateSavedProgress(q,correct){
 if(demo)return;
 try{
   const key="zb_practice_v3_progress";
   const data=JSON.parse(localStorage.getItem(key)||"{}");
   const old=data[q.id]||{attempts:0,correct:0};
   data[q.id]={attempts:Math.min(999,old.attempts+1),correct:Math.min(999,old.correct+(correct?1:0))};
   // Only anonymous question IDs and practice counts are stored in this browser, never answers or names.
   localStorage.setItem(key,JSON.stringify(data));
 }catch(_){/* Private browsing may block storage; the session still works. */}
}
function registerResult(correct){
 const q=session[position];
 if(results.some(r=>r.id===q.id))return;
 results.push({id:q.id,correct});
 updateSavedProgress(q,correct);
}
function next(){
 if(results.length<=position)return;
 position++;
 if(position>=session.length)finish();
 else drawQuestion();
}
function finish(){
 reveal("practice-stage",false);reveal("practice-finish",true);
 const correct=results.filter(r=>r.correct).length;
 const total=session.length;
 setText("practice-score",correct+" / "+total);
 setText("practice-score-detail",demo?
   "You completed the original demonstration questions. They are not official ECZ past-paper questions.":
   "You completed "+total+" questions. Your progress counts are saved on this browser only; no pupil account is needed.");
 $("practice-complete-bar").style.width=(total?(correct/total*100):0)+"%";
 window.scrollTo({top:0,behavior:"instant"});
}
function worksheet(includeSolutions){
 const chosen=selectedQuestions().slice(0,10);
 if(!chosen.length)return;
 const box=$("practice-worksheet");box.replaceChildren();
 const heading=element("div","worksheet-title","ZamBright Academy — Practice Worksheet");
 box.append(heading,element("p","","Name: _____________________  Class: __________  Date: __________"),element("p","","Learn Bright. Think Bright. Be Bright."));
 const wrap=element("div");
 chosen.forEach((q,i)=>{
   const item=element("div","worksheet-item");
   item.append(element("strong","",(i+1)+". "+q.subject+" · "+q.grade+" · "+q.topic));
   item.append(element("p","",q.question_text));
   if(q.question_type==="multiple_choice"){
     ["A","B","C","D"].forEach(k=>item.append(element("p","",k+". "+q["option_"+k.toLowerCase()])));
   }else if(!includeSolutions){
     for(let j=0;j<3;j++)item.append(element("div","worksheet-answer-line"));
   }
   if(includeSolutions){
     item.append(element("p","","Model answer: "+q.model_answer));
     item.append(element("p","","Explanation: "+q.explanation));
   }
   wrap.append(item);
 });
 box.append(wrap,element("div","worksheet-footer","For CBC materials — WhatsApp 0973731979 · ZamBright Academy"));
 document.body.classList.add("print-zb-worksheet");
 window.print();
}
function updateView(){
 const params=new URLSearchParams(window.location.search);
 const active=params.get("view")==="practice";
 document.body.classList.toggle("zb-practice-mode",active);
 if(active)document.body.classList.remove("zb-browse-mode");
 root.hidden=!active;
 if(active)window.scrollTo({top:0,behavior:"instant"});
}
function launchPractice(event){
 if(event)event.preventDefault();
 const url=new URL(window.location.href);
 url.searchParams.delete("paper");url.searchParams.delete("subject");url.searchParams.delete("material");
 url.searchParams.set("view","practice");url.hash="";
 window.history.pushState({zbPractice:true},"",url.pathname+url.search);
 updateView();
}
function returnHome(){
 const url=new URL(window.location.href);
 url.searchParams.delete("view");url.searchParams.delete("paper");url.searchParams.delete("subject");url.searchParams.delete("material");
 url.hash="";
 window.history.pushState({zbPractice:true},"",url.pathname+url.search);
 document.body.classList.remove("zb-practice-mode","zb-browse-mode");
 root.hidden=true;closeSession();window.scrollTo({top:0,behavior:"instant"});
}
async function fetchQuestions(){
 if(!settings.supabaseUrl||!settings.supabasePublishableKey||!window.supabase?.createClient){
   throw Error("The learning library connection is unavailable.");
 }
 client=window.supabase.createClient(settings.supabaseUrl,settings.supabasePublishableKey);
 const found=[];
 for(let start=0;start<10000;start+=200){
   const response=await client.from("zambright_questions")
     .select("id,subject,grade,topic,competency,question_text,question_type,option_a,option_b,option_c,option_d,correct_option,model_answer,explanation,difficulty,source_label")
     .eq("status","published").eq("verified",true).order("created_at",{ascending:false}).order("id",{ascending:false}).range(start,start+199);
   if(response.error)throw response.error;
   found.push(...(response.data||[]));
   if((response.data||[]).length<200)break;
 }
 return found;
}
async function init(){
 $("practice-home").addEventListener("click",returnHome);
 $("practice-subject").addEventListener("change",()=>refreshOptions("subject"));
 $("practice-grade").addEventListener("change",()=>refreshOptions("grade"));
 $("practice-topic").addEventListener("change",()=>refreshOptions("none"));
 $("practice-difficulty").addEventListener("change",()=>refreshOptions("none"));
 $("practice-start").addEventListener("click",()=>startPractice(false));
 $("practice-demo").addEventListener("click",()=>startPractice(true));
 $("practice-print").addEventListener("click",()=>worksheet($("practice-print-answers").checked));
 $("practice-check").addEventListener("click",showAnswer);
 $("practice-self-correct").addEventListener("click",()=>{registerResult(true);reveal("practice-self-mark",false);reveal("practice-next",true);});
 $("practice-self-incorrect").addEventListener("click",()=>{registerResult(false);reveal("practice-self-mark",false);reveal("practice-next",true);});
 $("practice-next").addEventListener("click",next);
 $("practice-again").addEventListener("click",()=>{closeSession();refreshOptions("none");});
 window.addEventListener("afterprint",()=>document.body.classList.remove("print-zb-worksheet"));
 document.querySelectorAll("[data-open-practice]").forEach(a=>a.addEventListener("click",launchPractice));
 document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener("click",function(){
   if(!document.body.classList.contains("zb-practice-mode"))return;
   const url=new URL(window.location.href);
   url.searchParams.delete("view");url.searchParams.delete("paper");url.searchParams.delete("subject");url.searchParams.delete("material");
   window.history.replaceState({},"",url.pathname+url.search+url.hash);
   document.body.classList.remove("zb-practice-mode");root.hidden=true;
 }));
 window.addEventListener("popstate",updateView);
 updateView();
 refill($("practice-subject"),supportedSubjects,"All subjects");
 try{
   questions=await fetchQuestions();loaded=true;
   refreshOptions("subject");
   setText("practice-info",questions.length?
     "Choose a subject, grade and topic to practice. Short-answer questions are self-assessed against a model solution.":
     "The verified question bank is being prepared. You can try the original sample questions now while the owner reviews the first set.");
 }catch(e){
   loadingError=e.message||"Library unavailable";
   loaded=true;refreshOptions("subject");
   setText("practice-info","The question bank is temporarily unavailable. You can still try the original demonstration questions.");
   console.error("ZamBright practice bank:",e);
 }
}
init();
})();