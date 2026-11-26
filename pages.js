let currentTool = 'text';
let selectedEl = null;
let zoomLevel = 1;
let activePageId = 1;
let totalPages = 1;
let pagesData = { 'M': '', 1: '' };
let pageGuides = { 'M': { h: [], v: [] }, 1: { h: [], v: [] } };

function ensureGuideBucket(id) {
  if (!pageGuides[id]) pageGuides[id] = { h: [], v: [] };
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
    }
  }
}

function buildRulers() {
  const rh = document.getElementById('ruler-h');
  const rv = document.getElementById('ruler-v');
  if (!rh || !rv) return;
  rh.innerHTML = '';
  rv.innerHTML = '';

  const pageEl = document.getElementById('page');
  const pbEl = document.getElementById('pasteboard');
  const pageRect = pageEl.getBoundingClientRect();
  const rhRect = rh.getBoundingClientRect();
  const rvRect = rv.getBoundingClientRect();

  // पानाच्या 0 (डावी/वरची कड) पासून मोजणी सुरू होईल आणि 1 इंच = 96px * zoomLevel
  const pxPerInch = 96 * zoomLevel;
  const stepQuarter = pxPerInch / 4; // प्रत्येक पाव इंचावर १ रेष (एकूण 4 divisions per inch)

  const originX = (pageRect.left - rhRect.left) + (pbEl ? pbEl.scrollLeft : 0);
  const originY = (pageRect.top - rvRect.top) + (pbEl ? pbEl.scrollTop : 0);

  const maxInchesH = 12;
  const totalStepsH = maxInchesH * 4;
  for (let i = 0; i <= totalStepsH; i++) {
    const pos = Math.round(originX + i * stepQuarter);
    if (pos < -20 || pos > rh.clientWidth + 40) continue;

    const isInch = (i % 4 === 0);
    const isHalf = (i % 2 === 0) && !isInch;

    const tick = document.createElement('div');
    tick.className = 'ruler-tick-h';
    tick.style.left = pos + 'px';
    tick.style.height = isInch ? '12px' : (isHalf ? '8px' : '5px');
    rh.appendChild(tick);

    if (isInch) {
      const lbl = document.createElement('div');
      lbl.className = 'ruler-label-h';
      lbl.style.left = pos + 'px';
      lbl.textContent = (i / 4);
      rh.appendChild(lbl);
    }
  }

  const maxInchesV = 15;
  const totalStepsV = maxInchesV * 4;
  for (let j = 0; j <= totalStepsV; j++) {
    const pos = Math.round(originY + j * stepQuarter);
    if (pos < -20 || pos > rv.clientHeight + 40) continue;

    const isInch = (j % 4 === 0);
    const isHalf = (j % 2 === 0) && !isInch;

    const tick = document.createElement('div');
    tick.className = 'ruler-tick-v';
    tick.style.top = pos + 'px';
    tick.style.width = isInch ? '12px' : (isHalf ? '8px' : '5px');
    rv.appendChild(tick);

    if (isInch) {
      const lbl = document.createElement('div');
      lbl.className = 'ruler-label-v';
      lbl.style.top = pos + 'px';
      lbl.textContent = (j / 4);
      rv.appendChild(lbl);
    }
  }
}

function renderGuides() {
  ensureGuideBucket(activePageId);
  const layer = document.getElementById('guides-layer');
  if (!layer) return;
  layer.innerHTML = '';

  const bucket = pageGuides[activePageId];
  bucket.h.forEach((pos, idx) => {
    const line = document.createElement('div');
    line.className = 'guide-line-h';
    line.style.top = pos + 'px';
    line.onpointerdown = (e) => {
      e.stopPropagation();
      const pageRect = document.getElementById('page').getBoundingClientRect();
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
      const pageRect = document.getElementById('page').getBoundingClientRect();
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

function clearGuides() {
  ensureGuideBucket(activePageId);
  pageGuides[activePageId] = { h: [], v: [] };
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
      ensureGuideBucket(activePageId);
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
      ensureGuideBucket(activePageId);
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
  clone.querySelectorAll('.pm-element').forEach(el => el.classList.remove('selected', 'crop-mode'));
  pagesData[activePageId] = clone.innerHTML;
}

function switchPage(targetId) {
  saveCurrentPageContent();
  activePageId = targetId;
  ensureGuideBucket(activePageId);
  selectedEl = null;

  const page = document.getElementById('page');
  const masterHTML = (targetId === 'M') ? '' : (pagesData['M'] || '');
  page.innerHTML =
    `<div class="margin-guide"></div>` +
    `<div class="master-layer" id="master-layer">${masterHTML}</div>` +
    `<div class="guides-layer" id="guides-layer"></div>` +
    `${pagesData[targetId] || ''}`;

  page.querySelectorAll(':scope > .pm-element').forEach(el => attachElementEvents(el));
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
  ensureGuideBucket(totalPages);
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
  }
  delete pagesData[totalPages];
  delete pageGuides[totalPages];
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

window.addEventListener('DOMContentLoaded', () => {
  const selectEl = document.getElementById('font-family');
  if (selectEl) selectEl.style.fontFamily = selectEl.value;
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
