let currentTool = 'pointer';
let selectedEl = null;
let pendingThreadSource = null;
let zoomLevel = 1;
let activePageId = 1;
let totalPages = 1;
let pagesData = { 'M': '', 1: '' };
let pageGuides = { 'M': { h: [], v: [] }, 1: { h: [], v: [] } };
let pageColumns = { 'M': { count: 1, gutter: 12 }, 1: { count: 1, gutter: 12 } };

function ensurePageState(id) {
  if (!pageGuides[id]) pageGuides[id] = { h: [], v: [] };
  if (!pageColumns[id]) pageColumns[id] = { count: 1, gutter: 12 };
}

function cleanMasterHTML(rawHTML) {
  if (!rawHTML) return '';
  const temp = document.createElement('div');
  temp.innerHTML = rawHTML;
  temp.querySelectorAll('.pm-element').forEach(el => {
    el.classList.remove('selected', 'crop-mode');
    el.style.pointerEvents = 'none';
  });
  temp.querySelectorAll('.handle, .overflow-badge').forEach(h => h.remove());
  temp.querySelectorAll('.text-content').forEach(tc => {
    tc.contentEditable = 'false';
  });
  return temp.innerHTML;
}

function applyFontFamily(fontVal) {
  const selectEl = document.getElementById('font-family');
  if (selectEl) {
    selectEl.style.fontFamily = fontVal;
  }
  if (selectedEl) {
    saveState();
    const tc = selectedEl.querySelector('.text-content');
    if (tc) {
      tc.style.fontFamily = fontVal;
      tc.querySelectorAll('*').forEach(child => {
        child.style.fontFamily = fontVal;
      });
      if (/[\u0900-\u097F]/.test(tc.innerText)) {
        tc.dataset.unicodeSource = tc.innerText;
      }
      const lType = (typeof getLegacyFontType === 'function') ? getLegacyFontType(fontVal) : null;
      if (lType && tc.dataset.unicodeSource) {
        tc.innerText = unicodeToLegacyDevanagari(tc.dataset.unicodeSource, lType);
      } else if (!lType && tc.dataset.unicodeSource) {
        tc.innerText = tc.dataset.unicodeSource;
      }
    }
    checkTextOverflow(selectedEl);
  }
}

function buildRulers() {
  const rh = document.getElementById('ruler-h');
  const rv = document.getElementById('ruler-v');
  if (!rh || !rv) return;
  rh.innerHTML = '';
  rv.innerHTML = '';

  const pageEl = document.getElementById('page');
  const pageRect = pageEl.getBoundingClientRect();
  const rhRect = rh.getBoundingClientRect();
  const rvRect = rv.getBoundingClientRect();

  const majorPx = 96 * zoomLevel;
  const subStep = majorPx / 16;

  const originX = pageRect.left - rhRect.left;
  const originY = pageRect.top - rvRect.top;

  function tickSizeH(stepIdx) {
    if (stepIdx === 0) return 14;
    if (stepIdx === 8) return 11;
    if (stepIdx === 4 || stepIdx === 12) return 8;
    if (stepIdx % 2 === 0) return 6;
    return 3.5;
  }

  function tickSizeV(stepIdx) {
    if (stepIdx === 0) return 14;
    if (stepIdx === 8) return 11;
    if (stepIdx === 4 || stepIdx === 12) return 8;
    if (stepIdx % 2 === 0) return 6;
    return 3.5;
  }

  const startUnitH = Math.floor(-originX / majorPx) - 1;
  const endUnitH = Math.ceil((rh.clientWidth - originX) / majorPx) + 1;

  for (let u = startUnitH; u <= endUnitH; u++) {
    for (let s = 0; s < 16; s++) {
      const pos = Math.round(originX + (u * 16 + s) * subStep);
      if (pos < 0 || pos > rh.clientWidth) continue;

      const tick = document.createElement('div');
      tick.className = 'ruler-tick-h';
      tick.style.left = pos + 'px';
      tick.style.height = tickSizeH(s) + 'px';
      rh.appendChild(tick);

      if (s === 0) {
        const lbl = document.createElement('div');
        lbl.className = 'ruler-label-h';
        lbl.style.left = (pos + 2) + 'px';
        lbl.textContent = u;
        rh.appendChild(lbl);
      }
    }
  }

  const startUnitV = Math.floor(-originY / majorPx) - 1;
  const endUnitV = Math.ceil((rv.clientHeight - originY) / majorPx) + 1;

  for (let u = startUnitV; u <= endUnitV; u++) {
    for (let s = 0; s < 16; s++) {
      const pos = Math.round(originY + (u * 16 + s) * subStep);
      if (pos < 0 || pos > rv.clientHeight) continue;

      const tick = document.createElement('div');
      tick.className = 'ruler-tick-v';
      tick.style.top = pos + 'px';
      tick.style.width = tickSizeV(s) + 'px';
      rv.appendChild(tick);

      if (s === 0) {
        const lbl = document.createElement('div');
        lbl.className = 'ruler-label-v';
        lbl.style.top = (pos + 2) + 'px';
        lbl.textContent = u;
        rv.appendChild(lbl);
      }
    }
  }
}

