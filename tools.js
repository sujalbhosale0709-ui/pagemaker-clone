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
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
}

function selectTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('tool-' + tool);
  if (btn) btn.classList.add('active');

  document.getElementById('pasteboard').style.cursor =
    (tool === 'hand') ? 'grab' : (tool === 'zoom' ? 'zoom-in' : 'crosshair');

  document.querySelectorAll('#page > .pm-element').forEach(el => {
    el.classList.toggle('crop-mode', tool === 'crop' && el === selectedEl);
  });
  document.querySelectorAll('#page > .pm-element .text-content').forEach(tc => {
    tc.contentEditable = (tool === 'text');
    tc.style.cursor = (tool === 'text') ? 'text' : 'move';
  });
}

function snapValue(val, axis) {
  ensurePageState(activePageId);
  const guides = pageGuides[activePageId][axis] || [];
  for (let g of guides) {
    if (Math.abs(val - g) <= 5) return g;
  }
  return val;
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
        ev.stopPropagation();
        pendingThreadSource = el;
        selectTool('text');
        alert('आता पानावर जिथे उरलेला मजकूर हवा आहे तिथे क्लिक किंवा ओढा.');
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
      e.stopPropagation();
      saveState();
      if (currentTool === 'crop') initCrop(e, el, dir);
      else initResize(e, el, dir);
    };
  });

  const tc = el.querySelector('.text-content');
  if (tc) {
    tc.addEventListener('input', () => checkTextOverflow(el));
  }

  el.onpointerdown = (e) => {
    if (currentTool === 'hand' || currentTool === 'zoom') return;
    if (e.target.classList.contains('handle') || e.target.classList.contains('overflow-badge')) return;
    if (currentTool === 'text' && e.target.classList.contains('text-content')) {
      selectElement(el);
      return;
    }
    e.stopPropagation();
    selectElement(el);
    if (currentTool === 'rotate') { saveState(); initRotate(e, el); }
    else { saveState(); initDrag(e, el); }
  };

  checkTextOverflow(el);
}

function createPMElement(x, y, w, h) {
  saveState();
  const el = document.createElement('div');
  el.className = 'pm-element selected';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  el.dataset.rotation = 0;

  ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].forEach(dir => {
    const hDiv = document.createElement('div');
    hDiv.className = 'handle ' + dir;
    el.appendChild(hDiv);
  });

  attachElementEvents(el);
  document.getElementById('page').appendChild(el);
  selectElement(el);
  return el;
}

