let clipboardElementHTML = null;
const SAVED_FILES_STORAGE_KEY = 'pm_saved_files_v1';
const ACTIVE_DOC_STORAGE_KEY = 'pm_active_doc_v1';
const IDB_NAME = 'PageMakerDTP_DB';
const IDB_STORE = 'store';
const ANCESTRY_PX_PER_INCH = 96;
const ANCESTRY_STEP_INCH = 0.01;

function showQuickToast(msg) {
  let toast = document.getElementById('pm-quick-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pm-quick-toast';
    toast.style.cssText = 'position:fixed;top:54px;left:50%;transform:translateX(-50%);background:#0a246a;color:#fff;padding:6px 12px;border:1px solid #fff;z-index:9999;font-size:11px;box-shadow:2px 2px 6px rgba(0,0,0,0.4);max-width:90vw;text-align:center;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.display = 'none';
  }, 2200);
}

function openIDB() {
  return new Promise((resolve) => {
    try {
      if (!window.indexedDB) return resolve(null);
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = (ev) => resolve(ev.target.result);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function writeToIDB(key, value) {
  return new Promise(async (resolve) => {
    const db = await openIDB();
    if (!db) return resolve(false);
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

function readFromIDB(key) {
  return new Promise(async (resolve) => {
    const db = await openIDB();
    if (!db) return resolve(null);
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function getCurrentPageDims() {
  const pageEl = document.getElementById('page');
  const w = parseInt(pageEl && pageEl.style.width) || (typeof currentPageW !== 'undefined' ? currentPageW : 816);
  const h = parseInt(pageEl && pageEl.style.height) || (typeof currentPageH !== 'undefined' ? currentPageH : 1056);
  const m = (typeof getPageMargins === 'function')
    ? getPageMargins(w, h)
    : { left: 96, right: 72, top: 72, bottom: 72 };
  return { w, h, m };
}

function getPageElementsOnlyHtml() {
  const pageEl = document.getElementById('page');
  if (!pageEl) return '';
  const clone = pageEl.cloneNode(true);
  ['#margin-guide', '#master-layer', '#guides-layer', '.margin-guide', '.guides-layer', '.handle', '.overflow-badge', '.anc-ui-layer', '.anc-floating-bar'].forEach(sel => {
    clone.querySelectorAll(sel).forEach(n => n.remove());
  });
  clone.querySelectorAll('.pm-element').forEach(el => {
    el.classList.remove('selected', 'crop-mode');
    el.style.outline = 'none';
    el.style.border = 'none';
    el.style.boxShadow = 'none';
  });
  return clone.innerHTML;
}

function ensureDocStore() {
  const { w, h } = getCurrentPageDims();
  if (typeof window.pageOrder === 'undefined' || !Array.isArray(window.pageOrder) || !window.pageOrder.length) {
    window.pageOrder = [1];
  }
  if (typeof window.pagesData === 'undefined' || !window.pagesData || typeof window.pagesData !== 'object') {
    window.pagesData = { 1: { html: '', width: w, height: h } };
  }
  if (typeof window.activePageId === 'undefined' || !window.activePageId) {
    window.activePageId = 1;
  }
  const cur = window.activePageId;
  if (!window.pagesData[cur]) {
    window.pagesData[cur] = { html: '', width: w, height: h };
  }
}

function saveCurrentActivePageIntoData() {
  ensureDocStore();
  const curId = window.activePageId;
  const { w, h } = getCurrentPageDims();
  const currentHtml = getPageElementsOnlyHtml();
  window.pagesData[curId] = { html: currentHtml, width: w, height: h };
  persistActiveSession();
}

function persistActiveSession() {
  try {
    ensureDocStore();
    const { m } = getCurrentPageDims();
    const sessionObj = {
      activePageId: window.activePageId,
      pageOrder: window.pageOrder.slice(),
      pagesData: window.pagesData,
      margins: Object.assign({}, m)
    };
    const serialized = JSON.stringify(sessionObj);
    localStorage.setItem(ACTIVE_DOC_STORAGE_KEY, serialized);
    writeToIDB(ACTIVE_DOC_STORAGE_KEY, serialized);
  } catch (err) {}
}

function applyRestoredSessionObject(parsed) {
  if (!parsed || !Array.isArray(parsed.pageOrder) || !parsed.pagesData) return false;
  window.pageOrder = parsed.pageOrder.slice();
  window.pagesData = parsed.pagesData;
  window.activePageId = parsed.activePageId || window.pageOrder[0] || 1;

  if (parsed.margins && typeof pageMargins !== 'undefined') {
    window.pageOrder.forEach(pNo => {
      pageMargins[pNo] = Object.assign({}, parsed.margins);
    });
  }

  const startPage = window.pagesData[window.activePageId] || { html: '' };
  renderPageElementsIntoCanvas(startPage.html || '');
  refreshPageBarTabs();
  return true;
}

async function restoreActiveSessionIfPresent() {
  try {
    let raw = localStorage.getItem(ACTIVE_DOC_STORAGE_KEY);
    const idbRaw = await readFromIDB(ACTIVE_DOC_STORAGE_KEY);
    if (!raw && idbRaw) {
      raw = idbRaw;
      try { localStorage.setItem(ACTIVE_DOC_STORAGE_KEY, idbRaw); } catch (e) {}
    } else if (raw && !idbRaw) {
      await writeToIDB(ACTIVE_DOC_STORAGE_KEY, raw);
    }
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return applyRestoredSessionObject(parsed);
  } catch (err) {
    return false;
  }
}

function renderPageElementsIntoCanvas(htmlStr) {
  const pageEl = document.getElementById('page');
  if (!pageEl) return;
  pageEl.querySelectorAll(':scope > .pm-element').forEach(el => el.remove());

  const { m } = getCurrentPageDims();
  const mg = document.getElementById('margin-guide');
  if (mg) {
    mg.style.top = m.top + 'px';
    mg.style.left = m.left + 'px';
    mg.style.right = m.right + 'px';
    mg.style.bottom = m.bottom + 'px';
  }

  if (htmlStr) {
    const temp = document.createElement('div');
    temp.innerHTML = htmlStr;
    Array.from(temp.children).forEach(child => {
      if (child.classList && child.classList.contains('pm-element')) {
        attachElementEvents(child);
        pageEl.appendChild(child);
      }
    });
  }
  selectedEl = null;
  removeAncestryFloatingBar();
}

function refreshPageBarTabs() {
  const bar = document.getElementById('page-bar');
  if (!bar) return;
  ensureDocStore();

  const normalPages = window.pageOrder.filter(p => p !== 'M');
  const curId = window.activePageId;

  let html = `<div class="page-tab master ${curId === 'M' ? 'active' : ''}" id="tab-M" onclick="pmSwitchToPage('M')">M</div>`;
  normalPages.forEach(pNum => {
    html += `<div class="page-tab ${curId === pNum ? 'active' : ''}" id="tab-${pNum}" onclick="pmSwitchToPage(${pNum})">${pNum}</div>`;
  });
  html += `<button type="button" class="add-page-btn" id="add-page-btn" onclick="pmActionAddPage(event)">+ Page</button>`;
  bar.innerHTML = html;

  const ind = document.getElementById('page-indicator');
  if (ind) {
    const label = curId === 'M' ? 'Master' : curId;
    ind.textContent = `[Page ${label} of ${normalPages.length}]`;
  }
}

function pmSwitchToPage(targetId) {
  saveCurrentActivePageIntoData();
  window.activePageId = targetId;
  const { w, h } = getCurrentPageDims();
  const pData = window.pagesData[targetId] || { html: '', width: w, height: h };
  renderPageElementsIntoCanvas(pData.html || '');
  refreshPageBarTabs();
  persistActiveSession();
}

function pmActionAddPage(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  ensureDocStore();
  saveCurrentActivePageIntoData();

  const normalPages = window.pageOrder.filter(p => p !== 'M');
  const nextPageNo = (normalPages.length ? Math.max(...normalPages) : 0) + 1;
  const { w, h, m } = getCurrentPageDims();

  if (typeof pageMargins !== 'undefined') {
    pageMargins[nextPageNo] = Object.assign({}, m);
  }
  window.pagesData[nextPageNo] = { html: '', width: w, height: h };
  if (!window.pageOrder.includes(nextPageNo)) {
    window.pageOrder.push(nextPageNo);
  }
  window.activePageId = nextPageNo;

  renderPageElementsIntoCanvas('');
  refreshPageBarTabs();
  persistActiveSession();
  showQuickToast(`Page ${nextPageNo} तयार (कोरे पान)`);
}

function pmActionSave(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  saveCurrentActivePageIntoData();

  const printContainer = document.getElementById('print-all-container');
  const { w, h } = getCurrentPageDims();
  const normalPages = window.pageOrder.filter(p => p !== 'M');

  let pagesHtml = '';
  normalPages.forEach(pNo => {
    const pData = window.pagesData[pNo] || null;
    const rawHtml = pData && pData.html ? pData.html : '';
    pagesHtml += `
      <div class="print-page" style="width:${w}px;height:${h}px;position:relative;background:#ffffff;page-break-after:always;break-after:page;overflow:hidden;">
        ${rawHtml}
      </div>
    `;
  });

  if (printContainer) {
    printContainer.innerHTML = pagesHtml;
  }
  window.print();
}

function parseFilesListSafe(raw) {
  try {
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function mergeFileLists(lsList, idbList) {
  const map = new Map();
  [...idbList, ...lsList].forEach((item, i) => {
    if (item && item.id) {
      const prev = map.get(item.id);
      map.set(item.id, Object.assign({ no: i + 1 }, prev || {}, item));
    }
  });
  return Array.from(map.values()).map((item, i) => Object.assign({}, item, { no: i + 1 }));
}

function getSavedFilesFromStorage() {
  try {
    const raw = localStorage.getItem(SAVED_FILES_STORAGE_KEY);
    return parseFilesListSafe(raw);
  } catch (err) {
    return [];
  }
}

async function saveSavedFilesList(list) {
  try {
    const serialized = JSON.stringify(list);
    try { localStorage.setItem(SAVED_FILES_STORAGE_KEY, serialized); } catch (e) {}
    await writeToIDB(SAVED_FILES_STORAGE_KEY, serialized);
  } catch (err) {}
}

async function hydrateSavedFilesOnLoad() {
  try {
    const lsList = getSavedFilesFromStorage();
    const idbRaw = await readFromIDB(SAVED_FILES_STORAGE_KEY);
    const idbList = parseFilesListSafe(idbRaw);
    const merged = mergeFileLists(lsList, idbList);
    if (merged.length) {
      await saveSavedFilesList(merged);
    }
    renderSavedFilesDrawerList();
  } catch (e) {
    renderSavedFilesDrawerList();
  }
}

async function persistSnapshotToStorage() {
  ensureDocStore();
  saveCurrentActivePageIntoData();
  const normalPages = window.pageOrder.filter(p => p !== 'M');
  const { w, h, m } = getCurrentPageDims();

  const clonedPages = {};
  normalPages.forEach(pNo => {
    const d = window.pagesData[pNo] || { html: '', width: w, height: h };
    clonedPages[pNo] = { html: d.html || '', width: d.width || w, height: d.height || h };
  });

  const existing = getSavedFilesFromStorage();
  const fileNo = existing.length + 1;
  const nowStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const record = {
    id: 'file_' + Date.now() + '_' + fileNo,
    no: fileNo,
    title: `File ${fileNo} (${normalPages.length}p · ${nowStr})`,
    pageOrder: normalPages,
    pagesData: clonedPages,
    margins: Object.assign({}, m)
  };

  existing.push(record);
  await saveSavedFilesList(existing);
  renderSavedFilesDrawerList();
  return record;
}

async function renameStoredFileById(fileId) {
  const files = getSavedFilesFromStorage();
  const found = files.find(f => f.id === fileId);
  if (!found) return;

  const currentName = found.title || (`File ${found.no || ''}`);
  const nextName = prompt('फाईलचे नवीन नाव लिहा:', currentName);
  if (nextName === null) return;

  const trimmed = nextName.trim();
  if (!trimmed) {
    alert('कृपया रिकामे नाव देऊ नका.');
    return;
  }

  found.title = trimmed;
  await saveSavedFilesList(files);
  renderSavedFilesDrawerList();
  showQuickToast('फाईलचे नाव बदलले.');
}

async function deleteStoredFileById(fileId) {
  const files = getSavedFilesFromStorage();
  const found = files.find(f => f.id === fileId);
  if (!found) return;

  const label = found.title || (`File ${found.no || ''}`);
  if (!confirm(`"${label}" ही फाईल डिलिट करायची का?`)) return;

  const updated = files.filter(f => f.id !== fileId);
  await saveSavedFilesList(updated);
  renderSavedFilesDrawerList();
  showQuickToast('फाईल डिलिट झाली.');
}

function renderSavedFilesDrawerList() {
  const container = document.getElementById('saved-files-list');
  if (!container) return;

  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.flexWrap = 'nowrap';
  container.style.gap = '6px';
  container.style.maxHeight = '65vh';
  container.style.overflowY = 'auto';
  container.style.overflowX = 'hidden';
  container.style.webkitOverflowScrolling = 'touch';

  const files = getSavedFilesFromStorage();
  if (!files.length) {
    container.innerHTML = '<div style="padding:8px;color:#000;">अजून कोणतीही फाईल सेव्ह झालेली नाही.</div>';
    return;
  }

  container.innerHTML = '';
  files.forEach((f, idx) => {
    const num = f.no || (idx + 1);
    const pCount = Array.isArray(f.pageOrder) ? f.pageOrder.length : 1;
    const displayTitle = f.title || (`File ${num}`);

    const itemRow = document.createElement('div');
    itemRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;width:100%;box-sizing:border-box;gap:6px;background:#e0ded8;border:1px solid #808080;padding:5px 6px;flex-shrink:0;';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'page-tab';
    openBtn.style.cssText = 'flex:1;min-width:0;text-align:left;padding:6px 8px;font-size:11px;touch-action:manipulation;cursor:pointer;background:#ffffff;border:1px solid #000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    openBtn.textContent = `${num}. ${displayTitle} [${pCount} Page]`;
    openBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openStoredFileById(f.id);
    });

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0;';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'btn';
    renameBtn.style.cssText = 'padding:5px 8px;font-size:10px;touch-action:manipulation;cursor:pointer;';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      renameStoredFileById(f.id);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn';
    delBtn.style.cssText = 'padding:5px 8px;font-size:10px;touch-action:manipulation;cursor:pointer;color:#8b0000;font-weight:bold;';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      deleteStoredFileById(f.id);
    });

    btnGroup.appendChild(renameBtn);
    btnGroup.appendChild(delBtn);

    itemRow.appendChild(openBtn);
    itemRow.appendChild(btnGroup);
    container.appendChild(itemRow);
  });
}

async function toggleSavedFilesDrawer(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  closeMenus();
  const drawer = document.getElementById('saved-files-drawer');
  if (!drawer) return;
  const isOpen = drawer.style.display === 'block';
  await hydrateSavedFilesOnLoad();
  drawer.style.display = isOpen ? 'none' : 'block';
}

function openStoredFileById(fileId) {
  const files = getSavedFilesFromStorage();
  const found = files.find(f => f.id === fileId);
  if (!found) return;

  const orderList = Array.isArray(found.pageOrder) && found.pageOrder.length ? found.pageOrder.slice() : [1];
  window.pageOrder = orderList;
  window.pagesData = {};

  orderList.forEach(pNo => {
    const src = found.pagesData && found.pagesData[pNo] ? found.pagesData[pNo] : { html: '', width: 816, height: 1056 };
    window.pagesData[pNo] = { html: src.html || '', width: src.width || 816, height: src.height || 1056 };
  });

  if (found.margins && typeof pageMargins !== 'undefined') {
    orderList.forEach(pNo => {
      pageMargins[pNo] = Object.assign({}, found.margins);
    });
  }

  window.activePageId = orderList[0];

  const firstHtml = window.pagesData[orderList[0]] ? window.pagesData[orderList[0]].html : '';
  renderPageElementsIntoCanvas(firstHtml);
  refreshPageBarTabs();
  persistActiveSession();

  const drawer = document.getElementById('saved-files-drawer');
  if (drawer) drawer.style.display = 'none';

  showQuickToast(`File ${found.no || ''} ओपन झाली (${orderList.length} पेजेस)`);
}

async function pmActionNew(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const savedRec = await persistSnapshotToStorage();

  const { w, h } = getCurrentPageDims();
  window.pageOrder = [1];
  window.pagesData = { 1: { html: '', width: w, height: h } };
  window.activePageId = 1;

  renderPageElementsIntoCanvas('');
  refreshPageBarTabs();
  persistActiveSession();
  showQuickToast(`File ${savedRec.no} सेव्ह झाली · नवीन कोरे पान (Page 1)`);
}

window.addEventListener('DOMContentLoaded', async () => {
  ensureDocStore();
  await restoreActiveSessionIfPresent();
  refreshPageBarTabs();
  await hydrateSavedFilesOnLoad();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveCurrentActivePageIntoData();
  }
});

function toggleMenu(e, id) {
  e.stopPropagation();
  const t = document.getElementById(id);
  const s = t.classList.contains('show');
  closeMenus();
  if (!s) t.classList.add('show');
}

function closeMenus() {
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('show'));
}

function toggleToolbox() {
  const tb = document.getElementById('toolbox');
  tb.style.display = (tb.style.display === 'none') ? 'block' : 'none';
}

function toggleControlPalette() {
  const cp = document.getElementById('control-palette');
  cp.style.display = (cp.style.display === 'none') ? 'flex' : 'none';
}

function toggleColorPalette() {
  const cp = document.getElementById('color-palette');
  cp.classList.toggle('open');
}

function makePaletteDraggable(boxId, handleId) {
  const box = document.getElementById(boxId);
  const handle = document.getElementById(handleId);
  if (!box || !handle) return;

  handle.onpointerdown = (e) => {
    if (e.target.tagName === 'SPAN' && e.target.textContent === '×') return;
    e.preventDefault();
    e.stopPropagation();
    const rect = box.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    function onMove(ev) {
      const nx = Math.max(0, Math.min(window.innerWidth - 40, ev.clientX - sx));
      const ny = Math.max(22, Math.min(window.innerHeight - 30, ev.clientY - sy));
      box.style.left = nx + 'px';
      box.style.top = ny + 'px';
      box.style.right = 'auto';
      box.style.bottom = 'auto';
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
}

function selectTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('tool-' + tool);
  if (btn) btn.classList.add('active');

  document.getElementById('pasteboard').style.cursor =
    (tool === 'hand') ? 'grab' : (tool === 'zoom' ? 'zoom-in' : (tool === 'pointer' ? 'default' : 'crosshair'));

  document.querySelectorAll('#page > .pm-element').forEach(el => {
    el.classList.toggle('crop-mode', tool === 'crop' && el === selectedEl);
  });
  document.querySelectorAll('#page > .pm-element .text-content').forEach(tc => {
    tc.contentEditable = 'true';
    tc.style.cursor = (tool === 'text') ? 'text' : 'move';
  });
}

/* =========================================================
   वंशावळ कनेक्टर शेप टूल (Ancestry Connector Shape Tool)
   ========================================================= */
function computeEqualDropRatios(count) {
  const n = Math.max(1, parseInt(count) || 1);
  if (n === 1) return [0.5];
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push(Number((i / (n - 1)).toFixed(4)));
  }
  return arr;
}

function isAncestryElement(el) {
  return !!(el && el.dataset && el.dataset.ancestryTree === '1');
}

function getAncestryLegInch(el) {
  const rawPx = parseFloat(el.dataset.legHeightPx);
  if (!isNaN(rawPx) && rawPx >= 0) {
    return Number((rawPx / ANCESTRY_PX_PER_INCH).toFixed(2));
  }
  const { h } = getElementExactSize(el);
  const inferredPx = Math.max(1, Math.round((Math.max(6, h) - 2) * 0.36));
  return Number((inferredPx / ANCESTRY_PX_PER_INCH).toFixed(2));
}

function setAncestryLegInch(el, nextInch) {
  if (!el || !isAncestryElement(el)) return;
  const parsed = parseFloat(nextInch);
  const safeVal = isNaN(parsed) ? 0.01 : parsed;
  const clampedInch = Math.max(0.01, Math.min(3.0, Number(safeVal.toFixed(2))));
  const legPx = Math.max(1, Math.round(clampedInch * ANCESTRY_PX_PER_INCH));
  el.dataset.legHeightPx = String(legPx);

  const neededH = Math.max(6, legPx * 2 + 4);
  el.style.minHeight = '0px';
  el.style.height = neededH + 'px';
  renderAncestryConnectorShape(el);
  updateControlPaletteInputs();
  saveCurrentActivePageIntoData();
  showQuickToast(`उंची: ${clampedInch.toFixed(2)}" (वर + खाली सर्व टोके)`);
}

function removeAncestryFloatingBar() {
  const existing = document.getElementById('anc-floating-action-bar');
  if (existing) existing.remove();
}

function syncAncestryFloatingBar(el) {
  const bar = document.getElementById('anc-floating-action-bar');
  if (!bar || !el || !el.isConnected || !isAncestryElement(el)) return;
  const pageEl = document.getElementById('page');
  if (!pageEl) return;

  const customLeft = parseFloat(bar.dataset.customLeft);
  const customTop = parseFloat(bar.dataset.customTop);

  if (!isNaN(customLeft) && !isNaN(customTop)) {
    bar.style.left = customLeft + 'px';
    bar.style.top = customTop + 'px';
  } else {
    const elLeft = parseInt(el.style.left) || 0;
    const elTop = parseInt(el.style.top) || 0;
    const { w } = getElementExactSize(el);
    const barW = bar.offsetWidth || 290;
    const centerLeft = Math.max(6, Math.round(elLeft + w / 2 - barW / 2));
    const fixedTop = Math.max(6, elTop - 64);
    bar.style.left = centerLeft + 'px';
    bar.style.top = fixedTop + 'px';
  }

  const hInput = bar.querySelector('input[type="number"]');
  if (hInput && document.activeElement !== hInput) {
    hInput.value = getAncestryLegInch(el).toFixed(2);
  }
}

function renderAncestryFloatingBar(el) {
  removeAncestryFloatingBar();
  if (!el || !isAncestryElement(el) || !el.classList.contains('selected')) return;
  const pageEl = document.getElementById('page');
  if (!pageEl) return;

  const actionBar = document.createElement('div');
  actionBar.id = 'anc-floating-action-bar';
  actionBar.className = 'anc-floating-bar';
  actionBar.style.cssText = 'position:absolute;top:12px;left:12px;display:flex;align-items:center;gap:3px;background:#0a246a;padding:2px 5px;border:1px solid #fff;white-space:nowrap;z-index:60;box-shadow:1px 2px 5px rgba(0,0,0,0.35);';

  const dragGrip = document.createElement('span');
  dragGrip.textContent = '⠿';
  dragGrip.title = 'पट्टी वरच्या कडीला किंवा हव्या तिथे सरकवा';
  dragGrip.style.cssText = 'color:#ffe4b5;font-size:12px;font-weight:bold;cursor:move;padding:0 3px;touch-action:none;user-select:none;';
  dragGrip.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const startX = ev.clientX;
    const startY = ev.clientY;
    const origLeft = parseFloat(actionBar.style.left) || 0;
    const origTop = parseFloat(actionBar.style.top) || 0;

    function onMove(mEv) {
      mEv.preventDefault();
      const dx = (mEv.clientX - startX) / zoomLevel;
      const dy = (mEv.clientY - startY) / zoomLevel;
      const nextL = Math.max(4, Math.round(origLeft + dx));
      const nextT = Math.max(4, Math.round(origTop + dy));
      actionBar.dataset.customLeft = String(nextL);
      actionBar.dataset.customTop = String(nextT);
      actionBar.style.left = nextL + 'px';
      actionBar.style.top = nextT + 'px';
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
  actionBar.appendChild(dragGrip);

  const makeActionBtn = (label, titleText, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = titleText;
    b.style.cssText = 'background:#ffffff;color:#000000;border:1px solid #000;padding:2px 5px;font-size:10px;font-weight:bold;cursor:pointer;touch-action:manipulation;';
    b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      fn();
    });
    return b;
  };

  actionBar.appendChild(makeActionBtn('+ टोक', 'खाली नवीन टोक जोडा', () => {
    const curCount = Math.max(1, parseInt(el.dataset.dropCount) || 2);
    const nextCount = curCount + 1;
    el.dataset.dropCount = String(nextCount);
    el.dataset.autoEqual = '1';
    el.dataset.dropRatios = JSON.stringify(computeEqualDropRatios(nextCount));
    renderAncestryConnectorShape(el);
    saveCurrentActivePageIntoData();
    showQuickToast(`खाली ${nextCount} टोके (समान अंतरावर)`);
  }));

  actionBar.appendChild(makeActionBtn('- टोक', 'शेवटचे टोक काढून टाका', () => {
    const curCount = Math.max(1, parseInt(el.dataset.dropCount) || 2);
    if (curCount <= 1) {
      showQuickToast('किमान १ टोक आवश्यक आहे.');
      return;
    }
    const nextCount = curCount - 1;
    el.dataset.dropCount = String(nextCount);
    el.dataset.autoEqual = '1';
    el.dataset.dropRatios = JSON.stringify(computeEqualDropRatios(nextCount));
    renderAncestryConnectorShape(el);
    saveCurrentActivePageIntoData();
    showQuickToast(`खाली ${nextCount} टोके (समान अंतरावर)`);
  }));

  actionBar.appendChild(makeActionBtn('समान अंतर', 'सर्व खालची टोके समान अंतरावर करा', () => {
    const curCount = Math.max(1, parseInt(el.dataset.dropCount) || 2);
    el.dataset.autoEqual = '1';
    el.dataset.dropRatios = JSON.stringify(computeEqualDropRatios(curCount));
    renderAncestryConnectorShape(el);
    saveCurrentActivePageIntoData();
    showQuickToast('सर्व टोके समान अंतरावर केली.');
  }));

  const heightLabel = document.createElement('span');
  heightLabel.textContent = 'उंची:';
  heightLabel.style.cssText = 'color:#fff;font-size:10px;font-weight:bold;margin-left:3px;';
  actionBar.appendChild(heightLabel);

  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.step = '0.01';
  heightInput.min = '0.01';
  heightInput.max = '3.0';
  heightInput.value = getAncestryLegInch(el).toFixed(2);
  heightInput.title = 'इंचामध्ये थेट उंची टाका (उदा. 0.01, 0.05, 0.20)';
  heightInput.style.cssText = 'width:46px;padding:1px 3px;font-size:10px;font-weight:bold;border:1px solid #000;background:#fff;color:#000;';
  const applyHeightInputVal = (ev) => {
    ev.stopPropagation();
    const raw = heightInput.value;
    if (raw === '' || raw === '.' || raw === '0.') return;
    const val = parseFloat(raw);
    if (!isNaN(val) && val > 0) {
      setAncestryLegInch(el, val);
    }
  };
  heightInput.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
  });
  heightInput.addEventListener('input', applyHeightInputVal);
  heightInput.addEventListener('change', (ev) => {
    applyHeightInputVal(ev);
    heightInput.value = getAncestryLegInch(el).toFixed(2);
  });

  actionBar.appendChild(makeActionBtn('-0.01"', 'सर्व उभ्या टोकांची उंची 0.01" ने कमी करा', () => {
    const curInch = getAncestryLegInch(el);
    const nextInch = Math.max(0.01, Number((curInch - ANCESTRY_STEP_INCH).toFixed(2)));
    heightInput.value = nextInch.toFixed(2);
    setAncestryLegInch(el, nextInch);
  }));

  actionBar.appendChild(heightInput);

  actionBar.appendChild(makeActionBtn('+0.01"', 'सर्व उभ्या टोकांची उंची 0.01" ने वाढवा', () => {
    const curInch = getAncestryLegInch(el);
    const nextInch = Math.min(3.0, Number((curInch + ANCESTRY_STEP_INCH).toFixed(2)));
    heightInput.value = nextInch.toFixed(2);
    setAncestryLegInch(el, nextInch);
  }));

  pageEl.appendChild(actionBar);
  syncAncestryFloatingBar(el);
}

function spawnBorderlessNameAt(x, y, defaultLabel = 'नाव') {
  const boxW = 140;
  const boxH = 32;
  const snapped = snapBoxPosition(x, y, boxW, boxH);

  const el = createPMElement(snapped.x, snapped.y, boxW, boxH);
  el.style.border = 'none';
  el.style.outline = 'none';
  el.style.background = 'transparent';
  el.style.boxShadow = 'none';
  el.dataset.borderlessName = '1';

  const content = document.createElement('div');
  content.className = 'text-content';
  content.contentEditable = 'true';
  content.style.touchAction = 'none';
  content.style.webkitUserSelect = 'text';
  content.style.userSelect = 'text';
  content.style.pointerEvents = 'auto';
  content.style.border = 'none';
  content.style.outline = 'none';
  content.style.background = 'transparent';
  content.style.boxShadow = 'none';
  content.style.textAlign = 'center';
  content.style.padding = '2px 4px';

  const chosenFont = (document.getElementById('font-family') && document.getElementById('font-family').value) || 'inherit';
  const chosenSize = (document.getElementById('font-size') && parseInt(document.getElementById('font-size').value)) || 16;
  const chosenLeading = (document.getElementById('line-leading') && parseFloat(document.getElementById('line-leading').value)) || 1.3;
  const chosenColor = (document.getElementById('picker-color') && document.getElementById('picker-color').value) || '#000000';

  content.style.fontFamily = chosenFont;
  content.style.fontSize = chosenSize + 'px';
  content.style.lineHeight = chosenLeading;
  content.style.color = chosenColor;

  content.dataset.unicodeSource = defaultLabel;
  const lType = getLegacyFontType(chosenFont);
  content.innerText = lType ? unicodeToLegacyDevanagari(defaultLabel, lType) : defaultLabel;

  el.appendChild(content);
  attachElementEvents(el);
  checkTextOverflow(el);
  selectElement(el);
  selectTool('pointer');
  saveCurrentActivePageIntoData();
  setTimeout(() => {
    content.focus();
  }, 0);
  showQuickToast('नाव टाईप करा · कंट्रोल पॅलेटमधून फॉन्ट/साइज/कलर बदला');
}

function renderAncestryConnectorShape(el) {
  if (!el || !isAncestryElement(el)) return;
  el.style.minHeight = '0px';
  const { w } = getElementExactSize(el);
  const cw = Math.max(40, w);

  let legPx = parseFloat(el.dataset.legHeightPx);
  if (isNaN(legPx) || legPx < 0) {
    legPx = 20;
    el.dataset.legHeightPx = String(legPx);
  }
  legPx = Math.max(1, Math.round(legPx));

  const ch = Math.max(6, legPx * 2 + 4);
  if ((parseInt(el.style.height) || 0) !== ch) {
    el.style.height = ch + 'px';
  }

  const stroke = el.dataset.strokeColor || (document.getElementById('picker-color') && document.getElementById('picker-color').value) || '#000000';
  const sw = parseFloat(el.dataset.strokeWidth) || 2;
  const autoEqual = el.dataset.autoEqual !== '0';

  let ratios = [];
  try {
    ratios = JSON.parse(el.dataset.dropRatios || '[]');
  } catch (e) {
    ratios = [];
  }
  const dropCount = Math.max(1, parseInt(el.dataset.dropCount) || ratios.length || 2);
  if (autoEqual || !Array.isArray(ratios) || ratios.length !== dropCount) {
    ratios = computeEqualDropRatios(dropCount);
    el.dataset.dropRatios = JSON.stringify(ratios);
  }

  const padX = 10;
  const usableW = Math.max(20, cw - padX * 2);
  const topStartY = 2;
  const barY = topStartY + legPx;
  const bottomEndY = barY + legPx;

  let topRatio = parseFloat(el.dataset.topRatio);
  if (isNaN(topRatio)) topRatio = 0.5;
  topRatio = Math.max(0.05, Math.min(0.95, topRatio));
  const topX = Math.round(padX + usableW * topRatio);

  const dropXs = ratios.map(r => Math.round(padX + usableW * Math.max(0, Math.min(1, parseFloat(r) || 0))));
  const minDropX = dropCount > 1 ? Math.min(...dropXs) : topX;
  const maxDropX = dropCount > 1 ? Math.max(...dropXs) : topX;

  let linesSvg = '';
  linesSvg += `<line x1="${topX}" y1="${topStartY}" x2="${topX}" y2="${barY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="square"/>`;

  if (dropCount > 1) {
    linesSvg += `<line x1="${minDropX}" y1="${barY}" x2="${maxDropX}" y2="${barY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="square"/>`;
  }

  dropXs.forEach(dx => {
    linesSvg += `<line x1="${dx}" y1="${barY}" x2="${dx}" y2="${bottomEndY}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="square"/>`;
  });

  const existingSvg = el.querySelector('.shape-svg');
  if (existingSvg) existingSvg.remove();

  const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgNode.setAttribute('class', 'shape-svg');
  svgNode.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
  svgNode.setAttribute('preserveAspectRatio', 'none');
  svgNode.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  svgNode.innerHTML = linesSvg;
  el.appendChild(svgNode);

  renderAncestryTouchHandles(el, cw, ch, barY, padX, usableW, topX, dropXs);
  if (el.classList.contains('selected')) {
    if (!document.getElementById('anc-floating-action-bar')) {
      renderAncestryFloatingBar(el);
    } else {
      syncAncestryFloatingBar(el);
    }
  }
}

function renderAncestryTouchHandles(el, cw, ch, barY, padX, usableW, topX, dropXs) {
  let uiLayer = el.querySelector('.anc-ui-layer');
  if (!uiLayer) {
    uiLayer = document.createElement('div');
    uiLayer.className = 'anc-ui-layer';
    uiLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:25;';
    el.appendChild(uiLayer);
  }
  uiLayer.innerHTML = '';

  const isSel = el.classList.contains('selected');
  if (!isSel) return;

  const leftHandle = document.createElement('div');
  leftHandle.title = 'डावीकडे ओढून लांबी वाढवा';
  leftHandle.style.cssText = `position:absolute;left:-14px;top:${Math.max(4, barY - 14)}px;width:28px;height:28px;background:#0a246a;color:#fff;border:2px solid #fff;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;pointer-events:auto;touch-action:none;cursor:ew-resize;box-shadow:0 1px 4px rgba(0,0,0,0.4);`;
  leftHandle.textContent = '◄';
  leftHandle.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    selectElement(el);
    const startX = ev.clientX;
    const origLeft = parseInt(el.style.left) || 0;
    const origW = getElementExactSize(el).w;
    const rightEdge = origLeft + origW;

    function onMove(mEv) {
      mEv.preventDefault();
      const dx = (mEv.clientX - startX) / zoomLevel;
      const nextLeft = Math.min(rightEdge - 60, Math.round(origLeft + dx));
      const nextW = Math.max(60, rightEdge - nextLeft);
      el.style.left = nextLeft + 'px';
      el.style.width = nextW + 'px';
      renderAncestryConnectorShape(el);
      updateControlPaletteInputs();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      saveCurrentActivePageIntoData();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
  uiLayer.appendChild(leftHandle);

  const rightHandle = document.createElement('div');
  rightHandle.title = 'उजवीकडे ओढून लांबी वाढवा';
  rightHandle.style.cssText = `position:absolute;right:-14px;top:${Math.max(4, barY - 14)}px;width:28px;height:28px;background:#0a246a;color:#fff;border:2px solid #fff;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;pointer-events:auto;touch-action:none;cursor:ew-resize;box-shadow:0 1px 4px rgba(0,0,0,0.4);`;
  rightHandle.textContent = '►';
  rightHandle.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    selectElement(el);
    const startX = ev.clientX;
    const origW = getElementExactSize(el).w;

    function onMove(mEv) {
      mEv.preventDefault();
      const dx = (mEv.clientX - startX) / zoomLevel;
      const nextW = Math.max(60, Math.round(origW + dx));
      el.style.width = nextW + 'px';
      renderAncestryConnectorShape(el);
      updateControlPaletteInputs();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      saveCurrentActivePageIntoData();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
  uiLayer.appendChild(rightHandle);

  // वरच्या १ टोकाचे हँडल (डावी/उजवी ड्रॅग) + त्याखाली '+' टायपिंग आयकॉन
  const topHandle = document.createElement('div');
  topHandle.title = 'वरचे टोक डावीकडे/उजवीकडे सरकवा';
  topHandle.style.cssText = `position:absolute;left:${topX - 11}px;top:-11px;width:22px;height:22px;background:#8b0000;color:#fff;border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;pointer-events:auto;touch-action:none;cursor:ew-resize;`;
  topHandle.textContent = '●';
  topHandle.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    selectElement(el);

    function onMove(mEv) {
      mEv.preventDefault();
      const rect = el.getBoundingClientRect();
      const localX = (mEv.clientX - rect.left) / zoomLevel;
      const ratio = Math.max(0.05, Math.min(0.95, (localX - padX) / usableW));
      el.dataset.topRatio = ratio.toFixed(4);
      renderAncestryConnectorShape(el);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      saveCurrentActivePageIntoData();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
  uiLayer.appendChild(topHandle);

  const topPlusBtn = document.createElement('button');
  topPlusBtn.type = 'button';
  topPlusBtn.title = 'वरच्या टोकाखाली मजकूर टाईप करा';
  topPlusBtn.textContent = '+';
  topPlusBtn.style.cssText = `position:absolute;left:${topX - 10}px;top:-34px;width:20px;height:20px;background:#0a246a;color:#fff;border:1.5px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;pointer-events:auto;touch-action:manipulation;cursor:pointer;padding:0;line-height:1;`;
  topPlusBtn.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const boxLeft = (parseInt(el.style.left) || 0) + topX - 70;
    const boxTop = (parseInt(el.style.top) || 0) - 36;
    spawnBorderlessNameAt(boxLeft, boxTop, 'वरचे नाव');
  });
  uiLayer.appendChild(topPlusBtn);

  // खालच्या प्रत्येक टोकाचे हँडल (डावी/उजवी ड्रॅग) + त्याखाली '+' टायपिंग आयकॉन
  dropXs.forEach((dx, idx) => {
    const dHandle = document.createElement('div');
    dHandle.title = `टोक ${idx + 1} डावीकडे/उजवीकडे सरकवा`;
    dHandle.style.cssText = `position:absolute;left:${dx - 11}px;bottom:-11px;width:22px;height:22px;background:#006400;color:#fff;border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;pointer-events:auto;touch-action:none;cursor:ew-resize;`;
    dHandle.textContent = '+';
    dHandle.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      selectElement(el);

      function onMove(mEv) {
        mEv.preventDefault();
        const rect = el.getBoundingClientRect();
        const localX = (mEv.clientX - rect.left) / zoomLevel;
        const ratio = Math.max(0, Math.min(1, (localX - padX) / usableW));
        let curRatios = [];
        try { curRatios = JSON.parse(el.dataset.dropRatios || '[]'); } catch (e) { curRatios = []; }
        if (!Array.isArray(curRatios) || curRatios.length !== dropXs.length) {
          curRatios = computeEqualDropRatios(dropXs.length);
        }
        curRatios[idx] = Number(ratio.toFixed(4));
        el.dataset.autoEqual = '0';
        el.dataset.dropRatios = JSON.stringify(curRatios);
        renderAncestryConnectorShape(el);
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        saveCurrentActivePageIntoData();
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
    uiLayer.appendChild(dHandle);

    const dPlusBtn = document.createElement('button');
    dPlusBtn.type = 'button';
    dPlusBtn.title = `टोक ${idx + 1} खाली मजकूर टाईप करा`;
    dPlusBtn.textContent = '+';
    dPlusBtn.style.cssText = `position:absolute;left:${dx - 10}px;bottom:-34px;width:20px;height:20px;background:#006400;color:#fff;border:1.5px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;pointer-events:auto;touch-action:manipulation;cursor:pointer;padding:0;line-height:1;`;
    dPlusBtn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const boxLeft = (parseInt(el.style.left) || 0) + dx - 70;
      const boxTop = (parseInt(el.style.top) || 0) + ch + 14;
      spawnBorderlessNameAt(boxLeft, boxTop, `नाव ${idx + 1}`);
    });
    uiLayer.appendChild(dPlusBtn);
  });
}

function pmInsertAncestryTreePrompt(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const ans = prompt('वरती १ टोक राहील — खाली किती टोके पाहिजेत? (उदा. 1, 2, 3, 4, 5)', '3');
  if (ans === null) return;
  const count = Math.max(1, Math.min(20, parseInt(ans) || 2));

  const { m } = getCurrentPageDims();
  const baseW = Math.max(220, Math.min(520, count * 95));
  const defaultLegPx = Math.max(1, Math.round(0.2 * ANCESTRY_PX_PER_INCH));
  const baseH = Math.max(6, defaultLegPx * 2 + 4);
  const startX = m.left + 20;
  const startY = m.top + 56;

  const el = createPMElement(startX, startY, baseW, baseH);
  el.style.minHeight = '0px';
  el.dataset.ancestryTree = '1';
  el.dataset.dropCount = String(count);
  el.dataset.autoEqual = '1';
  el.dataset.topRatio = '0.5';
  el.dataset.legHeightPx = String(defaultLegPx);
  el.dataset.dropRatios = JSON.stringify(computeEqualDropRatios(count));
  el.dataset.strokeColor = (document.getElementById('picker-color') && document.getElementById('picker-color').value) || '#000000';
  el.dataset.strokeWidth = '2';

  renderAncestryConnectorShape(el);
  selectElement(el);
  selectTool('pointer');
  saveCurrentActivePageIntoData();
  showQuickToast(`वंशावळ शेप तयार: वर १ · खाली ${count} टोके (समान अंतरावर)`);
}

function getMagnetTargets(axis) {
  ensureDocStore();
  if (typeof ensurePageState === 'function') ensurePageState(window.activePageId);
  const { w: pageW, h: pageH, m } = getCurrentPageDims();

  const vGuides = (typeof pageGuides !== 'undefined' && pageGuides[window.activePageId] && pageGuides[window.activePageId].v) || [];
  const hGuides = (typeof pageGuides !== 'undefined' && pageGuides[window.activePageId] && pageGuides[window.activePageId].h) || [];

  const targets = axis === 'v'
    ? [m.left, pageW - m.right, ...vGuides]
    : [m.top, pageH - m.bottom, ...hGuides];

  const colCfg = (typeof pageColumns !== 'undefined') ? pageColumns[window.activePageId] : null;
  if (axis === 'v' && colCfg && colCfg.count > 1) {
    const usableW = Math.max(40, pageW - m.left - m.right);
    const totalGutter = colCfg.gutter * (colCfg.count - 1);
    const colW = (usableW - totalGutter) / colCfg.count;
    for (let c = 0; c < colCfg.count; c++) {
      const lEdge = Math.round(m.left + c * (colW + colCfg.gutter));
      const rEdge = Math.round(lEdge + colW);
      targets.push(lEdge, rEdge);
    }
  }
  return targets;
}

function getElementExactSize(el) {
  const w = Math.round(el.offsetWidth || parseFloat(el.style.width) || 0);
  const h = Math.round(el.offsetHeight || parseFloat(el.style.height) || 0);
  return { w, h };
}

function snapBoxPosition(x, y, w, h, threshold = 7) {
  const vTargets = getMagnetTargets('v');
  const hTargets = getMagnetTargets('h');

  const bx = Math.round(x);
  const by = Math.round(y);
  const bw = Math.round(w);
  const bh = Math.round(h);

  let snappedX = bx;
  let snappedY = by;

  for (const t of vTargets) {
    const targetX = Math.round(t);
    if (Math.abs(bx - targetX) <= threshold) {
      snappedX = targetX;
      break;
    }
    if (Math.abs((bx + bw) - targetX) <= threshold) {
      snappedX = targetX - bw;
      break;
    }
  }

  for (const t of hTargets) {
    const targetY = Math.round(t);
    if (Math.abs(by - targetY) <= threshold) {
      snappedY = targetY;
      break;
    }
    if (Math.abs((by + bh) - targetY) <= threshold) {
      snappedY = targetY - bh;
      break;
    }
  }

  return { x: snappedX, y: snappedY };
}

function snapValue(val, axis) {
  const targets = getMagnetTargets(axis);
  const v = Math.round(val);
  for (const t of targets) {
    const target = Math.round(t);
    if (Math.abs(v - target) <= 7) return target;
  }
  return v;
}

function unicodeToLegacyDevanagari(str, familyType) {
  if (!str || !/[\u0900-\u097F]/.test(str)) return str;

  if (familyType === 'kruti') {
    const map = [
      ['क्ष', '{k'], ['त्र', '='], ['ज्ञ', 'K'], ['श्र', 'J'],
      ['क', 'd'], ['ख', '[k'], ['ग', 'x'], ['घ', '?k'], ['ङ', '³'],
      ['च', 'p'], ['छ', 'N'], ['ज', 't'], ['झ', '>'], ['ञ', '¥'],
      ['ट', 'V'], ['ठ', 'B'], ['ड', 'M'], ['ढ', '<'], ['ण', '.k'],
      ['त', 'r'], ['थ', 'Fk'], ['द', 'n'], ['ध', '/k'], ['न', 'u'],
      ['प', 'i'], ['फ', 'Q'], ['ब', 'c'], ['भ', 'Hk'], ['म', 'e'],
      ['य', ';'], ['र', 'j'], ['ल', 'y'], ['व', 'o'], ['श', "'k"],
      ['ष', '"k'], ['स', 'l'], ['ह', 'g'], ['ळ', 'G'],
      ['अ', 'v'], ['आ', 'vk'], ['इ', 'b'], ['ई', 'bZ'], ['उ', 'm'],
      ['ऊ', 'Å'], ['ए', ','], ['ऐ', ',s'], ['ओ', 'vks'], ['औ', 'vkS'],
      ['ा', 'k'], ['ी', 'h'], ['ु', 'q'], ['ू', 'w'], ['े', 's'],
      ['ै', 'S'], ['ो', 'ks'], ['ौ', 'kS'], ['ं', 'a'], ['ः', '%'],
      ['ँ', '¡'], ['।', 'A'], ['्', '~']
    ];
    let out = str.replace(/([\u0915-\u0939\u0958-\u095F])ि/g, 'f$1');
    for (const [u, l] of map) out = out.split(u).join(l);
    return out;
  }

  if (familyType === 'shivaji') {
    const map = [
      ['क्ष', 'xa'], ['त्र', 'Ha'], ['ज्ञ', 'Va'], ['श्र', 'Ea'],
      ['क', 'k'], ['ख', 'Ka'], ['ग', 'ga'], ['घ', 'Ga'],
      ['च', 'ca'], ['छ', 'Ca'], ['ज', 'ja'], ['झ', 'Ja'],
      ['ट', 'T'], ['ठ', 'z'], ['ड', 'D'], ['ढ', 'Z'], ['ण', 'Na'],
      ['त', 'ta'], ['थ', 'Ta'], ['द', 'd'], ['ध', 'Da'], ['न', 'na'],
      ['प', 'pa'], ['फ', 'P'], ['ब', 'ba'], ['भ', 'Ba'], ['म', 'ma'],
      ['य', 'ya'], ['र', 'r'], ['ल', 'la'], ['व', 'va'], ['श', 'Sa'],
      ['ष', 'Ya'], ['स', 'sa'], ['ह', 'h'], ['ळ', 'L'],
      ['अ', 'A'], ['आ', 'Aa'], ['इ', 'i'], ['ई', 'I'], ['उ', 'u'],
      ['ऊ', 'U'], ['ए', 'e'], ['ऐ', 'eo'], ['ओ', 'Aao'], ['औ', 'AaO'],
      ['ा', 'a'], ['ी', 'I'], ['ु', 'u'], ['ू', 'U'], ['े', 'o'],
      ['ै', 'O'], ['ो', 'ao'], ['ौ', 'aO'], ['ं', 'M'], ['ः', ':']
    ];
    let out = str.replace(/([\u0915-\u0939\u0958-\u095F])ि/g, 'i$1');
    for (const [u, l] of map) out = out.split(u).join(l);
    return out;
  }

  if (familyType === 'shree') {
    const map = [
      ['क्ष', 'j'], ['त्र', '~'], ['ज्ञ', 'k'], ['श्र', 'L'],
      ['क', 'H$'], ['ख', 'I'], ['ग', 'J'], ['घ', 'K'],
      ['च', 'M'], ['छ', 'N'], ['ज', 'O'], ['झ', 'P'],
      ['ट', 'Q'], ['ठ', 'R'], ['ड', 'S'], ['ढ', 'T'], ['ण', 'U'],
      ['त', 'V'], ['थ', 'W'], ['द', 'X'], ['ध', 'Y'], ['न', 'Z'],
      ['प', 'n'], ['फ', '’$'], ['ब', '~'], ['भ', '^'], ['म', '_'],
      ['य', '`'], ['र', 'a'], ['ल', 'b'], ['व', 'd'], ['श', 'e'],
      ['ष', 'f'], ['स', 'g'], ['ह', 'h'], ['ळ', 'i'],
      ['अ', 'A'], ['आ', 'Am'], ['इ', 'B'], ['ई', 'C'], ['उ', 'D'],
      ['ऊ', 'E'], ['ए', 'F'], ['ऐ', 'Eo'], ['ओ', 'Amo'], ['औ', 'Am¡'],
      ['ा', 'm'], ['ी', 'r'], ['ु', 'w'], ['ू', 'y'], ['े', 'o'],
      ['ै', '¡'], ['ो', 'mo'], ['ौ', 'm¡'], ['ं', '§'], ['ः', '…']
    ];
    let out = str.replace(/([\u0915-\u0939\u0958-\u095F])ि/g, 'p$1');
    for (const [u, l] of map) out = out.split(u).join(l);
    return out;
  }

  return str;
}

function getLegacyFontType(fontVal) {
  const f = (fontVal || '').toLowerCase();
  if (f.includes('kruti')) return 'kruti';
  if (f.includes('shivaji')) return 'shivaji';
  if (f.includes('shree')) return 'shree';
  return null;
}

function convertSelectedToLegacyFont() {
  if (!selectedEl) {
    alert('प्रथम कोणताही टेक्स्ट बॉक्स निवडा.');
    return;
  }
  const tc = selectedEl.querySelector('.text-content');
  if (!tc) return;
  const fontVal = tc.style.fontFamily || document.getElementById('font-family').value;
  const legacyType = getLegacyFontType(fontVal);
  if (!legacyType) {
    alert('कृपया आधी SHREE-DEV7, Kruti Dev, किंवा Shivaji फॉन्ट निवडा.');
    return;
  }
  if (!tc.dataset.unicodeSource) tc.dataset.unicodeSource = tc.innerText;
  tc.innerText = unicodeToLegacyDevanagari(tc.dataset.unicodeSource, legacyType);
  checkTextOverflow(selectedEl);
  saveCurrentActivePageIntoData();
}

function checkTextOverflow(el) {
  if (!el) return;
  const tc = el.querySelector('.text-content');
  let badge = el.querySelector('.overflow-badge');
  if (!tc) {
    if (badge) badge.remove();
    return;
  }
  const hasOverflow = tc.scrollHeight > tc.clientHeight + 2;
  if (hasOverflow) {
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'overflow-badge';
      badge.title = 'Text Overflow — Click to flow into new box';
      badge.textContent = '▼';
      badge.style.cssText = 'position:absolute;right:2px;bottom:2px;width:14px;height:14px;background:#d00;color:#fff;font-size:9px;line-height:14px;text-align:center;cursor:pointer;z-index:30;';
      badge.onpointerdown = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        pendingThreadSource = el;
        selectTool('text');
        alert('आता पानावर जिथे उरलेला मजकूर हवा आहे तिथे बोटाने टच करा.');
      };
      el.appendChild(badge);
    }
  } else if (badge) {
    badge.remove();
  }
}

function attachElementEvents(el) {
  el.querySelectorAll('.handle').forEach(h => {
    const dir = h.className.replace('handle', '').trim();
    h.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectElement(el);
      if (currentTool === 'crop') initCrop(e, el, dir);
      else initResize(e, el, dir);
    };
  });

  const tc = el.querySelector('.text-content');
  if (tc) {
    tc.contentEditable = 'true';
    tc.style.touchAction = 'none';
    tc.style.webkitUserSelect = 'text';
    tc.style.userSelect = 'text';
    tc.style.pointerEvents = 'auto';

    tc.addEventListener('pointerdown', (ev) => {
      if (currentTool === 'hand' || currentTool === 'zoom') return;
      ev.stopPropagation();
      selectElement(el);

      if (currentTool === 'rotate') {
        ev.preventDefault();
        initRotate(ev, el);
        return;
      }

      const startX = ev.clientX;
      const startY = ev.clientY;
      const ox = parseInt(el.style.left) || 0;
      const oy = parseInt(el.style.top) || 0;
      const { w, h } = getElementExactSize(el);
      let draggingBox = false;

      function onMove(mEv) {
        const moveDist = Math.hypot(mEv.clientX - startX, mEv.clientY - startY);
        if (!draggingBox && moveDist >= 3) {
          draggingBox = true;
          if (document.activeElement === tc) {
            tc.blur();
          }
        }
        if (draggingBox) {
          mEv.preventDefault();
          const rawX = Math.round(ox + (mEv.clientX - startX) / zoomLevel);
          const rawY = Math.round(oy + (mEv.clientY - startY) / zoomLevel);
          const snapped = snapBoxPosition(rawX, rawY, w, h);
          el.style.left = snapped.x + 'px';
          el.style.top = snapped.y + 'px';
          updateControlPaletteInputs();
        }
      }

      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);

        if (!draggingBox) {
          tc.contentEditable = 'true';
          setTimeout(() => tc.focus(), 0);
        } else {
          saveCurrentActivePageIntoData();
        }
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });

    tc.addEventListener('input', () => {
      if (/[\u0900-\u097F]/.test(tc.innerText)) {
        tc.dataset.unicodeSource = tc.innerText;
      }
      checkTextOverflow(el);
      saveCurrentActivePageIntoData();
    });
  }

  el.onpointerdown = (e) => {
    if (currentTool === 'hand' || currentTool === 'zoom') return;
    if (e.target.classList.contains('handle') || e.target.classList.contains('overflow-badge')) return;
    if (e.target.closest && e.target.closest('.anc-ui-layer')) return;
    if (e.target.classList && e.target.classList.contains('text-content')) return;

    e.preventDefault();
    e.stopPropagation();
    selectElement(el);
    if (currentTool === 'rotate') {
      initRotate(e, el);
    } else {
      initDrag(e, el);
    }
  };

  if (isAncestryElement(el)) {
    renderAncestryConnectorShape(el);
  }
  checkTextOverflow(el);
}

