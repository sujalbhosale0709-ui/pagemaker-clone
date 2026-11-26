let currentTool = 'text', selectedEl = null, zoomLevel = 1, activePageId = 1, totalPages = 1;
let pagesData = { 'M': '', 1: '' };

function saveCurrentPageContent() {
 const clone = document.getElementById('page').cloneNode(true);
 const guide = clone.querySelector('.margin-guide'), master = clone.querySelector('.master-layer');
 if (guide) guide.remove(); 
 if (master) master.remove();
 clone.querySelectorAll('.pm-element').forEach(el => el.classList.remove('selected', 'crop-mode'));
 pagesData[activePageId] = clone.innerHTML;
}

function switchPage(targetId) {
 saveCurrentPageContent(); 
 activePageId = targetId; 
 selectedEl = null;
 const page = document.getElementById('page');
 const masterHTML = (targetId === 'M') ? '' : (pagesData['M'] || '');
 page.innerHTML = `<div class="margin-guide"></div><div class="master-layer" id="master-layer">${masterHTML}</div>${pagesData[targetId] || ''}`;
 page.querySelectorAll(':scope > .pm-element').forEach(el => attachElementEvents(el));
 document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
 const tab = document.getElementById('tab-' + targetId);
 if (tab) tab.classList.add('active');
 document.getElementById('page-indicator').innerText = (targetId === 'M') ? '[Master Page]' : `[Page ${targetId} of ${totalPages}]`;
}

function insertNewPage() { 
 saveState();
 saveCurrentPageContent(); 
 totalPages++; 
 pagesData[totalPages] = ''; 
 renderPageTabs(); 
 switchPage(totalPages); 
}

function removeCurrentPage() {
 if (activePageId === 'M' || totalPages <= 1) return;
 if (!confirm(`Page ${activePageId} डिलीट करायचे का?`)) return;
 saveState();
 for (let i = activePageId; i < totalPages; i++) pagesData[i] = pagesData[i + 1];
 delete pagesData[totalPages]; 
 totalPages--; 
 renderPageTabs(); 
 switchPage(Math.min(activePageId, totalPages));
}

function renderPageTabs() {
 const bar = document.getElementById('page-bar');
 bar.innerHTML = `<div class="page-tab master ${activePageId === 'M' ? 'active' : ''}" id="tab-M" onclick="switchPage('M')">M</div>`;
 for (let i = 1; i <= totalPages; i++) {
  bar.innerHTML += `<div class="page-tab ${activePageId === i ? 'active' : ''}" id="tab-${i}" onclick="switchPage(${i})">${i}</div>`;
 }
 bar.innerHTML += `<button class="add-page-btn" onclick="insertNewPage()">+ Add Page</button>`;
}

function setPageSize(w, h) { 
 const p = document.getElementById('page'); 
 p.style.width = w + 'px'; 
 p.style.height = h + 'px'; 
 p.style.minWidth = w + 'px'; 
 p.style.minHeight = h + 'px'; 
}

function setZoom(l) { 
 zoomLevel = l; 
 document.getElementById('page').style.transform = `scale(${l})`; 
}

function printAllPages() {
 saveCurrentPageContent();
 const container = document.getElementById('print-all-container');
 container.innerHTML = '';
 const pageW = document.getElementById('page').style.width || '595px';
 const pageH = document.getElementById('page').style.height || '842px';
 for (let i = 1; i <= totalPages; i++) {
  const pDiv = document.createElement('div');
  pDiv.className = 'print-page'; 
  pDiv.style.width = pageW; 
  pDiv.style.height = pageH;
  pDiv.innerHTML = `<div class="master-layer">${pagesData['M'] || ''}</div>${pagesData[i] || ''}`;
  container.appendChild(pDiv);
 }
 window.print();
}
