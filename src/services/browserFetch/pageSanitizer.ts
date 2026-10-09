/**
 * 可见网页的净化脚本：在首个节点出现前安装，目录识别仍读取原始链接和正文。
 * 使用 raw 字符串保留正则反斜杠；测试执行这段真实脚本，防止模板转义导致整段失效。
 */
export const PAGE_SANITIZER_JS = String.raw`(function () {
  if (window.__nvlSanitizerInstalled) return true;
  window.__nvlSanitizerInstalled = true;
  var roots = ['bookshuku.org','mingzw.net','bqquge.org'];
  var host = location.hostname.toLowerCase();
  function siteRoot(name) {
    for (var i=0;i<roots.length;i++) if (name===roots[i] || name.endsWith('.'+roots[i])) return roots[i];
    return '';
  }
  var site = siteRoot(host);
  var adSelector = [
    '#ad','#ads','#adbox','#ad-container','#ad_container','.ad','.ads','.adbox',
    '.ad-box','.ad-container','.advert','.advertisement','.adsbygoogle',
    '[id^="ad_"]','[id^="ads_"]','[id*="-ad-"]','[id*="_ad_"]',
    '[class^="ad_"]','[class^="ads_"]','[class*="-ad-"]','[class*="_ad_"]',
    '[data-ad-client]','[data-ad-slot]'
  ].join(',');
  var candidates = adSelector+',a[href],img,iframe,object,embed,video,audio,ins,[style],[class],style[id]';
  var hidden = 'data-nvl-hidden';
  var css = document.createElement('style');
  css.id = '__nvl_clean_style';
  css.textContent = '['+hidden+']{display:none!important;visibility:hidden!important;pointer-events:none!important;height:0!important;min-height:0!important;max-height:0!important;margin:0!important;padding:0!important;}';
  function installStyle() {
    if (!css.isConnected && document.documentElement) (document.head||document.documentElement).appendChild(css);
  }
  function parsed(value) { try { return new URL(value,location.href); } catch(ignore) { return null; } }
  function adUrl(value) {
    var u = parsed(value);
    return !!u && /(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com|g86a0qbf1h\.com|qdfg039\.com|kt6th8f\.com|lkg6odg\.com|5bjoeih\.com|xq04k6u\.com|qq26oeg\.com|uuyi[56]\.cc|mocprelu\.cc|dsygc\.com)$/.test(u.hostname);
  }
  function sameSite(value) {
    var u = parsed(value);
    return !!u && /^https?:$/.test(u.protocol) && (site ? siteRoot(u.hostname)===site : u.hostname===host);
  }
  function verification(node) {
    if (node.closest('[id^="cf-chl"],.cf-turnstile,.g-recaptcha,[id*="captcha"],[class*="captcha"]')) return true;
    var u = parsed(node.getAttribute('src')||node.getAttribute('data')||'');
    return !!u && (u.hostname==='challenges.cloudflare.com' || /(^|\.)(google\.com|recaptcha\.net|hcaptcha\.com)$/.test(u.hostname) && /captcha/.test(u.pathname));
  }
  function bookLink(node) {
    if (!node || node.tagName!=='A' || !sameSite(node.href)) return false;
    var u = parsed(node.href), p = u.pathname;
    if (site==='bqquge.org') return /^\/\d+(?:\/\d+)?\/?$/.test(p);
    if (site==='bookshuku.org') return /^\/(?:bookinfo\/\d+\.html|read\/\d+[\w.-]*\/?|txt\/\d+[\w./-]*)$/i.test(p);
    if (site==='mingzw.net') return /^\/(?:mi|mzw)(?:book|chapter|read)\/\d+[\w.-]*\.html$/i.test(p);
    return false;
  }
  function critical(node) {
    if (node===document.body || node===document.documentElement || verification(node) || bookLink(node)) return true;
    // 广告标记可能误包整个页面；表单、正文和目录容器不能整块隐藏，继续处理其内部广告。
    if (node.matches('form,input,button,textarea,select,main,article') || node.querySelector('form,input,textarea,select,main,article')) return true;
    if ((node.textContent||'').length>300 || node.childElementCount>30) return true;
    var links = node.querySelectorAll('a[href]');
    for (var i=0;i<links.length;i++) if (bookLink(links[i])) return true;
    return false;
  }
  function hide(node) {
    if (!node || critical(node)) return;
    if (!node.hasAttribute(hidden)) node.setAttribute(hidden,'');
    // 站点可能反复覆盖 inline style；仅在值确实变化时修复，避免观察器自我触发死循环。
    if (node.style.getPropertyValue('display')!=='none' || node.style.getPropertyPriority('display')!=='important') node.style.setProperty('display','none','important');
    if (/^(VIDEO|AUDIO)$/.test(node.tagName)) { try { node.pause(); node.removeAttribute('autoplay'); } catch(ignore) {} }
  }
  function hideWithEmptyWrapper(node) {
    hide(node);
    var wrap = node.parentElement;
    // 只收起确实已空的广告占位，不凭短文字长度隐藏相邻的搜索框、封面或导航。
    if (node.hasAttribute(hidden) && wrap && wrap.children.length===1 && !(wrap.textContent||'').trim()) hide(wrap);
  }
  function imageProtected(node) {
    var value = node.getAttribute('src')||node.getAttribute('data-src')||'';
    var anchor = node.closest('a[href]');
    return bookLink(anchor) || /\/(?:cover|covers)\//i.test(value) || /(?:^|\/)logo[\w.-]*\.(?:png|jpe?g|gif|svg|webp)(?:[?#]|$)/i.test(value) || !!node.closest('.cover,.book-cover,.bookCover');
  }
  var adult = /成人视频|成人直播|成人交友|色情网|色情|裸聊|约炮|同城约|无码|博彩|在线赌场|真人娱乐|澳门赌场|免费看片|激情视频|开元棋牌|包夜|玩弄她/;
  var promo = /广告|免费领取|立即下载|下载APP|APP下载|充值返利|点击领取|最新网址|最新地址|赚钱|博彩/;
  function cleanNode(node) {
    if (!node || node.nodeType!==1 || !node.isConnected || node===css) return;
    if (node.hasAttribute(hidden)) { hide(node); return; }
    if (verification(node)) return;
    if (node.tagName==='STYLE') {
      // 笔趣阁实测广告脚本会给 body 加 100px 底部占位，并生成透明点击网格。
      if (site && /_style_id$/.test(node.id) && /body\s*\{position:initial\s*!important;min-height:/.test(node.textContent||'') && /padding-bottom:100px/.test(node.textContent||'')) node.remove();
      return;
    }
    if (node.matches(adSelector)) { hide(node); return; }
    if (/^(IFRAME|OBJECT|EMBED)$/.test(node.tagName)) {
      if (site || adUrl(node.getAttribute('src')||node.getAttribute('data')||'')) hideWithEmptyWrapper(node);
      return;
    }
    if (site && /^(VIDEO|AUDIO)$/.test(node.tagName)) { hide(node); return; }
    if (node.tagName==='A') {
      if (bookLink(node)) { if (node.target && node.target!=='_self') node.target='_self'; return; }
      var label = (node.textContent||'').replace(/\s+/g,' ').trim();
      var external = !sameSite(node.href);
      var media = node.querySelector('img,video,iframe');
      if (adUrl(node.href) || (label.length<=100 && (adult.test(label) || external && promo.test(label))) || (site && external && media && !imageProtected(media))) hideWithEmptyWrapper(node);
      // 仅改变新窗口的打开方式，正常书籍链接继续在当前页浏览，不给站点弹窗入口。
      else if (node.target && node.target!=='_self') node.target='_self';
    }
    if (node.tagName==='IMG') {
      var anchor = node.closest('a[href]');
      if (adUrl(node.src) || anchor && adUrl(anchor.href)) { hideWithEmptyWrapper(anchor||node); return; }
      if (imageProtected(node)) return;
      if (adult.test(node.alt||'')) { hideWithEmptyWrapper(anchor||node); return; }
      if (site && anchor && !sameSite(anchor.href)) { hideWithEmptyWrapper(anchor); return; }
      var rect = node.getBoundingClientRect();
      var wide = rect.width>=Math.min(200,window.innerWidth*0.5) && rect.height>=40 && rect.width>=rect.height*1.8;
      // 已适配小说站只需要封面/Logo；横幅即使经过站内跳转或直接嵌图也应收起。
      if (wide && (site || anchor && !sameSite(anchor.href))) hideWithEmptyWrapper(anchor||node);
      return;
    }
    // 浮层只在有广告证据时处理；保留正常置顶导航、搜索和阅读工具栏。
    if ((!node.hasAttribute('style') && !node.matches('div[class],section[class],aside[class],a[class]')) || critical(node)) return;
    var computed = window.getComputedStyle(node);
    var floating = computed.position==='fixed' || computed.position==='sticky' || computed.position==='absolute' && Number(computed.zIndex)>=10;
    if (!floating) return;
    var text = (node.textContent||'').trim();
    var transparent = site && text.length===0 && !node.querySelector('img,input,button,a,svg') && parseFloat(computed.opacity)<0.1;
    // 原生实测：广告有时由随机 class 的空固定容器承载，内部不出现在普通 DOM。
    // 小说站不需要这种宽幅空浮层；从宿主隐藏，可同时盖住 shadow/pseudo 内容与点击区域。
    var rect = node.getBoundingClientRect();
    var emptyOverlay = site && text.length===0 && node.childElementCount===0 && rect.width>=Math.min(200,window.innerWidth*0.5) && rect.height>=40;
    var background = computed.backgroundImage && computed.backgroundImage!=='none';
    var linkedAd = false, anchors = node.querySelectorAll('a[href]');
    for (var i=0;i<anchors.length;i++) if (adUrl(anchors[i].href) || site && !sameSite(anchors[i].href)) linkedAd=true;
    if (transparent || emptyOverlay || text.length<150 && adult.test(text) || site && (background || linkedAd)) hide(node);
  }
  function clean(root) {
    if (!root || root.nodeType!==9 && !root.isConnected) return;
    if (root.nodeType===1) { cleanNode(root); if (root.hasAttribute(hidden)) return; }
    if (!root.querySelectorAll) return;
    var nodes = root.querySelectorAll(candidates);
    for (var i=0;i<nodes.length;i++) cleanNode(nodes[i]);
  }
  installStyle();
  clean(document);
  var pending = [], timer = null;
  function enqueue(node) {
    if (!node || node.nodeType!==1 && node.nodeType!==9) return;
    if (pending.indexOf(node)<0) pending.push(node);
    if (pending.length>32) pending=[document];
    if (timer===null) timer=setTimeout(flush,80);
  }
  function flush() {
    timer=null; installStyle();
    var batch=pending; pending=[];
    for (var i=0;i<batch.length;i++) {
      var covered=false;
      for (var j=0;j<batch.length;j++) if (i!==j && batch[j].contains(batch[i])) { covered=true; break; }
      if (!covered) clean(batch[i]);
    }
  }
  // 只处理变化的子树并合并同一批变动，长目录不再每次广告改 src 就全页扫描。
  new MutationObserver(function(records) {
    for (var i=0;i<records.length;i++) {
      var r=records[i];
      if (r.type==='attributes') enqueue(r.target);
      else for (var j=0;j<r.addedNodes.length;j++) enqueue(r.addedNodes[j].nodeType===1 ? r.addedNodes[j] : r.target);
    }
    installStyle();
  }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['src','data-src','srcset','href','class','id','style']});
  document.addEventListener('load',function(event) { enqueue(event.target); },true);
  document.addEventListener('DOMContentLoaded',function() { enqueue(document); });
  window.addEventListener('load',function() { enqueue(document); });
  // CSS/图片可能晚于首轮 DOM 到达，只补一次整体排版检查，不启动周期性全页扫描。
  setTimeout(function() { enqueue(document); },1500);
  window.open=function(value) {
    // 允许真实点击触发的同站搜索/阅读在当前页打开，阻止定时器与外域广告弹窗。
    if (value && sameSite(value) && window.event && window.event.isTrusted) location.assign(value);
    return null;
  };
  document.addEventListener('submit',function(event) {
    var form=event.target;
    if (form && form.tagName==='FORM' && form.target && form.target!=='_self') form.target='_self';
  },true);
  // 捕获阶段先挡住广告点击；合法 target=_blank 链接改为当前页，后续站内搜索不受影响。
  document.addEventListener('click',function(event) {
    var target=event.target && event.target.closest ? event.target : null;
    var anchor=target && target.closest('a[href]');
    if (target && target.closest('['+hidden+']') || anchor && (adUrl(anchor.href) || site && !sameSite(anchor.href) && /^https?:/i.test(anchor.href))) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    if (anchor && anchor.target && anchor.target!=='_self') anchor.target='_self';
  },true);
  return true;
})(); true;`;
