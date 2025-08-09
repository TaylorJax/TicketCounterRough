
let cachedRows = [];
let includeResale = false;

function renderRows(rows, meta){
  const tbody = document.getElementById('items').getElementsByTagName('tbody')[0];
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  let counter = 1;
  for (const r of rows){
    const row = tbody.insertRow(-1);
    row.insertCell(0).appendChild(document.createTextNode(counter));
    row.insertCell(1).appendChild(document.createTextNode(r.section ?? ""));
    const price = (r.min!=null || r.max!=null) ? `${r.min ?? "?"} - ${r.max ?? "?"}` : "";
    row.insertCell(2).appendChild(document.createTextNode(price));
    row.insertCell(3).appendChild(document.createTextNode(r.count ?? "?"));
    counter++;
  }
  if (rows.length === 0){
    const row = tbody.insertRow(-1);
    row.insertCell(0).appendChild(document.createTextNode(""));
    row.insertCell(1).appendChild(document.createTextNode("No inventory"));
    row.insertCell(2).appendChild(document.createTextNode(""));
    row.insertCell(3).appendChild(document.createTextNode(""));
  }
  document.getElementById('meta').innerText = `Captured payloads: ${meta?.captured ?? 0} | Resale included: ${includeResale ? "Yes" : "No"}`;
}

function applyFilter(){
  const q = (document.getElementById('filter').value || "").trim().toLowerCase();
  if (!q){ renderRows(cachedRows, {captured: window.__capturedCount || 0}); return; }
  const rows = cachedRows.filter(r => (r.section||"").toLowerCase().includes(q));
  renderRows(rows, {captured: window.__capturedCount || 0});
}

function requestData() {
  chrome.tabs.query({active:true, currentWindow:true}, function(tabs){
    if (!tabs || !tabs.length) return;
    includeResale = document.getElementById('inclResale').checked;
    chrome.tabs.sendMessage(tabs[0].id, {from:'popup', subject:'getInfo', options:{includeResale}}, function(resp){
      try { 
        const obj = JSON.parse(resp); 
        cachedRows = obj.rows || []; 
        window.__capturedCount = obj.meta?.captured || 0;
      } catch(e){ cachedRows = []; }
      renderRows(cachedRows, {captured: window.__capturedCount});
      applyFilter();
    });
  });
}

function toCSV(rows){
  const header = ["No","Section","MinPrice","MaxPrice","Quantity"];
  const lines = [header.join(",")];
  let i=1;
  for (const r of rows){
    lines.push([i, JSON.stringify(r.section??""), r.min??"", r.max??"", r.count??""].join(","));
    i++;
  }
  return lines.join("\n");
}

function dumpPayloads(){
  chrome.tabs.query({active:true, currentWindow:true}, function(tabs){
    if (!tabs || !tabs.length) return;
    chrome.tabs.sendMessage(tabs[0].id, {from:'popup', subject:'dump'}, function(resp){
      const obj = JSON.parse(resp || "{}");
      const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tm_payload_dump.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  });
}

function resetCapture(){
  chrome.tabs.query({active:true, currentWindow:true}, function(tabs){
    if (!tabs || !tabs.length) return;
    chrome.tabs.sendMessage(tabs[0].id, {from:'popup', subject:'reset'}, function(_){
      cachedRows = []; window.__capturedCount = 0; renderRows(cachedRows, {captured: 0});
    });
  });
}

document.addEventListener('DOMContentLoaded', function(){
  document.getElementById('refresh').addEventListener('click', requestData);
  document.getElementById('filter').addEventListener('input', applyFilter);
  document.getElementById('csv').addEventListener('click', function(){
    const q = (document.getElementById('filter').value || "").trim().toLowerCase();
    const rows = q ? cachedRows.filter(r => (r.section||"").toLowerCase().includes(q)) : cachedRows;
    const blob = new Blob([toCSV(rows)], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tm_inventory.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('dump').addEventListener('click', dumpPayloads);
  document.getElementById('reset').addEventListener('click', resetCapture);
  document.getElementById('inclResale').addEventListener('change', requestData);
  requestData();
});