function renderGuides() {
  ensurePageState(activePageId);
  const layer = document.getElementById('guides-layer');
  if (!layer) return;
  layer.innerHTML = '';

  const pageEl = document.getElementById('page');
  const pageW = parseInt(pageEl.style.width) || 595;
  const margin = 40;
  const colCfg = pageColumns[activePageId];

  if (colCfg && colCfg.count > 1) {
    const usableW = pageW - margin * 2;
    const totalGutter = colCfg.gutter * (colCfg.count - 1);
    const colW = (usableW - totalGutter) / colCfg.count;

    for (let c = 0; c < colCfg.count; c++) {
      const leftEdge = Math.round(margin + c * (colW + colCfg.gutter));
      const rightEdge = Math.round(leftEdge + colW);

      const lGuide = document.createElement('div');
      lGuide.className = 'guide-line-v';
      lGuide.style.left = leftEdge + 'px';
      lGuide.style.borderLeftColor = '#ff69b4';
      lGuide.style.pointerEvents = 'none';
      layer.appendChild(lGuide);

      const rGuide = document.createElement('div');
      rGuide.className = 'guide-line-v';
      rGuide.style.left = rightEdge + 'px';
      rGuide.style.borderLeftColor = '#ff69b4';
      rGuide.style.pointerEvents = 'none';
      layer.appendChild(rGuide);
    }
  }

  const bucket = pageGuides[activePageId];
  bucket.h.forEach((pos, idx) => {
    const line = document.createElement('div');
    line.className = 'guide-line-h';
    line.style.top = pos + 'px';
    line.onpointerdown = (e) => {
      e.stopPropagation();
      const pageRect = pageEl.getBoundingClientRect();
      function onMove(ev) {
        const y = Math.round((ev.clientY - pageRect.top) / zoomLevel);
        bucket.h[idx] = y;
        line.style.top = y + 'px';
      }
      function onUp() {
        if (bucket.h[idx] < 0) bucket.h.splice(idx, 1);
        renderGuides();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    layer.appendChild(line);
  });

  bucket.v.forEach((pos, idx) => {
    const line = document.createElement('div');
    line.className = 'guide-line-v';
    line.style.left = pos + 'px';
    line.onpointerdown = (e) => {
      e.stopPropagation();
      const pageRect = pageEl.getBoundingClientRect();
      function onMove(ev) {
        const x = Math.round((ev.clientX - pageRect.left) / zoomLevel);
        bucket.v[idx] = x;
        line.style.left = x + 'px';
      }
      function onUp() {
        if (bucket.v[idx] < 0) bucket.v.splice(idx, 1);
        renderGuides();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    layer.appendChild(line);
  });
}

function setColumnGuides() {
  ensurePageState(activePageId);
  const current = pageColumns[activePageId];
  const countStr = prompt('कॉलम संख्या टाका (1 ते 4):', current.count);
  if (countStr === null) return;
  const count = Math.max(1, Math.min(4, parseInt(countStr) || 1));
  const gutterStr = prompt('कॉलममधील अंतर (Gutter px मध्ये):', current.gutter);
  if (gutterStr === null) return;
  const gutter = Math.max(4, Math.min(80, parseInt(gutterStr) || 12));
  saveState();
  pageColumns[activePageId] = { count, gutter };
  renderGuides();
}

function clearGuides() {
  ensurePageState(activePageId);
  pageGuides[activePageId] = { h: [], v: [] };
  pageColumns[activePageId] = { count: 1, gutter: 12 };
  renderGuides();
}

function toggleMargins() {
  const mg = document.getElementById('margin-guide');
  const gl = document.getElementById('guides-layer');
  const hide = mg.style.display === 'none';
  mg.style.display = hide ? 'block' : 'none';
  gl.style.display = hide ? 'block' : 'none';
}

function initRulerDrag() {
  const rh = document.getElementById('ruler-h');
  const rv = document.getElementById('ruler-v');
  if (rh) {
    rh.onpointerdown = (e) => {
      e.preventDefault();
      ensurePageState(activePageId);
      const pageRect = document.getElementById('page').getBoundingClientRect();
      const y0 = Math.max(0, Math.round((e.clientY - pageRect.top) / zoomLevel));
      pageGuides[activePageId].h.push(y0);
      const idx = pageGuides[activePageId].h.length - 1;
      renderGuides();
      function onMove(ev) {
        pageGuides[activePageId].h[idx] = Math.round((ev.clientY - pageRect.top) / zoomLevel);
        renderGuides();
      }
      function onUp() {
        if (pageGuides[activePageId].h[idx] < 0) pageGuides[activePageId].h.splice(idx, 1);
        renderGuides();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
  }
  if (rv) {
    rv.onpointerdown = (e) => {
      e.preventDefault();
      ensurePageState(activePageId);
      const pageRect = document.getElementById('page').getBoundingClientRect();
      const x0 = Math.max(0, Math.round((e.clientX - pageRect.left) / zoomLevel));
      pageGuides[activePageId].v.push(x0);
      const idx = pageGuides[activePageId].v.length - 1;
      renderGuides();
      function onMove(ev) {
        pageGuides[activePageId].v[idx] = Math.round((ev.clientX - pageRect.left) / zoomLevel);
        renderGuides();
      }
      function onUp() {
        if (pageGuides[activePageId].v[idx] < 0) pageGuides[activePageId].v.splice(idx, 1);
        renderGuides();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
  }
}

function saveCurrentPageContent() {
  const page = document.getElementById('page');
  const clone = page.cloneNode(true);
  ['.margin-guide', '.master-layer', '.guides-layer'].forEach(sel => {
    const n = clone.querySelector(sel);
    if (n) n.remove();
  });
  clone.querySelectorAll('.pm-element').forEach(el => {
    el.classList.remove('selected', 'crop-mode');
    el.style.pointerEvents = '';
  });
  pagesData[activePageId] = clone.innerHTML;
}

function switchPage(targetId) {
  saveCurrentPageContent();
  activePageId = targetId;
  ensurePageState(activePageId);
  selectedEl = null;

  const page = document.getElementById('page');
  const masterHTML = (targetId === 'M') ? '' : cleanMasterHTML(pagesData['M'] || '');
  page.innerHTML =
    `<div class="margin-guide" id="margin-guide"></div>` +
    `<div class="master-layer" id="master-layer">${masterHTML}</div>` +
    `<div class="guides-layer" id="guides-layer"></div>` +
    `${pagesData[targetId] || ''}`;

  page.querySelectorAll(':scope > .pm-element').forEach(el => {
    attachElementEvents(el);
    checkTextOverflow(el);
  });
  renderGuides();

  document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById('tab-' + targetId);
  if (tab) tab.classList.add('active');
  document.getElementById('page-indicator').innerText =
    (targetId === 'M') ? '[Master Page]' : `[Page ${targetId} of ${totalPages}]`;
}

function insertNewPage() {
  saveState();
  saveCurrentPageContent();
  totalPages++;
  pagesData[totalPages] = '';
  ensurePageState(totalPages);
  renderPageTabs();
  switchPage(totalPages);
}

function removeCurrentPage() {
  if (activePageId === 'M' || totalPages <= 1) return;
  if (!confirm(`Page ${activePageId} डिलीट करायचे का?`)) return;
  saveState();
  for (let i = activePageId; i < totalPages; i++) {
    pagesData[i] = pagesData[i + 1];
    pageGuides[i] = pageGuides[i + 1];
    pageColumns[i] = pageColumns[i + 1];
  }
  delete pagesData[totalPages];
  delete pageGuides[totalPages];
  delete pageColumns[totalPages];
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
  bar.innerHTML += `<button type="button" class="add-page-btn" onclick="insertNewPage()">+ Page</button>`;
}

function setPageSize(w, h) {
  saveState();
  const p = document.getElementById('page');
  p.style.width = w + 'px';
  p.style.height = h + 'px';
  p.style.minWidth = w + 'px';
  p.style.minHeight = h + 'px';
  buildRulers();
  renderGuides();
}

function setZoom(l) {
  zoomLevel = Math.max(0.4, Math.min(2.5, Number(l) || 1));
  document.getElementById('page').style.transform = `scale(${zoomLevel})`;
  const lbl = document.getElementById('zoom-lbl');
  if (lbl) lbl.innerText = Math.round(zoomLevel * 100) + '%';
  buildRulers();
}

function printAllPages() {
  saveCurrentPageContent();
  const container = document.getElementById('print-all-container');
  container.innerHTML = '';
  const pageW = document.getElementById('page').style.width || '595px';
  const pageH = document.getElementById('page').style.height || '842px';
  const masterClean = cleanMasterHTML(pagesData['M'] || '');
  for (let i = 1; i <= totalPages; i++) {
    const pDiv = document.createElement('div');
    pDiv.className = 'print-page';
    pDiv.style.width = pageW;
    pDiv.style.height = pageH;
    pDiv.innerHTML = `<div class="master-layer">${masterClean}</div>${pagesData[i] || ''}`;
    container.appendChild(pDiv);
  }
  window.print();
}

window.addEventListener('DOMContentLoaded', () => {
  const selectEl = document.getElementById('font-family');
  if (selectEl) selectEl.style.fontFamily = selectEl.value;
  selectTool('pointer');
  buildRulers();
  initRulerDrag();
  renderGuides();
  makePaletteDraggable('toolbox', 'toolbox-drag');
  makePaletteDraggable('color-palette', 'colors-drag');
  makePaletteDraggable('control-palette', 'control-drag');

  const pb = document.getElementById('pasteboard');
  if (pb) pb.addEventListener('scroll', buildRulers);
  window.addEventListener('resize', buildRulers);
});
