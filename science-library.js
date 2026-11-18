/* ZamBright Academy public Science papers.
 * The same secured Supabase data powers owner publishing and visitor downloads.
 */
(function(){
"use strict";
const root=document.body;
const config=window.ZAMBRIGHT_CONFIG||{};
const kind=root.dataset.sciencePage;
const documentList=document.getElementById("paper-list");
const totals=[document.getElementById("paper-1-count"),document.getElementById("paper-2-count")];
const search=document.getElementById("paper-search");
const shown=document.getElementById("visible-count");
const currentYear=new Date().getFullYear();
let client=null,items=[];

function node(tag,cls,text){
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 if(text!==undefined)n.textContent=text;
 return n;
}
function paperNumber(row){
 const number=String(row.paper_number||"").trim().toLowerCase();
 if(number){
   if(/^(?:paper\s*(?:0*1|one)|(?:0*1))$/.test(number))return 1;
   if(/^(?:paper\s*(?:0*2|two)|(?:0*2))$/.test(number))return 2;
   return null;
 }
 // Fallback only when no paper_number was recorded; never classify a Paper 3 as Paper 1.
 const title=String(row.title||"").toLowerCase();
 const matches=[...title.matchAll(/\bpaper[\s\-:]*(0?[123]|one|two|three)\b/g)];
 if(matches.length!==1)return null;
 const key=matches[0][1];
 return {"1":1,"01":1,one:1,"2":2,"02":2,two:2}[key]||null;
}
function correctPaper(row,n){return row.subject==="Science" && row.content_type==="Past paper" && paperNumber(row)===n;}
function readableYear(year){return Number.isInteger(Number(year))&&Number(year)>=1980&&Number(year)<=currentYear+1?Number(year):null;}
function materialTitle(m){
 const y=readableYear(m.exam_year);
 const name=String(m.title||"Science Paper "+paperNumber(m));
 return y&&!new RegExp("\\b"+y+"\\b").test(name)?y+" "+name:name;
}
function loadMessage(title,body){
 documentList.replaceChildren();
 const box=node("div","empty");
 box.append(node("strong","",title),node("p","",body));
 documentList.append(box);
}
function errorMessage(error){
 loadMessage("Unable to load Science papers","Please try refreshing the page. If the problem continues, contact ZamBright Academy. "+(error && error.message?error.message:""));
}
function matchesSearch(m,q){
 if(!q)return true;
 return [m.title,m.exam_year,m.grade,m.paper_number,m.description,m.topic].join(" ").toLowerCase().includes(q);
}
function wa(msg){
 return "https://wa.me/"+(config.whatsapp||"260973731979")+"?text="+encodeURIComponent(msg);
}
async function openPdf(item,button){
 button.disabled=true;
 const label=button.textContent;
 button.textContent="Preparing PDF…";
 try{
   const result=await client.storage.from("zambright-materials").createSignedUrl(item.storage_path,120);
   if(result.error)throw result.error;
   const a=document.createElement("a");
   a.href=result.data.signedUrl;a.target="_blank";a.rel="noopener noreferrer";
   document.body.appendChild(a);a.click();a.remove();
 }catch(error){
   window.alert("The PDF could not be opened right now. Please try again. "+(error.message||""));
 }finally{button.disabled=false;button.textContent=label;}
}
function paperCard(item){
 const card=node("article","paper-card");
 card.append(node("span","paper-tag",item.access_type==="free"?"Free PDF":"Paid / enquiry"));
 card.append(node("h4","",materialTitle(item)));
 card.append(node("p","",["Grade/Form "+item.grade,item.paper_number].filter(Boolean).join(" · ")));
 if(item.description)card.append(node("p","",item.description));
 const actions=node("div","card-button");
 if(item.access_type==="free"){
   const button=node("button","primary-button","Open / Download PDF ↗");
   button.type="button";
   button.addEventListener("click",()=>openPdf(item,button));
   actions.append(button);
 }else{
   const link=node("a","primary-button","Enquire to buy · K"+Number(item.price_zmw||0).toFixed(2));
   link.href=wa("Hello ZamBright Academy. Please tell me how to purchase "+materialTitle(item)+".");
   link.target="_blank";link.rel="noopener noreferrer";
   actions.append(link);
 }
 card.append(actions);
 return card;
}
function displayPaperList(){
 const target=Number(root.dataset.paperNumber);
 const query=(search&&search.value||"").trim().toLowerCase();
 const selected=items.filter(m=>correctPaper(m,target)&&matchesSearch(m,query));
 selected.sort((a,b)=>(readableYear(b.exam_year)||0)-(readableYear(a.exam_year)||0)||
   String(a.title||"").localeCompare(String(b.title||""),undefined,{numeric:true}));
 if(shown)shown.textContent=selected.length+" paper"+(selected.length===1?"":"s")+" found";
 documentList.replaceChildren();
 if(!selected.length){
   loadMessage(query?"No papers match that search":"No papers published here yet",
     query?"Try another year or title.":"The section is ready. Approved Science Paper "+target+" PDFs will appear automatically after the administrator publishes them.");
   return;
 }
 const years=new Map();
 selected.forEach(m=>{const k=readableYear(m.exam_year)||"Year not recorded";if(!years.has(k))years.set(k,[]);years.get(k).push(m);});
 for(const [y,group] of years){
   const section=node("section","year-group");
   const head=node("div","year-head");
   head.append(node("h3","",typeof y==="number"?"Examination year "+y:String(y)));
   head.append(node("span","count",group.length+" paper"+(group.length===1?"":"s")));
   section.append(head);
   const grid=node("div","paper-grid");
   group.forEach(m=>grid.append(paperCard(m)));
   section.append(grid);documentList.append(section);
 }
}
async function fetchPublished(){
 const res=await client.from("zambright_materials")
   .select("id,title,subject,grade,exam_year,paper_number,content_type,description,topic,access_type,price_zmw,storage_path")
   .eq("status","published").eq("subject","Science").eq("content_type","Past paper")
   .order("created_at",{ascending:false}).limit(1000);
 if(res.error)throw res.error;
 return res.data||[];
}
async function init(){
 if(!config.supabaseUrl||!config.supabasePublishableKey||!window.supabase?.createClient){
   if(documentList)loadMessage("Library is temporarily unavailable","Please refresh this page or contact ZamBright Academy.");
   return;
 }
 try{
   client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);
   items=await fetchPublished();
   if(kind==="hub"){
     [1,2].forEach((paper,i)=>{
       const n=items.filter(m=>correctPaper(m,paper)).length;
       if(totals[i])totals[i].textContent=n+" published paper"+(n===1?"":"s");
     });
   }else if(kind==="paper"){
     displayPaperList();
     if(search)search.addEventListener("input",displayPaperList);
   }
 }catch(e){
   if(kind==="paper")errorMessage(e);
   else totals.forEach(n=>{if(n)n.textContent="Browse papers";});
 }
}
init();
})();