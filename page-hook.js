
(function(){
  const HOST_OK = /(?:^|\.)ticketmaster\.|(?:^|\.)livenation\./i.test(location.host);
  if (!HOST_OK) return;

  const TOKEN = document.currentScript?.dataset?.tmToken || null;

  function safeParse(text){
    try { return JSON.parse(text); } catch(e){ return null; }
  }
  function send(json){
    try { window.postMessage({ __TM_INV__: true, payload: json, __TM_TOKEN__: TOKEN }, "*"); } catch(e){}
  }

  const origFetch = window.fetch;
  window.fetch = async function(input, init){
    const res = await origFetch(input, init);
    try {
      const url = (typeof input === "string") ? input : (input?.url || "");
      if (/ticketmaster|livenation/i.test(url)) {
        const clone = res.clone();
        clone.text().then(txt => { const j = safeParse(txt); if (j) send(j); }).catch(()=>{});
      }
    } catch(e){}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(...args){
    try { this.__tm_url__ = String(args[1] || ""); } catch(_) {}
    return origOpen.apply(this, args);
  };

  XMLHttpRequest.prototype.send = function(...args){
    this.addEventListener("load", () => {
      try {
        const url = this.__tm_url__ || this.responseURL || "";
        if (/ticketmaster|livenation/i.test(url)) {
          const ct = this.getResponseHeader("content-type") || "";
          if (ct.includes("json")) {
            const j = safeParse(this.responseText);
            if (j) send(j);
          }
        }
      } catch(e){}
    });
    return origSend.apply(this, args);
  };
})(); 
