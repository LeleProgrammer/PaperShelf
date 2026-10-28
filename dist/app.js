/* SPDX-License-Identifier: GPL-3.0-only
 * PaperShelf — static PNG ebook library. See LICENSE; book assets use CONTENT_LICENSE.md.
 */
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const state = { books: [], filter: 'all', query: '', genre: '', sort: 'newest', current: null, page: 1, mode: 'auto', zoom: 1, focus: false, drawer: 'chapters', animating: false, localURLs: [], opening: false };
  const STORAGE = 'paper-stories:v1';
  let saved = { books: {}, night: false, mode: 'auto' };
  let storageWarned = false, toastTimer, resizeObserver, turnTimer;
  try { const raw = JSON.parse(localStorage.getItem(STORAGE)); if (raw && typeof raw === 'object' && raw.books && typeof raw.books === 'object') saved = { ...saved, ...raw }; } catch { /* Empty or unavailable local storage. */ }
  state.mode = ['auto', 'single', 'double'].includes(saved.mode) ? saved.mode : 'auto';
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const icon = (name) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', '#i-' + name); svg.append(use); return svg; };
  const button = (cls, text, onClick) => { const node = el('button', cls, text); node.type = 'button'; node.addEventListener('click', onClick); return node; };
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const record = (book) => { const r = saved.books[book.id]; return r && typeof r === 'object' ? { page: 1, bookmarks: [], favorite: false, ...r, bookmarks: Array.isArray(r.bookmarks) ? r.bookmarks.filter(p => Number.isInteger(p) && p >= 1 && p <= book.data.page_count) : [] } : { page: 1, bookmarks: [], favorite: false }; };
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3000); }
  function persist() { try { localStorage.setItem(STORAGE, JSON.stringify(saved)); } catch { if (!storageWarned) { toast('浏览器未允许保存记录，本次仍可继续阅读。'); storageWarned = true; } } }
  function updateRecord(book, changes) { saved.books[book.id] = { ...record(book), ...changes }; persist(); }
  function percent(book) { const r = record(book); return r.updatedAt ? Math.round((clamp(Number(r.page) || 1, 1, book.data.page_count) - 1) / Math.max(1, book.data.page_count - 1) * 100) : 0; }
  function validateMetadata(d) {
    const keys = ['schema_version','title','language','writing_started_at','writing_completed_at','timezone','tags','body_character_count','pdf_file','page_count','page_pattern','render_dpi','chapters'];
    const sameKeys = (obj, expected) => obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length === expected.length && expected.every(k => Object.hasOwn(obj, k));
    const positive = n => Number.isInteger(n) && n > 0;
    if (!sameKeys(d, keys) || d.schema_version !== 1 || d.language !== 'zh-CN' || typeof d.title !== 'string' || !d.title.trim() || typeof d.timezone !== 'string') throw new Error('元数据字段与 v1 模板不符');
    if (!positive(d.page_count) || d.page_count > 9999 || !positive(d.body_character_count) || d.render_dpi !== 200 || d.page_pattern !== 'P%04d.png') throw new Error('页数、字数或图像格式不符合模板');
    if (typeof d.pdf_file !== 'string' || !/^\.\.\/[^/\\]+\.pdf$/.test(d.pdf_file)) throw new Error('PDF 路径格式不正确');
    const tagKeys = ['genre', 'themes', 'setting', 'tone', 'narrative'];
    if (!sameKeys(d.tags, tagKeys) || !tagKeys.every(k => Array.isArray(d.tags[k]) && d.tags[k].every(v => typeof v === 'string' && v.trim()) && new Set(d.tags[k]).size === d.tags[k].length)) throw new Error('分类标签格式不正确');
    let tz;
    try { tz = new Intl.DateTimeFormat('en-US', { timeZone: d.timezone }); } catch { throw new Error('时区无效'); }
    for (const key of ['writing_started_at','writing_completed_at']) if (d[key] !== null && (typeof d[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(d[key]) || !Number.isFinite(Date.parse(d[key])))) throw new Error('撰写时间格式不正确');
    if (d.writing_started_at && d.writing_completed_at && Date.parse(d.writing_started_at) > Date.parse(d.writing_completed_at)) throw new Error('撰写时间顺序不正确');
    if (!Array.isArray(d.chapters) || !d.chapters.length) throw new Error('缺少章节信息');
    let lastBody = 0, lastPhysical = 0, offset;
    for (const c of d.chapters) {
      if (!sameKeys(c, ['title','body_page','physical_page']) || typeof c.title !== 'string' || !c.title.trim() || !positive(c.body_page) || !positive(c.physical_page) || c.body_page <= lastBody || c.physical_page <= lastPhysical || c.physical_page > d.page_count || c.physical_page < c.body_page || (offset !== undefined && c.physical_page - c.body_page !== offset)) throw new Error('章节页号无效或顺序不正确');
      offset = c.physical_page - c.body_page; lastBody = c.body_page; lastPhysical = c.physical_page;
    }
    if (d.chapters[0].body_page !== 1) throw new Error('首章正文页码必须为 1');
    return d;
  }
  const pageName = (page) => 'P' + String(page).padStart(4, '0') + '.png';
  const pageURL = (book, p) => book.local ? book.images.get(pageName(p)) : new URL(pageName(p), book.base).href;
  const cover = (book) => pageURL(book, 1);
  const currentChapter = (book, page) => { if (page === 1) return '封面'; if (page === book.data.page_count) return '封底'; return [...book.data.chapters].reverse().find(c => c.physical_page <= page)?.title || (page === 2 ? '内封面' : '目录'); };
  const shortDate = value => value ? new Intl.DateTimeFormat('zh-CN', { year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Shanghai' }).format(new Date(value)).replaceAll('/', '.') : '日期未记录';
  function renderHero() {
    const books = state.books;
    $('statBooks').textContent = String(books.length).padStart(2, '0');
    $('statPages').textContent = books.reduce((s,b) => s+b.data.page_count,0).toLocaleString('zh-CN');
    const words = books.reduce((s,b) => s+b.data.body_character_count,0);
    $('statWords').textContent = words >= 10000 ? (words/10000).toFixed(1)+'万' : words.toLocaleString('zh-CN');
    const latestRead = [...books].filter(b => record(b).updatedAt).sort((a,b) => (record(b).updatedAt || 0) - (record(a).updatedAt || 0))[0];
    const featured = latestRead || books[0]; state.featured = featured;
    $('heroRead').disabled = !featured; $('featureRead').disabled = !featured;
    $('heroArt').hidden = !featured;
    if (featured) { $('heroCover').src = cover(featured); $('heroCover').alt = featured.data.title+' 封面'; $('featureTitle').textContent = featured.data.title; $('heroRead').replaceChildren(document.createTextNode(record(featured).updatedAt ? '继续阅读 ' : '开始阅读 '),icon('arrow')); }
  }
  function renderGenres() {
    const selected = state.genre; $('genreFilter').replaceChildren(new Option('所有题材',''));
    [...new Set(state.books.flatMap(b => b.data.tags.genre))].sort((a,b)=>a.localeCompare(b,'zh-CN')).forEach(g => $('genreFilter').add(new Option(g,g)));
    $('genreFilter').value = selected;
  }
  function renderShelf() {
    $('bookCount').textContent = String(state.books.length).padStart(2,'0');
    document.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active', b.dataset.filter === state.filter); b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter)); });
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === (state.filter === 'recent' ? 'recent' : 'all')));
    let books = state.books.filter(b => {
      const r = record(b);
      return (state.filter !== 'recent' || r.updatedAt) && (state.filter !== 'favorite' || r.favorite) && (!state.genre || b.data.tags.genre.includes(state.genre)) && (!state.query || [b.data.title,...Object.values(b.data.tags).flat()].join(' ').toLowerCase().includes(state.query.toLowerCase()));
    });
    books.sort((a,b) => state.filter === 'recent' ? (record(b).updatedAt || 0) - (record(a).updatedAt || 0) : state.sort === 'title' ? a.data.title.localeCompare(b.data.title,'zh-CN') : state.sort === 'progress' ? percent(b)-percent(a) : (Date.parse(b.data.writing_completed_at) || 0) - (Date.parse(a.data.writing_completed_at) || 0));
    $('bookGrid').replaceChildren(); $('emptyState').hidden = books.length !== 0;
    $('emptyMessage').textContent = !state.books.length ? '放入作品文件，或打开本地作品开始阅读。' : state.filter === 'favorite' ? '点亮作品右上角的心形，把喜欢的故事留下。' : state.filter === 'recent' ? '翻开一本书，这里就会记住你的阅读足迹。' : '试试其他书名或筛选条件。';
    books.forEach((book) => {
      const r = record(book), p = percent(book), card = el('article','book-card');
      const imageButton = button('card-cover','',()=>openBook(book)); imageButton.setAttribute('aria-label','阅读 '+book.data.title);
      const image = el('img'); image.src = cover(book); image.alt = book.data.title+' 封面'; image.loading='lazy'; imageButton.append(image,el('span','book-spine')); card.append(imageButton);
      const info = el('div','card-content'); info.append(el('div','card-number','VOL. '+String(state.books.indexOf(book)+1).padStart(3,'0')));
      if (book.local) info.append(el('div','local-badge','本次本地打开'));
      info.append(el('h3','',book.data.title)); const tags=el('div','card-tags');book.data.tags.genre.slice(0,3).forEach(t=>tags.append(el('span','tag',t)));info.append(tags);
      info.append(el('p','card-meta',book.data.body_character_count.toLocaleString('zh-CN')+' 字  /  '+book.data.page_count+' 页  /  '+shortDate(book.data.writing_completed_at)));
      const actions=el('div','card-actions');const read=button('card-read',r.updatedAt?'继续阅读':'翻开这本书',()=>openBook(book));read.append(icon('arrow'));actions.append(read,el('span','card-status',r.updatedAt?'已读 '+p+'%':'尚未翻开'));info.append(actions);
      const progress=el('div','card-progress');const fill=el('span');fill.style.width=p+'%';progress.append(fill);info.append(progress);card.append(info);
      const fav=button('icon-button card-favorite'+(r.favorite?' active':''),'',()=>{updateRecord(book,{favorite:!record(book).favorite});renderShelf();}); fav.append(icon('heart'));fav.setAttribute('aria-label',r.favorite?'取消收藏 '+book.data.title:'收藏 '+book.data.title);fav.setAttribute('aria-pressed',String(!!r.favorite));card.append(fav);
      $('bookGrid').append(card);
    });
  }
  async function fetchJSON(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try { const response = await fetch(url, { signal: controller.signal }); if (!response.ok) throw new Error('HTTP ' + response.status + ' · ' + url); return await response.json(); }
    catch (error) { if (error.name === 'AbortError') throw new Error('载入超时 · ' + url); throw error; }
    finally { clearTimeout(timer); }
  }
  async function loadLibrary() {
    const errors=[];
    try {
      const paths=await fetchJSON('books/index.json');if(!Array.isArray(paths)||!paths.every(p=>typeof p==='string'))throw new Error('作品清单必须是元数据路径的 JSON 数组');
      const results=await Promise.allSettled([...new Set(paths)].map(async path=>{
        const url=new URL(path,document.baseURI);
        if(url.origin!==location.origin||!['http:','https:'].includes(url.protocol))throw new Error('作品必须使用本站的静态文件路径');
        const data=validateMetadata(await fetchJSON(url));return{id:url.href,data,base:new URL('.',url),pdf:new URL(data.pdf_file,url).href,local:false};
      }));
      for(const r of results){if(r.status==='fulfilled')state.books.push(r.value);else errors.push(r.reason.message);}
    }catch(error){errors.push(error.message);}
    if(errors.length){$('libraryErrors').hidden=false;$('libraryErrors').textContent='部分作品未能载入：\n'+errors.join('\n');}
    renderHero();renderGenres();renderShelf();
    const params=new URLSearchParams(location.hash.slice(1));const path=params.get('book');
    if(path){const found=state.books.find(b=>b.id===new URL(path,document.baseURI).href);if(found)openBook(found,Number(params.get('page'))||undefined);else toast('链接中的作品不在当前书架。');}
  }
  async function importFolder(files) {
    const list=Array.from(files), byPath=new Map(list.map(f=>[f.webkitRelativePath,f])), metadata=list.filter(f=>f.name==='data.json');if(!metadata.length){toast('所选目录中没有 data.json。');return;}
    let added=0;const errors=[];
    for(const f of metadata){
      const created=[];
      try{
        const data=validateMetadata(JSON.parse(await f.text()));const path=f.webkitRelativePath;const folder=path.slice(0,path.lastIndexOf('/')+1);const images=new Map();
        for(let p=1;p<=data.page_count;p++){const name=pageName(p);const image=byPath.get(folder+name);if(!image)throw new Error('缺少 '+name);const url=URL.createObjectURL(image);created.push(url);images.set(name,url);}
        const bookFolder=folder.split('/').filter(Boolean).slice(0,-1).join('/')+'/';const pdfName=data.pdf_file.slice(3);const pdfFile=byPath.get(bookFolder+pdfName);let pdf=null;if(pdfFile){pdf=URL.createObjectURL(pdfFile);created.push(pdf);}
        const id='local:'+data.title+':'+data.page_count+':'+data.body_character_count;
        if(state.books.some(b=>b.id===id)){created.forEach(u=>URL.revokeObjectURL(u));continue;}
        state.localURLs.push(...created);state.books.push({id,data,images,pdf,local:true});added++;
      }catch(error){created.forEach(u=>URL.revokeObjectURL(u));errors.push(f.webkitRelativePath+'：'+error.message);}
    }
    renderHero();renderGenres();renderShelf();toast(added?'已打开 '+added+' 部作品，刷新后需重新选择文件夹。':'没有新增作品。');
    if(errors.length){$('libraryErrors').hidden=false;$('libraryErrors').textContent=errors.join('\n');}
  }
  function isDouble() { return window.innerWidth>=760 && state.mode!=='single' && (state.mode==='double'||state.mode==='auto'); }
  function anchor(page=state.page) { return isDouble() && page>1 ? page-page%2 : page; }
  function visiblePages(page=state.page) { const start=anchor(page);return isDouble()&&start>1?[start,start+1].filter(p=>p<=state.current.data.page_count):[start]; }
  function setRoute() {
    if(!state.current)return;
    if(state.current.local){history.replaceState(null,'',location.pathname+location.search);return;}
    const route=new URL(state.current.id).pathname.replace(new URL('.',document.baseURI).pathname,'');const params=new URLSearchParams({book:route,page:String(state.page)});history.replaceState(null,'','#'+params);
  }
  function openBook(book, page) {
    state.current=book;state.page=clamp(Number.isInteger(page)?page:Number(record(book).page)||1,1,book.data.page_count);state.zoom=1;state.animating=false;clearTimeout(turnTimer);
    $('shelfView').hidden=true;$('readerView').hidden=false;document.body.style.overflow='hidden';$('readerTitle').textContent=book.data.title;document.title=book.data.title+' · PaperShelf';
    $('totalPages').textContent=book.data.page_count;$('pageInput').max=book.data.page_count;$('pageSlider').max=book.data.page_count;$('readerView').classList.toggle('night',!!saved.night);$('themeButton').setAttribute('aria-pressed',String(!!saved.night));
    closeDrawer();saveProgress();renderPages();setRoute();requestAnimationFrame(fitBook);$('backToShelf').focus({preventScroll:true});
  }
  function closeBook() {
    if(!state.current)return;
    saveProgress();closeDrawer();state.current=null;clearTimeout(turnTimer);state.animating=false;setFocus(false);$('readerView').hidden=true;$('shelfView').hidden=false;document.body.style.overflow='';document.title='PaperShelf';history.replaceState(null,'',location.pathname+location.search);renderHero();renderShelf();
    if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});$('heroRead').focus({preventScroll:true});
  }
  function saveProgress(){if(state.current)updateRecord(state.current,{page:state.page,updatedAt:Date.now()});}
  function createPage(p, side) {
    const node=el('div','book-page '+side);node.dataset.page=String(p);const image=el('img');image.alt=state.current.data.title+'，第 '+p+' 页';image.decoding='async';const loading=el('div','page-loading','正在翻到第 '+p+' 页…');node.append(loading);
    const url=pageURL(state.current,p);
    image.addEventListener('load',()=>node.classList.add('loaded'));
    image.addEventListener('error',()=>{node.querySelector('.page-failure')?.remove();const fail=el('div','page-failure');fail.append(el('strong','','这一页暂时走失了'),el('span','',pageName(p)));fail.append(button('','重新加载',()=>{fail.remove();image.src=url+(url.startsWith('blob:')?'':(url.includes('?')?'&':'?')+'retry='+Date.now());}));node.append(fail);node.classList.add('loaded');});
    image.src=url;node.append(image);node.addEventListener('click',()=>{state.page=p;saveProgress();setRoute();updateControls();});return node;
  }
  function renderPages() {
    if(!state.current)return;
    const pages=visiblePages();$('book').replaceChildren();$('book').classList.toggle('double',pages.length===2);
    pages.forEach((p,i)=>$('book').append(createPage(p,pages.length===1?'single':i===0?'left':'right')));
    fitBook();updateControls();
    const total=state.current.data.page_count;
    for(let p=Math.max(1,anchor()-2);p<=Math.min(total,anchor()+3);p++){if(!pages.includes(p)){const pre=new Image();pre.src=pageURL(state.current,p);}}
  }
  function fitBook(){
    if(!state.current)return;
    const viewport=$('bookViewport'),pages=visiblePages(),count=pages.length;const width=Math.max(40,viewport.clientWidth-10),height=Math.max(40,viewport.clientHeight-10);const baseHeight=Math.min(height,width/(148/210*count));const pageHeight=baseHeight*state.zoom;const pageWidth=pageHeight*148/210;
    $('book').style.width=pageWidth*count+'px';$('book').style.height=pageHeight+'px';document.querySelectorAll('#book .book-page').forEach(n=>n.style.width=pageWidth+'px');$('zoomReset').textContent=Math.round(state.zoom*100)+'%';
    $('zoomOut').disabled=state.zoom<=.75;$('zoomIn').disabled=state.zoom>=2.5;
  }
  function updateControls(){
    const book=state.current;if(!book)return;const p=state.page,total=book.data.page_count,spread=visiblePages();const pct=percent(book);
    $('chapterLabel').textContent=currentChapter(book,p);$('pageInput').value=p;$('pageSlider').value=p;$('pageSlider').style.setProperty('--progress',((p-1)/Math.max(1,total-1)*100)+'%');$('progressPercent').textContent=pct+'%';
    $('spreadLabel').textContent=p===1?'封面':spread.length===2?'第 '+spread[0]+'–'+spread[1]+' 页':'第 '+p+' 页';$('previousPage').disabled=anchor()===1;$('nextPage').disabled=Math.max(...spread)>=total;
    const bookmarked=record(book).bookmarks.includes(p);$('bookmarkButton').classList.toggle('active',bookmarked);$('bookmarkButton').setAttribute('aria-label',bookmarked?'移除第 '+p+' 页书签':'添加第 '+p+' 页书签');$('bookmarkButton').setAttribute('aria-pressed',String(bookmarked));
    $('layoutLabel').textContent=isDouble()?'双页':'单页';$('layoutButton').setAttribute('aria-label',isDouble()?'切换单页阅读':'切换双页阅读');$('layoutButton').title=window.innerWidth<760?'小屏幕使用单页阅读':isDouble()?'切换单页阅读':'切换双页阅读';
  }
  function navigate(target, animate=true){
    if(!state.current||!Number.isFinite(target))return;
    if(state.animating){if(animate)return;clearTimeout(turnTimer);state.animating=false;$('book').querySelector('.turn-sheet')?.remove();}
    const n=clamp(Math.trunc(target),1,state.current.data.page_count);if(n===state.page)return;
    const oldPage=state.page,oldAnchor=anchor(),oldPages=visiblePages();state.page=n;saveProgress();setRoute();
    const direction=n>oldPage?'forward':'backward';const oldImage=direction==='forward'?oldPages.at(-1):oldPages[0];const animateTurn=animate&&anchor()!==oldAnchor&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
    const oldWidth=$('book').clientWidth/oldPages.length;
    renderPages();$('bookViewport').scrollTo(0,0);
    if(animateTurn){state.animating=true;const sheet=el('div','turn-sheet '+direction+(oldPages.length===1?' single':''));sheet.style.width=oldWidth+'px';const image=el('img');image.src=pageURL(state.current,oldImage);image.alt='';sheet.append(image);$('book').append(sheet);turnTimer=setTimeout(()=>{sheet.remove();state.animating=false;},500);}
    if(!$('readerDrawer').hidden&&state.drawer!=='pages')renderDrawer();
  }
  function next(){if(!state.current)return;const a=anchor();navigate(isDouble()?(a===1?2:a+2):a+1);}
  function previous(){if(!state.current)return;const a=anchor();navigate(isDouble()?(a===2?1:a-2):a-1);}
  function toggleBookmark(){const book=state.current;if(!book)return;const bookmarks=record(book).bookmarks;const has=bookmarks.includes(state.page);updateRecord(book,{bookmarks:has?bookmarks.filter(p=>p!==state.page):[...bookmarks,state.page].sort((a,b)=>a-b)});updateControls();toast(has?'已移除这一页的书签。':'已留下第 '+state.page+' 页的书签。');if(!$('readerDrawer').hidden)renderDrawer();}
  function openDrawer(panel){state.drawer=panel||state.drawer;$('readerDrawer').hidden=false;$('drawerShade').hidden=false;document.querySelectorAll('.reader-header,.reader-stage,.reader-footer').forEach(n=>n.inert=true);renderDrawer();$('closeDrawer').focus();}
  function closeDrawer(){$('readerDrawer').hidden=true;$('drawerShade').hidden=true;document.querySelectorAll('.reader-header,.reader-stage,.reader-footer').forEach(n=>n.inert=false);}
  function renderDrawer(){
    const book=state.current;if(!book)return;const box=$('drawerContent');box.replaceChildren();document.querySelectorAll('[data-panel]').forEach(b=>b.classList.toggle('active',b.dataset.panel===state.drawer));
    if(state.drawer==='chapters'){
      box.append(el('p','drawer-note','从目录跳转到原版页面。右侧数字为正文页码。'));
      const c=[...book.data.chapters].reverse().find(c=>c.physical_page<=state.page);
      const coverButton=button('chapter-item'+(state.page===1?' active':''),'',()=>{navigate(1,false);closeDrawer();});coverButton.append(el('span','','封面'),el('span','','01'));box.append(coverButton);
      book.data.chapters.forEach(ch=>{const b=button('chapter-item'+(c===ch?' active':''),'',()=>{navigate(ch.physical_page,false);closeDrawer();});b.append(el('span','',ch.title),el('span','',String(ch.body_page).padStart(2,'0')));box.append(b);});
      const end=button('chapter-item','',()=>{navigate(book.data.page_count,false);closeDrawer();});end.append(el('span','','封底'),el('span','','END'));box.append(end);
    }else if(state.drawer==='bookmarks'){
      const marks=record(book).bookmarks;if(!marks.length)box.append(el('p','drawer-note','还没有书签。点亮顶部的书签图标，留住想再读的一页。'));
      marks.forEach(p=>{const row=el('div','bookmark-item');const link=button('','第 '+p+' 页',()=>{navigate(p,false);closeDrawer();});link.append(el('small','',currentChapter(book,p)));const remove=button('icon-button','×',()=>{updateRecord(book,{bookmarks:record(book).bookmarks.filter(x=>x!==p)});updateControls();renderDrawer();});remove.setAttribute('aria-label','删除第 '+p+' 页书签');row.append(link,remove);box.append(row);});
    }else if(state.drawer==='pages'){
      box.append(el('p','drawer-note','点击缩略图，翻到想去的地方。'));const grid=el('div','thumb-grid');for(let p=1;p<=book.data.page_count;p++){const b=button('thumb-button'+(visiblePages().includes(p)?' active':''),'',()=>{navigate(p,false);closeDrawer();});const im=el('img');im.loading='lazy';im.src=pageURL(book,p);im.alt='第 '+p+' 页缩略图';b.append(im,el('span','',String(p).padStart(2,'0')));grid.append(b);}box.append(grid);
    }else{
      box.append(el('h3','detail-title',book.data.title));const info=[['正文字数',book.data.body_character_count.toLocaleString('zh-CN')+' 字'],['页面数量',book.data.page_count+' 页'],['撰写开始',shortDate(book.data.writing_started_at)],['撰写完成',shortDate(book.data.writing_completed_at)],['页面规格','A5 · '+book.data.render_dpi+' DPI'],['内容语言','简体中文']];
      info.forEach(([key,value])=>{const row=el('div','detail-row');row.append(el('span','',key),el('span','',value));box.append(row);});
      const labels={genre:'题材',themes:'主题',setting:'背景',tone:'氛围',narrative:'叙述'};Object.entries(book.data.tags).forEach(([key,values])=>{if(!values.length)return;const section=el('div','detail-section');section.append(el('h4','',labels[key]));values.forEach(v=>section.append(el('span','tag',v)));box.append(section);});
      if(book.pdf){const link=el('a','detail-link','下载原版 PDF');link.href=book.pdf;link.download=book.data.title+'.pdf';link.append(el('span','','↗'));box.append(link);}
    }
  }
  function setFocus(value){state.focus=value;$('readerView').classList.toggle('focus',value);$('focusButton').setAttribute('aria-pressed',String(value));requestAnimationFrame(fitBook);}
  function changeZoom(delta){state.zoom=clamp(Math.round((state.zoom+delta)*100)/100,.75,2.5);fitBook();}
  function bind(){
    $('heroRead').addEventListener('click',()=>state.featured&&openBook(state.featured));$('featureRead').addEventListener('click',()=>state.featured&&openBook(state.featured));$('heroBook').addEventListener('click',()=>state.featured&&openBook(state.featured));
    document.querySelectorAll('[data-filter],[data-nav]').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.filter||b.dataset.nav;renderShelf();if(b.dataset.nav==='recent')$('collection').scrollIntoView();}));
    $('searchInput').addEventListener('input',e=>{state.query=e.target.value;renderShelf();});$('genreFilter').addEventListener('change',e=>{state.genre=e.target.value;renderShelf();});$('sortSelect').addEventListener('change',e=>{state.sort=e.target.value;renderShelf();});
    $('clearFilters').addEventListener('click',()=>{state.filter='all';state.query='';state.genre='';$('searchInput').value='';$('genreFilter').value='';renderShelf();});
    $('helpButton').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelp').addEventListener('click',()=>$('helpDialog').close());$('gotIt').addEventListener('click',()=>$('helpDialog').close());$('helpDialog').addEventListener('click',e=>{if(e.target===$('helpDialog')){const r=$('helpDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('helpDialog').close();}});
    $('openFolder').addEventListener('click',()=>$('folderInput').click());$('folderInput').addEventListener('change',async e=>{await importFolder(e.target.files);e.target.value='';});
    $('backToShelf').addEventListener('click',closeBook);$('previousPage').addEventListener('click',previous);$('nextPage').addEventListener('click',next);$('bookmarkButton').addEventListener('click',toggleBookmark);$('tocButton').addEventListener('click',()=>openDrawer());$('closeDrawer').addEventListener('click',()=>{closeDrawer();$('tocButton').focus();});$('drawerShade').addEventListener('click',closeDrawer);document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>{state.drawer=b.dataset.panel;renderDrawer();}));
    $('themeButton').addEventListener('click',()=>{saved.night=!saved.night;persist();$('readerView').classList.toggle('night',saved.night);$('themeButton').setAttribute('aria-pressed',String(saved.night));});$('focusButton').addEventListener('click',()=>setFocus(!state.focus));$('exitFocus').addEventListener('click',()=>setFocus(false));
    $('fullscreenButton').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('readerView').requestFullscreen();}catch{toast('当前浏览器不支持全屏。');}});
    $('layoutButton').addEventListener('click',()=>{if(window.innerWidth<760){toast('当前屏幕使用单页阅读，横向宽屏可切换双页。');return;}state.mode=isDouble()?'single':'double';saved.mode=state.mode;persist();renderPages();});$('zoomIn').addEventListener('click',()=>changeZoom(.25));$('zoomOut').addEventListener('click',()=>changeZoom(-.25));$('zoomReset').addEventListener('click',()=>{state.zoom=1;fitBook();});
    $('pageForm').addEventListener('submit',e=>{e.preventDefault();navigate(Number($('pageInput').value),false);$('pageInput').blur();});$('pageSlider').addEventListener('input',e=>navigate(Number(e.target.value),false));
    document.addEventListener('keydown',e=>{
      if(!state.current)return;
      if(e.key==='Escape'){if(!$('readerDrawer').hidden){closeDrawer();$('tocButton').focus();}else if(state.focus)setFocus(false);return;}
      if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||!$('readerDrawer').hidden||(e.target.tagName==='BUTTON'&&e.key===' '))return;
      if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();next();}else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();previous();}else if(e.key==='Home'){e.preventDefault();navigate(1,false);}else if(e.key==='End'){e.preventDefault();navigate(state.current.data.page_count,false);}
    });
    let touch=null;$('bookViewport').addEventListener('touchstart',e=>{if(e.touches.length===1)touch={x:e.touches[0].clientX,y:e.touches[0].clientY};else touch=null;},{passive:true});$('bookViewport').addEventListener('touchend',e=>{if(!touch||state.zoom>1)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.4){if(dx<0)next();else previous();}},{passive:true});
    let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.current)renderPages();},100);});if('ResizeObserver' in window){resizeObserver=new ResizeObserver(()=>fitBook());resizeObserver.observe($('bookViewport'));}
    window.addEventListener('pagehide',()=>{saveProgress();});
  }
  bind();loadLibrary();
})();