function populateShapeInner(el, type, w, h) {
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
    c.contentEditable = true;
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
  const startX = snapValue(Math.round((e.clientX - rect.left) / zoomLevel), 'v');
  const startY = snapValue(Math.round((e.clientY - rect.top) / zoomLevel), 'h');

  if (currentTool === 'text') {
    const el = createPMElement(startX, startY, 220, 70);
    const content = document.createElement('div');
    content.className = 'text-content';
    content.contentEditable = true;
    content.style.fontFamily = document.getElementById('font-family').value;
    content.style.fontSize = document.getElementById('font-size').value + 'px';
    content.style.lineHeight = document.getElementById('line-leading').value || '1.4';
    content.style.color = document.getElementById('picker-color').value || '#000000';

    if (pendingThreadSource) {
      const srcTc = pendingThreadSource.querySelector('.text-content');
      if (srcTc) {
        const words = srcTc.innerText.split(/\s+/).filter(Boolean);
        const half = Math.ceil(words.length / 2);
        srcTc.innerText = words.slice(0, half).join(' ');
        content.innerText = words.slice(half).join(' ') || 'पुढील मजकूर...';
        checkTextOverflow(pendingThreadSource);
      }
      pendingThreadSource = null;
    } else {
      content.innerText = 'येथे मराठी टाइप करा...';
    }

    el.appendChild(content);
    content.addEventListener('input', () => checkTextOverflow(el));
    checkTextOverflow(el);
    content.focus();
    return;
  }

  const shapeType = currentTool;
  const el = createPMElement(startX, startY, 40, 40);
  populateShapeInner(el, shapeType, 40, 40);

  function onMove(ev) {
    let curX = Math.round((ev.clientX - rect.left) / zoomLevel);
    let curY = Math.round((ev.clientY - rect.top) / zoomLevel);
    if (shapeType === 'cline') {
      curY = startY;
    }
    const left = Math.min(startX, curX);
    const top = Math.min(startY, curY);
    const w = Math.max(12, Math.abs(curX - startX));
    const h = (shapeType === 'cline') ? 12 : Math.max(12, Math.abs(curY - startY));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    populateShapeInner(el, shapeType, w, h);
    updateControlPaletteInputs();
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    selectTool('pointer');
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function triggerPlaceImage() {
  document.getElementById('image-input').click();
}

function placeImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const el = createPMElement(60, 60, 180, 180);
    const w = document.createElement('div');
    w.className = 'img-wrapper';
    const img = document.createElement('img');
    img.src = e.target.result;
    img.className = 'pm-image';
    w.appendChild(img);
    el.appendChild(w);
    selectTool('pointer');
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
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
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
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
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
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function initDrag(e, el) {
  let sx = e.clientX, sy = e.clientY;
  let ox = parseInt(el.style.left) || 0;
  let oy = parseInt(el.style.top) || 0;
  function onMove(ev) {
    const nx = snapValue(Math.round(ox + (ev.clientX - sx) / zoomLevel), 'v');
    const ny = snapValue(Math.round(oy + (ev.clientY - sy) / zoomLevel), 'h');
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
    updateControlPaletteInputs();
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function initResize(e, el, dir) {
  e.stopPropagation();
  let sx = e.clientX, sy = e.clientY;
  let ow = parseInt(el.style.width) || 50;
  let oh = parseInt(el.style.height) || 50;
  let ox = parseInt(el.style.left) || 0;
  let oy = parseInt(el.style.top) || 0;

  function onMove(ev) {
    let dx = (ev.clientX - sx) / zoomLevel;
    let dy = (ev.clientY - sy) / zoomLevel;
    if (dir.includes('e')) el.style.width = Math.max(15, Math.round(ow + dx)) + 'px';
    if (dir.includes('s')) el.style.height = Math.max(10, Math.round(oh + dy)) + 'px';
    if (dir.includes('w')) {
      el.style.width = Math.max(15, Math.round(ow - dx)) + 'px';
      el.style.left = Math.round(ox + dx) + 'px';
    }
    if (dir.includes('n')) {
      el.style.height = Math.max(10, Math.round(oh - dy)) + 'px';
      el.style.top = Math.round(oy + dy) + 'px';
    }
    checkTextOverflow(el);
    updateControlPaletteInputs();
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function selectElement(el) {
  document.querySelectorAll('#page > .pm-element').forEach(i => i.classList.remove('selected', 'crop-mode'));
  el.classList.add('selected');
  if (currentTool === 'crop') el.classList.add('crop-mode');
  selectedEl = el;
  updateControlPaletteInputs();
}

function selectAllOnPage() {
  const els = document.querySelectorAll('#page > .pm-element');
  els.forEach(el => el.classList.add('selected'));
  if (els.length > 0) selectedEl = els[els.length - 1];
}

function deselectAll(e) {
  if (e.target.classList.contains('pasteboard') || e.target.id === 'page') {
    document.querySelectorAll('#page > .pm-element').forEach(i => i.classList.remove('selected'));
    selectedEl = null;
  }
}

function updateControlPaletteInputs() {
  if (!selectedEl) return;
  document.getElementById('pos-x').value = parseInt(selectedEl.style.left) || 0;
  document.getElementById('pos-y').value = parseInt(selectedEl.style.top) || 0;
  document.getElementById('box-w').value = parseInt(selectedEl.style.width) || 0;
  document.getElementById('box-h').value = parseInt(selectedEl.style.height) || 0;
  document.getElementById('box-rot').value = selectedEl.dataset.rotation || 0;
}

function updateBoxGeometry() {
  if (!selectedEl) return;
  saveState();
  selectedEl.style.left = (parseInt(document.getElementById('pos-x').value) || 0) + 'px';
  selectedEl.style.top = (parseInt(document.getElementById('pos-y').value) || 0) + 'px';
  selectedEl.style.width = (parseInt(document.getElementById('box-w').value) || 10) + 'px';
  selectedEl.style.height = (parseInt(document.getElementById('box-h').value) || 10) + 'px';
  checkTextOverflow(selectedEl);
}

function updateBoxRotation() {
  if (!selectedEl) return;
  saveState();
  const d = parseInt(document.getElementById('box-rot').value) || 0;
  selectedEl.dataset.rotation = d;
  selectedEl.style.transform = `rotate(${d}deg)`;
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
}

function changeFontSize(s) {
  if (selectedEl) {
    saveState();
    const tc = selectedEl.querySelector('.text-content');
    if (tc) {
      tc.style.fontSize = (parseInt(s) || 16) + 'px';
      checkTextOverflow(selectedEl);
    }
  }
}

function setLineHeight(lh) {
  const val = parseFloat(lh) || 1.4;
  document.getElementById('line-leading').value = val;
  if (selectedEl) {
    saveState();
    const tc = selectedEl.querySelector('.text-content');
    if (tc) {
      tc.style.lineHeight = val;
      checkTextOverflow(selectedEl);
    }
  }
}

function applyColor(c) {
  document.getElementById('picker-color').value = c;
  if (!selectedEl) return;
  saveState();
  const tc = selectedEl.querySelector('.text-content');
  if (tc) tc.style.color = c;
  selectedEl.querySelectorAll('rect, ellipse, polygon, line').forEach(s => s.setAttribute('stroke', c));
}

function applyFillColor() {
  if (!selectedEl) return;
  saveState();
  const c = document.getElementById('picker-color').value;
  selectedEl.querySelectorAll('rect, ellipse, polygon').forEach(s => s.setAttribute('fill', c));
}

function changeStrokeWidth(w) {
  if (!selectedEl) return;
  saveState();
  selectedEl.querySelectorAll('rect, ellipse, polygon, line').forEach(s => s.setAttribute('stroke-width', w));
}

function toggleTextWrap() {
  if (!selectedEl) return;
  saveState();
  const wrapped = selectedEl.dataset.textWrap === '1';
  if (wrapped) {
    selectedEl.dataset.textWrap = '0';
    selectedEl.style.boxShadow = 'none';
  } else {
    selectedEl.dataset.textWrap = '1';
    selectedEl.style.boxShadow = '0 0 0 6px rgba(0,168,232,0.18)';
  }
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
  const updated = prompt('Story Editor — मजकूर बदला:', tc.innerText);
  if (updated !== null) {
    saveState();
    tc.innerText = updated;
    checkTextOverflow(selectedEl);
  }
}

function duplicateSelected() {
  if (!selectedEl) return;
  saveState();
  const c = selectedEl.cloneNode(true);
  c.style.left = ((parseInt(selectedEl.style.left) || 0) + 20) + 'px';
  c.style.top = ((parseInt(selectedEl.style.top) || 0) + 20) + 'px';
  attachElementEvents(c);
  document.getElementById('page').appendChild(c);
  selectElement(c);
}

function bringToFront() { if (selectedEl) { saveState(); selectedEl.style.zIndex = 50; } }
function sendToBack() { if (selectedEl) { saveState(); selectedEl.style.zIndex = 5; } }
function deleteSelected() { if (selectedEl) { saveState(); selectedEl.remove(); selectedEl = null; } }

function insertPageNumberBox() {
  const label = (activePageId === 'M') ? '#' : String(activePageId);
  const el = createPMElement(275, 800, 50, 24);
  const c = document.createElement('div');
  c.className = 'text-content';
  c.contentEditable = true;
  c.style.textAlign = 'center';
  c.innerText = label;
  el.appendChild(c);
}

function findAndReplaceText() {
  const findVal = prompt('कोणता शब्द शोधायचा आहे?');
  if (!findVal) return;
  const repVal = prompt(`"${findVal}" ऐवजी कोणता शब्द टाकायचा आहे?`, '');
  if (repVal === null) return;
  saveState();
  document.querySelectorAll('.text-content').forEach(tc => {
    tc.innerHTML = tc.innerHTML.split(findVal).join(repVal);
  });
}
