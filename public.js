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
  async function downloadFree(item, button) {
    if (item.access_type!=="free") return;
    button.disabled = true;
    button.textContent = "Preparing PDF…";
    try {
      const response = await client.storage.from("zambright-materials").createSignedUrl(item.storage_path, 120);
      if (response.error) throw response.error;
      const a = document.createElement("a");
      a.href = response.data.signedUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.append(a); a.click(); a.remove();
    } catch (error) {
      window.alert("This download is temporarily unavailable. Please contact ZamBright Academy. " + error.message);
    } finally { button.disabled=false; button.textContent="Open free PDF"; }
  }
  function renderMaterial(item) {
    const card = el("article","catalogue-card");
    const tag = el("span","catalogue-tag", (item.exam_year ? "YEAR "+item.exam_year+" · " : "YEAR NOT SET · ")+item.content_type+" · Grade/Form "+item.grade);
    const titleText=item.exam_year && !new RegExp("\\b"+String(item.exam_year)+"\\b").test(item.title) ? item.exam_year+" "+item.title : item.title;
    const title = el("h3","",titleText);
    const meta = el("p","catalogue-meta",[item.subject,item.paper_number].filter(Boolean).join(" · "));
    const desc = el("p","",item.description || (item.topic ? "Topic: " + item.topic : "ZamBright Academy educational resource"));
    card.append(tag,title,meta,desc);
    if(item.access_type==="free"){
      const b=el("button","btn gold","Open free PDF");
      b.type="button";
      b.addEventListener("click",function(){downloadFree(item,b);});
      card.append(b);
    } else {
      const price = Number(item.price_zmw||0);
      const b=el("a","btn gold","Enquire to buy · K"+price.toFixed(2));
      b.href=wa("Hello ZamBright Academy. I would like to purchase: " + item.title + " (K" + price.toFixed(2) + "). How do I pay?");
      b.target="_blank"; b.rel="noopener noreferrer";
      card.append(b);
    }
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

  // Same-page subject browser. No separate website or automatic scroll to the old PDF catalogue.
  const browserPanel=document.getElementById("browse-workspace");
  let browse={kind:"home",subject:"",paper:0};
  let papersLoaded=false;
  let browseLoadError=false;
  const browsingIds={
    choices:"browse-choices",papers:"browse-papers",general:"browse-general",
    current:"browse-current",title:"browse-title",description:"browse-description",
    paperResult:"browse-paper-results",generalResult:"browse-general-results"
  };
  function element(id){return document.getElementById(id);}
  function parseSciencePaper(item){
    const number=String(item.paper_number||"").trim().toLowerCase();
    if(number){
      if(/^(?:paper[\s-]*(?:0*1|one)|0*1)$/.test(number))return 1;
      if(/^(?:paper[\s-]*(?:0*2|two)|0*2)$/.test(number))return 2;
      return null;
    }
    // Some older uploads have no paper_number. Use the title only when unambiguous.
    const matches=[...String(item.title||"").toLowerCase().matchAll(/\bpaper[\s:-]*(0?[123]|one|two|three)\b/g)];
    if(matches.length!==1)return null;
    return {"1":1,"01":1,one:1,"2":2,"02":2,two:2}[matches[0][1]]||null;
  }
  function publishedScience(paperNumber){
    return materials.filter(function(m){
      return m.subject==="Science"&&m.content_type==="Past paper"&&parseSciencePaper(m)===paperNumber;
    });
  }
  function matchesBrowseSearch(item,term){
    if(!term)return true;
    return [item.title,item.subject,item.exam_year,item.paper_number,item.grade,item.topic,item.description].join(" ").toLowerCase().includes(term);
  }
  function browseEmpty(parent,heading,message){
    const container=el("div","browse-empty");
    container.append(el("strong","",heading),el("p","",message));
    parent.append(container);
  }
  function renderYearGroups(rows,resultId,emptyMessage){
    const holder=element(resultId);if(!holder)return;
    clear(holder);
    if(!papersLoaded){
      browseEmpty(holder,browseLoadError?"Could not load published papers":"Loading published papers…",
        browseLoadError?"Please refresh the website or contact ZamBright Academy.":"Retrieving ZamBright Academy materials.");return;
    }
    if(!rows.length){
      browseEmpty(holder,"No matching materials found",emptyMessage);return;
    }
    const sorted=rows.slice().sort(function(a,b){
      return (Number(b.exam_year)||0)-(Number(a.exam_year)||0)||
        String(a.title||"").localeCompare(String(b.title||""),undefined,{numeric:true});
    });
    const years=new Map();
    sorted.forEach(function(m){
      const label=m.exam_year?String(m.exam_year):"Year not recorded";
      if(!years.has(label))years.set(label,[]);
      years.get(label).push(m);
    });
    years.forEach(function(group,label){
      const section=el("section","browse-year");
      section.append(el("h3","browse-year-heading",label==="Year not recorded"?label:"Examination year "+label));
      const cards=el("div","catalogue-grid");
      group.forEach(m=>cards.append(renderMaterial(m)));
      section.append(cards);holder.append(section);
    });
  }
  function displayBrowse(){
    if(!browserPanel)return;
    const isBrowse=browse.kind!=="home";
    document.body.classList.toggle("zb-browse-mode",isBrowse);
    browserPanel.hidden=!isBrowse;
    if(!isBrowse)return;
    const choices=element(browsingIds.choices),papers=element(browsingIds.papers),general=element(browsingIds.general);
    choices.hidden=!(browse.kind==="science" && !browse.paper);
    papers.hidden=!(browse.kind==="science" && !!browse.paper);
    general.hidden=browse.kind!=="subject";
    const back=element("browse-back-science");
    back.hidden=!(browse.kind==="science" && !!browse.paper);
    if(browse.kind==="science"){
      element(browsingIds.title).textContent=browse.paper?"Science Paper "+browse.paper:"Science";
      element(browsingIds.current).textContent=browse.paper?"Paper "+browse.paper:"Science";
      element(browsingIds.description).textContent=browse.paper?
        "Every published Science Paper "+browse.paper+" appears here, organised by examination year. Select a free PDF to open or download it.":
        "Choose Science Paper 1 or Science Paper 2 to see every approved examination PDF. All documents appear right here on ZamBright Academy.";
      [1,2].forEach(function(num){
        const total=publishedScience(num).length;
        const node=element(num===1?"inline-paper1-count":"inline-paper2-count");
        if(node)node.textContent=papersLoaded?total+" published paper"+(total===1?"":"s"):"Loading papers…";
      });
      if(browse.paper){
        const q=element("browse-paper-search").value.trim().toLowerCase();
        const rows=publishedScience(browse.paper).filter(m=>matchesBrowseSearch(m,q));
        element("browse-paper-count").textContent=papersLoaded?rows.length+" paper"+(rows.length===1?"":"s"):"Loading…";
        renderYearGroups(rows,browsingIds.paperResult,
          q?"Try another year or title.":"No Science Paper "+browse.paper+" has been published yet. The section is ready for future uploads.");
      }
    }else{
      element(browsingIds.title).textContent=browse.subject;
      element(browsingIds.current).textContent=browse.subject;
      element(browsingIds.description).textContent="All approved "+browse.subject+" teaching materials and examination papers, organised by year.";
      const q=element("browse-general-search").value.trim().toLowerCase();
      const rows=materials.filter(m=>m.subject===browse.subject && matchesBrowseSearch(m,q));
      element("browse-general-count").textContent=papersLoaded?rows.length+" resource"+(rows.length===1?"":"s"):"Loading…";
      renderYearGroups(rows,browsingIds.generalResult,q?"Try a different search.":"Published "+browse.subject+" resources will appear here when available.");
    }
  }
  function browseUrl(kind,subject,paper){
    const u=new URL(window.location.href);
    u.searchParams.delete("view");u.searchParams.delete("paper");u.searchParams.delete("subject");
    u.hash="";
    if(kind==="science"){
      u.searchParams.set("view","science");
      if(paper)u.searchParams.set("paper",String(paper));
    }else if(kind==="subject"){
      u.searchParams.set("view","subject");
      u.searchParams.set("subject",subject);
    }
    return u.pathname+u.search;
  }
  function openBrowse(kind,subject,paper,addHistory){
    const isScience=kind==="science";
    browse={kind:kind,subject:isScience?"Science":subject||"",paper:isScience&&(paper===1||paper===2)?paper:0};
    if(addHistory)window.history.pushState({zbBrowse:true},"",browseUrl(browse.kind,browse.subject,browse.paper));
    displayBrowse();
    window.scrollTo({top:0,behavior:"instant"});
  }
  function goHome(pushHistory){
    browse={kind:"home",subject:"",paper:0};
    if(pushHistory)window.history.pushState({zbBrowse:true},"",browseUrl("home","",0));
    displayBrowse();
    window.scrollTo({top:0,behavior:"instant"});
  }
  function syncBrowseFromUrl(){
    const params=new URLSearchParams(window.location.search);
    const view=params.get("view");
    const p=Number(params.get("paper"));
    if(view==="science")openBrowse("science","Science",p,false);
    else if(view==="subject"&&params.get("subject"))openBrowse("subject",params.get("subject"),0,false);
    else goHome(false);
  }
  function bindBrowse(){
    const scienceLink=document.querySelector('[data-view-subject="Science"]');
    if(scienceLink)scienceLink.addEventListener("click",function(event){
      event.preventDefault();openBrowse("science","Science",0,true);
    });
    document.querySelectorAll("[data-science-paper]").forEach(function(button){
      button.addEventListener("click",function(){
        element("browse-paper-search").value="";
        openBrowse("science","Science",Number(button.dataset.sciencePaper),true);
      });
    });
    const home=element("browse-home"),back=element("browse-back-science");
    if(home)home.addEventListener("click",()=>goHome(true));
    if(back)back.addEventListener("click",()=>openBrowse("science","Science",0,true));
    const paperSearch=element("browse-paper-search"),generalSearch=element("browse-general-search");
    if(paperSearch)paperSearch.addEventListener("input",displayBrowse);
    if(generalSearch)generalSearch.addEventListener("input",displayBrowse);
    // Existing website menus still work: clicking Home, Subjects or Articles restores the homepage.
    document.querySelectorAll('a[href^="#"]').forEach(function(link){
      link.addEventListener("click",function(event){
        if(browse.kind==="home")return;
        event.preventDefault();
        const hash=link.getAttribute("href");
        goHome(false);
        const url=new URL(window.location.href);
        url.searchParams.delete("view");url.searchParams.delete("paper");url.searchParams.delete("subject");
        url.hash=hash;
        window.history.pushState({zbBrowse:true},"",url.pathname+url.search+url.hash);
        window.requestAnimationFrame(function(){
          const target=document.getElementById(hash.slice(1));
          if(target)target.scrollIntoView({behavior:"smooth",block:"start"});
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
    bindBrowse();
    const requestedSubject=new URLSearchParams(window.location.search).get("subject");
    if(requestedSubject && Array.from(subject.options).some(function(option){return option.value===requestedSubject;})){
      subject.value=requestedSubject;
    }
    revealOwnerToolbar();
    try {
      const [a,b,c] = await Promise.all([
        client.from("zambright_materials").select("id,title,subject,grade,topic,exam_year,paper_number,content_type,description,access_type,price_zmw,storage_path,status").eq("status","published").order("created_at",{ascending:false}).limit(300),
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