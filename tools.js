function toggleMenu(e, id) { 
 e.stopPropagation(); 
 const t = document.getElementById(id), s = t.classList.contains('show'); 
 closeMenus(); 
 if (!s) t.classList.add('show'); 
}

function closeMenus() { 
 document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('show')); 
}

function toggleColorPalette() { 
 const cp = document.getElementById('color-palette'); 
 cp.style.display = (cp.style.display === 'block') ? 'none' : 'block'; 
}

function selectTool(tool) {
 currentTool = tool;
 document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
 const btn = document.getElementById('tool-' + tool);
 if (btn) btn.classList.add('active');
 document.getElementById('pasteboard').style.cursor = (tool === 'hand') ? 'grab' : (tool === 'zoom' ? 'zoom-in' : 'default');
 document.querySelectorAll('#page > .pm-element').forEach(el => el.classList.toggle('crop-mode', tool === 'crop' && el === selectedEl));
 document.querySelectorAll('#page > .pm-element .text-content').forEach(tc => { 
  tc.contentEditable = (tool === 'text'); 
  tc.style.cursor = (tool === 'text') ? 'text' : 'move'; 
 });
}

function attachElementEvents(el) {
 el.querySelectorAll('.handle').forEach(h => {
  // येथे जुना 'handle' वाला बग फिक्स केला आहे
  const dir = h.className.replace('handle ', '').trim();
  h.onpointerdown = (e) => { 
   saveState();
   if (currentTool === 'crop') initCrop(e, el, dir); 
   else initResize(e, el, dir); 
  };
 });
 el.onpointerdown = (e) => {
  if (currentTool === 'hand' || currentTool === 'zoom') return;
  e.stopPropagation(); 
  selectElement(el);
  if (e.target.classList.contains('handle')) return;
  if (currentTool === 'rotate') { saveState(); initRotate(e, el); }
  else if (currentTool === 'pointer' || currentTool === 'crop') { saveState(); initDrag(e, el); }
 };
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

function handlePageClick(e) {
 if (currentTool === 'zoom') { setZoom(zoomLevel >= 1.5 ? 0.75 : zoomLevel + 0.25); return; }
 if (e.target.id !== 'page') return;
 const rect = e.target.getBoundingClientRect();
 const x = Math.round((e.clientX - rect.left) / zoomLevel);
 const y = Math.round((e.clientY - rect.top) / zoomLevel);

 if (currentTool === 'text') {
  const el = createPMElement(x, y, 220, 60);
  const content = document.createElement('div');
  content.className = 'text-content'; 
  content.contentEditable = true; 
  content.style.fontFamily = document.getElementById('font-family').value; 
  content.style.fontSize = document.getElementById('font-size').value + 'px'; 
  content.innerText = 'येथे मराठी टाइप करा...';
  el.appendChild(content); 
  content.focus();
 } else if (currentTool === 'line') addSVGShape(x, y, 160, 80, `<line x1="0" y1="0" x2="100%" y2="100%" stroke="#000" stroke-width="2"/>`);
 else if (currentTool === 'cline') addSVGShape(x, y, 200, 10, `<line x1="0" y1="5" x2="100%" y2="5" stroke="#000" stroke-width="2"/>`);
 else if (currentTool === 'rect') addSVGShape(x, y, 150, 100, `<rect x="1" y="1" width="98%" height="98%" fill="none" stroke="#000" stroke-width="2"/>`);
 else if (currentTool === 'rectframe') addFrameShape(x, y, 160, 110, `<rect x="1" y="1" width="98%" height="98%" fill="none" stroke="#000" stroke-width="1"/><line x1="0" y1="0" x2="100%" y2="100%" stroke="#888" stroke-width="1"/><line x1="100%" y1="0" x2="0" y2="100%" stroke="#888" stroke-width="1"/>`);
 else if (currentTool === 'ellipse') addSVGShape(x, y, 120, 120, `<ellipse cx="50%" cy="50%" rx="48%" ry="48%" fill="none" stroke="#000" stroke-width="2"/>`);
 else if (currentTool === 'ellipseframe') addFrameShape(x, y, 130, 130, `<ellipse cx="50%" cy="50%" rx="48%" ry="48%" fill="none" stroke="#000" stroke-width="1"/><line x1="15%" y1="15%" x2="85%" y2="85%" stroke="#888" stroke-width="1"/><line x1="85%" y1="15%" x2="15%" y2="85%" stroke="#888" stroke-width="1"/>`);
 else if (currentTool === 'polygon') addSVGShape(x, y, 120, 120, `<polygon points="60,2 118,45 95,115 25,115 2,45" fill="none" stroke="#000" stroke-width="2"/>`);
 else if (currentTool === 'polygonframe') addFrameShape(x, y, 130, 130, `<polygon points="65,2 128,48 104,125 26,125 2,48" fill="none" stroke="#000" stroke-width="1"/><line x1="20" y1="30" x2="110" y2="110" stroke="#888"/><line x1="110" y1="30" x2="20" y2="110" stroke="#888"/>`);
}

function addSVGShape(x, y, w, h, svg) { 
 const el = createPMElement(x, y, w, h); 
 el.innerHTML += `<svg class="shape-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${svg}</svg>`; 
 attachElementEvents(el); 
 selectTool('pointer'); 
}

function addFrameShape(x, y, w, h, svg) { 
 const el = createPMElement(x, y, w, h); 
 el.innerHTML += `<svg class="shape-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${svg}</svg>`; 
 const c = document.createElement('div'); 
 c.className = 'text-content'; 
 c.style.position = 'absolute'; c.style.top = '0'; c.style.left = '0'; 
 c.contentEditable = true; 
 el.appendChild(c); 
 attachElementEvents(el); 
 selectTool('pointer'); 
}

function triggerPlaceImage() { document.getElementById('image-input').click(); }

function placeImage(event) {
 const file = event.target.files[0]; if (!file) return;
 const reader = new FileReader();
 reader.onload = function(e) { 
  const el = createPMElement(60, 60, 180, 180);
  const w = document.createElement('div'); w.className = 'img-wrapper'; 
  const img = document.createElement('img'); img.src = e.target.result; img.className = 'pm-image'; 
  w.appendChild(img); el.appendChild(w); 
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
 function onMove(ev) { pb.scrollLeft = sl - (ev.clientX - sx); pb.scrollTop = st - (ev.clientY - sy); }
 function onUp() { pb.style.cursor = 'grab'; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
 window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
}

function initRotate(e, el) {
 const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
 function onMove(ev) { 
  const a = Math.round(Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI)); 
  el.dataset.rotation = a; el.style.transform = `rotate(${a}deg)`; 
  document.getElementById('box-rot').value = a; 
 }
 function onUp() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
 window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
}

function initCrop(e, el, dir) {
 e.stopPropagation(); 
 const img = el.querySelector('.pm-image'); 
 if (!img) { initResize(e, el, dir); return; }
 let sx = e.clientX, sy = e.clientY, ow = parseInt(el.style.width), oh = parseInt(el.style.height); 
 img.style.width = ow + 'px'; img.style.height = oh + 'px';
 function onMove(ev) { 
  if (dir.includes('e')) el.style.width = Math.max(20, ow + (ev.clientX - sx) / zoomLevel) + 'px'; 
  if (dir.includes('s')) el.style.height = Math.max(20, oh + (ev.clientY - sy) / zoomLevel) + 'px'; 
  updateControlPaletteInputs(); 
 }
 function onUp() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
 window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
}

function initDrag(e, el) {
 let sx = e.clientX, sy = e.clientY, ox = parseInt(el.style.left), oy = parseInt(el.style.top);
 function onMove(ev) { 
  el.style.left = Math.round(ox + (ev.clientX - sx) / zoomLevel) + 'px'; 
  el.style.top = Math.round(oy + (ev.clientY - sy) / zoomLevel) + 'px'; 
  updateControlPaletteInputs(); 
 }
 function onUp() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
 window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
}

function initResize(e, el, dir) {
 e.stopPropagation(); 
 let sx = e.clientX, sy = e.clientY, ow = parseInt(el.style.width), oh = parseInt(el.style.height), ox = parseInt(el.style.left), oy = parseInt(el.style.top);
 function onMove(ev) {
  let dx = (ev.clientX - sx) / zoomLevel, dy = (ev.clientY - sy) / zoomLevel;
  if (dir.includes('e')) el.style.width = Math.max(15, Math.round(ow + dx)) + 'px';
  if (dir.includes('s')) el.style.height = Math.max(10, Math.round(oh + dy)) + 'px';
  if (dir.includes('w')) { el.style.width = Math.max(15, Math.round(ow - dx)) + 'px'; el.style.left = Math.round(ox + dx) + 'px'; }
  if (dir.includes('n')) { el.style.height = Math.max(10, Math.round(oh - dy)) + 'px'; el.style.top = Math.round(oy + dy) + 'px'; }
  updateControlPaletteInputs();
 }
 function onUp() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
 window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
}

function selectElement(el) { 
 document.querySelectorAll('#page > .pm-element').forEach(i => i.classList.remove('selected', 'crop-mode')); 
 el.classList.add('selected'); 
 if (currentTool === 'crop') el.classList.add('crop-mode'); 
 selectedEl = el; 
 updateControlPaletteInputs(); 
}

function deselectAll(e) { 
 if (e.target.classList.contains('pasteboard') || (e.target.id === 'page' && currentTool === 'pointer')) { 
  document.querySelectorAll('#page > .pm-element').forEach(i => i.classList.remove('selected')); 
  selectedEl = null; 
 } 
}

function updateControlPaletteInputs() { 
 if (!selectedEl) return; 
 document.getElementById('pos-x').value = parseInt(selectedEl.style.left); 
 document.getElementById('pos-y').value = parseInt(selectedEl.style.top); 
 document.getElementById('box-w').value = parseInt(selectedEl.style.width); 
 document.getElementById('box-h').value = parseInt(selectedEl.style.height); 
 document.getElementById('box-rot').value = selectedEl.dataset.rotation || 0; 
}

function updateBoxGeometry() { 
 if (!selectedEl) return; 
 saveState();
 selectedEl.style.left = document.getElementById('pos-x').value + 'px'; 
 selectedEl.style.top = document.getElementById('pos-y').value + 'px'; 
 selectedEl.style.width = document.getElementById('box-w').value + 'px'; 
 selectedEl.style.height = document.getElementById('box-h').value + 'px'; 
}

function updateBoxRotation() { 
 if (!selectedEl) return; 
 saveState();
 const d = document.getElementById('box-rot').value; 
 selectedEl.dataset.rotation = d; 
 selectedEl.style.transform = `rotate(${d}deg)`; 
}

function applyStyle(cmd, val = null) { 
 document.execCommand(cmd, false, val); 
 if (selectedEl && cmd === 'fontName') { 
  const tc = selectedEl.querySelector('.text-content'); 
  if (tc) tc.style.fontFamily = val; 
 } 
}

function changeFontSize(s) { 
 if (selectedEl) { 
  const tc = selectedEl.querySelector('.text-content'); 
  if (tc) tc.style.fontSize = s + 'px'; 
 } 
}

function applyColor(c) { 
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

function duplicateSelected() { 
 if (!selectedEl) return; 
 saveState();
 const c = selectedEl.cloneNode(true); 
 c.style.left = (parseInt(selectedEl.style.left) + 20) + 'px'; 
 c.style.top = (parseInt(selectedEl.style.top) + 20) + 'px'; 
 attachElementEvents(c); 
 document.getElementById('page').appendChild(c); 
 selectElement(c); 
}

function bringToFront() { if (selectedEl) { saveState(); selectedEl.style.zIndex = 50; } }
function sendToBack() { if (selectedEl) { saveState(); selectedEl.style.zIndex = 5; } }
function deleteSelected() { if (selectedEl) { saveState(); selectedEl.remove(); selectedEl = null; } }
