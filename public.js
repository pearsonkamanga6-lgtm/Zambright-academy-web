/* ZamBright Academy public catalogue. No admin privileges or secret keys in this file. */
(function () {
  "use strict";
  const config = window.ZAMBRIGHT_CONFIG || {};
  const ready = Boolean(config.supabaseUrl && config.supabasePublishableKey && window.supabase && window.supabase.createClient);
  if (!ready) return; // Keep the existing honest "library being prepared" message during setup.
  const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  let materials = [];
  const resultHolder = document.getElementById("material-results");
  const count = document.getElementById("count");
  const subject = document.getElementById("subject");
  const grade = document.getElementById("grade");
  const type = document.getElementById("type");
  const search = document.getElementById("search");
  const year = document.getElementById("year-filter");
  const paper = document.getElementById("paper-filter");
  let audience = "pupil";

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function wa(message) { return "https://wa.me/" + (config.whatsapp || "260973731979") + "?text=" + encodeURIComponent(message); }
  function isTeacherType(value) { return ["Lesson plan", "Weekly forecast", "Scheme of work"].includes(value); }
  function matchesGrade(savedGrade, selectedGrade) {
    if(!selectedGrade) return true;
    const current=String(savedGrade||"").trim().toLowerCase();
    const chosen=String(selectedGrade).trim().toLowerCase();
    if(current===chosen) return true;
    const numberedGrade=chosen.match(/^grade\s+(\d+)$/);
    return Boolean(numberedGrade && [numberedGrade[1], "grade"+numberedGrade[1], "g"+numberedGrade[1]].includes(current));
  }
  function clear(node) { if (node) node.replaceChildren(); }
  function selectedResults() {
    return materials.filter(function (m) {
      const text = [m.title,m.subject,m.grade,m.topic,m.description,m.paper_number,m.exam_year].join(" ").toLowerCase();
      return (!subject.value || m.subject===subject.value)
        && matchesGrade(m.grade,grade.value)
        && (!type.value || m.content_type===type.value)
        && (!year || !year.value || String(m.exam_year || "") === year.value)
        && (!paper || !paper.value || String(m.paper_number || "").toLowerCase().includes(paper.value.toLowerCase()))
        && (!search.value || text.includes(search.value.trim().toLowerCase()))
        && (audience==="teacher" || !isTeacherType(m.content_type));
    });
  }

  const pdfModal=document.getElementById("pdf-preview");
  let previewItem=null,previewCaller=null;
  function fileNameFor(item){
    const title=String(item.title||"Past paper");
    const base=[item.exam_year,title].filter(Boolean).join(" ")
      .replace(/[^\w\s.-]/g,"").replace(/\s+/g,"_").slice(0,110);
    return (base||"ZamBright_Paper").replace(/\.pdf$/i,"")+".pdf";
  }
  function fileSizeText(bytes){
    const size=Number(bytes);
    if(!Number.isFinite(size)||size<=0)return "";
    return (size/(1024*1024)).toFixed(1)+" MB";
  }
  function closePreview(){
    if(!pdfModal||pdfModal.hidden)return;
    pdfModal.hidden=true;document.body.classList.remove("pdf-preview-open");
    const frame=document.getElementById("pdf-preview-frame");
    if(frame)frame.src="about:blank";
    previewItem=null;
    if(previewCaller)previewCaller.focus();
    previewCaller=null;
  }
  function bindPreview(){
    if(!pdfModal)return;
    const close=document.getElementById("pdf-preview-close");
    if(close)close.addEventListener("click",closePreview);
    pdfModal.addEventListener("click",function(event){if(event.target===pdfModal)closePreview();});
    document.addEventListener("keydown",function(event){
      if(event.key==="Escape"&&!pdfModal.hidden){event.preventDefault();closePreview();}
      if(event.key==="Tab"&&!pdfModal.hidden){
        // Keep keyboard focus within the open preview dialog.
        const focusables=[...pdfModal.querySelectorAll('a[href],button:not([disabled])')];
        if(!focusables.length)return;
        const first=focusables[0],last=focusables[focusables.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });
    const download=document.getElementById("pdf-preview-download");
    if(download)download.addEventListener("click",function(){if(previewItem)downloadPdf(previewItem,download);});
  }
  async function viewPdf(item,button){
    if(item.access_type!=="free")return;
    if(!pdfModal){
      window.alert("PDF preview is unavailable on this browser. Use Download PDF instead.");
      return;
    }
    previewItem=item;previewCaller=button;
    const title=document.getElementById("pdf-preview-title");
    const status=document.getElementById("pdf-preview-status");
    const frame=document.getElementById("pdf-preview-frame");
    const newTab=document.getElementById("pdf-preview-newtab");
    title.textContent=(item.exam_year?item.exam_year+" ":"")+item.title;
    status.textContent="Preparing PDF preview. A large PDF may use considerable mobile data.";
    frame.src="about:blank";newTab.removeAttribute("href");
    pdfModal.hidden=false;document.body.classList.add("pdf-preview-open");
    document.getElementById("pdf-preview-close").focus();
    button.disabled=true;
    try{
      const result=await client.storage.from("zambright-materials").createSignedUrl(item.storage_path,120);
      if(result.error)throw result.error;
      if(previewItem!==item)return;
      frame.src=result.data.signedUrl;
      newTab.href=result.data.signedUrl;
      status.textContent="Showing PDF preview"+(fileSizeText(item.file_size_bytes)?" · "+fileSizeText(item.file_size_bytes):"")+". If it does not display on this device, use Open PDF in new tab or Download PDF.";
    }catch(error){
      if(previewItem===item)status.textContent="Preview unavailable: "+(error.message||"Please retry.")+" Try Download PDF or contact ZamBright Academy.";
    }finally{button.disabled=false;}
  }
  async function downloadPdf(item,button){
    if(item.access_type!=="free")return;
    const original=button.textContent;
    button.disabled=true;button.textContent="Preparing download…";
    try{
      // Stream the file directly from Supabase: avoids buffering large PDFs in mobile memory.
      // The signed URL enforces Content-Disposition: attachment and preserves the filename.
      const response=await client.storage.from("zambright-materials")
        .createSignedUrl(item.storage_path,120,{download:fileNameFor(item)});
      if(response.error)throw response.error;
      if(!response.data||!response.data.signedUrl)throw Error("Unable to prepare a secure download link.");
      const a=document.createElement("a");
      a.href=response.data.signedUrl;
      a.download=fileNameFor(item);
      a.rel="noopener noreferrer";
      document.body.appendChild(a);a.click();a.remove();
      const status=document.getElementById("pdf-preview-status");
      if(pdfModal&&!pdfModal.hidden&&status)status.textContent="Download started. Check your browser's Downloads folder when it finishes.";
    }catch(error){
      window.alert("Download failed. Please try again or contact ZamBright Academy. "+(error.message||""));
    }finally{button.disabled=false;button.textContent=original;}
  }
  function renderMaterial(item){
    const card=el("article","catalogue-card");
    const year=item.exam_year?String(item.exam_year):"Year not recorded";
    const tag=el("span","catalogue-tag",year+" · "+item.content_type+" · Grade/Form "+item.grade);
    const titleText=item.exam_year&&!new RegExp("\\b"+String(item.exam_year)+"\\b").test(item.title)
      ?item.exam_year+" "+item.title:item.title;
    const title=el("h3","",titleText);
    const meta=el("p","catalogue-meta",[item.subject,item.paper_number].filter(Boolean).join(" · "));
    const desc=el("p","",item.description||(item.topic?"Topic: "+item.topic:"ZamBright Academy educational resource"));
    card.append(tag,title,meta,desc);
    const detail=[fileSizeText(item.file_size_bytes),Number(item.page_count)>0?item.page_count+" pages":""].filter(Boolean).join(" · ");
    if(detail)card.append(el("p","catalogue-meta-extra","PDF · "+detail));
    const actions=el("div","catalogue-actions");
    if(item.access_type==="free"){
      const view=el("button","btn gold","View PDF");
      view.type="button";view.addEventListener("click",function(){viewPdf(item,view);});
      const save=el("button","btn","Download PDF");
      save.type="button";save.addEventListener("click",function(){downloadPdf(item,save);});
      actions.append(view,save);
    }else{
      const price=Number(item.price_zmw||0);
      const b=el("a","btn gold","Enquire to buy · K"+price.toFixed(2));
      b.href=wa("Hello ZamBright Academy. I would like to purchase: "+item.title+" (K"+price.toFixed(2)+"). How do I pay?");
      b.target="_blank";b.rel="noopener noreferrer";
      actions.append(b);
    }
    card.append(actions);
    return card;
  }
  function drawMaterials(){
    if(!resultHolder) return;
    clear(resultHolder);
    const selected=selectedResults().sort(function(a,b){
      return (Number(b.exam_year)||0)-(Number(a.exam_year)||0)
        || String(a.subject).localeCompare(String(b.subject))
        || String(a.title).localeCompare(String(b.title),undefined,{numeric:true});
    });
    if(count)count.textContent=selected.length+" published resource"+(selected.length===1?"":"s");
    if(selected.length===0){
      const box=el("div","empty");
      box.append(el("div","empty-symbol","📂"),el("strong","", materials.length ? "No materials match your filters" : "Our online library is being prepared"), el("p","",materials.length ? "Try clearing some search filters." : "No PDF resources have been published yet. Contact ZamBright Academy to ask about currently available materials."));
      resultHolder.append(box);return;
    }
    // Group the published library by the year of the actual examination, newest first.
    // Papers without a year stay in a clearly labelled group rather than being assigned a guessed year.
    const years=new Map();
    selected.forEach(function(item){
      const key=item.exam_year ? String(item.exam_year) : "Year not recorded";
      if(!years.has(key))years.set(key,[]);
      years.get(key).push(item);
    });
    years.forEach(function(items,yearLabel){
      const group=el("section","catalogue-year-group");
      const head=el("div","catalogue-year-head");
      head.append(el("h3","",yearLabel==="Year not recorded"?yearLabel:"Examination year "+yearLabel));
      head.append(el("span","catalogue-year-count",items.length+" paper"+(items.length===1?"":"s")+" / resource"+(items.length===1?"":"s")));
      group.append(head);
      const cards=el("div","catalogue-grid");
      items.forEach(function(item){cards.append(renderMaterial(item));});
      group.append(cards);
      resultHolder.append(group);
    });
  }
  function bindFilters(){
    [subject,grade,type,search,year,paper].filter(Boolean).forEach(function(input){ input.addEventListener("input",drawMaterials);input.addEventListener("change",drawMaterials);});
    document.querySelectorAll("[data-subject]").forEach(function(button){
      button.addEventListener("click",function(){openBrowse("subject",button.getAttribute("data-subject"),0,true);});
    });
    const reset=document.getElementById("reset");if(reset)reset.addEventListener("click",function(){if(year)year.value="";if(paper)paper.value="";drawMaterials();});
    [["pupil","pupil"],["teacher","teacher"]].forEach(function(pair){const tab=document.getElementById(pair[0]);if(tab)tab.addEventListener("click",function(){audience=pair[1];drawMaterials();});});
  }
  function renderPosts(posts){
    const holder=document.getElementById("post-list");if(!holder)return;
    clear(holder);
    if(!posts.length){holder.append(el("p","desc","Our first articles are coming soon."));return;}
    posts.forEach(function(item){
      const card=el("article","catalogue-card");
      card.append(el("span","catalogue-tag",item.category),el("h3","",item.title));
      const body=el("p","post-body",item.body);
      card.append(body);
      holder.append(card);
    });
  }
  function renderLinks(links){
    const holder=document.getElementById("affiliate-list");if(!holder)return;
    clear(holder);
    if(!links.length){holder.append(el("p","desc","No partner recommendations have been published yet."));return;}
    links.forEach(function(item){
      let target;
      try {target=new URL(item.url);if(target.protocol!=="https:")return;} catch(_){return;}
      const card=el("article","catalogue-card");
      card.append(el("span","catalogue-tag",item.category||"Partner"),el("h3","",item.name),el("p","",item.description||"View more information on the provider's own website."));
      if(item.is_affiliate)card.append(el("p","disclosure","Affiliate link: ZamBright Academy may earn a referral commission. We do not provide or approve loans."));
      const link=el("a","btn gold","Visit provider ↗");
      link.href=target.href;link.target="_blank";link.rel=item.is_affiliate?"sponsored nofollow noopener noreferrer":"noopener noreferrer";
      card.append(link);holder.append(card);
    });
  }


  // The public subject library operates entirely inside the one ZamBright homepage.
  // Navigation history and deep links are supported without creating separate websites.
  const browserPanel=document.getElementById("browse-workspace");
  let browse={kind:"home",subject:"",paper:0,section:""};
  let papersLoaded=false,browseLoadError=false;
  const subjectNames=["Mathematics","Science","Physics","Biology","Chemistry","Civic Education","Religious Education","English","Literature"];
  const browsingIds={
    choices:"browse-choices",papers:"browse-papers",general:"browse-general",
    current:"browse-current",title:"browse-title",description:"browse-description",
    paperResult:"browse-paper-results",generalResult:"browse-general-results"
  };
  function element(id){return document.getElementById(id);}
  function paperIndex(item){
    const raw=String(item.paper_number||"").trim().toLowerCase();
    if(raw){
      const found=raw.match(/^(?:paper[\s:-]*)?(0?[123]|one|two|three)$/);
      if(!found)return null;
      return {"1":1,"01":1,one:1,"2":2,"02":2,two:2,"3":3,"03":3,three:3}[found[1]]||null;
    }
    // Explicit titles only: don't confuse a topic's question number with the paper number.
    const matches=[...String(item.title||"").toLowerCase().matchAll(/\bpaper[\s:-]*(0?[123]|one|two|three)\b/g)];
    if(matches.length!==1)return null;
    return {"1":1,"01":1,one:1,"2":2,"02":2,two:2,"3":3,"03":3,three:3}[matches[0][1]]||null;
  }
  function publishedPapers(subjectName,paperNumber){
    return materials.filter(function(m){
      return m.subject===subjectName&&m.content_type==="Past paper"&&paperIndex(m)===paperNumber;
    });
  }
  function otherSubjectMaterials(subjectName){
    return materials.filter(function(m){
      return m.subject===subjectName&&(m.content_type!=="Past paper"||!paperIndex(m));
    });
  }
  function matchesBrowseSearch(item,term){
    if(!term)return true;
    return [item.title,item.subject,item.exam_year,item.paper_number,item.grade,item.topic,item.description].join(" ").toLowerCase().includes(term);
  }
  function browseEmpty(parent,heading,description){
    const container=el("div","browse-empty");
    container.append(el("strong","",heading),el("p","",description));
    parent.append(container);
  }
  function renderYearGroups(rows,id,emptyDescription){
    const holder=element(id);if(!holder)return;
    clear(holder);
    if(!papersLoaded){
      browseEmpty(holder,browseLoadError?"Unable to load the library":"Loading published papers…",
        browseLoadError?"Please refresh the website or contact ZamBright Academy.":"Fetching the current approved materials.");return;
    }
    if(!rows.length){
      browseEmpty(holder,"No published resources found",emptyDescription);return;
    }
    const ordered=rows.slice().sort(function(a,b){
      return (Number(b.exam_year)||0)-(Number(a.exam_year)||0)||
        String(a.title||"").localeCompare(String(b.title||""),undefined,{numeric:true});
    });
    const years=new Map();
    ordered.forEach(function(m){
      const key=m.exam_year?String(m.exam_year):"Year not recorded";
      if(!years.has(key))years.set(key,[]);
      years.get(key).push(m);
    });
    years.forEach(function(group,yearName){
      const section=el("section","browse-year");
      section.append(el("h3","browse-year-heading",yearName==="Year not recorded"?yearName:"Examination year "+yearName));
      const cards=el("div","catalogue-grid");
      group.forEach(m=>cards.append(renderMaterial(m)));
      section.append(cards);holder.append(section);
    });
  }
  function buildPaperChoice(subjectName,paperNumber,count){
    const button=el("button","browse-choice");button.type="button";
    button.append(el("strong","",subjectName+" Paper "+paperNumber));
    button.append(el("span","browse-choice-note","Browse approved Paper "+paperNumber+" PDFs, arranged by examination year."));
    const detail=el("em","browse-choice-count",
      (papersLoaded?count+" published paper"+(count===1?"":"s"):"Loading papers…")+" · Open Paper "+paperNumber+" →");
    button.append(detail);
    button.addEventListener("click",function(){
      const input=element("browse-paper-search");if(input)input.value="";
      openBrowse(browse.kind,browse.subject,paperNumber,true,"");
    });
    return button;
  }
  function buildBrowseChoices(){
    const holder=element(browsingIds.choices);
    if(!holder)return;
    clear(holder);
    const paperNumbers=[1,2];
    if(publishedPapers(browse.subject,3).length)paperNumbers.push(3);
    paperNumbers.forEach(function(n){
      holder.append(buildPaperChoice(browse.subject,n,publishedPapers(browse.subject,n).length));
    });
    const extras=otherSubjectMaterials(browse.subject);
    if(extras.length || browse.subject!=="Science"){
      const button=el("button","browse-choice");button.type="button";
      button.append(el("strong","","Notes & Other Materials"));
      button.append(el("span","browse-choice-note","Revision notes, lessons, assessments and papers awaiting correct paper-number classification."));
      button.append(el("em","browse-choice-count",
        (papersLoaded?extras.length+" published item"+(extras.length===1?"":"s"):"Loading materials…")+" · View materials →"));
      button.addEventListener("click",function(){
        const input=element("browse-general-search");if(input)input.value="";
        openBrowse(browse.kind,browse.subject,0,true,"other");
      });
      holder.append(button);
    }
  }
  function displayBrowse(){
    if(!browserPanel)return;
    const active=browse.kind!=="home";
    document.body.classList.toggle("zb-browse-mode",active);
    browserPanel.hidden=!active;
    if(!active)return;
    const choices=element(browsingIds.choices),papers=element(browsingIds.papers),general=element(browsingIds.general);
    const showingPaper=Boolean(browse.paper),showingOther=browse.section==="other";
    choices.hidden=showingPaper||showingOther;
    papers.hidden=!showingPaper;
    general.hidden=!showingOther;
    const back=element("browse-back-subject");
    back.hidden=!(showingPaper||showingOther);
    back.textContent=browse.subject;
    const pageTitle=showingPaper?browse.subject+" Paper "+browse.paper:
      showingOther?browse.subject+" — Notes & Other Materials":browse.subject;
    element(browsingIds.title).textContent=pageTitle;
    element(browsingIds.current).textContent=showingPaper?"Paper "+browse.paper:showingOther?"Other materials":browse.subject;
    element(browsingIds.description).textContent=showingPaper?
      "Browse all published "+pageTitle+" documents by examination year. Preview a PDF or download it for offline study.":
      showingOther?"Available "+browse.subject+" revision notes, assessments and other educational materials.":
      "Choose a paper number to see its complete collection immediately. All papers stay inside the ZamBright Academy website.";
    if(!showingPaper&&!showingOther){
      buildBrowseChoices();
    }else if(showingPaper){
      const input=element("browse-paper-search");
      const q=(input&&input.value||"").trim().toLowerCase();
      const rows=publishedPapers(browse.subject,browse.paper).filter(m=>matchesBrowseSearch(m,q));
      element("browse-paper-count").textContent=papersLoaded?rows.length+" paper"+(rows.length===1?"":"s"):"Loading…";
      renderYearGroups(rows,browsingIds.paperResult,
        q?"Try another year or paper title.":"No "+pageTitle+" has been published yet. This collection is ready for future approved uploads.");
    }else{
      const input=element("browse-general-search");
      const q=(input&&input.value||"").trim().toLowerCase();
      const rows=otherSubjectMaterials(browse.subject).filter(m=>matchesBrowseSearch(m,q));
      element("browse-general-count").textContent=papersLoaded?rows.length+" resource"+(rows.length===1?"":"s"):"Loading…";
      renderYearGroups(rows,browsingIds.generalResult,
        q?"Try searching by another title or year.":"Approved "+browse.subject+" notes and other resources will appear here when published.");
    }
  }
  function browseUrl(kind,subjectName,paper,section){
    const u=new URL(window.location.href);
    ["view","paper","subject","material"].forEach(key=>u.searchParams.delete(key));
    u.hash="";
    if(kind!=="home"){
      if(subjectName==="Science")u.searchParams.set("view","science");
      else{
        u.searchParams.set("view","subject");
        u.searchParams.set("subject",subjectName);
      }
      if(paper)u.searchParams.set("paper",String(paper));
      if(section==="other")u.searchParams.set("material","other");
    }
    return u.pathname+u.search;
  }
  function openBrowse(kind,subjectName,paper,addHistory,section){
    if(!subjectNames.includes(subjectName)){goHome(false);return;}
    browse={kind:subjectName==="Science"?"science":"subject",subject:subjectName,
      paper:[1,2,3].includes(paper)?paper:0,section:section==="other"?"other":""};
    if(browse.paper)browse.section="";
    if(addHistory)window.history.pushState({zbBrowse:true},"",browseUrl(browse.kind,browse.subject,browse.paper,browse.section));
    displayBrowse();
    window.scrollTo({top:0,behavior:"instant"});
  }
  function goHome(addHistory){
    browse={kind:"home",subject:"",paper:0,section:""};
    if(addHistory)window.history.pushState({zbBrowse:true},"",browseUrl("home","",0,""));
    displayBrowse();window.scrollTo({top:0,behavior:"instant"});
  }
  function syncBrowseFromUrl(){
    const query=new URLSearchParams(window.location.search);
    const requested=query.get("view"),target=query.get("subject");
    const paper=Number(query.get("paper"));
    const section=query.get("material");
    if(requested==="science")openBrowse("science","Science",paper,false,section);
    else if(requested==="subject"&&subjectNames.includes(target))openBrowse("subject",target,paper,false,section);
    else goHome(false);
  }
  function bindBrowse(){
    const scienceCard=document.querySelector('[data-view-subject="Science"]');
    if(scienceCard)scienceCard.addEventListener("click",function(event){
      event.preventDefault();openBrowse("science","Science",0,true,"");
    });
    const home=element("browse-home"),back=element("browse-back-subject");
    if(home)home.addEventListener("click",()=>goHome(true));
    if(back)back.addEventListener("click",()=>openBrowse(browse.kind,browse.subject,0,true,""));
    const paperSearch=element("browse-paper-search"),generalSearch=element("browse-general-search");
    if(paperSearch)paperSearch.addEventListener("input",displayBrowse);
    if(generalSearch)generalSearch.addEventListener("input",displayBrowse);
    // Main website menus still reach the homepage's original information sections.
    document.querySelectorAll('a[href^="#"]').forEach(function(link){
      link.addEventListener("click",function(event){
        if(browse.kind==="home")return;
        event.preventDefault();
        const hash=link.getAttribute("href");
        goHome(false);
        const url=new URL(window.location.href);
        ["view","paper","subject","material"].forEach(key=>url.searchParams.delete(key));
        url.hash=hash;
        window.history.pushState({zbBrowse:true},"",url.pathname+url.search+url.hash);
        window.requestAnimationFrame(function(){
          const section=document.getElementById(hash.slice(1));
          if(section)section.scrollIntoView({behavior:"smooth",block:"start"});
        });
      });
    });
    window.addEventListener("popstate",syncBrowseFromUrl);
    syncBrowseFromUrl();
  }

  async function revealOwnerToolbar(){
    try {
      const userResult=await client.auth.getUser();
      const user=userResult.data && userResult.data.user;
      if(!user)return;
      const membership=await client.from("zambright_admins").select("user_id").eq("user_id",user.id).maybeSingle();
      if(membership.data && !membership.error){
        const toolbar=document.getElementById("owner-toolbar");
        if(toolbar)toolbar.hidden=false;
      }
    }catch(error){console.warn("Owner toolbar unavailable",error);}
  }
  async function init(){
    bindFilters();
    bindPreview();
    bindBrowse();
    const requestedSubject=new URLSearchParams(window.location.search).get("subject");
    if(requestedSubject && Array.from(subject.options).some(function(option){return option.value===requestedSubject;})){
      subject.value=requestedSubject;
    }
    revealOwnerToolbar();
    try {
      const [a,b,c] = await Promise.all([
        client.from("zambright_materials").select("id,title,subject,grade,topic,exam_year,paper_number,content_type,description,access_type,price_zmw,storage_path,status,file_size_bytes,page_count").eq("status","published").order("created_at",{ascending:false}).limit(300),
        client.from("zambright_posts").select("id,title,category,body").eq("status","published").order("created_at",{ascending:false}).limit(30),
        client.from("zambright_links").select("id,name,url,description,category,is_affiliate").eq("status","published").order("created_at",{ascending:false}).limit(30)
      ]);
      if(a.error)throw a.error;
      materials=a.data||[];papersLoaded=true;drawMaterials();displayBrowse();
      if(!b.error)renderPosts(b.data||[]);
      if(!c.error)renderLinks(c.data||[]);
    } catch(e) {
      console.error("ZamBright library service:",e);
      papersLoaded=true;browseLoadError=true;displayBrowse();
      if(count)count.textContent="Library temporarily unavailable";
    }
  }
  init();
})();