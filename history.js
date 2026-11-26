let historyStack = [];

function saveState() {
 saveCurrentPageContent();
 historyStack.push(JSON.stringify({ pagesData, totalPages, activePageId }));
 if (historyStack.length > 25) historyStack.shift(); // जास्तीत जास्त २५ स्टेप्स सेव्ह राहतील
}

function undo() {
 if (historyStack.length === 0) return;
 const prevState = JSON.parse(historyStack.pop());
 pagesData = prevState.pagesData;
 totalPages = prevState.totalPages;
 renderPageTabs();
 switchPage(prevState.activePageId);
}

function saveProject() { 
 saveCurrentPageContent(); 
 const blob = new Blob([JSON.stringify({ pagesData, totalPages, activePageId })], { type: 'application/json' }); 
 const a = document.createElement('a'); 
 a.href = URL.createObjectURL(blob); 
 a.download = 'PageMaker7_MultiPage.json'; 
 a.click(); 
}

function loadProject(e) { 
 const f = e.target.files[0]; if (!f) return; 
 const r = new FileReader(); 
 r.onload = function(ev) { 
  const d = JSON.parse(ev.target.result); 
  pagesData = d.pagesData; 
  totalPages = d.totalPages; 
  renderPageTabs(); 
  switchPage(d.activePageId || 1); 
 }; 
 r.readAsText(f); 
}

function newDocument() { 
 if (confirm('नवीन पब्लिकेशन सुरू करायचे का?')) { 
  historyStack = [];
  pagesData = { 'M': '', 1: '' }; 
  totalPages = 1; 
  renderPageTabs(); 
  switchPage(1); 
 } 
}

// Keyboard Shortcuts (Ctrl+Z, Ctrl+D, Ctrl+S, Delete, Arrow Keys)
document.addEventListener('keydown', function(e) {
 // जर युजर मजकूर टाइप करत असेल तर शॉर्टकट्स थांबवा
 if (document.activeElement && document.activeElement.classList.contains('text-content')) return;

 if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
 if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); triggerPlaceImage(); }
 if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); }
 if (e.key === 'Delete' && selectedEl) { e.preventDefault(); deleteSelected(); }

 // Arrow keys ने बॉक्स हलवण्यासाठी
 if (selectedEl && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
  e.preventDefault();
  let step = e.shiftKey ? 10 : 1; // Shift दाबल्यास १० पिक्सेलने हलेल
  let x = parseInt(selectedEl.style.left) || 0;
  let y = parseInt(selectedEl.style.top) || 0;
  if (e.key === 'ArrowLeft') selectedEl.style.left = (x - step) + 'px';
  if (e.key === 'ArrowRight') selectedEl.style.left = (x + step) + 'px';
  if (e.key === 'ArrowUp') selectedEl.style.top = (y - step) + 'px';
  if (e.key === 'ArrowDown') selectedEl.style.top = (y + step) + 'px';
  updateControlPaletteInputs();
 }
});