function createPMElement(x, y, w, h) {
  const el = document.createElement('div');
  el.className = 'pm-element selected';
  el.style.left = Math.round(x) + 'px';
  el.style.top = Math.round(y) + 'px';
  el.style.width = Math.round(w) + 'px';
  el.style.height = Math.round(h) + 'px';
  el.dataset.rotation = 0;
  el.style.zIndex = 10;

  ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].forEach(dir => {
    const hDiv = document.createElement('div');
    hDiv.className = 'handle ' + dir;
    el.appendChild(hDiv);
  });

  attachElementEvents(el);
  document.getElementById('page').appendChild(el);
  selectElement(el);
  saveCurrentActivePageIntoData();
  return el;
}

function populateShapeInner(el, type, w, h) {
  if (isAncestryElement(el)) {
    renderAncestryConnectorShape(el);
    return;
  }
  const stroke = document.getElementById('picker-color').value || '#000000';
  let svgInner = '';
  let isFrame = false;

  if (type === 'line') {
    svgInner = `<line x1="0" y1="0" x2="${w}" y2="${h}" stroke="${stroke}" stroke-width="2"/>`;
  } else if (type === 'cline') {
    const midY = Math.round(h / 2);
    svgInner = `<line x1="0" y1="${midY}" x2="${w}" y2="${midY}" stroke="${stroke}" stroke-width="2"/>`;
  } else if (type === 'rect') {
    svgInner = `<rect x="1" y="1" width="${Math.max(1, w-2)}" height="${Math.max(1, h-2)}" fill="none" stroke="${stroke}" stroke-width="2"/>`;
  } else if (type === 'rectframe') {
    isFrame = true;
    svgInner = `<rect x="1" y="1" width="${Math.max(1, w-2)}" height="${Math.max(1, h-2)}" fill="none" stroke="${stroke}" stroke-width="1"/><line x1="0" y1="0" x2="${w}" y2="${h}" stroke="#888" stroke-width="1"/><line x1="${w}" y1="0" x2="0" y2="${h}" stroke="#888" stroke-width="1"/>`;
  } else if (type === 'ellipse') {
    svgInner = `<ellipse cx="${w/2}" cy="${h/2}" rx="${Math.max(1, w/2-2)}" ry="${Math.max(1, h/2-2)}" fill="none" stroke="${stroke}" stroke-width="2"/>`;
  } else if (type === 'ellipseframe') {
    isFrame = true;
    svgInner = `<ellipse cx="${w/2}" cy="${h/2}" rx="${Math.max(1, w/2-2)}" ry="${Math.max(1, h/2-2)}" fill="none" stroke="${stroke}" stroke-width="1"/><line x1="${w*0.15}" y1="${h*0.15}" x2="${w*0.85}" y2="${h*0.85}" stroke="#888" stroke-width="1"/><line x1="${w*0.85}" y1="${h*0.15}" x2="${w*0.15}" y2="${h*0.85}" stroke="#888" stroke-width="1"/>`;
  } else if (type === 'polygon') {
    svgInner = `<polygon points="${w*0.5},2 ${w-2},${h*0.38} ${w*0.8},${h-2} ${w*0.2},${h-2} 2,${h*0.38}" fill="none" stroke="${stroke}" stroke-width="2"/>`;
  } else if (type === 'polygonframe') {
    isFrame = true;
    svgInner = `<polygon points="${w*0.5},2 ${w-2},${h*0.38} ${w*0.8},${h-2} ${w*0.2},${h-2} 2,${h*0.38}" fill="none" stroke="${stroke}" stroke-width="1"/><line x1="${w*0.2}" y1="${h*0.25}" x2="${w*0.8}" y2="${h*0.85}" stroke="#888"/><line x1="${w*0.8}" y1="${h*0.25}" x2="${w*0.2}" y2="${h*0.85}" stroke="#888"/>`;
  }

  const existingSvg = el.querySelector('.shape-svg');
  if (existingSvg) existingSvg.remove();

  const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgNode.setAttribute('class', 'shape-svg');
  svgNode.setAttribute('viewBox', `0 0 ${Math.max(1, w)} ${Math.max(1, h)}`);
  svgNode.setAttribute('preserveAspectRatio', 'none');
  svgNode.innerHTML = svgInner;
  el.appendChild(svgNode);

  if (isFrame && !el.querySelector('.text-content')) {
    const c = document.createElement('div');
    c.className = 'text-content';
    c.style.position = 'absolute';
    c.style.top = '0';
    c.style.left = '0';
    c.contentEditable = 'true';
    el.appendChild(c);
  }
}

