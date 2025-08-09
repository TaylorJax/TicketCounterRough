
(function(){
  if (!/(?:^|\.)ticketmaster\.|(?:^|\.)livenation\./i.test(location.host)) return;

  const CAP = 40;
  const captured = [];
  let sections = {};        
  let options = { includeResale: false };

  function qsa(sel){ try { return Array.from(document.querySelectorAll(sel)); } catch(e){ return []; } }

  function buildSectionMap(){
    try{
      const els = qsa("*[data-section-id], *[data-section-name]");
      for (const el of els){
        const id = el.getAttribute("data-section-id");
        const name = el.getAttribute("data-section-name");
        if (id){
          sections[id] = name || sections[id] || id;
        } else if (name){
          sections[name] = name;
        }
      }
    }catch(e){}
  }
  const mo = new MutationObserver(buildSectionMap);
  mo.observe(document.documentElement || document, {subtree:true, childList:true});

  function firstNonNull(...vals){
    for (const v of vals){ if (v !== undefined && v !== null) return v; }
    return null;
  }
  function toNumber(x){
    if (x == null) return null;
    // Support cents integers (like 12345 => $123.45)
    if (typeof x === "object"){
      const maybe = firstNonNull(x.value, x.amount, x.min, x.max);
      return toNumber(maybe);
    }
    const n = Number(x);
    if (!isFinite(n)) return null;
    // If it's a large int with no decimals and > 500 but divisible by 5, might be in cents
    if (Number.isInteger(n) && n > 2000 && n % 5 === 0) {
      // Heuristic: treat as cents if also too large to be face value (e.g. > 999)
      if (n > 999) return Math.round(n) / 100;
    }
    return n;
  }

  function looksResaleOrPlatinum(node){
    if (options.includeResale) return false;
    const t = JSON.stringify(node).toLowerCase();
    return /\bresale\b|\bverified\s*resale\b|\bsecondary\b|\bplatinum\b/.test(t) || node?.marketType === 'resale' || node?.isResale === true;
  }

  function uniqueAvailableCount(arr){
    const seen = new Set();
    let cnt = 0;
    for (const it of arr){
      const id = it?.id || it?.seatId || it?.offerId || it?.uid;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      if (looksResaleOrPlatinum(it)) continue;
      if (typeof it?.available === "boolean") { if (it.available) cnt += 1; continue; }
      if (typeof it?.isAvailable === "boolean") { if (it.isAvailable) cnt += 1; continue; }
      if (typeof it?.status === "string" && /available/i.test(it.status)) { cnt += 1; continue; }
      const v = toNumber(firstNonNull(it?.available, it?.quantity, it?.remaining, it?.availableCount));
      if (v) cnt += v;
    }
    return cnt || null;
  }

  function extractPriceFromNode(node){
    // Look for standard ranges
    const tryRange = (pr)=>{
      if (!pr) return [null,null];
      const min = toNumber(firstNonNull(pr.min, pr.low, pr.start, pr.faceValueMin, pr.minPrice, pr.priceMin, pr.amountMin, pr.from));
      const max = toNumber(firstNonNull(pr.max, pr.high, pr.end, pr.faceValueMax, pr.maxPrice, pr.priceMax, pr.amountMax, pr.to));
      return [min, max];
    };
    if (Array.isArray(node.priceRange) && node.priceRange.length) return tryRange(node.priceRange[0]);
    if (Array.isArray(node.offerPriceRanges) && node.offerPriceRanges.length) return tryRange(node.offerPriceRanges[0]);
    if (Array.isArray(node.faceValues) && node.faceValues.length) return tryRange(node.faceValues[0]);
    // Flat fields
    const flatMin = toNumber(firstNonNull(node.minPrice, node.low, node.start, node.faceValueMin, node.priceMin));
    const flatMax = toNumber(firstNonNull(node.maxPrice, node.high, node.end, node.faceValueMax, node.priceMax));
    if (flatMin != null || flatMax != null) return [flatMin, flatMax];
    // Dive into offers/seats/items to derive min/max
    function scanArray(arr){
      let mn = null, mx = null;
      for (const it of arr){
        if (looksResaleOrPlatinum(it)) continue;
        // common fields: price, listingPrice, total, amount, faceValue
        const candidates = [
          it.price, it.listingPrice, it.total, it.amount, it.faceValue, it.offerPrice, it.displayPrice, it.ticketPrice
        ];
        for (const c of candidates){
          const v = toNumber(firstNonNull(c?.value, c?.amount, c?.price, c?.total, c?.min, c?.max, c));
          if (v != null){
            mn = (mn==null)?v:Math.min(mn,v);
            mx = (mx==null)?v:Math.max(mx,v);
          }
        }
      }
      return [mn, mx];
    }
    if (Array.isArray(node.offers)){
      const [mn, mx] = scanArray(node.offers);
      if (mn != null || mx != null) return [mn, mx];
    }
    if (Array.isArray(node.seats)){
      const [mn, mx] = scanArray(node.seats);
      if (mn != null || mx != null) return [mn, mx];
    }
    if (Array.isArray(node.items)){
      const [mn, mx] = scanArray(node.items);
      if (mn != null || mx != null) return [mn, mx];
    }
    return [null, null];
  }

  function resolveSection(node){
    let s = firstNonNull(node.sectionName, node.section, node.name, node.sectionId, node.id);
    if (!s && Array.isArray(node.shapes) && node.shapes.length){
      const secId = String(node.shapes[0]);
      s = sections[secId] || secId;
    }
    if (!s && (node.generalAdmission || node.ga)) s = "GA";
    if (typeof s === "string" && /^s_?\d+$/i.test(s)){
      const key = s.replace(/^s_?/i, "s_");
      s = sections[key] || sections[s] || s;
    }
    if (typeof s === "string" && /lawn|general\s*admission|ga\b/i.test(s)) return "GA";
    return (s && String(s)) || null;
  }

  function getPrimaryCount(node){
    if (looksResaleOrPlatinum(node)) return null;
    const direct = toNumber(firstNonNull(node.count, node.available, node.quantity, node.availableCount, node.remaining, node.remainingQuantity));
    if (direct && direct > 0) return direct;
    if (node.statusCounts){
      const v = toNumber(firstNonNull(node.statusCounts.AVAILABLE, node.statusCounts.available, node.statusCounts.Open, node.statusCounts.open));
      if (v && v > 0) return v;
    }
    if (Array.isArray(node.offers)){ const s = uniqueAvailableCount(node.offers); if (s && s>0) return s; }
    if (Array.isArray(node.seats)){ const s = uniqueAvailableCount(node.seats); if (s && s>0) return s; }
    if (Array.isArray(node.items)){ const s = uniqueAvailableCount(node.items); if (s && s>0) return s; }
    if (node.inventory && typeof node.inventory === "object"){
      const v = toNumber(firstNonNull(node.inventory.available, node.inventory.remaining));
      if (v && v > 0) return v;
    }
    return null;
  }

  // Capture live payloads (ring buffer)
  window.addEventListener("message", (ev)=>{
    const data = ev.data;
    if (data && data.__TM_INV__ && data.payload){
      captured.push(data.payload);
      if (captured.length > CAP) captured.shift();
    }
  });

  try{
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("page-hook.js");
    (document.head || document.documentElement).appendChild(s);
    s.onload = ()=> s.remove();
  }catch(e){}

  function computeRows(){
    const agg = new Map();  // section -> {section,min,max,count}
    function applyNode(node, per){
      const c = getPrimaryCount(node);
      const sec = resolveSection(node);
      if (sec && c && c > 0){
        const [mn, mx] = extractPriceFromNode(node);
        const prev = per.get(sec) || {section: sec, min:null, max:null, count:0};
        prev.count += c;
        if (mn!=null) prev.min = (prev.min==null)?mn:Math.min(prev.min, mn);
        if (mx!=null) prev.max = (prev.max==null)?mx:Math.max(prev.max, mx);
        per.set(sec, prev);
      }
      if (Array.isArray(node)){
        for (const v of node) applyNode(v, per);
      } else if (node && typeof node === "object"){
        for (const k of Object.keys(node)) applyNode(node[k], per);
      }
    }

    for (const payload of captured){
      const per = new Map();
      try { applyNode(payload, per); } catch(e){}
      for (const [sec, val] of per.entries()){
        const key = sec.toUpperCase().trim();
        const prev = agg.get(key);
        if (!prev){
          agg.set(key, val);
        } else {
          prev.count = Math.max(prev.count||0, val.count||0);
          if (val.min!=null) prev.min = (prev.min==null)?val.min:Math.min(prev.min, val.min);
          if (val.max!=null) prev.max = (prev.max==null)?val.max:Math.max(prev.max, val.max);
        }
      }
    }

    return Array.from(agg.values())
      .filter(r => r.section && (r.count||0) > 0 && !/^s_?\d+$/i.test(r.section))
      .sort((a,b)=>(b.count||0)-(a.count||0));
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.from === "popup" && msg.subject === "getInfo"){
      buildSectionMap();
      try {
        options = msg.options || options;
        const rows = computeRows();
        sendResponse(JSON.stringify({ rows, meta: { captured: captured.length }}));
      } catch(e){
        sendResponse(JSON.stringify({ rows:[], meta:{captured: captured.length} }));
      }
      return true;
    }
    if (msg.from === "popup" && msg.subject === "setOptions"){
      options = Object.assign(options, msg.options||{});
      sendResponse({ok:true});
      return true;
    }
    if (msg.from === "popup" && msg.subject === "dump"){
      try {
        sendResponse(JSON.stringify({ payloads: captured.slice(-10) }));
      } catch(e){
        sendResponse(JSON.stringify({ payloads: [] }));
      }
      return true;
    }
    if (msg.from === "popup" && msg.subject === "reset"){
      captured.length = 0;
      sendResponse({ok:true});
      return true;
    }
  });

  buildSectionMap();
})();
