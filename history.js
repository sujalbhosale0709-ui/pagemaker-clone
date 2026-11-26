let historyStack = [];
let redoStack = [];
const MAX_HISTORY = 40;

function captureSnapshot() {
  saveCurrentPageContent();
  return {
    activePageId,
    totalPages,
    currentPageW,
    currentPageH,
    pagesData: { ...pagesData },
    pageGuides: JSON.parse(JSON.stringify(pageGuides)),
    pageColumns: JSON.parse(JSON.stringify(pageColumns))
  };
}

function restoreSnapshot(snap) {
  if (!snap) return;
  totalPages = snap.totalPages;
  currentPageW = snap.currentPageW;
  currentPageH = snap.currentPageH;
  pagesData = { ...snap.pagesData };
  pageGuides = JSON.parse(JSON.stringify(snap.pageGuides));
  pageColumns = JSON.parse(JSON.stringify(snap.pageColumns));

  const p = document.getElementById('page');
  p.style.width = currentPageW + 'px';
  p.style.height = currentPageH + 'px';
  p.style.minWidth = currentPageW + 'px';
  p.style.minHeight = currentPageH + 'px';
  updateMarginGuide();

  renderPageTabs();
  activePageId = snap.activePageId;
  ensurePageState(activePageId);
  selectedEl = null;

  const masterHTML = (activePageId === 'M') ? '' : cleanMasterHTML(pagesData['M'] || '');
  p.innerHTML =
    `<div class="margin-guide" id="margin-guide"></div>` +
    `<div class="master-layer" id="master-layer">${masterHTML}</div>` +
    `<div class="guides-layer" id="guides-layer"></div>` +
    `${pagesData[activePageId] || ''}`;

  updateMarginGuide();
  p.querySelectorAll(':scope > .pm-element').forEach(el => {
    attachElementEvents(el);
    checkTextOverflow(el);
  });
  renderGuides();
  buildRulers();

  document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById('tab-' + activePageId);
  if (tab) tab.classList.add('active');
  document.getElementById('page-indicator').innerText =
    (activePageId === 'M') ? '[Master Page]' : `[Page ${activePageId} of ${totalPages}]`;
}

function saveState() {
  historyStack.push(captureSnapshot());
  if (historyStack.length > MAX_HISTORY) {
    historyStack.shift();
  }
  redoStack = [];
}

function undo() {
  if (historyStack.length === 0) return;
  redoStack.push(captureSnapshot());
  const prev = historyStack.pop();
  restoreSnapshot(prev);
}

function redo() {
  if (redoStack.length === 0) return;
  historyStack.push(captureSnapshot());
  const next = redoStack.pop();
  restoreSnapshot(next);
}

function newDocument() {
  if (!confirm('नवीन पब्लिकेशन सुरू करायचे का? (सध्याचे सेव्ह नसलेले बदल जातील)')) return;
  saveState();
  activePageId = 1;
  totalPages = 1;
  currentPageW = 816;
  currentPageH = 1056;
  pagesData = { 'M': '', 1: '' };
  pageGuides = { 'M': { h: [], v: [] }, 1: { h: [], v: [] } };
  pageColumns = { 'M': { count: 1, gutter: 12 }, 1: { count: 1, gutter: 12 } };
  selectedEl = null;
  setPageSize(currentPageW, currentPageH);
  renderPageTabs();
  switchPage(1);
}

function saveProject() {
  saveCurrentPageContent();
  const data = {
    version: 'pagemaker-7.0-web',
    activePageId,
    totalPages,
    currentPageW,
    currentPageH,
    pagesData,
    pageGuides,
    pageColumns
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pagemaker_project.json';
  a.click();
  URL.revokeObjectURL(url);
}

function loadProject(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      saveState();
      totalPages = data.totalPages || 1;
      currentPageW = data.currentPageW || 816;
      currentPageH = data.currentPageH || 1056;
      pagesData = data.pagesData || { 'M': '', 1: '' };
      pageGuides = data.pageGuides || { 'M': { h: [], v: [] }, 1: { h: [], v: [] } };
      pageColumns = data.pageColumns || { 'M': { count: 1, gutter: 12 }, 1: { count: 1, gutter: 12 } };
      setPageSize(currentPageW, currentPageH);
      renderPageTabs();
      switchPage(data.activePageId || 1);
    } catch (err) {
      alert('वैध .json प्रोजेक्ट फाईल निवडा.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}