function handlePagePointerDown(e) {
  if (e.target.id !== 'page' && !e.target.classList.contains('guides-layer') && !e.target.classList.contains('margin-guide')) return;
  if (currentTool === 'zoom') {
    setZoom(zoomLevel >= 1.5 ? 0.75 : zoomLevel + 0.25);
    return;
  }
  if (currentTool === 'hand' || currentTool === 'pointer' || currentTool === 'rotate' || currentTool === 'crop') return;

  e.stopPropagation();
  const rect = document.getElementById('page').getBoundingClientRect();
  const tapX = snapValue(Math.round((e.clientX - rect.left) / zoomLevel), 'v');
  const tapY = snapValue(Math.round((e.clientY - rect.top) / zoomLevel), 'h');

  if (currentTool === 'text') {
    const boxW = 360;
    const boxH = 120;
    const snapped = snapBoxPosition(tapX, tapY, boxW, boxH);

    const el = createPMElement(snapped.x, snapped.y, boxW, boxH);
    const content = document.createElement('div');
    content.className = 'text-content';
    content.contentEditable = 'true';
    content.style.touchAction = 'none';
    content.style.webkitUserSelect = 'text';
    content.style.userSelect = 'text';
    content.style.pointerEvents = 'auto';

    const chosenFont = document.getElementById('font-family').value;
    const chosenSize = parseInt(document.getElementById('font-size').value) || 16;
    const chosenLeading = parseFloat(document.getElementById('line-leading').value) || 1.4;
    const chosenColor = document.getElementById('picker-color').value || '#000000';

    content.style.fontFamily = chosenFont;
    content.style.fontSize = chosenSize + 'px';
    content.style.lineHeight = chosenLeading;
    content.style.color = chosenColor;

    const fourLinesMarathi =
      'ही पहिली ओळ मराठी मजकुरासाठी आहे.\n' +
      'ही दुसरी ओळ येथे लिहिली आहे.\n' +
      'ही तिसरी ओळ आपण बदलू शकता.\n' +
      'ही चौथी ओळ टेक्स्ट बॉक्समध्ये आहे.';

    content.dataset.unicodeSource = fourLinesMarathi;
    const lType = getLegacyFontType(chosenFont);
    content.innerText = lType ? unicodeToLegacyDevanagari(fourLinesMarathi, lType) : fourLinesMarathi;

    el.appendChild(content);
    attachElementEvents(el);
    checkTextOverflow(el);
    selectElement(el);
    saveCurrentActivePageIntoData();
    setTimeout(() => {
      content.focus();
    }, 0);
    return;
  }

  const shapeType = currentTool;
  const el = createPMElement(tapX, tapY, 40, 40);
  populateShapeInner(el, shapeType, 40, 40);

  function onMove(ev) {
    let curX = Math.round((ev.clientX - rect.left) / zoomLevel);
    let curY = Math.round((ev.clientY - rect.top) / zoomLevel);
    if (shapeType === 'cline') {
      curY = tapY;
    }
    const left = Math.min(tapX, curX);
    const top = Math.min(tapY, curY);
    const w = Math.max(12, Math.abs(curX - tapX));
    const h = (shapeType === 'cline') ? 12 : Math.max(12, Math.abs(curY - tapY));
    const snapped = snapBoxPosition(left, top, w, h);
    el.style.left = snapped.x + 'px';
    el.style.top = snapped.y + 'px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    populateShapeInner(el, shapeType, w, h);
    updateControlPaletteInputs();
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    selectTool('pointer');
    saveCurrentActivePageIntoData();
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function triggerPlaceImage() {
  document.getElementById('image-input').click();
}

function placeImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const el = createPMElement(96, 72, 180, 180);
    const w = document.createElement('div');
    w.className = 'img-wrapper';
    const img = document.createElement('img');
    img.src = e.target.result;
    img.className = 'pm-image';
    w.appendChild(img);
    el.appendChild(w);
    selectTool('pointer');
    saveCurrentActivePageIntoData();
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function handlePasteboardDown(e) {
  if (currentTool !== 'hand') return;
  const pb = document.getElementById('pasteboard');
  let sx = e.clientX, sy = e.clientY, sl = pb.scrollLeft, st = pb.scrollTop;
  pb.style.cursor = 'grabbing';
  function onMove(ev) {
    pb.scrollLeft = sl - (ev.clientX - sx);
    pb.scrollTop = st - (ev.clientY - sy);
  }
  function onUp() {
    pb.style.cursor = 'grab';
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function initRotate(e, el) {
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  function onMove(ev) {
    const a = Math.round(Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI));
    el.dataset.rotation = a;
    el.style.transform = `rotate(${a}deg)`;
    document.getElementById('box-rot').value = a;
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    saveCurrentActivePageIntoData();
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function initCrop(e, el, dir) {
  e.stopPropagation();
  const img = el.querySelector('.pm-image');
  if (!img) { initResize(e, el, dir); return; }
  let sx = e.clientX, sy = e.clientY;
  let ow = parseInt(el.style.width) || 100;
  let oh = parseInt(el.style.height) || 100;
  img.style.width = ow + 'px';
  img.style.height = oh + 'px';
  function onMove(ev) {
    if (dir.includes('e')) el.style.width = Math.max(20, Math.round(ow + (ev.clientX - sx) / zoomLevel)) + 'px';
    if (dir.includes('s')) el.style.height = Math.max(20, Math.round(oh + (ev.clientY - sy) / zoomLevel)) + 'px';
    updateControlPaletteInputs();
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    saveCurrentActivePageIntoData();
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function initDrag(e, el) {
  let sx = e.clientX, sy = e.clientY;
  let ox = parseInt(el.style.left) || 0;
  let oy = parseInt(el.style.top) || 0;
  const { w, h } = getElementExactSize(el);

  function onMove(ev) {
    const rawX = Math.round(ox + (ev.clientX - sx) / zoomLevel);
    const rawY = Math.round(oy + (ev.clientY - sy) / zoomLevel);
    const snapped = snapBoxPosition(rawX, rawY, w, h);
    el.style.left = snapped.x + 'px';
    el.style.top = snapped.y + 'px';
    if (isAncestryElement(el)) syncAncestryFloatingBar(el);
    updateControlPaletteInputs();
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    saveCurrentActivePageIntoData();
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function initResize(e, el, dir) {
  e.preventDefault();
  e.stopPropagation();
  let sx = e.clientX, sy = e.clientY;
  const { w: ow, h: oh } = getElementExactSize(el);
  let ox = parseInt(el.style.left) || 0;
  let oy = parseInt(el.style.top) || 0;

  function onMove(ev) {
    ev.preventDefault();
    let dx = (ev.clientX - sx) / zoomLevel;
    let dy = (ev.clientY - sy) / zoomLevel;
    if (dir.includes('e')) {
      const targetR = snapValue(Math.round(ox + ow + dx), 'v');
      el.style.width = Math.max(15, targetR - ox) + 'px';
    }
    if (dir.includes('s')) {
      const targetB = snapValue(Math.round(oy + oh + dy), 'h');
      el.style.height = Math.max(10, targetB - oy) + 'px';
    }
    if (dir.includes('w')) {
      const targetL = snapValue(Math.round(ox + dx), 'v');
      const newW = Math.max(15, (ox + ow) - targetL);
      el.style.left = ((ox + ow) - newW) + 'px';
      el.style.width = newW + 'px';
    }
    if (dir.includes('n')) {
      const targetT = snapValue(Math.round(oy + dy), 'h');
      const newH = Math.max(10, (oy + oh) - targetT);
      el.style.top = ((oy + oh) - newH) + 'px';
      el.style.height = newH + 'px';
    }
    if (isAncestryElement(el)) {
      renderAncestryConnectorShape(el);
    }
    checkTextOverflow(el);
    updateControlPaletteInputs();
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    saveCurrentActivePageIntoData();
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function selectElement(el) {
  document.querySelectorAll('#page > .pm-element').forEach(i => {
    i.classList.remove('selected', 'crop-mode');
    if (isAncestryElement(i)) renderAncestryConnectorShape(i);
  });
  el.classList.add('selected');
  if (currentTool === 'crop') el.classList.add('crop-mode');
  selectedEl = el;
  if (isAncestryElement(el)) {
    renderAncestryConnectorShape(el);
    renderAncestryFloatingBar(el);
  }
  updateControlPaletteInputs();
}

function selectAllOnPage() {
  const els = document.querySelectorAll('#page > .pm-element');
  els.forEach(el => el.classList.add('selected'));
  if (els.length > 0) selectedEl = els[els.length - 1];
}

function deselectAllElements() {
  document.querySelectorAll('#page > .pm-element').forEach(i => {
    i.classList.remove('selected', 'crop-mode');
    if (isAncestryElement(i)) renderAncestryConnectorShape(i);
  });
  selectedEl = null;
  removeAncestryFloatingBar();
}

function deselectAll(e) {
  if (e.target.classList.contains('pasteboard') || e.target.id === 'page') {
    deselectAllElements();
  }
}

function copySelected() {
  if (!selectedEl) return;
  const clone = selectedEl.cloneNode(true);
  clone.classList.remove('selected', 'crop-mode');
  clipboardElementHTML = clone.outerHTML;
}

function cutSelected() {
  if (!selectedEl) return;
  copySelected();
  deleteSelected();
}

function pasteCopied() {
  if (!clipboardElementHTML) return;
  const temp = document.createElement('div');
  temp.innerHTML = clipboardElementHTML;
  const newEl = temp.firstElementChild;
  newEl.style.left = ((parseInt(newEl.style.left) || 40) + 18) + 'px';
  newEl.style.top = ((parseInt(newEl.style.top) || 40) + 18) + 'px';
  attachElementEvents(newEl);
  document.getElementById('page').appendChild(newEl);
  selectElement(newEl);
  saveCurrentActivePageIntoData();
}

function pasteMultiple() {
  if (!selectedEl) {
    alert('प्रथम कोणताही घटक निवडा.');
    return;
  }
  const countStr = prompt('किती प्रती पेस्ट करायच्या आहेत?', '5');
  if (countStr === null) return;
  const count = Math.max(1, Math.min(50, parseInt(countStr) || 1));
  const dxStr = prompt('Horizontal Offset (X अंतर px मध्ये):', '15');
  if (dxStr === null) return;
  const dyStr = prompt('Vertical Offset (Y अंतर px मध्ये):', '15');
  if (dyStr === null) return;
  const dx = parseInt(dxStr) || 0;
  const dy = parseInt(dyStr) || 0;

  let baseX = parseInt(selectedEl.style.left) || 40;
  let baseY = parseInt(selectedEl.style.top) || 40;
  let lastEl = selectedEl;

  for (let i = 1; i <= count; i++) {
    const c = selectedEl.cloneNode(true);
    c.classList.remove('selected', 'crop-mode');
    c.style.left = (baseX + dx * i) + 'px';
    c.style.top = (baseY + dy * i) + 'px';
    attachElementEvents(c);
    document.getElementById('page').appendChild(c);
    lastEl = c;
  }
  selectElement(lastEl);
  saveCurrentActivePageIntoData();
}

function updateControlPaletteInputs() {
  if (!selectedEl) return;
  const { w, h } = getElementExactSize(selectedEl);
  document.getElementById('pos-x').value = parseInt(selectedEl.style.left) || 0;
  document.getElementById('pos-y').value = parseInt(selectedEl.style.top) || 0;
  document.getElementById('box-w').value = w;
  document.getElementById('box-h').value = h;
  document.getElementById('box-rot').value = selectedEl.dataset.rotation || 0;
}

function updateBoxGeometry() {
  if (!selectedEl) return;
  selectedEl.style.left = (parseInt(document.getElementById('pos-x').value) || 0) + 'px';
  selectedEl.style.top = (parseInt(document.getElementById('pos-y').value) || 0) + 'px';
  selectedEl.style.width = (parseInt(document.getElementById('box-w').value) || 10) + 'px';
  selectedEl.style.height = (parseInt(document.getElementById('box-h').value) || 10) + 'px';
  if (isAncestryElement(selectedEl)) renderAncestryConnectorShape(selectedEl);
  checkTextOverflow(selectedEl);
  saveCurrentActivePageIntoData();
}

function updateBoxRotation() {
  if (!selectedEl) return;
  const d = parseInt(document.getElementById('box-rot').value) || 0;
  selectedEl.dataset.rotation = d;
  selectedEl.style.transform = `rotate(${d}deg)`;
  saveCurrentActivePageIntoData();
}

function applyStyle(cmd, val = null) {
  if (selectedEl) {
    const tc = selectedEl.querySelector('.text-content');
    if (tc && document.activeElement !== tc) {
      tc.focus();
    }
  }
  document.execCommand(cmd, false, val);
  if (selectedEl && cmd === 'fontName') {
    applyFontFamily(val);
  }
  if (selectedEl) checkTextOverflow(selectedEl);
  saveCurrentActivePageIntoData();
}

function toggleReverseText() {
  if (!selectedEl) return;
  const tc = selectedEl.querySelector('.text-content');
  if (!tc) return;
  const isRev = tc.dataset.reversed === '1';
  if (isRev) {
    tc.dataset.reversed = '0';
    tc.style.color = '#000000';
  } else {
    tc.dataset.reversed = '1';
    tc.style.color = '#ffffff';
  }
  saveCurrentActivePageIntoData();
}

function setLetterTrackingPrompt() {
  if (!selectedEl) {
    alert('प्रथम टेक्स्ट बॉक्स निवडा.');
    return;
  }
  const tc = selectedEl.querySelector('.text-content');
  if (!tc) return;
  const cur = parseFloat(tc.style.letterSpacing) || 0;
  const valStr = prompt('अक्षरांमधील अंतर (Letter Spacing px मध्ये, उदा. -1, 0, 1, 2, 4):', cur);
  if (valStr === null) return;
  tc.style.letterSpacing = (parseFloat(valStr) || 0) + 'px';
  checkTextOverflow(selectedEl);
  saveCurrentActivePageIntoData();
}

function setWordSpacingPrompt() {
  if (!selectedEl) {
    alert('प्रथम टेक्स्ट बॉक्स निवडा.');
    return;
  }
  const tc = selectedEl.querySelector('.text-content');
  if (!tc) return;
  const cur = parseFloat(tc.style.wordSpacing) || 0;
  const valStr = prompt('दोन शब्दांमधील अंतर (Word Spacing px मध्ये, उदा. 0, 3, 6, 12):', cur);
  if (valStr === null) return;
  tc.style.wordSpacing = (parseFloat(valStr) || 0) + 'px';
  checkTextOverflow(selectedEl);
  saveCurrentActivePageIntoData();
}

function setLineSpacingPrompt() {
  if (!selectedEl) {
    alert('प्रथम टेक्स्ट बॉक्स निवडा.');
    return;
  }
  const tc = selectedEl.querySelector('.text-content');
  if (!tc) return;
  const cur = parseFloat(tc.style.lineHeight) || parseFloat(document.getElementById('line-leading').value) || 1.4;
  const valStr = prompt('ओळींमधील / उभे अंतर (Line Leading, उदा. 1.1, 1.4, 1.8, 2.2):', cur);
  if (valStr === null) return;
  const nextVal = parseFloat(valStr) || 1.4;
  document.getElementById('line-leading').value = nextVal;
  tc.style.lineHeight = nextVal;
  checkTextOverflow(selectedEl);
  saveCurrentActivePageIntoData();
}

function changeFontSize(s) {
  if (selectedEl) {
    const tc = selectedEl.querySelector('.text-content');
    if (tc) {
      tc.style.fontSize = (parseInt(s) || 16) + 'px';
      checkTextOverflow(selectedEl);
      saveCurrentActivePageIntoData();
    }
  }
}

function setLineHeight(lh) {
  const val = parseFloat(lh) || 1.4;
  document.getElementById('line-leading').value = val;
  if (selectedEl) {
    const tc = selectedEl.querySelector('.text-content');
    if (tc) {
      tc.style.lineHeight = val;
      checkTextOverflow(selectedEl);
      saveCurrentActivePageIntoData();
    }
  }
}

function applyColor(c) {
  document.getElementById('picker-color').value = c;
  if (!selectedEl) return;
  const tc = selectedEl.querySelector('.text-content');
  if (tc) tc.style.color = c;
  if (isAncestryElement(selectedEl)) {
    selectedEl.dataset.strokeColor = c;
    renderAncestryConnectorShape(selectedEl);
  }
  selectedEl.querySelectorAll('rect, ellipse, polygon, line').forEach(s => s.setAttribute('stroke', c));
  saveCurrentActivePageIntoData();
}

function applyFillColor() {
  if (!selectedEl) return;
  const c = document.getElementById('picker-color').value;
  selectedEl.querySelectorAll('rect, ellipse, polygon').forEach(s => s.setAttribute('fill', c));
  saveCurrentActivePageIntoData();
}

function applyFillStrokePrompt() {
  if (!selectedEl) {
    alert('प्रथम कोणताही आकार निवडा.');
    return;
  }
  const fillCol = prompt('Fill Color (उदा. #ffe4b5, none, #ffffff):', '#ffe4b5');
  if (fillCol === null) return;
  const strokeCol = prompt('Stroke Color (उदा. #000000, #ff0000):', '#000000');
  if (strokeCol === null) return;
  const strokeW = prompt('Stroke Width (pt/px मध्ये, उदा. 1, 2, 4):', '2');
  if (strokeW === null) return;

  if (isAncestryElement(selectedEl)) {
    selectedEl.dataset.strokeColor = strokeCol.trim() || '#000000';
    selectedEl.dataset.strokeWidth = String(parseFloat(strokeW) || 2);
    renderAncestryConnectorShape(selectedEl);
  }
  selectedEl.querySelectorAll('rect, ellipse, polygon').forEach(s => {
    s.setAttribute('fill', fillCol.trim() || 'none');
    s.setAttribute('stroke', strokeCol.trim() || '#000000');
    s.setAttribute('stroke-width', parseFloat(strokeW) || 1);
  });
  selectedEl.querySelectorAll('line').forEach(s => {
    s.setAttribute('stroke', strokeCol.trim() || '#000000');
    s.setAttribute('stroke-width', parseFloat(strokeW) || 1);
  });
  saveCurrentActivePageIntoData();
}

function changeStrokeWidth(w) {
  if (!selectedEl) return;
  if (isAncestryElement(selectedEl)) {
    selectedEl.dataset.strokeWidth = String(parseFloat(w) || 2);
    renderAncestryConnectorShape(selectedEl);
  }
  selectedEl.querySelectorAll('rect, ellipse, polygon, line').forEach(s => s.setAttribute('stroke-width', w));
  saveCurrentActivePageIntoData();
}

function alignObjects(mode) {
  const els = Array.from(document.querySelectorAll('#page > .pm-element.selected'));
  if (els.length < 2) {
    alert('Align Objects साठी Select All किंवा एकापेक्षा जास्त घटक निवडा.');
    return;
  }
  const rects = els.map(el => {
    const { w, h } = getElementExactSize(el);
    return {
      el,
      left: parseInt(el.style.left) || 0,
      top: parseInt(el.style.top) || 0,
      w,
      h
    };
  });

  if (mode === 'left') {
    const minL = Math.min(...rects.map(r => r.left));
    rects.forEach(r => { r.el.style.left = minL + 'px'; });
  } else if (mode === 'right') {
    const maxR = Math.max(...rects.map(r => r.left + r.w));
    rects.forEach(r => { r.el.style.left = (maxR - r.w) + 'px'; });
  } else if (mode === 'center') {
    const minL = Math.min(...rects.map(r => r.left));
    const maxR = Math.max(...rects.map(r => r.left + r.w));
    const midX = (minL + maxR) / 2;
    rects.forEach(r => { r.el.style.left = Math.round(midX - r.w / 2) + 'px'; });
  } else if (mode === 'top') {
    const minT = Math.min(...rects.map(r => r.top));
    rects.forEach(r => { r.el.style.top = minT + 'px'; });
  } else if (mode === 'bottom') {
    const maxB = Math.max(...rects.map(r => r.top + r.h));
    rects.forEach(r => { r.el.style.top = (maxB - r.h) + 'px'; });
  } else if (mode === 'middle') {
    const minT = Math.min(...rects.map(r => r.top));
    const maxB = Math.max(...rects.map(r => r.top + r.h));
    const midY = (minT + maxB) / 2;
    rects.forEach(r => { r.el.style.top = Math.round(midY - r.h / 2) + 'px'; });
  }
  updateControlPaletteInputs();
  saveCurrentActivePageIntoData();
}

function toggleTextWrap() {
  if (!selectedEl) return;
  const wrapped = selectedEl.dataset.textWrap === '1';
  if (wrapped) {
    selectedEl.dataset.textWrap = '0';
    selectedEl.style.boxShadow = 'none';
  } else {
    selectedEl.dataset.textWrap = '1';
    selectedEl.style.boxShadow = '0 0 0 6px rgba(0,168,232,0.18)';
  }
  saveCurrentActivePageIntoData();
}

function openStoryEditor() {
  if (!selectedEl) {
    alert('प्रथम कोणताही टेक्स्ट बॉक्स निवडा.');
    return;
  }
  const tc = selectedEl.querySelector('.text-content');
  if (!tc) {
    alert('निवडलेल्या बॉक्समध्ये मजकूर नाही.');
    return;
  }
  const baseText = tc.dataset.unicodeSource || tc.innerText;
  const updated = prompt('Story Editor — मराठी मजकूर बदला:', baseText);
  if (updated !== null) {
    tc.dataset.unicodeSource = updated;
    const lType = getLegacyFontType(tc.style.fontFamily || document.getElementById('font-family').value);
    tc.innerText = lType ? unicodeToLegacyDevanagari(updated, lType) : updated;
    checkTextOverflow(selectedEl);
    saveCurrentActivePageIntoData();
  }
}

function exportPageAsPNG() {
  try {
    const pageEl = document.getElementById('page');
    const w = parseInt(pageEl.style.width) || 816;
    const h = parseInt(pageEl.style.height) || 1056;
    const clone = pageEl.cloneNode(true);
    ['.margin-guide', '.guides-layer', '.handle', '.overflow-badge', '.anc-ui-layer', '.anc-floating-bar'].forEach(sel => {
      clone.querySelectorAll(sel).forEach(n => n.remove());
    });
    clone.querySelectorAll('.pm-element').forEach(el => {
      el.classList.remove('selected', 'crop-mode');
      el.style.outline = 'none';
      el.style.border = 'none';
      el.style.boxShadow = 'none';
    });
    clone.style.transform = 'none';

    const svgData =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<foreignObject width="100%" height="100%">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background:#ffffff;position:relative;">` +
      clone.innerHTML +
      `</div></foreignObject></svg>`;

    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = function() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `Page_${window.activePageId || 1}.png`;
        a.click();
      } catch (err) {
        alert('PNG तयार करताना अडचण आली; Save / PDF पर्याय वापरून पहा.');
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      alert('PNG एक्सपोर्ट शक्य झाले नाही; Save / PDF पर्याय वापरून पहा.');
    };
    img.src = url;
  } catch (e) {
    alert('PNG एक्सपोर्ट शक्य झाले नाही.');
  }
}

function duplicateSelected() {
  if (!selectedEl) return;
  const c = selectedEl.cloneNode(true);
  c.style.left = ((parseInt(selectedEl.style.left) || 0) + 20) + 'px';
  c.style.top = ((parseInt(selectedEl.style.top) || 0) + 20) + 'px';
  attachElementEvents(c);
  document.getElementById('page').appendChild(c);
  selectElement(c);
  saveCurrentActivePageIntoData();
}

function bringToFront() { if (selectedEl) { selectedEl.style.zIndex = 50; saveCurrentActivePageIntoData(); } }
function sendToBack() { if (selectedEl) { selectedEl.style.zIndex = 5; saveCurrentActivePageIntoData(); } }
function bringForward() {
  if (selectedEl) {
    const cur = parseInt(selectedEl.style.zIndex) || 10;
    selectedEl.style.zIndex = Math.min(80, cur + 1);
    saveCurrentActivePageIntoData();
  }
}
function sendBackward() {
  if (selectedEl) {
    const cur = parseInt(selectedEl.style.zIndex) || 10;
    selectedEl.style.zIndex = Math.max(3, cur - 1);
    saveCurrentActivePageIntoData();
  }
}
function deleteSelected() { if (selectedEl) { selectedEl.remove(); selectedEl = null; removeAncestryFloatingBar(); saveCurrentActivePageIntoData(); } }

function insertPageNumberBox() {
  const curId = window.activePageId || 1;
  const label = (curId === 'M') ? '#' : String(curId);
  const el = createPMElement(275, 800, 50, 24);
  const c = document.createElement('div');
  c.className = 'text-content';
  c.contentEditable = true;
  c.style.textAlign = 'center';
  c.innerText = label;
  el.appendChild(c);
  saveCurrentActivePageIntoData();
}

function findAndReplaceText() {
  const findVal = prompt('कोणता शब्द शोधायचा आहे?');
  if (!findVal) return;
  const repVal = prompt(`"${findVal}" ऐवजी कोणता शब्द टाकायचा आहे?`, '');
  if (repVal === null) return;
  document.querySelectorAll('.text-content').forEach(tc => {
    tc.innerHTML = tc.innerHTML.split(findVal).join(repVal);
  });
  saveCurrentActivePageIntoData();
}
