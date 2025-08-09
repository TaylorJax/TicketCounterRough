
(function(){
  const HOST_OK = /(?:^|\.)ticketmaster\.|(?:^|\.)livenation\./i.test(location.host);
  if (!HOST_OK) { return; }
  function safeParse(text){
    try { return JSON.parse(text); } catch(e){ return null; }
  }
  function send(json){
    try { window.postMessage({ __TM_INV__: true, payload: json }, "*"); } catch(e){}
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
  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR(){
    const xhr = new OrigXHR();
    xhr.addEventListener("load", function(){
      try {
        const url = this.responseURL || "";
        if (/ticketmaster|livenation/i.test(url)) {
          const ct = this.getResponseHeader("content-type") || "";
          if (ct.includes("json")) {
            const j = safeParse(this.responseText);
            if (j) send(j);
          }
        }
      } catch(e){}
    });
    return xhr;
  }
  window.XMLHttpRequest = PatchedXHR;
})(); 
