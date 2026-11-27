let clipboardElementHTML = null;

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

function getMagnetTargets(axis) {
  ensurePageState(activePageId);
  const pageEl = document.getElementById('page');
  const pageW = parseInt(pageEl.style.width) || (typeof currentPageW !== 'undefined' ? currentPageW : 816);
  const pageH = parseInt(pageEl.style.height) || (typeof currentPageH !== 'undefined' ? currentPageH : 1056);
  const m = (typeof getPageMargins === 'function')
    ? getPageMargins(pageW, pageH)
    : { left: 96, right: 72, top: 72, bottom: 72 };

  const targets = axis === 'v'
    ? [m.left, pageW - m.right, ...(pageGuides[activePageId].v || [])]
    : [m.top, pageH - m.bottom, ...(pageGuides[activePageId].h || [])];

  const colCfg = pageColumns[activePageId];
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
  saveState();
  if (!tc.dataset.unicodeSource) tc.dataset.unicodeSource = tc.innerText;
  tc.innerText = unicodeToLegacyDevanagari(tc.dataset.unicodeSource, legacyType);
  checkTextOverflow(selectedEl);
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
      saveState();
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
        saveState();
        initRotate(ev, el);
        return;
      }

      const startX = ev.clientX;
      const startY = ev.clientY;
      const ox = parseInt(el.style.left) || 0;
      const oy = parseInt(el.style.top) || 0;
      const { w, h } = getElementExactSize(el);
      let draggingBox = false;
      let stateSaved = false;

      function onMove(mEv) {
        const moveDist = Math.hypot(mEv.clientX - startX, mEv.clientY - startY);
        if (!draggingBox && moveDist >= 3) {
          draggingBox = true;
          if (!stateSaved) {
            saveState();
            stateSaved = true;
          }
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
    });
  }

  el.onpointerdown = (e) => {
    if (currentTool === 'hand' || currentTool === 'zoom') return;
    if (e.target.classList.contains('handle') || e.target.classList.contains('overflow-badge')) return;
    if (e.target.classList && e.target.classList.contains('text-content')) return;

    e.preventDefault();
    e.stopPropagation();
    selectElement(el);
    if (currentTool === 'rotate') {
      saveState();
      initRotate(e, el);
    } else {
      saveState();
      initDrag(e, el);
    }
  };

  checkTextOverflow(el);
}

function createPMElement(x, y, w, h) {
  saveState();
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
    updateControlPaletteInputs();
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
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
    checkTextOverflow(el);
    updateControlPaletteInputs();
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
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

function deselectAllElements() {
  document.querySelectorAll('#page > .pm-element').forEach(i => i.classList.remove('selected', 'crop-mode'));
  selectedEl = null;
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
  saveState();
  const temp = document.createElement('div');
  temp.innerHTML = clipboardElementHTML;
  const newEl = temp.firstElementChild;
  newEl.style.left = ((parseInt(newEl.style.left) || 40) + 18) + 'px';
  newEl.style.top = ((parseInt(newEl.style.top) || 40) + 18) + 'px';
  attachElementEvents(newEl);
  document.getElementById('page').appendChild(newEl);
  selectElement(newEl);
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

  saveState();
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

function toggleReverseText() {
  if (!selectedEl) return;
  const tc = selectedEl.querySelector('.text-content');
  if (!tc) return;
  saveState();
  const isRev = tc.dataset.reversed === '1';
  if (isRev) {
    tc.dataset.reversed = '0';
    tc.style.color = '#000000';
  } else {
    tc.dataset.reversed = '1';
    tc.style.color = '#ffffff';
  }
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
  saveState();
  tc.style.letterSpacing = (parseFloat(valStr) || 0) + 'px';
  checkTextOverflow(selectedEl);
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
  saveState();
  tc.style.wordSpacing = (parseFloat(valStr) || 0) + 'px';
  checkTextOverflow(selectedEl);
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
  saveState();
  tc.style.lineHeight = nextVal;
  checkTextOverflow(selectedEl);
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

  saveState();
  selectedEl.querySelectorAll('rect, ellipse, polygon').forEach(s => {
    s.setAttribute('fill', fillCol.trim() || 'none');
    s.setAttribute('stroke', strokeCol.trim() || '#000000');
    s.setAttribute('stroke-width', parseFloat(strokeW) || 1);
  });
  selectedEl.querySelectorAll('line').forEach(s => {
    s.setAttribute('stroke', strokeCol.trim() || '#000000');
    s.setAttribute('stroke-width', parseFloat(strokeW) || 1);
  });
}

function changeStrokeWidth(w) {
  if (!selectedEl) return;
  saveState();
  selectedEl.querySelectorAll('rect, ellipse, polygon, line').forEach(s => s.setAttribute('stroke-width', w));
}

function alignObjects(mode) {
  const els = Array.from(document.querySelectorAll('#page > .pm-element.selected'));
  if (els.length < 2) {
    alert('Align Objects साठी Select All किंवा एकापेक्षा जास्त घटक निवडा.');
    return;
  }
  saveState();
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
  const baseText = tc.dataset.unicodeSource || tc.innerText;
  const updated = prompt('Story Editor — मराठी मजकूर बदला:', baseText);
  if (updated !== null) {
    saveState();
    tc.dataset.unicodeSource = updated;
    const lType = getLegacyFontType(tc.style.fontFamily || document.getElementById('font-family').value);
    tc.innerText = lType ? unicodeToLegacyDevanagari(updated, lType) : updated;
    checkTextOverflow(selectedEl);
  }
}

function exportPageAsPNG() {
  try {
    const pageEl = document.getElementById('page');
    const w = parseInt(pageEl.style.width) || 816;
    const h = parseInt(pageEl.style.height) || 1056;
    const clone = pageEl.cloneNode(true);
    ['.margin-guide', '.guides-layer', '.handle', '.overflow-badge'].forEach(sel => {
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
        a.download = `Page_${activePageId}.png`;
        a.click();
      } catch (err) {
        alert('PNG तयार करताना अडचण आली; PDF / Print पर्याय वापरून पहा.');
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      alert('PNG एक्सपोर्ट शक्य झाले नाही; PDF / Print पर्याय वापरून पहा.');
    };
    img.src = url;
  } catch (e) {
    alert('PNG एक्सपोर्ट शक्य झाले नाही.');
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
function bringForward() {
  if (selectedEl) {
    saveState();
    const cur = parseInt(selectedEl.style.zIndex) || 10;
    selectedEl.style.zIndex = Math.min(80, cur + 1);
  }
}
function sendBackward() {
  if (selectedEl) {
    saveState();
    const cur = parseInt(selectedEl.style.zIndex) || 10;
    selectedEl.style.zIndex = Math.max(3, cur - 1);
  }
}
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
