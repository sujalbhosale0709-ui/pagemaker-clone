let historyStack = [];

function saveState() {
  saveCurrentPageContent();
  historyStack.push(JSON.stringify({
    pagesData,
    pageGuides,
    pageColumns,
    totalPages,
    activePageId
  }));
  if (historyStack.length > 35) historyStack.shift();
}

function undo() {
  if (historyStack.length === 0) return;
  const prev = JSON.parse(historyStack.pop());
  pagesData = prev.pagesData || { 'M': '', 1: '' };
  pageGuides = prev.pageGuides || { 'M': { h: [], v: [] }, 1: { h: [], v: [] } };
  pageColumns = prev.pageColumns || { 'M': { count: 1, gutter: 12 }, 1: { count: 1, gutter: 12 } };
  totalPages = prev.totalPages || 1;
  renderPageTabs();
  switchPage(prev.activePageId || 1);
}

function saveProject() {
  saveCurrentPageContent();
  const payload = JSON.stringify({ pagesData, pageGuides, pageColumns, totalPages, activePageId });
  const blob = new Blob([payload], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'PageMaker7_Project.json';
  a.click();
}

function loadProject(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = function(ev) {
    const d = JSON.parse(ev.target.result);
    pagesData = d.pagesData || { 'M': '', 1: '' };
    pageGuides = d.pageGuides || { 'M': { h: [], v: [] }, 1: { h: [], v: [] } };
    pageColumns = d.pageColumns || { 'M': { count: 1, gutter: 12 }, 1: { count: 1, gutter: 12 } };
    totalPages = d.totalPages || 1;
    renderPageTabs();
    switchPage(d.activePageId || 1);
  };
  r.readAsText(f);
  e.target.value = '';
}

function newDocument() {
  if (confirm('नवीन पब्लिकेशन सुरू करायचे का?')) {
    historyStack = [];
    pagesData = { 'M': '', 1: '' };
    pageGuides = { 'M': { h: [], v: [] }, 1: { h: [], v: [] } };
    pageColumns = { 'M': { count: 1, gutter: 12 }, 1: { count: 1, gutter: 12 } };
    totalPages = 1;
    renderPageTabs();
    switchPage(1);
  }
}

document.addEventListener('keydown', function(e) {
  const isTyping = document.activeElement &&
    (document.activeElement.classList.contains('text-content') ||
     ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName));

  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); undo(); return; }
    if (k === 's') { e.preventDefault(); saveProject(); return; }
    if (k === 'p') { e.preventDefault(); printAllPages(); return; }
    if (!isTyping && k === 'd') { e.preventDefault(); triggerPlaceImage(); return; }
    if (!isTyping && k === 'a') { e.preventDefault(); selectAllOnPage(); return; }
  }

  if (isTyping) {
    if (e.key === 'Escape') {
      document.activeElement.blur();
      selectTool('pointer');
    }
    return;
  }

  const k = e.key.toLowerCase();
  if (e.key === 'Escape') { selectTool('pointer'); return; }
  if (k === 't') { selectTool('text'); return; }
  if (k === 'v') { selectTool('pointer'); return; }
  if (k === 'r') { selectTool('rotate'); return; }
  if (k === 'c') { selectTool('crop'); return; }
  if (k === 'h') { selectTool('hand'); return; }
  if (k === 'z') { selectTool('zoom'); return; }

  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEl) {
    e.preventDefault();
    deleteSelected();
    return;
  }

  if (selectedEl && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const x = parseInt(selectedEl.style.left) || 0;
    const y = parseInt(selectedEl.style.top) || 0;
    if (e.key === 'ArrowLeft') selectedEl.style.left = (x - step) + 'px';
    if (e.key === 'ArrowRight') selectedEl.style.left = (x + step) + 'px';
    if (e.key === 'ArrowUp') selectedEl.style.top = (y - step) + 'px';
    if (e.key === 'ArrowDown') selectedEl.style.top = (y + step) + 'px';
    updateControlPaletteInputs();
  }
});
