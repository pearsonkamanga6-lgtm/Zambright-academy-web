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
  function clear(node) { if (node) node.replaceChildren(); }
  function selectedResults() {
    return materials.filter(function (m) {
      const text = [m.title,m.subject,m.grade,m.topic,m.description,m.paper_number,m.exam_year].join(" ").toLowerCase();
      return (!subject.value || m.subject===subject.value)
        && (!grade.value || m.grade===grade.value)
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
    const tag = el("span","catalogue-tag",item.content_type + " · " + item.grade);
    const title = el("h3","",item.title);
    const meta = el("p","catalogue-meta",[item.subject,item.exam_year,item.paper_number].filter(Boolean).join(" · "));
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
    const selected=selectedResults();
    if(count)count.textContent=selected.length+" published resource"+(selected.length===1?"":"s");
    if(selected.length===0){
      const box=el("div","empty");
      box.append(el("div","empty-symbol","📂"),el("strong","", materials.length ? "No materials match your filters" : "Our online library is being prepared"), el("p","",materials.length ? "Try clearing some search filters." : "No PDF resources have been published yet. Contact ZamBright Academy to ask about currently available materials."));
      resultHolder.append(box);return;
    }
    const cards=el("div","catalogue-grid");
    selected.forEach(function(item){cards.append(renderMaterial(item));});
    resultHolder.append(cards);
  }
  function bindFilters(){
    [subject,grade,type,search,year,paper].filter(Boolean).forEach(function(input){ input.addEventListener("input",drawMaterials);input.addEventListener("change",drawMaterials);});
    document.querySelectorAll("[data-subject]").forEach(function(button){button.addEventListener("click",drawMaterials);});
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
      materials=a.data||[];drawMaterials();
      if(!b.error)renderPosts(b.data||[]);
      if(!c.error)renderLinks(c.data||[]);
    } catch(e) {
      console.error("ZamBright library service:",e);
      if(count)count.textContent="Library temporarily unavailable";
    }
  }
  init();
})();