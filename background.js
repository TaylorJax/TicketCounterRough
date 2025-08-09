chrome.runtime.onMessage.addListener((m,s,r)=>{ if(m?.type==='PING') r({ok:true}); });
