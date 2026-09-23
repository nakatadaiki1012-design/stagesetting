/* アプリ本体 */
(function (SS) {
  'use strict';
  const $ = id => document.getElementById(id);
  const G = SS.geo;
  const svg = $('canvas');
  const vp = $('viewport');
  const layerStage = $('layerStage'), layerUnderlay = $('layerUnderlay'), layerItems = $('layerItems'), layerOverlay = $('layerOverlay');
  const AUTOSAVE_KEY = 'stagesetting.autosave.v1';
  // 吸着の間隔：方眼の半分（1.82mの方眼なら91cm＝3尺）
  const snapSize = () => { const g = opts().gridSize || 50; return g / 2; };

  const S = {
    doc: null,
    sel: new Set(),
    view: { k: 1, tx: 0, ty: 0 },
    mode: 'select',
    undo: [], redo: [],
    underlayEdit: false,
    trace: null,
  };
  SS.state = S;

  let idCounter = 0;
  const newId = () => 'i' + Date.now().toString(36) + (idCounter++).toString(36);

  // ------------------------------------------------------------ 文書
  function defaultOptions() {
    return { showNames: true, showStands: true, standLegs: true, showNumbers: false, grid: true, gridSize: 50, snap: false, colorBy: true, seatR: 24, figure: true, contest: false, guides: true, dims: true };
  }
  function normalize(doc) {
    doc = doc || {};
    const d = {
      version: 1,
      title: doc.title || '',
      subtitle: doc.subtitle || '',
      stage: Object.assign({ w: 1400, d: 900, shape: 'rect' }, doc.stage || {}),
      items: (doc.items || []).map(it => Object.assign({ rot: 0 }, it, { id: it.id || newId() })),
      underlay: doc.underlay || null,
      options: Object.assign(defaultOptions(), doc.options || {}),
      ensemble: doc.ensemble || null,
      hall: doc.hall || '',
    };
    return d;
  }
  const doc = () => S.doc;
  const opts = () => doc().options;
  const byId = id => doc().items.find(it => it.id === id);
  const selected = () => doc().items.filter(it => S.sel.has(it.id));
  const players = () => doc().items.filter(it => it.type === 'player');

  function conductor() {
    const p = doc().items.find(it => it.type === 'podium');
    if (p) return { x: p.x, y: p.y };
    return { x: doc().stage.w / 2, y: doc().stage.d - 100 };
  }

  // ------------------------------------------------------------ 元に戻す
  function snapshot() {
    const d = doc();
    // 舞台図（下絵）は、画像そのものは入れず、位置・大きさ・回転などだけを記録する
    const ul = d.underlay ? Object.assign({}, d.underlay, { src: undefined }) : null;
    if (d.underlay) S.ulSrc = d.underlay.src;
    return JSON.stringify({ title: d.title, subtitle: d.subtitle, stage: d.stage, items: d.items, options: d.options, ensemble: d.ensemble, hall: d.hall, ul });
  }
  function pushHistory() {
    S.undo.push(snapshot());
    if (S.undo.length > 150) S.undo.shift();
    S.redo = [];
    updateUndoButtons();
  }
  function restore(snap) {
    const u = doc().underlay;
    const p = JSON.parse(snap);
    S.doc = normalize(p);
    const src = (u && u.src) || S.ulSrc;
    S.doc.underlay = p.ul && src ? Object.assign({ src }, p.ul) : p.ul === undefined ? u : null;
    $('overlayControls').classList.toggle('hidden', !S.doc.underlay);
    if (S.doc.underlay) syncOverlayUI();
    S.sel = new Set([...S.sel].filter(id => byId(id)));
    renderAll();
    renderSteppers();
    updateHallNote();
  }
  function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); restore(S.undo.pop()); }
  function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); }
  function updateUndoButtons() {
    $('btnUndo').disabled = !S.undo.length;
    $('btnRedo').disabled = !S.redo.length;
  }

  // ------------------------------------------------------------ 描画
  function renderOpts() {
    const o = opts();
    return { showNames: o.showNames, showStands: o.showStands, standLegs: o.standLegs, showNumbers: o.showNumbers, colorBy: o.colorBy, seatR: o.seatR, grid: o.grid, gridSize: o.gridSize, figure: o.figure, contest: o.contest, dims: o.dims };
  }

  const layerDimsEl = () => document.getElementById('layerDims');
  function render() {
    const d = doc();
    layerStage.innerHTML = SS.render.stageSVG(d, opts().grid ? (opts().gridSize || 50) : 0);
    const u = d.underlay;
    layerUnderlay.innerHTML = u ? SS.render.underlaySVG(u, { edit: S.underlayEdit, k: S.view.k, id: 'main' }) : '';
    // 「図を奏者より上に」：下絵の層を部品の層の後ろ（上）に移す
    const onTop = !!(u && u.onTop);
    if (onTop !== (layerUnderlay.nextElementSibling === layerDimsEl())) {
      if (onTop) layerItems.after(layerUnderlay); else layerItems.before(layerUnderlay);
    }
    layerItems.innerHTML = SS.render.itemsSVG(d, renderOpts(), conductor(), true);
    renderOverlay();
    scheduleSave();
  }

  // 舞台の大きさをドラッグで変えるつまみ（前の幅・奥の幅・奥行）
  function stageHandlesSVG(k) {
    if (S.underlayEdit || S.placing || S.pick) return '';
    const st = doc().stage;
    const bw = SS.render.backWidth(st), cx = st.w / 2;
    const r = 11 / k, hit = 24 / k;
    const knob = (kind, x, y, arrow, title) =>
      `<g data-handle="${kind}" style="cursor:${arrow === '↔' ? 'ew-resize' : 'ns-resize'}"><title>${title}</title>` +
      `<circle cx="${x}" cy="${y}" r="${hit}" fill="transparent"/>` +
      `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="#3b6bb5" stroke-width="${2.5 / k}"/>` +
      `<text x="${x}" y="${y}" dy="0.36em" text-anchor="middle" font-size="${14 / k}" font-weight="700" fill="#3b6bb5" pointer-events="none">${arrow}</text></g>`;
    let s = '';
    const R = SS.render;
    if (st.shape === 'round') {
      // 丸い舞台：いちばん広い所の幅と、中央の奥行
      const yMid = R.stagePoly(st).reduce((a, p) => (p[0] > a[0] ? p : a), [0, 0])[1];
      s += knob('stageW', 0, yMid, '↔', 'ドラッグで舞台の幅を変える');
      s += knob('stageW', st.w, yMid, '↔', 'ドラッグで舞台の幅を変える');
      s += knob('stageD', cx, st.d, '↕', 'ドラッグで舞台の奥行を変える');
    } else if (st.shape === 'arc') {
      // 弧の舞台：前の角（幅）、角の奥行、真ん中のふくらみ
      const yc = st.d - R.arcSag(st);
      s += knob('stageW', 0, yc, '↔', 'ドラッグで舞台の幅を変える');
      s += knob('stageW', st.w, yc, '↔', 'ドラッグで舞台の幅を変える');
      s += knob('stageD', st.w * 0.08, yc, '↕', 'ドラッグで舞台の奥行（角の所）を変える');
      s += knob('stageSag', cx, st.d, '◠', 'ドラッグで弧のふくらみを変える');
    } else {
      s += knob('stageW', 0, st.d, '↔', 'ドラッグで舞台の前の幅を変える');
      s += knob('stageW', st.w, st.d, '↔', 'ドラッグで舞台の前の幅を変える');
      s += knob('stageD', cx + Math.min(260, st.w * 0.2), st.d, '↕', 'ドラッグで舞台の奥行を変える');
    }
    if (bw < st.w - 1) {
      s += knob('stageBW', cx - bw / 2, 0, '↔', 'ドラッグで舞台の奥の幅を変える');
      s += knob('stageBW', cx + bw / 2, 0, '↔', 'ドラッグで舞台の奥の幅を変える');
    }
    return s;
  }

  function renderOverlay(marquee) {
    const k = S.view.k;
    let s = '';
    const sel = selected();
    const o = renderOpts();
    sel.forEach(it => {
      const sz = SS.itemSize(it, o);
      if (it.type === 'player') {
        s += `<circle cx="${it.x}" cy="${it.y}" r="${sz.w / 2 + 6}" fill="rgba(47,111,222,.12)" stroke="#2f6fde" stroke-width="${2.5 / k}" stroke-dasharray="${6 / k} ${4 / k}"/>`;
      } else {
        s += `<g transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0})"><rect x="${-sz.w / 2 - 6}" y="${-sz.h / 2 - 6}" width="${sz.w + 12}" height="${sz.h + 12}" fill="rgba(47,111,222,.08)" stroke="#2f6fde" stroke-width="${2.5 / k}" stroke-dasharray="${6 / k} ${4 / k}"/></g>`;
      }
    });
    if (sel.length === 1) {
      const it = sel[0];
      const sz = SS.itemSize(it, o);
      const hr = 9 / k;
      const back = sz.h / 2 + 40;
      s += `<g transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0})">`;
      s += `<line x1="0" y1="${-sz.h / 2 - 4}" x2="0" y2="${-back}" stroke="#2f6fde" stroke-width="${2 / k}"/>`;
      s += `<circle data-handle="rotate" cx="0" cy="${-back}" r="${hr * 1.3}" fill="#fff" stroke="#2f6fde" stroke-width="${2.5 / k}" style="cursor:grab"/>`;
      s += `<text x="0" y="${-back}" dy="0.35em" text-anchor="middle" font-size="${12 / k}" fill="#2f6fde" pointer-events="none">↻</text>`;
      if (it.type !== 'player') {
        s += `<rect data-handle="resize" x="${sz.w / 2 + 6 - hr}" y="${sz.h / 2 + 6 - hr}" width="${hr * 2}" height="${hr * 2}" fill="#2f6fde" stroke="#fff" stroke-width="${1.5 / k}" style="cursor:nwse-resize"/>`;
      }
      s += '</g>';
    }
    s += stageHandlesSVG(k);
    if (S.pick) {
      const tg = pickTargets(S.pick.kind);
      if (tg) tg.forEach((q, i) => { s += `<circle cx="${q.x}" cy="${q.y}" r="${14 / k}" fill="none" stroke="#e8467c" stroke-width="${3 / k}" stroke-dasharray="${5 / k}"/><text x="${q.x}" y="${q.y - 22 / k}" text-anchor="middle" font-size="${13 / k}" font-weight="700" fill="#e8467c">${i + 1}</text>`; });
      S.pick.pts.forEach((q, i) => { s += `<circle cx="${q.x}" cy="${q.y}" r="${9 / k}" fill="#2f6fde" stroke="#fff" stroke-width="${2.5 / k}"/><text x="${q.x}" y="${q.y - 16 / k}" text-anchor="middle" font-size="${13 / k}" font-weight="700" fill="#2f6fde" stroke="#fff" stroke-width="${3 / k}" paint-order="stroke">${i + 1}</text>`; });
    }
    if (drag && drag.guides) {
      const gs = `stroke="#e8467c" stroke-width="${1.6 / k}" stroke-dasharray="${8 / k} ${5 / k}" fill="none"`;
      drag.guides.forEach(g => {
        if (g.kind === 'x') s += `<line x1="${g.v}" y1="-200" x2="${g.v}" y2="${doc().stage.d + 200}" ${gs}/>`;
        if (g.kind === 'y') s += `<line x1="-200" y1="${g.v}" x2="${doc().stage.w + 200}" y2="${g.v}" ${gs}/>`;
        if (g.kind === 'r') s += `<circle cx="${g.c.x}" cy="${g.c.y}" r="${g.v}" ${gs}/>`;
      });
    }
    if (marquee && marquee.pts) {
      s += `<path d="M${marquee.pts.map(p => p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('L')}Z" fill="rgba(47,111,222,.1)" stroke="#2f6fde" stroke-width="${1.8 / k}" stroke-dasharray="${5 / k}"/>`;
    } else if (marquee) {
      const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1);
      s += `<rect x="${x}" y="${y}" width="${Math.abs(marquee.x1 - marquee.x0)}" height="${Math.abs(marquee.y1 - marquee.y0)}" fill="rgba(47,111,222,.1)" stroke="#2f6fde" stroke-width="${1.5 / k}" stroke-dasharray="${5 / k}"/>`;
    }
    layerOverlay.innerHTML = s;
    // 寸法線（選んだ物が1つなら、そのまわりの距離も）
    const one = sel.length === 1 ? sel[0] : null;
    $('layerDims').innerHTML = opts().dims ? SS.render.dimsSVG(doc(), k, one) : '';
    positionCtxBar();
  }

  function applyView() {
    const v = S.view;
    vp.setAttribute('transform', `translate(${v.tx} ${v.ty}) scale(${v.k})`);
  }

  function fitView(extra) {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const st = doc().stage;
    const mx = opts().dims ? 110 : 80;
    let x0 = -mx, y0 = -95, x1 = st.w + 80, y1 = SS.render.frontY(st) + 110;
    if (extra) { x0 = Math.min(x0, extra.x0 - 30); y0 = Math.min(y0, extra.y0 - 30); x1 = Math.max(x1, extra.x1 + 30); y1 = Math.max(y1, extra.y1 + 30); }
    const k = Math.min(r.width / (x1 - x0), (r.height - 60) / (y1 - y0));
    S.view.k = k;
    S.view.tx = (r.width - (x1 - x0) * k) / 2 - x0 * k;
    S.view.ty = (r.height - 60 - (y1 - y0) * k) / 2 - y0 * k;
    applyView();
    render();
  }

  function zoomAt(factor, sx, sy) {
    const v = S.view;
    const nk = Math.max(0.05, Math.min(8, v.k * factor));
    factor = nk / v.k;
    v.tx = sx - (sx - v.tx) * factor;
    v.ty = sy - (sy - v.ty) * factor;
    v.k = nk;
    applyView();
    renderOverlay();
    if (S.underlayEdit) render();
  }

  function toWorld(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return { x: (clientX - r.left - S.view.tx) / S.view.k, y: (clientY - r.top - S.view.ty) / S.view.k };
  }

  function renderAll() {
    render();
    renderProps();
    renderCounts();
    renderSettings();
    updateUndoButtons();
  }

  // ------------------------------------------------------------ 保存
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc()));
      } catch (e) {
        try {
          const d = Object.assign({}, doc(), { underlay: null });
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(d));
        } catch (e2) { /* 容量不足 */ }
      }
    }, 400);
  }

  // ------------------------------------------------------------ 通知・ダイアログ
  let toastTimer = null;
  function toast(msg, withUndo) {
    const t = $('toast');
    t.innerHTML = SS.esc(msg) + (withUndo ? ' <button class="toast-undo" id="toastUndo">元に戻す</button>' : '');
    t.classList.toggle('has-btn', !!withUndo);
    t.classList.add('show');
    if (withUndo) $('toastUndo').onclick = () => { undo(); t.classList.remove('show'); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), withUndo ? 4500 : 2600);
  }
  SS.toast = toast;

  function openModal(html) {
    $('modalBody').innerHTML = html;
    $('modal').classList.remove('hidden');
  }
  function closeModal() { $('modal').classList.add('hidden'); }
  // 画面内で確認する（ブラウザの確認ダイアログが使えない環境でも動くように）
  function askConfirm(msg, yesLabel, onYes) {
    openModal(`<h2>確認</h2><p style="line-height:1.7">${SS.esc(msg).replace(/\n/g, '<br>')}</p>
      <div class="btn-row"><button class="btn primary" id="cfYes">${SS.esc(yesLabel)}</button><button class="btn" id="cfNo">やめる</button></div>`);
    $('cfYes').onclick = () => { closeModal(); onYes(); };
    $('cfNo').onclick = closeModal;
  }
  $('modalClose').onclick = closeModal;
  $('modal').addEventListener('pointerdown', e => { if (e.target === $('modal')) closeModal(); });

  // ------------------------------------------------------------ ポインター操作
  const pointers = new Map();
  let drag = null;
  let spaceDown = false;

  svg.addEventListener('pointerdown', e => {
    if (e.button === 2) return;
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    closePanels();

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      drag = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      renderOverlay();
      return;
    }
    if (pointers.size > 2) return;

    const w = toWorld(e.clientX, e.clientY);
    const handle = e.target.closest && e.target.closest('[data-handle]');
    const itemEl = e.target.closest && e.target.closest('.item');
    const start = { sx: e.clientX, sy: e.clientY, w };

    if (S.pick) {
      // 舞台図の2点をタップ（ドラッグしたときは画面を動かす）
      drag = { kind: 'pick', start, last: { x: e.clientX, y: e.clientY } };
      return;
    }
    if (S.placing && !handle) {
      const type = S.placing;
      setPlacing(null);
      addItem(type, null, w);
      pointers.delete(e.pointerId);
      return;
    }
    if (e.button === 1 || S.mode === 'pan' || spaceDown) {
      drag = { kind: 'pan', start, last: { x: e.clientX, y: e.clientY } };
      return;
    }
    if (handle && /^stage/.test(handle.getAttribute('data-handle'))) {
      pushHistory();
      const st = doc().stage;
      drag = { kind: handle.getAttribute('data-handle'), start, w0: st.w, d0: st.d, auto: doc().items.some(it => it.auto) };
      return;
    }
    if (handle) {
      const it = selected()[0];
      if (!it) return;
      pushHistory();
      drag = { kind: handle.getAttribute('data-handle'), start, it };
      return;
    }
    if (S.underlayEdit && doc().underlay && !itemEl) {
      pushHistory();
      drag = { kind: 'underlay', start, ox: doc().underlay.x, oy: doc().underlay.y };
      return;
    }
    if (itemEl) {
      const id = itemEl.getAttribute('data-id');
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
      } else if (!S.sel.has(id)) {
        S.sel = new Set([id]);
      }
      const orig = new Map();
      selected().forEach(it => orig.set(it.id, { x: it.x, y: it.y }));
      drag = { kind: 'move', start, orig, primary: id, moved: false };
      renderOverlay();
      renderProps();
      return;
    }
    // 何もないところ
    if (S.mode === 'lasso') {
      if (!(e.shiftKey || e.ctrlKey || e.metaKey)) S.sel.clear();
      drag = { kind: 'lasso', start, base: new Set(S.sel), m: { pts: [w] } };
      renderOverlay(drag.m);
      renderProps();
      return;
    }
    if (e.pointerType === 'touch' && S.mode !== 'box') {
      drag = { kind: 'pan', start, last: { x: e.clientX, y: e.clientY }, tapClear: true };
      return;
    }
    if (!(e.shiftKey || e.ctrlKey || e.metaKey)) S.sel.clear();
    drag = { kind: 'marquee', start, base: new Set(S.sel), m: { x0: w.x, y0: w.y, x1: w.x, y1: w.y } };
    renderOverlay(drag.m);
    renderProps();
  });

  svg.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;

    if (drag.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = svg.getBoundingClientRect();
      S.view.tx += mid.x - drag.mid.x;
      S.view.ty += mid.y - drag.mid.y;
      zoomAt(dist / (drag.dist || dist), mid.x - r.left, mid.y - r.top);
      drag.dist = dist; drag.mid = mid;
      return;
    }

    const w = toWorld(e.clientX, e.clientY);
    const moved = Math.hypot(e.clientX - drag.start.sx, e.clientY - drag.start.sy) > 4;

    switch (drag.kind) {
      case 'pick':
      case 'pan': {
        if (drag.kind === 'pick' && !moved && !drag.didMove) break;
        S.view.tx += e.clientX - drag.last.x;
        S.view.ty += e.clientY - drag.last.y;
        drag.last = { x: e.clientX, y: e.clientY };
        if (moved) drag.didMove = true;
        applyView();
        break;
      }
      case 'move': {
        if (!drag.moved) {
          if (!moved) return;
          pushHistory();
          drag.moved = true;
        }
        let dx = w.x - drag.start.w.x, dy = w.y - drag.start.w.y;
        if (opts().snap) {
          const p = drag.orig.get(drag.primary);
          if (p) {
            const sn = snapSize();
            dx = Math.round((p.x + dx) / sn) * sn - p.x;
            dy = Math.round((p.y + dy) / sn) * sn - p.y;
          }
        }
        drag.guides = null;
        if (opts().guides && !opts().snap && !e.altKey) {
          const g = smartSnap(drag, dx, dy);
          dx = g.dx; dy = g.dy; drag.guides = g.guides;
        }
        selected().forEach(it => {
          const o = drag.orig.get(it.id);
          if (o) { it.x = o.x + dx; it.y = o.y + dy; }
        });
        render();
        break;
      }
      case 'rotate': {
        const it = drag.it;
        let a = Math.atan2(w.x - it.x, -(w.y - it.y)) * 180 / Math.PI;
        if (!e.shiftKey) a = Math.round(a / 15) * 15;
        it.rot = normAngle(a);
        render();
        renderProps(true);
        break;
      }
      case 'resize': {
        const it = drag.it;
        const a = (it.rot || 0) * Math.PI / 180;
        const vx = w.x - it.x, vy = w.y - it.y;
        const lx = vx * Math.cos(a) + vy * Math.sin(a);
        const ly = -vx * Math.sin(a) + vy * Math.cos(a);
        it.w = Math.max(10, Math.round((Math.abs(lx) * 2 - 12) / 5) * 5);
        it.h = Math.max(10, Math.round((Math.abs(ly) * 2 - 12) / 5) * 5);
        if (it.type === 'hina') {
          // ひな壇は平台の枚数単位で大きさが変わる
          const pn = SS.panelSize(it);
          it.w = Math.max(1, Math.round(it.w / pn.w)) * pn.w;
          it.h = Math.max(1, Math.round(it.h / pn.d)) * pn.d;
        }
        render();
        renderProps(true);
        break;
      }
      case 'stageW':
      case 'stageBW':
      case 'stageD': {
        dragStage(drag, w);
        break;
      }
      case 'underlay': {
        const u = doc().underlay;
        u.x = drag.ox + (w.x - drag.start.w.x);
        u.y = drag.oy + (w.y - drag.start.w.y);
        render();
        break;
      }
      case 'marquee': {
        drag.m.x1 = w.x; drag.m.y1 = w.y;
        const x0 = Math.min(drag.m.x0, drag.m.x1), x1 = Math.max(drag.m.x0, drag.m.x1);
        const y0 = Math.min(drag.m.y0, drag.m.y1), y1 = Math.max(drag.m.y0, drag.m.y1);
        pickIn(drag.base, it => it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1);
        renderOverlay(drag.m);
        break;
      }
      case 'lasso': {
        const pts = drag.m.pts, last = pts[pts.length - 1];
        if (Math.hypot(w.x - last.x, w.y - last.y) < 6 / S.view.k) break;
        pts.push(w);
        if (pts.length > 2) pickIn(drag.base, it => G.inPolygon(it, pts));
        renderOverlay(drag.m);
        break;
      }
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (!drag) return;
    if (drag.kind === 'pinch') {
      if (pointers.size < 2) drag = null;
      return;
    }
    if (drag.kind === 'pick' && !drag.didMove && S.pick) {
      S.pick.pts.push(drag.start.w);
      drag = null;
      pickStep();
      renderOverlay();
      return;
    }
    if (/^stage/.test(drag.kind)) {
      const st = doc().stage;
      if (drag.auto) applyAuto({ noHistory: true });
      fitView();
      toast(`舞台：前の幅 ${st.w / 100}m・奥の幅 ${Math.round(SS.render.backWidth(st)) / 100}m・奥行 ${st.d / 100}m`);
    }
    if (drag.kind === 'pan' && drag.tapClear && !drag.didMove) {
      S.sel.clear();
    }
    if (drag.kind === 'move' && !drag.moved && !(e.shiftKey || e.ctrlKey || e.metaKey)) {
      // クリックだけ → その1つを選ぶ。すばやく2回タップ → その列をまとめて選ぶ
      const now = Date.now();
      if (lastTap && lastTap.id === drag.primary && now - lastTap.t < 400) {
        selectRowOf(drag.primary);
        lastTap = null;
      } else {
        S.sel = new Set([drag.primary]);
        lastTap = { id: drag.primary, t: now };
      }
    }
    drag = null;
    renderOverlay();
    renderProps();
    renderCounts();
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    if (S.underlayEdit && doc().underlay) {
      const u = doc().underlay;
      const w = toWorld(e.clientX, e.clientY);
      u.x = w.x - (w.x - u.x) * f; u.y = w.y - (w.y - u.y) * f;
      u.w *= f; u.h *= f;
      render();
      return;
    }
    zoomAt(f, sx, sy);
  }, { passive: false });

  let lastTap = null;

  // 舞台のつまみをドラッグ：10cm単位。自動配置ならその場で並べ直す
  let stageRAF = 0;
  function dragStage(dr, w) {
    const st = doc().stage;
    const oldW = st.w, oldD = st.d;
    const cx = oldW / 2;
    const r10 = v => Math.round(v / 10) * 10;
    if (dr.kind === 'stageW') {
      st.w = Math.max(400, Math.min(6000, r10(Math.abs(w.x - cx) * 2)));
      if (st.bw) st.bw = Math.min(st.bw, st.w);
    } else if (dr.kind === 'stageBW') {
      st.bw = Math.max(200, Math.min(st.w, r10(Math.abs(w.x - cx) * 2)));
    } else if (dr.kind === 'stageSag') {
      // 真ん中のふくらみ：角の位置はそのまま、中央の奥行だけ変える
      const yc = st.d - SS.render.arcSag(st);
      st.d = Math.max(yc, Math.min(yc + st.w * 0.3, r10(w.y)));
      st.sag = st.d - yc;
    } else if (st.shape === 'arc') {
      // 角の所の奥行を変える（ふくらみはそのまま）
      const sg = SS.render.arcSag(st);
      st.d = Math.max(300, Math.min(5000, r10(w.y) + sg));
      st.sag = sg;
    } else {
      st.d = Math.max(300, Math.min(5000, r10(w.y)));
    }
    if (st.w === oldW && st.d === oldD && dr.kind !== 'stageBW' && dr.kind !== 'stageSag') return;
    doc().hall = '';
    const dx = (st.w - oldW) / 2, dy = st.d - oldD;
    if (dr.auto) {
      // 自動配置：いったん中心をずらして表示し、描画のタイミングで並べ直す
      doc().items.forEach(it => { it.x += dx; it.y += dy; });
      render();
      cancelAnimationFrame(stageRAF);
      stageRAF = requestAnimationFrame(() => applyAuto({ noHistory: true, quiet: true }));
    } else {
      // 手で置いた配置：真ん中と舞台際（指揮者）からの位置を保つ
      doc().items.forEach(it => { it.x += dx; it.y += dy; });
      render();
    }
    renderSettings();
    updateHallNote();
  }

  // 範囲・投げ縄で選ぶ。ひな壇（平台）は、ほかに何も入っていないときだけ選ぶ
  function pickIn(base, test) {
    const hit = doc().items.filter(test);
    const noHina = hit.filter(it => it.type !== 'hina');
    S.sel = new Set(base);
    (noHina.length ? noHina : hit).forEach(it => S.sel.add(it.id));
  }

  // 同じ列（指揮者からの距離が同じくらい）の奏者をまとめて選ぶ
  function selectRowOf(id) {
    const it = byId(id);
    if (!it || it.type !== 'player') { S.sel = new Set([id]); return; }
    const rows = G.arcRows(players(), conductor());
    const row = rows.find(r => r.includes(it)) || [it];
    S.sel = new Set(row.map(p => p.id));
    toast(`この列の${row.length}人を選びました`);
  }

  // ドラッグ中に、ほかの部品と位置をそろえる（ガイド線）
  function smartSnap(d, dx, dy) {
    const th = 9 / S.view.k;
    const p0 = d.orig.get(d.primary);
    const prim = byId(d.primary);
    if (!p0 || !prim) return { dx, dy, guides: null };
    const px = p0.x + dx, py = p0.y + dy;
    const others = doc().items.filter(it => !S.sel.has(it.id) && it.type !== 'riser' && it.type !== 'text');
    const guides = [];
    if (prim.type === 'player') {
      const c = conductor();
      const pol = G.polar({ x: px, y: py }, c);
      let best = null;
      others.forEach(o => {
        if (o.type !== 'player') return;
        const q = G.polar(o, c);
        if (Math.abs(q.t - pol.t) > 0.9) return;
        const diff = Math.abs(q.r - pol.r);
        if (diff < th && (!best || diff < best.diff)) best = { r: q.r, diff };
      });
      if (best) {
        const q = G.fromPolar(best.r, pol.t, c);
        guides.push({ kind: 'r', v: best.r, c });
        return { dx: q.x - p0.x, dy: q.y - p0.y, guides };
      }
    }
    let bx = null, by = null;
    others.forEach(o => {
      const ddx = Math.abs(o.x - px), ddy = Math.abs(o.y - py);
      if (ddx < th && (!bx || ddx < bx.d)) bx = { v: o.x, d: ddx };
      if (ddy < th && (!by || ddy < by.d)) by = { v: o.y, d: ddy };
    });
    if (bx) { dx = bx.v - p0.x; guides.push({ kind: 'x', v: bx.v }); }
    if (by) { dy = by.v - p0.y; guides.push({ kind: 'y', v: by.v }); }
    return { dx, dy, guides: guides.length ? guides : null };
  }

  // ------------------------------------------------------------ 選んだものの近くに出る操作バー
  const ctxBar = $('ctxBar');
  function positionCtxBar() {
    const sel = selected();
    const tb = document.querySelector('.tidy-bar');
    if (!sel.length || (drag && drag.kind !== 'marquee') || S.placing) { ctxBar.hidden = true; if (tb) tb.hidden = false; return; }
    if (tb) tb.hidden = true;
    // 選んだ物のそばに出すと、指やポインタ・となりの人に重なって邪魔なので、画面の下にまとめて出す
    ctxBar.hidden = false;
    const one = sel.length === 1 ? sel[0] : null;
    $('ctxCount').textContent = sel.length > 1 ? sel.length + '個' : (one.type === 'player' ? (one.label || '奏者') : (SS.CATALOG[one.type] || {}).name || '');
    $('ctxRow').hidden = !(one && one.type === 'player');
    $('ctx3d').hidden = !(one && one.type === 'player');
    const ed = $('ctxEdit');
    if (!ed.hidden) {
      const allP = sel.every(it => it.type === 'player');
      $('ctxName').parentElement.hidden = !one || one.type !== 'player';
      $('ctxLabel').placeholder = allP ? 'パート名 (例 Fl1)' : '表示する文字';
      if (document.activeElement !== $('ctxLabel')) $('ctxLabel').value = sel.every(it => it.label === sel[0].label) ? (sel[0].label || '') : '';
      if (one && document.activeElement !== $('ctxName')) $('ctxName').value = one.name || '';
    }
  }
  ctxBar.addEventListener('pointerdown', e => e.stopPropagation());
  ctxBar.querySelectorAll('[data-ctx]').forEach(b => {
    b.onclick = () => {
      const a = b.getAttribute('data-ctx');
      const sel = selected();
      if (a === 'edit') { $('ctxEdit').hidden = !$('ctxEdit').hidden; positionCtxBar(); if (!$('ctxEdit').hidden) $('ctxLabel').focus(); return; }
      if (a === 'row') { selectRowOf(sel[0].id); renderOverlay(); renderProps(); return; }
      if (a === 'view3d') { SS.view3d.open(sel[0].id); return; }
      if (a === 'rotL' || a === 'rotR') {
        pushHistory();
        sel.forEach(it => { it.rot = normAngle((it.rot || 0) + (a === 'rotL' ? -15 : 15)); });
        render(); renderProps(); return;
      }
      act(a);
    };
  });
  ['ctxLabel', 'ctxName'].forEach(id => {
    const el = $(id);
    el.addEventListener('focus', () => pushHistory());
    el.addEventListener('input', () => {
      const sel = selected();
      if (id === 'ctxLabel') sel.forEach(it => { it.label = el.value; });
      else if (sel[0]) sel[0].name = el.value;
      render(); renderCounts();
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
  });

  // ------------------------------------------------------------ 置く場所をタップして追加
  function setPlacing(type) {
    S.placing = type;
    $('placeHint').hidden = !type;
    if (type) $('placeHintText').textContent = `「${SS.CATALOG[type].name}」を置きたい場所をタップ`;
    svg.classList.toggle('placing', !!type);
    positionCtxBar();
  }
  $('placeCancel').onclick = () => setPlacing(null);

  function normAngle(a) {
    a = ((a + 180) % 360 + 360) % 360 - 180;
    return Math.round(a * 10) / 10;
  }

  // ------------------------------------------------------------ キーボード
  let clipboard = null;
  document.addEventListener('keydown', e => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag);
    if (e.key === 'Escape') { setPlacing(null); if (S.pick) endPick(); closeModal(); if (!typing) { S.sel.clear(); renderOverlay(); renderProps(); } return; }
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.code === 'Space') { spaceDown = true; svg.classList.add('panning'); e.preventDefault(); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); act('selectAll'); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); act('duplicate'); return; }
    if (mod && e.key.toLowerCase() === 'c') { clipboard = JSON.stringify(selected()); return; }
    if (mod && e.key.toLowerCase() === 'v') {
      if (!clipboard) return;
      e.preventDefault();
      pasteItems(JSON.parse(clipboard));
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); act('delete'); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && S.sel.size) {
      e.preventDefault();
      if (!e.repeat) pushHistory();
      const st = e.shiftKey ? 25 : 5;
      selected().forEach(it => { it.x += arrows[e.key][0] * st; it.y += arrows[e.key][1] * st; });
      render();
      return;
    }
    if (e.key.toLowerCase() === 'r' && S.sel.size) {
      pushHistory();
      selected().forEach(it => { it.rot = normAngle((it.rot || 0) + (e.shiftKey ? -15 : 15)); });
      render(); renderProps();
    }
  });
  document.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; svg.classList.toggle('panning', S.mode === 'pan'); } });

  // ------------------------------------------------------------ 追加・複製
  function addItem(type, extra, at) {
    const c = SS.CATALOG[type];
    const r = svg.getBoundingClientRect();
    const center = at || toWorld(r.left + r.width / 2, r.top + r.height / 2);
    // 既にあるものと重ならないよう少しずらす
    let p = { x: center.x, y: center.y };
    if (!at) for (let i = 0; i < 30 && doc().items.some(it => Math.hypot(it.x - p.x, it.y - p.y) < 40); i++) { p.x += 30; p.y += 20; }
    const it = Object.assign({ id: newId(), type, x: Math.round(p.x), y: Math.round(p.y), rot: 0 }, extra || {});
    if (type === 'player') {
      it.label = it.label || '';
      it.rot = G.faceAngle(it, conductor());
    } else {
      it.w = c.w; it.h = c.h;
      if (c.label !== undefined && it.label === undefined) it.label = c.label;
      if (type === 'text') it.fontSize = c.fontSize;
      if (type === 'hina') { it.hgt = 21.2; it.panel = '36'; it.orient = 'h'; }
    }
    pushHistory();
    doc().items.push(it);
    S.sel = new Set([it.id]);
    renderAll();
    return it;
  }

  function pasteItems(list) {
    if (!list.length) return;
    pushHistory();
    const ids = [];
    list.forEach(src => {
      const it = Object.assign({}, src, { id: newId(), x: src.x + 40, y: src.y + 40 });
      doc().items.push(it);
      ids.push(it.id);
    });
    S.sel = new Set(ids);
    renderAll();
  }

  // ------------------------------------------------------------ 整える・操作
  // 何も選んでいないときは奏者全員が対象（打楽器・鍵盤など列に並ばない人は除く）
  function targetsPlayers() {
    const sel = selected().filter(it => it.type === 'player');
    if (sel.length) return sel;
    return players().filter(it => !/^(perc|kb)$/.test(SS.partGroup(it.label).id));
  }
  function tidyOpts() {
    return { symmetric: $('optSymmetric').checked, evenRows: $('optEvenRows').checked, minGap: opts().seatR * 2 + 14 };
  }

  // ステージからはみ出したものを内側へ入れる。動かした数を返す
  function fitInStage(list) {
    let n = 0;
    const st = doc().stage;
    list.forEach(it => {
      if (it.type === 'text') return;
      const sz = SS.itemSize(it, renderOpts());
      const m = it.type === 'player' ? 26 : Math.min(sz.w, sz.h) / 2;
      const q = SS.render.clampToStage(st, it, m);
      if (Math.abs(q.x - it.x) > 0.5 || Math.abs(q.y - it.y) > 0.5) { it.x = q.x; it.y = q.y; n++; }
    });
    return n;
  }

  function tidyAuto(list, silent) {
    list = list || targetsPlayers();
    if (list.length < 2) { if (!silent) toast('整える奏者がいません'); return; }
    const c = conductor();
    // ひな壇の上の人は横一列に、床の人は扇形か横一列（近い方）に
    const onR = list.filter(onRiser), floor = list.filter(it => !onRiser(it));
    const shape = floor.length >= 2 ? G.guessShape(floor, c) : 'line';
    let n = 0;
    if (floor.length >= 2) n += shape === 'arc' ? G.tidyArc(floor, c, tidyOpts()) : G.tidyLine(floor, c, tidyOpts());
    if (onR.length >= 2) n += G.tidyLine(onR, c, Object.assign(tidyOpts(), { evenRows: false }));
    if (shape === 'arc') { opts().arcCurve = 1; opts().arcBase = null; syncArcCurve(); }
    G.fixOverlap(list, opts().seatR * 2 + 8);
    fitInStage(list);
    if (!silent) toast(`${n}列を${shape === 'arc' ? '扇形' : '横一列'}にきれいにそろえました`, true);
  }

  // 弧のカーブ（スライダー）：床の奏者（ひな壇の上の人は除く）を、ゆるい弧〜扇形に
  function onRiser(it) {
    return doc().items.some(h => h.type === 'hina' && Math.abs(it.x - h.x) < h.w / 2 && Math.abs(it.y - h.y) < h.h / 2);
  }
  // スライダーを動かし始めたとき、扇形のときの位置（arcBase）を覚えておき、いつもそこから計算する
  function curveStart() {
    pushHistory();
    const o = opts();
    if (o.arcCurve == null || o.arcCurve >= 0.999 || !o.arcBase) o.arcBase = {};
    curveList().forEach(it => { if (!o.arcBase[it.id]) o.arcBase[it.id] = { x: it.x, y: it.y }; });
  }
  function curveList() {
    const sel = selected().filter(it => it.type === 'player');
    return sel.length >= 2 ? sel : players().filter(it => !onRiser(it) && !['perc', 'kb'].includes(SS.partGroup(it.label).id));
  }
  $('arcCurve').addEventListener('pointerdown', curveStart);
  $('arcCurve').addEventListener('keydown', curveStart);
  $('arcCurve').addEventListener('input', e => {
    const k = +e.target.value / 100;
    $('arcCurveVal').textContent = k >= 0.99 ? '扇形' : k <= 0.02 ? 'まっすぐ' : Math.round(k * 100) + '%';
    const o = opts();
    if (!o.arcBase) curveStart();
    const list = curveList();
    if (list.length < 2) return;
    list.forEach(it => { const b = o.arcBase[it.id]; if (b) { it.x = b.x; it.y = b.y; } });
    G.tidyArc(list, conductor(), Object.assign(tidyOpts(), { curve: k }));
    o.arcCurve = k;
    if (k >= 0.999) o.arcBase = null;
    render();
  });
  function syncArcCurve() {
    const k = opts().arcCurve == null ? 1 : opts().arcCurve;
    $('arcCurve').value = Math.round(k * 100);
    $('arcCurveVal').textContent = k >= 0.99 ? '扇形' : k <= 0.02 ? 'まっすぐ' : Math.round(k * 100) + '%';
  }

  function act(name) {
    const sel = selected();
    const c = conductor();
    const needSel = n => { if (sel.length < n) { toast(n === 1 ? '先に部品を選んでください' : `${n}つ以上選んでください`); return false; } return true; };
    switch (name) {
      case 'tidy': {
        pushHistory();
        tidyAuto();
        break;
      }
      case 'tidyArc': {
        // 何も選んでいないときは、ひな壇の上の人（まっすぐの列）は動かさない
        const list = sel.length ? targetsPlayers() : targetsPlayers().filter(it => !onRiser(it)); if (list.length < 2) return toast('奏者が2人以上必要です');
        pushHistory();
        const n = G.tidyArc(list, c, tidyOpts());
        opts().arcCurve = 1; opts().arcBase = null; syncArcCurve();
        G.fixOverlap(list, opts().seatR * 2 + 8);
        fitInStage(list);
        toast(`${n}列を扇形にそろえました`, true);
        break;
      }
      case 'tidyLine': {
        const list = targetsPlayers(); if (list.length < 2) return toast('奏者が2人以上必要です');
        pushHistory();
        const n = G.tidyLine(list, c, tidyOpts());
        fitInStage(list);
        toast(`${n}列を横一列にそろえました`, true);
        break;
      }
      case 'faceConductor': {
        const list = sel.length ? sel.filter(it => it.type !== 'podium') : players();
        pushHistory();
        list.forEach(it => { it.rot = normAngle(G.faceAngle(it, c)); });
        break;
      }
      case 'faceFront': {
        const list = sel.length ? sel : players();
        pushHistory();
        list.forEach(it => { it.rot = 0; });
        break;
      }
      case 'fixOverlap': {
        const list = targetsPlayers();
        pushHistory();
        G.fixOverlap(list, opts().seatR * 2 + 8);
        toast('重なりを直しました');
        break;
      }
      case 'mirror': {
        const list = sel.length ? sel : doc().items.filter(it => it.type !== 'podium');
        pushHistory();
        list.forEach(it => { it.x = 2 * c.x - it.x; it.rot = normAngle(-(it.rot || 0)); });
        toast('左右を入れ替えました', true);
        break;
      }
      case 'arrangePerc': {
        const has = doc().items.some(it => SS.auto.PERC_TYPES.has(it.type) || (it.type === 'player' && SS.partGroup(it.label).id === 'perc'));
        if (!has) return toast('打楽器（楽器かPercの奏者）がありません');
        pushHistory();
        const place = (doc().ensemble && doc().ensemble.percPlace) || 'back';
        SS.auto.arrangePercIn(doc().items, doc().stage, place);
        toast({ back: '打楽器を舞台奥に並べました', top: '打楽器をひな壇の最上段に並べました', left: '打楽器を下手側に並べました', both: 'ティンパニ・鍵盤を最上段、太鼓類を下手に並べました' }[place], true);
        break;
      }
      case 'alignHina': {
        const hs = doc().items.filter(it => it.type === 'hina');
        if (hs.length < 2) return toast('ひな壇が2段以上ありません');
        pushHistory();
        const widest = hs.reduce((a, b) => (b.w > a.w ? b : a));
        hs.forEach(h => { h.w = widest.w; h.x = widest.x; });
        toast(`${hs.length}段の横幅を${(widest.w / 100).toFixed(2)}m（平台${SS.hinaMaterials(widest).across}枚分）にそろえました`, true);
        break;
      }
      case 'fitStage': {
        pushHistory();
        const n = fitInStage(doc().items);
        toast(n ? `${n}個をステージの内側に入れました` : 'はみ出しているものはありません', !!n);
        break;
      }
      case 'alignLeft': case 'alignRight': case 'alignCenterX':
      case 'alignTop': case 'alignBottom': case 'alignCenterY': {
        if (!needSel(2)) return;
        pushHistory();
        const xs = sel.map(it => it.x), ys = sel.map(it => it.y);
        const v = {
          alignLeft: Math.min(...xs), alignRight: Math.max(...xs), alignCenterX: G.mean(xs),
          alignTop: Math.min(...ys), alignBottom: Math.max(...ys), alignCenterY: G.mean(ys),
        }[name];
        sel.forEach(it => { if (/Left|Right|CenterX/.test(name)) it.x = v; else it.y = v; });
        break;
      }
      case 'distH': case 'distV': {
        if (!needSel(3)) return;
        pushHistory();
        const key = name === 'distH' ? 'x' : 'y';
        const s = sel.slice().sort((a, b) => a[key] - b[key]);
        const a = s[0][key], b = s[s.length - 1][key];
        s.forEach((it, i) => { it[key] = a + ((b - a) * i) / (s.length - 1); });
        break;
      }
      case 'duplicate': {
        if (!needSel(1)) return;
        pasteItems(JSON.parse(JSON.stringify(sel)));
        return;
      }
      case 'delete': {
        if (!needSel(1)) return;
        pushHistory();
        doc().items = doc().items.filter(it => !S.sel.has(it.id));
        toast(`${S.sel.size}個を削除しました`, true);
        S.sel.clear();
        break;
      }
      case 'selectAll':
        S.sel = new Set(doc().items.map(it => it.id));
        break;
      case 'selectSamePart': {
        if (!needSel(1)) return;
        const labels = new Set(sel.map(it => (it.type === 'player' ? 'p:' + (it.label || '') : 't:' + it.type)));
        S.sel = new Set(doc().items.filter(it => labels.has(it.type === 'player' ? 'p:' + (it.label || '') : 't:' + it.type)).map(it => it.id));
        toast(`${S.sel.size}個を選びました`);
        break;
      }
      default: return;
    }
    renderAll();
  }
  SS.act = act;

  document.querySelectorAll('[data-act]').forEach(b => { b.onclick = () => act(b.getAttribute('data-act')); });
  $('btnTidy').onclick = () => act('tidy');
  $('btnTidyMobile').onclick = () => { closePanels(); act('tidy'); };

  // ------------------------------------------------------------ 選択中の部品のプロパティ
  const COMMON_PARTS = ['Picc', 'Fl', 'Fl1', 'Fl2', 'Ob', 'Ob1', 'Ob2', 'E.H.', 'Fg', 'Fg1', 'Fg2', 'Es.Cl', 'Cl', 'Cl1', 'Cl2', 'Cl3', 'B.Cl', 'A.Sx', 'A.Sx1', 'A.Sx2', 'T.Sx', 'B.Sx', 'S.Sx',
    'Hr', 'Hr1', 'Hr2', 'Hr3', 'Hr4', 'Tp', 'Tp1', 'Tp2', 'Tp3', 'Tb', 'Tb1', 'Tb2', 'Tb3', 'B.Tb', 'Euph', 'Tuba', 'St.B', 'Perc', 'Timp', 'Pf', 'Hp',
    'Vn1', 'Vn2', 'Va', 'Vc', 'Cb'];

  function renderProps(valuesOnly) {
    const sel = selected();
    const info = $('selInfo'), box = $('selProps');
    if (valuesOnly && sel.length === 1) {
      const it = sel[0];
      const r = $('propRot'); if (r && document.activeElement !== r) { r.value = Math.round(it.rot || 0); $('propRotVal').textContent = Math.round(it.rot || 0) + '°'; }
      const w = $('propW'); if (w && document.activeElement !== w) w.value = it.w;
      const h = $('propH'); if (h && document.activeElement !== h) h.value = it.h;
      return;
    }
    if (!sel.length) { info.classList.remove('hidden'); box.innerHTML = ''; return; }
    info.classList.add('hidden');
    const allPlayers = sel.every(it => it.type === 'player');
    const one = sel.length === 1 ? sel[0] : null;
    const esc = SS.esc;
    let h = `<div class="hint"><b>${sel.length}個</b>選択中${one ? '：' + esc(one.type === 'player' ? '奏者' : (SS.CATALOG[one.type] || {}).name || '') : ''}</div>`;
    const same = key => { const v = sel[0][key]; return sel.every(it => it[key] === v) ? v : ''; };
    if (allPlayers || (one && one.type !== 'player')) {
      h += `<label class="field">${allPlayers ? 'パート名' : '表示する文字'}<input id="propLabel" list="partList" value="${esc(same('label') || '')}" placeholder="${sel.length > 1 && !same('label') ? '（いろいろ）' : ''}"></label>`;
    }
    if (one && one.type === 'player') {
      h += `<label class="field">名前<input id="propName" value="${esc(one.name || '')}" placeholder="例: 山田"></label>`;
    }
    if (one && one.type === 'text') {
      h += `<label class="field">文字の大きさ<input id="propFont" type="range" min="12" max="120" value="${one.fontSize || 36}"></label>`;
    }
    if (one && one.type === 'hina') {
      const m = SS.hinaMaterials(one);
      h += `<label class="field">高さ<select id="propHgt">${SS.RISER_HEIGHTS.map(x => `<option value="${x.v}"${Math.abs(x.v - (one.hgt || 21.2)) < 0.6 ? ' selected' : ''}>${x.name}：${x.how}</option>`).join('')}</select></label>`;
      const curT = SS.hinaTypeOf({ panel: one.panel, orient: one.orient, deep: m.deep });
      h += `<p class="hint small" style="margin:4px 0">平台の置き方（押すと奥行が変わります）</p><div class="hina-types" id="propHinaTypes">${SS.HINA_TYPES.map(t => `<button class="hina-type${curT && curT.id === t.id ? ' on' : ''}" data-ht="${t.id}" title="${SS.esc(t.hint)}">${SS.hinaTypeSVG(t)}<b>${SS.esc(t.name)}</b><small>奥行${Math.round(SS.hinaTypeDepth(t))}cm</small></button>`).join('')}</div>`;
      h += `<p class="hint small" style="margin:6px 0 0">平台 ${SS.esc(m.panelName)}：横${m.across}枚×奥${m.deep}枚＝${m.panels}枚</p>`;
      h += `<p class="hint small">必要な部材の目安：平台 ${m.panels}枚${m.legs ? `／${m.legName} ${m.legs}個` : ''}</p>`;
    }
    if (one && one.type !== 'player' && one.type !== 'text') {
      h += `<div class="row2"><label class="field">幅(cm)<input id="propW" type="number" min="10" step="5" value="${one.w}"></label><label class="field">奥行(cm)<input id="propH" type="number" min="10" step="5" value="${one.h}"></label></div>`;
    }
    if (one) {
      h += `<label class="field">向き <span id="propRotVal">${Math.round(one.rot || 0)}°</span><input id="propRot" type="range" min="-180" max="180" step="5" value="${Math.round(one.rot || 0)}"></label>`;
    }
    const col = same('color') || (one ? SS.itemColor(one, renderOpts()) : '#ffffff');
    h += `<div class="row2"><label class="field">色<input id="propColor" type="color" value="${/^#[0-9a-f]{6}$/i.test(col) ? col : '#ffffff'}"></label>`;
    h += `<label class="field">&nbsp;<button class="btn" id="propColorReset">色を元に戻す</button></label></div>`;
    h += `<datalist id="partList">${COMMON_PARTS.map(p => `<option value="${p}">`).join('')}</datalist>`;
    box.innerHTML = h;

    const bind = (id, ev, fn) => {
      const el = $(id); if (!el) return;
      el.addEventListener('focus', () => pushHistory());
      el.addEventListener(ev, () => { fn(el); render(); renderCounts(); });
    };
    bind('propLabel', 'input', el => sel.forEach(it => { it.label = el.value; }));
    bind('propName', 'input', el => { one.name = el.value; });
    bind('propFont', 'input', el => { one.fontSize = +el.value; });
    bind('propW', 'input', el => { if (+el.value >= 10) one.w = +el.value; });
    bind('propH', 'input', el => { if (+el.value >= 10) one.h = +el.value; });
    bind('propRot', 'input', el => { one.rot = +el.value; $('propRotVal').textContent = el.value + '°'; });
    bind('propHgt', 'change', el => { one.hgt = +el.value; renderProps(); });
    box.querySelectorAll('#propHinaTypes [data-ht]').forEach(b => {
      b.onclick = () => {
        const t = SS.HINA_TYPES.find(x => x.id === b.getAttribute('data-ht'));
        pushHistory();
        one.panel = t.panel; one.orient = t.orient;
        // 幅は平台の枚数単位に、奥行はこの型の奥行に
        const P = SS.panelSize(one);
        one.w = Math.max(1, Math.round(one.w / P.w)) * P.w;
        one.h = P.d * t.deep;
        render(); renderCounts(); renderProps();
      };
    });
    bind('propColor', 'input', el => sel.forEach(it => { it.color = el.value; }));
    $('propColorReset').onclick = () => { pushHistory(); sel.forEach(it => { delete it.color; }); renderAll(); };
    ['propLabel', 'propName'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
    });
  }

  // ------------------------------------------------------------ 編成表
  function renderCounts() {
    const c = SS.render.counts(doc());
    let h = `<div class="total">合計 ${c.total} 人</div>`;
    if (!c.total) h += '<p class="hint">奏者がまだいません。</p>';
    h += '<table class="count-table">';
    c.groups.forEach(x => {
      const sum = x.parts.reduce((a, p) => a + p.n, 0);
      h += `<tr class="grp"><td><span class="swatch" style="background:${x.g.color}"></span>${x.g.name}</td><td>${sum}</td></tr>`;
      x.parts.forEach(p => { h += `<tr><td data-part="${SS.esc(p.label)}" style="cursor:pointer" title="クリックで選択">　${SS.esc(p.label)}</td><td>${p.n}</td></tr>`; });
    });
    h += '</table><p class="hint small">パート名をクリックすると、そのパートの人をまとめて選べます。</p>';
    const hinas = doc().items.filter(it => it.type === 'hina').sort((a, b) => (a.hgt || 0) - (b.hgt || 0));
    if (hinas.length) {
      const pan = {}, leg = {};
      h += '<h3 style="margin-top:16px">ひな壇の部材（目安）</h3><ul class="mat-list">';
      hinas.forEach(it => {
        const m = SS.hinaMaterials(it);
        pan[m.panelName] = (pan[m.panelName] || 0) + m.panels;
        if (m.legs) leg[m.legName] = (leg[m.legName] || 0) + m.legs;
        h += `<li>${it.step ? it.step + '段目 ' : ''}高さ${SS.heightName(it.hgt || 21.2)}：幅${(it.w / 100).toFixed(1)}m×奥行${(it.h / 100).toFixed(1)}m → 平台${m.panels}枚${m.legs ? '＋' + m.legName + m.legs + '個' : ''}</li>`;
      });
      h += '</ul><p class="hint small"><b>合計</b>：' + Object.keys(pan).map(k => `平台${k} ${pan[k]}枚`).concat(Object.keys(leg).map(k => `${k} ${leg[k]}個`)).join('／') + '<br>※足の数は「平台の前後の辺に、つなぎ目ごとに置く」ときの目安です。ホールの備品数を確認してください。</p>';
    }
    $('countTable').innerHTML = h;
    $('countTable').querySelectorAll('[data-part]').forEach(td => {
      td.onclick = () => {
        const l = td.getAttribute('data-part');
        S.sel = new Set(players().filter(it => ((it.label || '').trim() || '（未設定）') === l).map(it => it.id));
        renderOverlay(); renderProps();
        openRightTab('selTab');
      };
    });
  }

  // ------------------------------------------------------------ 設定
  function renderSettings() {
    const d = doc(), o = d.options;
    if (document.activeElement !== $('docTitle')) $('docTitle').value = d.title;
    if (document.activeElement !== $('docSubtitle')) $('docSubtitle').value = d.subtitle;
    if (document.activeElement !== $('stageW')) $('stageW').value = d.stage.w / 100;
    if (document.activeElement !== $('stageD')) $('stageD').value = d.stage.d / 100;
    $('stageShape').value = d.stage.shape || 'rect';
    $('stageBWWrap').hidden = !['shell', 'arc', 'round'].includes(d.stage.shape);
    $('stageSagWrap').hidden = d.stage.shape !== 'arc';
    if (document.activeElement !== $('stageSag')) $('stageSag').value = Math.round(SS.render.arcSag(d.stage)) / 100;
    if (document.activeElement !== $('stageBW')) $('stageBW').value = Math.round(SS.render.backWidth(d.stage)) / 100;
    $('optNames').checked = o.showNames;
    $('optStands').checked = o.showStands;
    $('optStandLegs').checked = o.standLegs !== false;
    $('optNumbers').checked = o.showNumbers;
    $('optGrid').value = o.grid ? String(o.gridSize || 50) : '0';
    $('optStyle').value = o.contest ? 'contest' : o.figure ? 'figure' : 'circle';
    $('optSnap').checked = o.snap;
    $('optColor').checked = o.colorBy;
    $('optSeatSize').value = o.seatR;
    $('optDims').checked = o.dims;
    $('optGuides').checked = o.guides;
    syncArcCurve();
  }
  function bindSetting(id, ev, fn) {
    const el = $(id);
    el.addEventListener('focus', () => pushHistory());
    el.addEventListener(ev, () => { if (ev === 'change' && el.type === 'checkbox') pushHistory(); fn(el); render(); renderCounts(); });
  }
  bindSetting('docTitle', 'input', el => { doc().title = el.value; });
  bindSetting('docSubtitle', 'input', el => { doc().subtitle = el.value; });
  bindSetting('stageW', 'change', el => { const v = +el.value; if (v >= 3 && v <= 60) { doc().stage.w = Math.round(v * 100); doc().hall = ''; updateHallNote(); } });
  bindSetting('stageD', 'change', el => { const v = +el.value; if (v >= 2 && v <= 50) { doc().stage.d = Math.round(v * 100); doc().hall = ''; updateHallNote(); } });
  bindSetting('stageShape', 'change', el => {
    const st = doc().stage;
    st.shape = el.value;
    if (['shell', 'arc', 'round'].includes(el.value) && !st.bw) st.bw = Math.round(st.w * 0.7);
    if (el.value === 'arc' && st.sag == null) st.sag = Math.round(st.w * 0.08);
    renderSettings();
  });
  bindSetting('stageSag', 'change', el => { const v = +el.value; if (v >= 0) { const st = doc().stage, yc = st.d - SS.render.arcSag(st); st.sag = Math.round(v * 100); st.d = Math.round(yc + st.sag); doc().hall = ''; updateHallNote(); } });
  bindSetting('stageBW', 'change', el => { const v = +el.value; if (v >= 2) { doc().stage.bw = Math.min(doc().stage.w, Math.round(v * 100)); doc().hall = ''; updateHallNote(); } });
  bindSetting('optNames', 'change', el => { opts().showNames = el.checked; });
  bindSetting('optStands', 'change', el => { opts().showStands = el.checked; });
  bindSetting('optStandLegs', 'change', el => { opts().standLegs = el.checked; });
  bindSetting('optNumbers', 'change', el => { opts().showNumbers = el.checked; });
  bindSetting('optGrid', 'change', el => { const v = +el.value; opts().grid = v > 0; if (v) opts().gridSize = v; });
  bindSetting('optStyle', 'change', el => { opts().contest = el.value === 'contest'; opts().figure = el.value === 'figure'; renderSettings(); });
  bindSetting('optSnap', 'change', el => { opts().snap = el.checked; });
  bindSetting('optColor', 'change', el => { opts().colorBy = el.checked; });
  bindSetting('optSeatSize', 'input', el => { opts().seatR = +el.value; });
  bindSetting('optDims', 'change', el => { opts().dims = el.checked; });
  bindSetting('optGuides', 'change', el => { opts().guides = el.checked; });

  // ------------------------------------------------------------ パネル・タブ
  document.querySelectorAll('.tabs').forEach(nav => {
    nav.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        const panel = nav.parentElement;
        panel.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
        panel.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === tab.getAttribute('data-tab')));
      };
    });
  });
  function openTab(panelId, tabId) {
    const panel = $(panelId);
    panel.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tabId));
    panel.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === tabId));
  }
  const openRightTab = id => openTab('rightPanel', id);
  const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
  function openPanel(id) { if (isMobile()) { closePanels(); $(id).classList.add('open'); } }
  function closePanels() { document.querySelectorAll('.panel.open').forEach(p => p.classList.remove('open')); }
  document.querySelectorAll('[data-open]').forEach(b => {
    b.onclick = () => {
      const p = $(b.getAttribute('data-open'));
      const was = p.classList.contains('open');
      closePanels();
      if (!was) p.classList.add('open');
    };
  });

  // モード
  function setMode(m) {
    S.mode = m;
    $('modeSelect').classList.toggle('active', m === 'select');
    $('modeBox').classList.toggle('active', m === 'box');
    $('modeLasso').classList.toggle('active', m === 'lasso');
    $('modePan').classList.toggle('active', m === 'pan');
    if (m === 'box') toast('ドラッグで四角く囲んだ人を選びます（ひな壇は選びません）');
    if (m === 'lasso') toast('指やマウスで自由に囲んだ人を選びます（ひな壇は選びません）');
    svg.classList.toggle('panning', m === 'pan');
  }
  $('modeSelect').onclick = () => setMode('select');
  $('modePan').onclick = () => setMode('pan');
  $('modeBox').onclick = () => setMode(S.mode === 'box' ? 'select' : 'box');
  $('modeLasso').onclick = () => setMode(S.mode === 'lasso' ? 'select' : 'lasso');
  $('zoomIn').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); };
  $('zoomOut').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2); };
  $('zoomFit').onclick = fitView;
  $('btnUndo').onclick = undo;
  $('btnRedo').onclick = redo;

  // ------------------------------------------------------------ ひな形・部品
  function thumbSVG(d) {
    const st = d.stage;
    const tmp = normalize(d);
    const c = tmp.items.find(it => it.type === 'podium') || { x: st.w / 2, y: st.d - 100 };
    return `<svg viewBox="-20 -20 ${st.w + 40} ${st.d + 40}" preserveAspectRatio="xMidYMid meet">${SS.render.stageSVG(tmp, false).replace(/<text[\s\S]*?<\/text>/g, '')}${SS.render.itemsSVG(tmp, { colorBy: true, showStands: false, showNames: false, seatR: 26 }, c, false).replace(/<g pointer-events="none">[\s\S]*<\/g>$/, '')}</svg>`;
  }

  function loadTemplate(t, force) {
    const hasWork = players().length > 0 && S.undo.length > 0;
    if (hasWork && !force) {
      askConfirm('いまの配置図を「' + t.name + '」に置き換えます。\n（あとで「戻す」で元に戻せます）', '置き換える', () => loadTemplate(t, true));
      return;
    }
    pushHistory();
    const made = t.make();
    const keep = doc();
    S.doc = normalize({ title: keep.title, subtitle: keep.subtitle, stage: Object.assign({ shape: made.stage.shape || keep.stage.shape }, made.stage), items: made.items, options: keep.options, underlay: keep.underlay, ensemble: made.ensemble || null });
    renderSteppers();
    S.sel.clear();
    closePanels();
    renderAll();
    updateHallNote();
    fitView();
    toast('「' + t.name + '」を読み込みました', true);
  }

  function buildTemplates() {
    const list = $('templateList');
    list.innerHTML = '';
    SS.TEMPLATES.forEach(t => {
      const b = document.createElement('button');
      b.className = 'tpl-card';
      b.innerHTML = `${thumbSVG(t.make())}<div><b>${t.name}</b><span>${t.desc}</span></div>`;
      b.onclick = () => loadTemplate(t);
      list.appendChild(b);
    });
  }

  function buildPalette() {
    const pal = $('palette');
    const cats = {};
    Object.keys(SS.CATALOG).forEach(k => { const c = SS.CATALOG[k]; if (c.cat) (cats[c.cat] = cats[c.cat] || []).push(k); });
    let h = '';
    Object.keys(cats).forEach(cat => {
      h += `<h4>${cat}</h4><div class="palette-grid">`;
      cats[cat].forEach(k => {
        const c = SS.CATALOG[k];
        const size = c.w ? `${c.w}×${c.h}cm` : '';
        h += `<button class="pal-item" draggable="true" data-type="${k}" title="${SS.esc(c.note || size)}">${SS.iconFor(k)}<span>${c.name}${size ? `<small>${size}</small>` : ''}</span></button>`;
      });
      h += '</div>';
    });
    pal.innerHTML = h;
    pal.querySelectorAll('[data-type]').forEach(b => {
      b.onclick = () => {
        setPlacing(b.getAttribute('data-type'));
        closePanels();
      };
      b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-stage-item', b.getAttribute('data-type')); e.dataTransfer.effectAllowed = 'copy'; });
    });
  }

  // ------------------------------------------------------------ 一括作成
  $('btnGenerate').onclick = () => {
    const rows = $('genRows').value.split(/[,、，\s]+/).map(s => parseInt(s, 10)).filter(n => n > 0 && n < 100);
    if (!rows.length) return toast('各列の人数を「8,10,12」のように入れてください');
    pushHistory();
    const c = conductor();
    if (!doc().items.some(it => it.type === 'podium')) doc().items.push({ id: newId(), type: 'podium', x: c.x, y: c.y, rot: 0 });
    if ($('genReplace').checked) doc().items = doc().items.filter(it => it.type !== 'player');
    const pts = G.generate(rows, {
      shape: $('genShape').value,
      spacing: +$('genSpacing').value || 75,
      r0: +$('genR0').value || 180,
      gap: +$('genGap').value || 110,
    }, c);
    const labels = G.parseSpec($('genParts').value);
    const ids = [];
    pts.forEach((p, i) => {
      const it = { id: newId(), type: 'player', x: p.x, y: p.y, rot: p.rot, label: labels[i] || '' };
      doc().items.push(it);
      ids.push(it.id);
    });
    S.sel = new Set(ids);
    closePanels();
    renderAll();
    toast(`${pts.length}人分の席を作りました`);
  };

  $('btnAssign').onclick = () => {
    const labels = G.parseSpec($('assignSpec').value);
    if (!labels.length) return toast('パート名を入れてください（例: Fl×4, Ob×2）');
    const list = targetsPlayers();
    if (!list.length) return toast('奏者がいません');
    pushHistory();
    const order = G.seatOrder(list, conductor());
    order.forEach((it, i) => { if (i < labels.length) it.label = labels[i]; });
    renderAll();
    const diff = labels.length - order.length;
    toast(diff === 0 ? `${order.length}席に割り当てました` : diff > 0 ? `席が${diff}つ足りません（${order.length}席に割り当て）` : `${labels.length}席に割り当てました（残り${-diff}席はそのまま）`);
  };

  $('btnNames').onclick = () => {
    const lines = $('namesSpec').value.split(/\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return toast('名前を入れてください');
    const list = targetsPlayers();
    if (!list.length) return toast('奏者がいません');
    pushHistory();
    const order = G.seatOrder(list, conductor());
    if ($('namesClear').checked) order.forEach(it => { it.name = ''; });
    const labelsLower = new Set(order.map(it => (it.label || '').toLowerCase()));
    let placed = 0, missing = 0;
    lines.forEach(line => {
      const m = /^(\S+)[\s\t　:：]+(.+)$/.exec(line);
      if (m && labelsLower.has(m[1].toLowerCase())) {
        const seat = order.find(it => (it.label || '').toLowerCase() === m[1].toLowerCase() && !it.name);
        if (seat) { seat.name = m[2].trim(); placed++; } else missing++;
        return;
      }
      const seat = order.find(it => !it.name);
      if (seat) { seat.name = line; placed++; } else missing++;
    });
    opts().showNames = true;
    renderAll();
    toast(missing ? `${placed}人を入れました（${missing}人は空いている席がありません）` : `${placed}人の名前を入れました`);
  };

  // ------------------------------------------------------------ 舞台図（画像・PDF）の読み込みと重ね合わせ
  async function handleImageFile(file, pageNo) {
    if (!file) return;
    const pdf = SS.trace.isPdf(file);
    if (!pdf && !/^image\//.test(file.type)) return toast('画像かPDFを選んでください');
    try {
      toast(pdf ? 'PDFを読み込んでいます…' : '画像を読み込んでいます…');
      let canvas, cmPerPx = 0;
      if (pdf) {
        const r = await SS.trace.loadPdf(S.pdfData && pageNo ? S.pdfData.slice(0) : file, pageNo || 1, 3000);
        if (!pageNo) S.pdfData = r.data;
        canvas = r.canvas; cmPerPx = r.cmPerPx;
        $('pdfPage').value = r.page; $('pdfPage').max = r.pages;
        $('pdfPages').textContent = `／ ${r.pages} ページ`;
        $('pdfPageRow').classList.toggle('hidden', r.pages < 2);
      } else {
        const { img } = await SS.trace.loadImageFromFile(file);
        canvas = SS.trace.toCanvas(img, 3000, 0);
        S.pdfData = null;
        $('pdfPageRow').classList.add('hidden');
      }
      $('pdfScaleRow').classList.toggle('hidden', !cmPerPx);
      S.traceSrc = { img: canvas, rot: 0 };
      S.trace = null;
      placeDrawing(canvas, cmPerPx);
      $('overlayControls').classList.remove('hidden');
      $('traceControls').classList.add('hidden');
      openTab('leftPanel', 'traceTab');
      openPanel('leftPanel');
      toast('舞台図を重ねました。「⤢ 舞台の前の角に合わせる」を押して、図の舞台の左の角 → 右の角をタップすると、ぴったり重なります', true);
    } catch (err) {
      toast(err.message || '読み込めませんでした');
    }
  }

  // 読み込んだ図を下絵にする（白い余白は自動で切り取り、ステージに入る大きさで置く）
  function placeDrawing(canvas, cmPerPx) {
    pushHistory();
    const crop = SS.trace.autoTrim(canvas);
    const u = { src: canvas.toDataURL('image/jpeg', 0.9), opacity: +$('underlayOpacity').value / 100, rot: 0, crop, pxW: canvas.width, pxH: canvas.height, cmPerPx: cmPerPx || 0, x: 0, y: 0, w: canvas.width, h: canvas.height };
    doc().underlay = u;
    fitDrawingInStage();
    syncOverlayUI();
    render();
    fitView(SS.render.underlayBounds(u));
  }

  // 使う範囲がステージにちょうど入るように、大きさと位置を変える
  function fitDrawingInStage() {
    const u = doc().underlay; if (!u) return;
    const st = doc().stage;
    let b = SS.render.underlayBounds(u);
    scaleDrawing(Math.min(st.w / (b.x1 - b.x0), st.d / (b.y1 - b.y0)), { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
    b = SS.render.underlayBounds(u);
    u.x += st.w / 2 - (b.x0 + b.x1) / 2; u.y += st.d / 2 - (b.y0 + b.y1) / 2;
  }
  // 点 P を中心に f 倍
  function scaleDrawing(f, P) {
    const u = doc().underlay;
    u.x = P.x + (u.x - P.x) * f; u.y = P.y + (u.y - P.y) * f; u.w *= f; u.h *= f;
  }
  // 使う範囲の真ん中（舞台の座標）
  function drawingCenter() {
    const u = doc().underlay, c = SS.render.underlayCrop(u);
    return SS.render.underlayToWorld(u, (c.l + c.r) / 2, (c.t + c.b) / 2);
  }
  function rotateDrawing(deg) {
    const u = doc().underlay; if (!u) return;
    const C = drawingCenter();
    u.rot = Math.round(deg * 10) / 10;
    const C2 = drawingCenter();
    u.x += C.x - C2.x; u.y += C.y - C2.y;
  }
  function syncOverlayUI() {
    const u = doc().underlay; if (!u) return;
    $('underlayOpacity').value = Math.round((u.opacity == null ? 0.45 : u.opacity) * 100);
    $('ovRot').value = u.rot || 0;
    $('ovRotVal').textContent = `${Math.round((u.rot || 0) * 10) / 10}°`;
    $('ovOnTop').checked = !!u.onTop;
    $('pdfScaleRow').classList.toggle('hidden', !u.cmPerPx);
  }

  // 2点を選んで合わせる
  function pickTargets(kind) {
    const st = doc().stage, poly = SS.render.stagePoly(st);
    if (kind === 'front') return [{ x: poly[3][0], y: poly[3][1] }, { x: poly[2][0], y: poly[2][1] }];
    if (kind === 'back') return [{ x: poly[0][0], y: poly[0][1] }, { x: poly[1][0], y: poly[1][1] }];
    return null;
  }
  const PICK_TEXT = {
    front: ['図の舞台の<b>前の左の角</b>をタップ', '図の舞台の<b>前の右の角</b>をタップ'],
    back: ['図の舞台の<b>奥の左の角</b>をタップ', '図の舞台の<b>奥の右の角</b>をタップ'],
    len: ['長さのわかる<b>1つ目の点</b>をタップ', '<b>2つ目の点</b>をタップ'],
  };
  function startPick(kind) {
    if (!doc().underlay) return toast('先に舞台図を読み込んでください');
    S.pick = { kind, pts: [] };
    S.underlayEdit = false; $('underlayEdit').checked = false;
    closePanels();
    pickStep();
    render();
  }
  function endPick() {
    S.pick = null;
    $('pickHint').hidden = true;
    renderOverlay();
  }
  function pickStep() {
    const P = S.pick; if (!P) return;
    if (P.pts.length < 2) {
      $('pickHint').hidden = false;
      $('pickHintText').innerHTML = `${P.pts.length + 1}/2：${PICK_TEXT[P.kind][P.pts.length]}（ドラッグで画面を動かせます）`;
      return;
    }
    const [p1, p2] = P.pts;
    const kind = P.kind;
    endPick();
    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 5) return toast('2つの点が近すぎます。もう一度どうぞ');
    if (kind === 'len') {
      const cur = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 100;
      openModal(`<h2>📏 2点の間の実際の長さ</h2><p class="hint">図に書かれている寸法（例：間口 18m）を入れてください。</p>
        <label class="field">長さ（m）<input id="pickLen" type="number" step="0.01" min="0.1" value="${cur.toFixed(2)}"></label>
        <div class="btn-row"><button class="btn primary" id="pickLenOk">この長さで合わせる</button><button class="btn" id="pickLenNo">やめる</button></div>`);
      setTimeout(() => { const el = $('pickLen'); if (el) { el.focus(); el.select(); } }, 50);
      $('pickLenNo').onclick = closeModal;
      $('pickLenOk').onclick = () => {
        const L = +$('pickLen').value * 100;
        if (!(L > 0)) return;
        closeModal();
        pushHistory();
        scaleDrawing(L / Math.hypot(p2.x - p1.x, p2.y - p1.y), p1);
        doc().underlay.aligned = true;
        render();
        fitView(SS.render.underlayBounds(doc().underlay));
        toast(`2点の間を ${(L / 100).toFixed(2)}m にしました。位置は「↑↓←→」かドラッグで合わせられます`, true);
      };
      return;
    }
    // 2点を舞台の角に重ねる（大きさ・回転・位置を一度に）
    const [q1, q2] = pickTargets(kind);
    const u = doc().underlay;
    pushHistory();
    const f = Math.hypot(q2.x - q1.x, q2.y - q1.y) / Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const th = Math.atan2(q2.y - q1.y, q2.x - q1.x) - Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const M = p => {
      const dx = (p.x - p1.x) * f, dy = (p.y - p1.y) * f;
      return { x: q1.x + dx * Math.cos(th) - dy * Math.sin(th), y: q1.y + dx * Math.sin(th) + dy * Math.cos(th) };
    };
    const tl = M({ x: u.x, y: u.y });
    u.x = tl.x; u.y = tl.y; u.w *= f; u.h *= f;
    let rot = (u.rot || 0) + (th * 180) / Math.PI;
    rot = ((rot + 540) % 360) - 180;
    u.rot = Math.round(rot * 100) / 100;
    u.aligned = true;
    syncOverlayUI();
    render();
    fitView(SS.render.underlayBounds(u));
    toast('舞台図を、この配置図の舞台に重ねました。ずれていたら「②微調整」で直せます', true);
  }
  document.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => startPick(b.getAttribute('data-pick')); });
  $('pickCancel').onclick = endPick;
  $('btnOvFit').onclick = () => { if (!doc().underlay) return; pushHistory(); fitDrawingInStage(); render(); };
  $('btnPdfScale').onclick = () => {
    const u = doc().underlay; if (!u || !u.cmPerPx) return;
    const ratio = +$('pdfScale').value;
    if (!(ratio > 0)) return;
    pushHistory();
    const C = drawingCenter();
    scaleDrawing((u.pxW * u.cmPerPx * ratio) / u.w, C);
    u.aligned = true;
    render();
    fitView(SS.render.underlayBounds(u));
    toast(`縮尺 1/${ratio} で実寸にしました。位置はドラッグや「⤢ 舞台の前の角に合わせる」で合わせてください`, true);
  };
  $('pdfPage').addEventListener('change', e => { if (S.pdfData) handleImageFile(new Blob([S.pdfData], { type: 'application/pdf' }), +e.target.value); });
  let rotHist = 0;
  $('ovRot').addEventListener('input', e => {
    if (!doc().underlay) return;
    if (Date.now() - rotHist > 1500) pushHistory();
    rotHist = Date.now();
    rotateDrawing(+e.target.value);
    $('ovRotVal').textContent = `${e.target.value}°`;
    render();
  });
  document.querySelectorAll('[data-ovmove]').forEach(b => {
    b.onclick = e => {
      const u = doc().underlay; if (!u) return;
      const [dx, dy] = b.getAttribute('data-ovmove').split(',').map(Number);
      const step = e.shiftKey ? 50 : 10;
      pushHistory(); u.x += dx * step; u.y += dy * step; render();
    };
  });
  document.querySelectorAll('[data-ovzoom]').forEach(b => {
    b.onclick = () => { if (!doc().underlay) return; pushHistory(); scaleDrawing(+b.getAttribute('data-ovzoom'), drawingCenter()); render(); };
  });
  $('btnOvShowAll').onclick = () => { const u = doc().underlay; if (u) fitView(SS.render.underlayBounds(u)); };
  $('ovOnTop').addEventListener('change', e => { const u = doc().underlay; if (!u) return; u.onTop = e.target.checked; render(); });
  $('btnOvCrop').onclick = openRectCrop;
  $('btnTraceOpen').onclick = () => {
    if (!S.traceSrc) return toast('もう一度、舞台図（配置図）の画像を選んでください');
    const prep = SS.trace.prepare(S.traceSrc.img);
    S.trace = { prep, result: null, canvas: S.traceSrc.img, framed: false };
    $('traceScale').checked = !(doc().underlay && doc().underlay.aligned);
    $('traceControls').classList.remove('hidden');
    runDetect();
    $('traceControls').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 使う範囲を四角く切り取る（外側の客席・袖などを隠す）
  function openRectCrop() {
    const u = doc().underlay; if (!u) return;
    const img = new Image();
    img.onload = () => {
      let c = SS.render.underlayCrop(u);
      openModal(`<h2>✂ 使う範囲を切り取る</h2>
        <p class="hint">四隅の点をドラッグして、残したい範囲を決めてください（はみ出す部分はあとで「図の全体を表示」でも見られます）。</p>
        <div class="crop-wrap" id="rcWrap"><canvas id="rcCanvas"></canvas><svg id="rcSvg"></svg></div>
        <div class="btn-row"><button class="btn" id="rcAuto">白い余白を自動で切る</button><button class="btn" id="rcAll">全体を使う</button></div>
        <div class="btn-row"><button class="btn primary" id="rcOk">この範囲にする</button><button class="btn" id="rcNo">やめる</button></div>`);
      const W = img.naturalWidth, H = img.naturalHeight;
      const cv = $('rcCanvas'), sv = $('rcSvg');
      const k = Math.min(1, 1600 / Math.max(W, H));
      cv.width = Math.round(W * k); cv.height = Math.round(H * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      sv.setAttribute('viewBox', `0 0 ${cv.width} ${cv.height}`);
      const draw = () => {
        const x0 = c.l * cv.width, y0 = c.t * cv.height, x1 = c.r * cv.width, y1 = c.b * cv.height;
        const hr = Math.max(cv.width, cv.height) / 45;
        sv.innerHTML = `<path d="M0 0H${cv.width}V${cv.height}H0Z M${x0} ${y0}H${x1}V${y1}H${x0}Z" fill="rgba(0,0,0,.45)" fill-rule="evenodd"/>
          <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="#4d8dff" stroke-width="${hr / 4}"/>` +
          [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${hr}" fill="rgba(77,141,255,.35)" stroke="#fff" stroke-width="${hr / 5}"/>`).join('');
      };
      draw();
      let grab = -1;
      const toF = e => { const r = sv.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
      sv.addEventListener('pointerdown', e => {
        const p = toF(e);
        const cs = [[c.l, c.t], [c.r, c.t], [c.r, c.b], [c.l, c.b]];
        let bi = 0, bd = Infinity;
        cs.forEach((q, i) => { const d = Math.hypot((q[0] - p.x) * W, (q[1] - p.y) * H); if (d < bd) { bd = d; bi = i; } });
        grab = bi; sv.setPointerCapture(e.pointerId);
      });
      sv.addEventListener('pointermove', e => {
        if (grab < 0) return;
        const p = toF(e);
        if (grab === 0 || grab === 3) c.l = Math.min(p.x, c.r - 0.02); else c.r = Math.max(p.x, c.l + 0.02);
        if (grab === 0 || grab === 1) c.t = Math.min(p.y, c.b - 0.02); else c.b = Math.max(p.y, c.t + 0.02);
        draw();
      });
      sv.addEventListener('pointerup', () => { grab = -1; });
      $('rcAuto').onclick = () => { c = SS.trace.autoTrim(img); draw(); };
      $('rcAll').onclick = () => { c = { l: 0, t: 0, r: 1, b: 1 }; draw(); };
      $('rcNo').onclick = closeModal;
      $('rcOk').onclick = () => { pushHistory(); u.crop = c; closeModal(); render(); toast('使う範囲を切り取りました', true); };
    };
    img.src = u.src;
  }

  // 解析する画像（キャンバス）を決めて、下絵として置く
  function setTraceImage(canvas, framed) {
    const prep = SS.trace.prepare(canvas);
    S.trace = { prep, result: null, canvas, framed };
    const st = doc().stage;
    const u = { src: canvas.toDataURL('image/jpeg', 0.85), opacity: +$('underlayOpacity').value / 100, rot: 0, pxW: canvas.width, pxH: canvas.height, cmPerPx: 0 };
    if (framed) { u.x = 0; u.y = 0; u.w = st.w; u.h = st.d; u.aligned = true; }
    else {
      const k = Math.min(st.w / prep.w, st.d / prep.h);
      u.w = prep.w * k; u.h = prep.h * k; u.x = (st.w - u.w) / 2; u.y = (st.d - u.h) / 2;
    }
    doc().underlay = u;
    $('traceScale').checked = !framed;
    $('overlayControls').classList.remove('hidden');
    $('traceControls').classList.remove('hidden');
    syncOverlayUI();
    runDetect();
    render();
  }

  // ------------------------------------------------------------ トリミング・四隅合わせ
  function openCropEditor(corners, auto) {
    if (!S.traceSrc) return toast('先に画像を選んでください');
    let src = SS.trace.toCanvas(S.traceSrc.img, 2400, S.traceSrc.rot);
    const prepScale = () => {
      // findFrame は解析用（縮小）画像の座標なので、元画像の座標に直す
      const pw = S.trace && S.trace.prep ? S.trace.prep.w : src.width;
      return src.width / pw;
    };
    let pts;
    if (corners) { const k = prepScale(); pts = corners.map(p => ({ x: p.x * k, y: p.y * k })); }
    else pts = [{ x: 0, y: 0 }, { x: src.width, y: 0 }, { x: src.width, y: src.height }, { x: 0, y: src.height }];
    const st = doc().stage;
    openModal(`
      <h2>✂ トリミング・四隅合わせ</h2>
      <p class="hint">${auto ? '<b>ステージの枠を自動で見つけました。</b>' : ''}青い4つの点を、ステージの<b>四隅</b>に合わせてください（ドラッグで動かせます）。斜めから撮った写真も、まっすぐに直します。</p>
      <div class="crop-wrap" id="cropWrap"><canvas id="cropCanvas"></canvas><svg id="cropSvg"></svg></div>
      <div class="btn-row">
        <button class="btn" id="cropAuto">🔍 枠を自動で探す</button>
        <button class="btn" id="cropAll">画像全体</button>
        <button class="btn" id="cropRot">⟳ 90°回転</button>
      </div>
      <div class="row2">
        <label class="field">この枠の実際の幅(m)<input id="cropW" type="number" step="0.5" min="3" max="60" value="${st.w / 100}"></label>
        <label class="field">奥行(m)<input id="cropD" type="number" step="0.5" min="2" max="50" value="${st.d / 100}"></label>
      </div>
      <p class="hint small">枠の中がステージ全体になり、ステージの大きさも上の数字に変わります。</p>
      <div class="btn-row"><button class="btn primary" id="cropOk">この範囲で決定</button><button class="btn" id="cropCancel">やめる</button></div>
    `);
    const cv = $('cropCanvas'), svgEl = $('cropSvg');
    const draw = () => {
      cv.width = src.width; cv.height = src.height;
      cv.getContext('2d').drawImage(src, 0, 0);
      svgEl.setAttribute('viewBox', `0 0 ${src.width} ${src.height}`);
      const hr = Math.max(src.width, src.height) / 45;
      const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
      svgEl.innerHTML = `<path d="M0 0H${src.width}V${src.height}H0Z M${pts.map(p => `${p.x} ${p.y}`).join(' L')}Z" fill="rgba(0,0,0,.45)" fill-rule="evenodd"/>
        <polygon points="${poly}" fill="none" stroke="#4d8dff" stroke-width="${hr / 4}"/>` +
        pts.map((p, i) => `<circle class="crop-handle" data-i="${i}" cx="${p.x}" cy="${p.y}" r="${hr}" fill="rgba(77,141,255,.35)" stroke="#fff" stroke-width="${hr / 5}"/>`).join('');
    };
    draw();
    let dragI = -1;
    const toImg = e => {
      const r = svgEl.getBoundingClientRect();
      return { x: Math.max(0, Math.min(src.width, (e.clientX - r.left) / r.width * src.width)), y: Math.max(0, Math.min(src.height, (e.clientY - r.top) / r.height * src.height)) };
    };
    svgEl.addEventListener('pointerdown', e => {
      const p = toImg(e);
      // いちばん近い点をつかむ（点を正確に押さなくてもよい）
      let bi = 0, bd = Infinity;
      pts.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; bi = i; } });
      dragI = bi;
      svgEl.setPointerCapture(e.pointerId);
      pts[dragI] = p; draw();
    });
    svgEl.addEventListener('pointermove', e => { if (dragI >= 0) { pts[dragI] = toImg(e); draw(); } });
    svgEl.addEventListener('pointerup', () => { dragI = -1; });
    $('cropAuto').onclick = () => {
      const tmp = SS.trace.prepare(src);
      const f = SS.trace.findFrame(tmp);
      if (!f) return toast('枠が見つかりませんでした。点を手で動かしてください');
      const k = src.width / tmp.w;
      pts = f.map(p => ({ x: p.x * k, y: p.y * k })); draw();
    };
    $('cropAll').onclick = () => { pts = [{ x: 0, y: 0 }, { x: src.width, y: 0 }, { x: src.width, y: src.height }, { x: 0, y: src.height }]; draw(); };
    $('cropRot').onclick = () => {
      S.traceSrc.rot = (S.traceSrc.rot + 1) % 4;
      src = SS.trace.toCanvas(S.traceSrc.img, 2400, S.traceSrc.rot);
      pts = [{ x: 0, y: 0 }, { x: src.width, y: 0 }, { x: src.width, y: src.height }, { x: 0, y: src.height }];
      draw();
    };
    $('cropCancel').onclick = () => { closeModal(); openPanel('leftPanel'); };
    $('cropOk').onclick = () => {
      const W = +$('cropW').value, D = +$('cropD').value;
      if (!(W >= 3 && D >= 2)) return toast('幅と奥行を入れてください');
      pushHistory();
      doc().stage.w = Math.round(W * 100); doc().stage.d = Math.round(D * 100);
      // 出力の大きさ：実際の縦横比に合わせる
      const outW = Math.min(2000, Math.round(Math.max(dist(pts[0], pts[1]), dist(pts[3], pts[2]))));
      const outH = Math.max(50, Math.round(outW * D / W));
      const warped = SS.trace.warp(src, pts, outW, outH);
      closeModal();
      setTraceImage(warped, true);
      renderAll();
      fitView();
      openPanel('leftPanel');
      toast('ステージの枠に合わせました。赤い丸（見つかった椅子）を確認して「取り込む」を押してください');
    };
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  $('btnCrop').onclick = () => openCropEditor(null, false);

  function runDetect() {
    if (!S.trace) return;
    const sens = +$('traceSens').value;
    const size = +$('traceSize').value;
    $('sensVal').textContent = sens === 0 ? '標準' : sens > 0 ? '+' + sens : sens;
    $('sizeVal').textContent = size ? size + 'px' : '自動';
    const res = SS.trace.detect(S.trace.prep, { sens, size, split: $('traceSplit').checked, boxes: $('traceBoxes').checked });
    S.trace.result = res;
    SS.trace.drawPreview($('tracePreview'), S.trace.prep, res);
    $('traceStatus').textContent = `椅子を ${res.seats.length} 個見つけました` + (res.boxes.length ? `／大きな図形 ${res.boxes.length} 個` : '') + (res.seats.length ? '（赤い丸）' : '');
    if (!size) $('traceSize').value = 0;
  }
  let detectTimer = null;
  ['traceSens', 'traceSize'].forEach(id => $(id).addEventListener('input', () => { clearTimeout(detectTimer); detectTimer = setTimeout(runDetect, 120); }));
  ['traceSplit', 'traceBoxes'].forEach(id => $(id).addEventListener('change', runDetect));

  $('btnTraceApply').onclick = async () => {
    if (!S.trace || !S.trace.result) return;
    const res = S.trace.result;
    if (!res.seats.length && !res.boxes.length) return toast('椅子が見つかっていません。感度や大きさを調整してください');
    const btn = $('btnTraceApply');
    btn.disabled = true;
    const seats = res.seats.map(p => Object.assign({}, p));
    const boxes = res.boxes.map(b => Object.assign({}, b));
    try {
      if ($('traceOcr').checked) {
        $('traceStatus').textContent = '文字を読み取っています… 0%';
        try {
          const words = await SS.trace.ocr(S.trace.prep, p => { $('traceStatus').textContent = `文字を読み取っています… ${Math.round(p * 100)}%`; });
          SS.trace.assignWords(seats, boxes, words, res.s0);
        } catch (err) {
          toast(err.message || '文字を読み取れませんでした');
        }
      }
      pushHistory();
      applyTrace(seats, boxes, res);
      $('traceStatus').textContent = `${seats.length}人分の席を取り込みました`;
    } finally {
      btn.disabled = false;
    }
  };

  function applyTrace(seats, boxes, res) {
    const d = doc();
    const prep = S.trace.prep;
    const u = d.underlay;
    let toW;
    let center = null;
    if (S.trace.framed) {
      // 枠＝ステージなので、そのまま当てはめる
      const kx = d.stage.w / prep.w, ky = d.stage.d / prep.h;
      toW = p => ({ x: p.x * kx, y: p.y * ky });
      const spacing = SS.trace.typicalSpacing(seats) || res.s0 * 1.5;
      const cImg = SS.trace.estimateCenter(seats, spacing);
      if (cImg) {
        for (let i = seats.length - 1; i >= 0; i--) if (Math.hypot(seats[i].x - cImg.x, seats[i].y - cImg.y) < spacing * 0.8) seats.splice(i, 1);
        center = toW(cImg);
        center.y = Math.min(center.y, d.stage.d - 50);
      }
      u.x = 0; u.y = 0; u.w = d.stage.w; u.h = d.stage.d;
    } else if (u.aligned || !$('traceScale').checked) {
      // 舞台図を重ねて合わせてあるときは、その位置のまま取り込む（切り取った外側の椅子は使わない）
      const cr = SS.render.underlayCrop(u);
      const inCrop = p => p.x / prep.w >= cr.l && p.x / prep.w <= cr.r && p.y / prep.h >= cr.t && p.y / prep.h <= cr.b;
      for (let i = seats.length - 1; i >= 0; i--) if (!inCrop(seats[i])) seats.splice(i, 1);
      for (let i = boxes.length - 1; i >= 0; i--) if (!inCrop(boxes[i])) boxes.splice(i, 1);
      toW = p => SS.render.underlayToWorld(u, p.x / prep.w, p.y / prep.h);
    } else if ($('traceScale').checked && seats.length >= 3) {
      const spacing = SS.trace.typicalSpacing(seats) || res.s0 * 1.5;
      const cm = 75 / spacing; // となりの席との間隔を約75cmとみなす
      const all = seats.concat(boxes);
      const xs = all.map(p => p.x), ys = all.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      let cImg = SS.trace.estimateCenter(seats, spacing);
      if (!cImg || cImg.y - maxY > spacing * 8 || cImg.y < minY) cImg = { x: (minX + maxX) / 2, y: maxY + spacing * 2 };
      else {
        // 指揮台の四角を椅子と見まちがえたものは消す
        for (let i = seats.length - 1; i >= 0; i--) if (Math.hypot(seats[i].x - cImg.x, seats[i].y - cImg.y) < spacing * 0.8) seats.splice(i, 1);
      }
      const bw = (maxX - minX) * cm, bh = (Math.max(maxY, cImg.y) - minY) * cm;
      const W = Math.max(800, Math.ceil((bw + 300) / 100) * 100);
      const D = Math.max(600, Math.ceil((bh + 280) / 100) * 100);
      d.stage.w = W; d.stage.d = D;
      if (d.stage.bw) d.stage.bw = Math.min(d.stage.bw, Math.round(W * 0.7));
      const ox = W / 2 - ((minX + maxX) / 2) * cm;
      const oy = 150 - minY * cm;
      toW = p => ({ x: ox + p.x * cm, y: oy + p.y * cm });
      center = toW(cImg);
      center.y = Math.min(center.y, D - 60);
      u.x = ox; u.y = oy; u.w = prep.w * cm; u.h = prep.h * cm; u.rot = 0;
    } else {
      toW = p => SS.render.underlayToWorld(u, p.x / prep.w, p.y / prep.h);
    }
    const scale = u.w / prep.w;
    if ($('traceReplace').checked) d.items = d.items.filter(it => it.type === 'podium');
    let podium = d.items.find(it => it.type === 'podium');
    if (center) {
      if (podium) { podium.x = center.x; podium.y = center.y; } else { podium = { id: newId(), type: 'podium', x: center.x, y: center.y, rot: 0 }; d.items.push(podium); }
    }
    const c = conductor();
    const newPlayers = [];
    seats.forEach(p => {
      const q = toW(p);
      const it = { id: newId(), type: 'player', x: q.x, y: q.y, rot: 0, label: (p.label || '').slice(0, 12), name: (p.name || '').slice(0, 20) };
      it.rot = normAngle(G.faceAngle(it, c));
      d.items.push(it);
      newPlayers.push(it);
    });
    boxes.forEach(b => {
      const q = toW(b);
      d.items.push({ id: newId(), type: 'box', x: q.x, y: q.y, rot: 0, w: Math.round(b.w * scale), h: Math.round(b.h * scale), label: (b.label || '').slice(0, 12) });
    });
    if ($('traceTidy').checked && newPlayers.length >= 3) {
      // となり同士でつながる「列」ごとに、きれいに並んでいる列だけを整える（位置は下絵からずらさない）
      const sp = SS.trace.typicalSpacing(newPlayers) || 75;
      let n = 0;
      SS.trace.chainRows(newPlayers, sp).forEach(row => {
        if (row.length < 4) return;
        const rs = row.map(p => G.polar(p, c).r), ys = row.map(p => p.y);
        const sd = a => { const m = G.mean(a); return Math.sqrt(G.mean(a.map(v => (v - m) ** 2))); };
        const o = { symmetric: false, evenRows: false, minGap: opts().seatR * 2 + 14 };
        if (sd(rs) < 22 && sd(rs) <= sd(ys)) { G.tidyArc(row, c, o); n++; }
        else if (sd(ys) < 18) { G.tidyLine(row, c, o); n++; }
      });
      G.fixOverlap(newPlayers, opts().seatR * 2 + 8);
    }
    S.sel = new Set(newPlayers.map(it => it.id));
    closePanels();
    renderAll();
    fitView();
    toast(`${newPlayers.length}人分の席を取り込みました。パート名は右の「選択中」やまとめて割り当てで入れられます`);
  }

  $('traceFile').addEventListener('change', e => { handleImageFile(e.target.files[0]); e.target.value = ''; });
  $('underlayOpacity').addEventListener('input', e => { if (doc().underlay) { doc().underlay.opacity = +e.target.value / 100; render(); } });
  $('underlayEdit').addEventListener('change', e => { S.underlayEdit = e.target.checked; if (S.underlayEdit) pushHistory(); render(); if (S.underlayEdit) { closePanels(); toast('図をドラッグで移動、ホイール（2本指）で拡大縮小できます。終わったらチェックを外してください'); } });
  $('btnUnderlayRemove').onclick = () => {
    pushHistory();
    doc().underlay = null;
    S.trace = null; S.traceSrc = null; S.pdfData = null;
    S.underlayEdit = false;
    $('underlayEdit').checked = false;
    $('traceControls').classList.add('hidden');
    $('overlayControls').classList.add('hidden');
    if (S.pick) endPick();
    render();
  };

  // ドラッグ＆ドロップ・貼り付け
  const wrap = $('stageWrap');
  let dragDepth = 0;
  document.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; $('dropHint').classList.add('show'); } });
  document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dropHint').classList.remove('show'); });
  document.addEventListener('dragover', e => { e.preventDefault(); });
  document.addEventListener('drop', e => {
    e.preventDefault();
    const itemType = e.dataTransfer && e.dataTransfer.getData('text/x-stage-item');
    if (itemType) { setPlacing(null); addItem(itemType, null, toWorld(e.clientX, e.clientY)); return; }
    dragDepth = 0;
    $('dropHint').classList.remove('show');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    if (/json$/i.test(f.name) || f.type === 'application/json') loadJSONFile(f);
    else handleImageFile(f);
  });
  document.addEventListener('paste', e => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/INPUT|TEXTAREA/.test(tag)) return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) { e.preventDefault(); handleImageFile(it.getAsFile()); return; }
    }
  });
  void wrap;

  // ------------------------------------------------------------ 保存・開く
  function loadDoc(d, msg) {
    pushHistory();
    S.doc = normalize(d);
    S.sel.clear();
    renderAll();
    renderSteppers();
    updateHallNote();
    fitView();
    if (msg) toast(msg);
  }

  function loadJSONFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || !Array.isArray(d.items)) throw new Error();
        loadDoc(d, '読み込みました');
        closeModal();
      } catch (e) { toast('このファイルは読み込めませんでした'); }
    };
    r.readAsText(file);
  }

  $('btnFile').onclick = () => {
    const list = SS.render.savedList();
    const fmt = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
    openModal(`
      <h2>保存・開く</h2>
      <p class="hint">作業中の内容は自動でこのブラウザに保存されています。名前を付けて保存しておくと、いくつもの配置図を切り替えられます。</p>
      <div class="btn-row">
        <input id="saveName" style="flex:1;min-width:160px;padding:7px;border:1px solid #dde2ea;border-radius:7px;font:inherit" value="${SS.esc(doc().title || '配置図')}">
        <button class="btn primary" id="saveHere">名前を付けて保存</button>
      </div>
      <h3 style="font-size:14px">保存した配置図</h3>
      ${list.length ? `<ul class="saved-list">${list.map(x => `<li><span>${SS.esc(x.name)}<br><small>${fmt(x.date)}・${x.doc.items.filter(i => i.type === 'player').length}人</small></span><button class="btn" data-load="${x.id}">開く</button><button class="btn danger" data-del="${x.id}">削除</button></li>`).join('')}</ul>` : '<p class="hint">まだありません。</p>'}
      <h3 style="font-size:14px">ファイル</h3>
      <p class="hint">ファイルにしておくと、ほかのパソコンやスマホでも開けます。</p>
      <div class="btn-row">
        <button class="btn" id="saveFile">⬇ ファイルに保存</button>
        <label class="btn filebtn">⬆ ファイルを開く<input type="file" id="openFile" accept=".json,application/json" hidden></label>
      </div>
      <hr>
      <button class="btn danger" id="newDoc">新しく白紙から作る</button>
    `);
    $('saveHere').onclick = () => {
      const name = $('saveName').value.trim() || '配置図';
      try { SS.render.saveToList(name, doc()); toast('「' + name + '」を保存しました'); closeModal(); } catch (e) { toast('保存できませんでした（容量がいっぱいです）'); }
    };
    document.querySelectorAll('[data-load]').forEach(b => {
      b.onclick = () => { const x = SS.render.savedList().find(s => s.id === b.getAttribute('data-load')); if (x) { loadDoc(x.doc, '「' + x.name + '」を開きました'); closeModal(); } };
    });
    document.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        const id = b.getAttribute('data-del');
        askConfirm('この配置図を削除しますか？', '削除する', () => { try { SS.render.deleteFromList(id); } catch (e) { /* ignore */ } $('btnFile').onclick(); });
      };
    });
    $('saveFile').onclick = () => {
      const blob = new Blob([JSON.stringify(doc(), null, 1)], { type: 'application/json' });
      SS.render.download(blob, SS.render.safeName(doc().title || '配置図') + '.stage.json');
    };
    $('openFile').onchange = e => { if (e.target.files[0]) loadJSONFile(e.target.files[0]); };
    $('newDoc').onclick = () => { closeModal(); loadTemplate(SS.TEMPLATES.find(t => t.id === 'blank')); };
  };

  // ------------------------------------------------------------ 画像・印刷・共有
  $('btnExport').onclick = () => {
    openModal(`
      <h2>画像として保存</h2>
      <label class="check"><input type="checkbox" id="exLegend" checked> 編成表（人数）を入れる</label>
      <label class="check"><input type="checkbox" id="exGrid"> 方眼を入れる</label>
      ${doc().underlay ? '<label class="check"><input type="checkbox" id="exUnderlay"> 舞台図（下絵）を重ねて入れる</label><label class="check"><input type="checkbox" id="exUnderlayAll" checked> 舞台図がはみ出す部分まで紙を広げる</label>' : ''}
      <label class="field" style="margin-top:10px">画質
        <select id="exScale"><option value="1">ふつう</option><option value="2" selected>きれい</option><option value="3">とてもきれい（印刷向け）</option></select>
      </label>
      <div class="btn-row">
        <button class="btn primary" id="exPng">🖼 PNG画像で保存</button>
        <button class="btn" id="exSvg">SVG（拡大しても荒れない形式）</button>
      </div>
      <p class="hint small">スマホでは保存した画像が「ファイル」アプリや「ダウンロード」に入ります。</p>
      <div id="exResult"></div>
    `);
    const build = () => SS.render.fullSVG(doc(), renderOpts(), conductor(), {
      legend: $('exLegend').checked, grid: $('exGrid').checked, underlay: $('exUnderlay') && $('exUnderlay').checked, underlayAll: $('exUnderlayAll') && $('exUnderlayAll').checked, pxPerCm: +$('exScale').value,
    });
    $('exPng').onclick = async () => {
      try {
        const blob = await SS.render.svgToPng(build());
        SS.render.download(blob, SS.render.safeName(doc().title || '配置図') + '.png');
        // ダウンロードできない環境（アプリ内ブラウザなど）でも保存できるよう画像を表示する
        const url = URL.createObjectURL(blob);
        $('exResult').innerHTML = `<p class="hint">保存されない場合は、下の画像を<b>長押し</b>（パソコンは右クリック）して保存してください。</p><img src="${url}" alt="配置図" style="width:100%;border:1px solid #dde2ea;border-radius:8px">`;
        toast('画像を作りました');
      } catch (e) { toast(e.message); }
    };
    $('exSvg').onclick = () => {
      SS.render.download(new Blob([build()], { type: 'image/svg+xml' }), SS.render.safeName(doc().title || '配置図') + '.svg');
    };
  };

  $('btnPrint').onclick = () => {
    $('printArea').innerHTML = SS.render.fullSVG(doc(), renderOpts(), conductor(), { legend: true, grid: false, underlay: false, pxPerCm: 1 });
    setTimeout(() => window.print(), 50);
  };

  $('btnShare').onclick = async () => {
    try {
      const code = await SS.render.encodeShare(doc());
      const url = location.origin + location.pathname + '#d=' + code;
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch (e) { /* ignore */ }
      openModal(`
        <h2>共有リンク</h2>
        <p class="hint">${copied ? '✅ リンクをコピーしました。' : ''}このリンクを開くと、同じ配置図が表示されます（下絵の画像は含まれません）。LINEやメールで送れます。</p>
        <textarea readonly rows="4" style="width:100%;font-size:12px" onclick="this.select()">${SS.esc(url)}</textarea>
        <p class="hint small">長さ: ${url.length}文字</p>
      `);
    } catch (e) {
      toast('リンクを作れませんでした');
    }
  };

  $('btnHelp').onclick = showHelp;
  function showHelp() {
    openModal(`
      <h2>🎼 使い方</h2>
      <ol>
        <li><b>🤖 AIにお願いする</b>：「フルート6人、打楽器は下手、ひな壇2段、ミューザで」のように書いて押すと、その通りに並べ直します。claude.ai で開いたときは Claude が文章を読んで考えます（使うときに確認が出ます）。ダウンロード版では、よくある言い方を読み取って並べます。</li>
        <li><b>弧・円形の舞台</b>：「設定」の舞台の形で「前が弧」「円形・楕円形」を選べます。◠ のつまみで弧のふくらみを変えられます。サントリーホール・ミューザ・みなとみらいもホール一覧にあります（寸法は目安なので図面で確認を）。</li>
        <li><b>かんたん編成</b>：ホールを選んで、パートの人数を▲▼で変えるだけ。<b>すぐに自動で並べ直します</b>。ステージは<b>音響反射板を置いたときの形</b>（前が広く奥がせまい台形）になり、はみ出さないように詰めて並べます。</li>
        <li><b>ひな壇</b>：段数と<b>平台の置き方</b>（3×6の横置き・縦置き、4×6、6×6…を図で選ぶ）を決めると、後ろの列が<b>ひな壇の上にまっすぐ</b>並びます。置いた平台を選んでも、図から置き方を変えられます。高さは7寸・1尺4寸・2尺1寸…から選べ、必要な平台・箱馬の数は「編成表」に出ます。</li>
        <li><b>打楽器</b>：「打楽器の場所」で<b>舞台奥・ひな壇の最上段・下手側・最上段＋下手</b>を選べます。「🥁 打楽器を整列」でその場所に並べ直せます。</li>
        <li><b>舞台の大きさ</b>：舞台の角と前の縁にある <b>↔ ↕ の丸いつまみ</b>をドラッグすると、前の幅・奥の幅・奥行をその場で変えられます（10cm単位）。自動配置なら、すぐに並べ直します。</li>
        <li><b>並び方</b>：かんたん編成の「並び方」で、<b>標準・Cl下手/Sax上手・昔ながら・ドイツ式</b>を選べます。「ひな形」にも、コンクールA（55人）や小編成などの型があります。</li>
        <li><b>選び方</b>：右上の <b>⬚</b> で四角く囲んで、<b>➰</b> で自由に囲んで、まとめて選べます。<b>ひな壇（平台）は選ばれません</b>（平台だけを囲んだときは平台を選びます）。</li>
        <li><b>弧のカーブ</b>：「整える」のスライダーで、床の扇形を<b>ゆるい弧〜まっすぐ</b>に変えられます。右端に戻すと元の扇形です。</li>
        <li><b>舞台図を重ねる</b>：「トレース」タブで、ホールの<b>舞台図（PDF・画像）</b>を読み込むと配置図に重なります。「⤢ 舞台の前の角に合わせる」で図の前の左右の角をタップすると、<b>大きさ・向き・位置が一度に</b>合います。PDFなら縮尺（1/100など）で実寸にもできます。図が大きくはみ出しても大丈夫。「✂ 使う範囲を切り取る」「🔭 図の全体を表示」で調整できます。</li>
        <li><b>方眼・コンクール用の図</b>：「設定」で方眼を <b>1.82m（1間）</b> にしたり、奏者を<b>椅子○・譜面台×</b>のコンクール用の表し方にしたりできます。</li>
        <li><b>📏 寸法の表示</b>：舞台の<b>前の幅・奥の幅・奥行</b>、指揮台〜舞台際が常に出ます。平台などを選んだり動かしたりすると、<b>指揮台まで・舞台際まで・奥まで・下手／上手まで</b>の距離がその場で出ます（「設定」で消せます）。</li>
        <li><b>低音を上手の外側に・ホルンのボックス</b>：「一括作成」タブの「配置のくふう」のチェックで、B.Cl・ユーフォ・チューバ・弦バスを<b>上手側の外側の弧</b>にまとめて置きます（弦バスがいちばん外）。ホルンを2人ずつ前後に並べるボックス型もここで選べます。</li>
        <li><b>ひな壇の幅</b>：自動ではすべての段が同じ横幅になります。手で置いたときは「▤ ひな壇の幅をそろえる」。</li>
        <li><b>🧊 3D</b>：客席から・指揮者から・<b>奏者の席に座った目線</b>で、立体で見られます（奏者をタップするとその席に座れます）。</li>
        <li><b>ひな形</b>：左の「ひな形」から近い編成を選ぶこともできます。</li>
        <li><b>動かす</b>：奏者や楽器をドラッグ。ほかの人と位置がそろうと<b>ピンクのガイド線</b>が出て、ぴったり合います。何もないところをドラッグすると<b>範囲でまとめて選択</b>できます。</li>
        <li><b>選ぶと操作バーが出ます</b>：✏️名前・パート入力／回転／指揮者の方を向く／複製／削除。<b>2回タップ</b>でその列をまとめて選択。</li>
        <li><b>部品を足す</b>：「部品」で押してから、置きたい場所をタップ。楽器は実寸（cm）です。</li>
        <li><b>✨ きれいに整える</b>：ざっくり置いたあと押すと、列を自動で見つけて<b>扇形（または横一列）・等間隔・指揮者向き</b>にそろえます。</li>
        <li><b>まとめて作る</b>：「一括作成」で「8,10,12」のように人数を入れると扇形の席が一気にできます。パート名や名前もまとめて入れられます。</li>
        <li><b>トレース</b>：いま使っている配置図の画像（写真・スクショ）を読み込むと、<b>ステージの枠を自動で見つけて</b>四隅合わせ（トリミング・ゆがみ補正）をし、椅子の位置を自動で読み取ります。</li>
        <li><b>保存・共有</b>：上のボタンから画像保存・印刷・共有リンクが作れます。作業中の内容は自動で保存されます。</li>
      </ol>
      <h3 style="font-size:14px">便利なキー（パソコン）</h3>
      <ul class="hint">
        <li>Ctrl+Z 元に戻す／Ctrl+Y やり直す／Delete 削除</li>
        <li>Ctrl+C / Ctrl+V コピー・貼り付け／Ctrl+D 複製</li>
        <li>矢印キーで少しずつ移動（Shiftで大きく）／R で15°回転</li>
        <li>スペースを押しながらドラッグで画面移動、ホイールで拡大縮小</li>
      </ul>
      <button class="btn primary wide" onclick="document.getElementById('modalClose').click()">はじめる</button>
    `);
  }

  // ------------------------------------------------------------ かんたん編成（人数を変えると自動で並べる）
  let lastAutoPush = 0;
  function ens() {
    if (!doc().ensemble) doc().ensemble = SS.auto.defaultState('band');
    const e = doc().ensemble;
    if (!e.hina) e.hina = SS.auto.defaultState(e.type).hina;
    return e;
  }
  function applyAuto(opts2) {
    opts2 = opts2 || {};
    const st = ens();
    if (!opts2.noHistory && Date.now() - lastAutoPush > 1500) pushHistory();
    lastAutoPush = Date.now();
    const d = doc();
    // 今の名前を、パートごとに覚えておく
    const names = {};
    d.items.filter(it => it.type === 'player' && it.name).forEach(it => { (names[it.label] = names[it.label] || []).push(it.name); });
    const hadAuto = d.items.some(it => it.auto);
    const keepTypes = new Set(['text', 'box', 'circle', 'mic', 'amp']);
    d.items = d.items.filter(it => (hadAuto ? !it.auto : keepTypes.has(it.type)));
    const r = SS.auto.build(st, d.stage);
    opts().arcCurve = 1; opts().arcBase = null; syncArcCurve();
    r.items.forEach(it => {
      it.id = newId();
      if (it.type === 'player' && names[it.label] && names[it.label].length) it.name = names[it.label].shift();
      d.items.push(it);
    });
    S.sel.clear();
    renderAll();
    if (opts2.fit) fitView();
    if (opts2.quiet) return;
    if (!r.fits) toast('このステージには入りきりません。ひな壇の段数か人数を減らすか、打楽器を別の場所に置いてください（はみ出した人は端に寄せています）');
    else if (r.percMoved) toast('打楽器が入りきらないので、打楽器の場所を「' + $('percPlace').querySelector(`option[value="${r.percMoved}"]`).textContent + '」にして並べました');
    else if (r.slim) toast('奥行が足りないので、ひな壇を 4×6尺1枚分（121cm）に詰めました');
    else if (r.lowFallback) toast('上手の外側に場所がないので、低音はそれぞれの列に入れました');
  }

  const HOLD_DELAY = 380, HOLD_REPEAT = 110;
  function renderSteppers() {
    const st = ens();
    const e = SS.auto.ENSEMBLES[st.type];
    document.querySelectorAll('#ensType [data-ens]').forEach(b => b.classList.toggle('on', b.getAttribute('data-ens') === st.type));
    $('ensAntiWrap').hidden = st.type === 'band';
    $('ensAnti').checked = !!st.antiphonal;
    $('ensPerc').checked = st.percInst !== false;
    $('ensPerc').parentElement.hidden = st.type === 'strings';
    let total = 0;
    $('partSteppers').innerHTML = e.parts.map(([k]) => {
      const n = st.counts[k] || 0; total += n;
      return `<div class="stepper${n ? '' : ' zero'}" data-part="${k}"><span class="nm"><i style="background:${SS.partGroup(k).color}"></i>${SS.esc(k)}</span>
        <button data-d="-1" aria-label="${SS.esc(k)}を1人減らす">▼</button><b>${n}</b><button data-d="1" aria-label="${SS.esc(k)}を1人増やす">▲</button></div>`;
    }).join('');
    $('ensTotal').textContent = `合計 ${total} 人`;
    // ひな壇
    $('ensHornBox').checked = !!st.hornBox;
    $('ensLowOuter').checked = !!st.lowOuter;
    $('lowOuterWrap').hidden = st.type !== 'band';
    $('bandLayoutWrap').hidden = st.type !== 'band';
    if (!$('bandLayout').options.length) $('bandLayout').innerHTML = Object.keys(SS.auto.BAND_LAYOUTS).map(k => `<option value="${k}">${SS.esc(SS.auto.BAND_LAYOUTS[k].name)}</option>`).join('');
    $('bandLayout').value = st.layout || 'std';
    $('percPlace').value = st.percPlace || 'back';
    $('percPlaceWrap').hidden = st.type === 'strings';
    const H = st.hina;
    document.querySelectorAll('#hinaSteps [data-steps]').forEach(b => b.classList.toggle('on', +b.getAttribute('data-steps') === (H.steps || 0)));
    const cur = SS.hinaTypeOf(H);
    $('hinaTypes').innerHTML = SS.HINA_TYPES.map(t => `<button class="hina-type${cur && cur.id === t.id ? ' on' : ''}" data-ht="${t.id}" title="${SS.esc(t.hint)}">${SS.hinaTypeSVG(t)}<b>${SS.esc(t.name)}</b><small>奥行${Math.round(SS.hinaTypeDepth(t))}cm</small></button>`).join('');
    $('hinaTypes').querySelectorAll('[data-ht]').forEach(b => {
      b.onclick = () => {
        const t = SS.HINA_TYPES.find(x => x.id === b.getAttribute('data-ht'));
        Object.assign(ens().hina, { panel: t.panel, orient: t.orient, deep: t.deep });
        renderSteppers();
        applyAuto();
      };
    });
    const std = [21.2, 42.4, 63.6, 84.8];
    $('hinaHeights').innerHTML = Array.from({ length: H.steps || 0 }, (_, i) => {
      const v = (H.heights && H.heights[i]) || std[i];
      return `<label><b>${i + 1}段</b><select data-hstep="${i}">${SS.RISER_HEIGHTS.map(h => `<option value="${h.v}"${Math.abs(h.v - v) < 0.6 ? ' selected' : ''}>${h.name}：${h.how}</option>`).join('')}</select></label>`;
    }).join('');
    $('hinaHeights').querySelectorAll('select').forEach(sel => {
      sel.onchange = () => {
        const i = +sel.getAttribute('data-hstep');
        const hh = ens().hina;
        hh.heights = (hh.heights || std.slice()).slice();
        hh.heights[i] = +sel.value;
        applyAuto();
      };
    });
    $('partSteppers').querySelectorAll('.stepper button').forEach(b => {
      const k = b.parentElement.getAttribute('data-part');
      const d = +b.getAttribute('data-d');
      let timer = null;
      const step = () => {
        const st2 = ens();
        const v = Math.max(0, Math.min(40, (st2.counts[k] || 0) + d));
        if (v === (st2.counts[k] || 0)) return;
        st2.counts[k] = v;
        const box = b.parentElement;
        box.querySelector('b').textContent = v;
        box.classList.toggle('zero', !v);
        $('ensTotal').textContent = `合計 ${Object.values(st2.counts).reduce((a, x) => a + x, 0)} 人`;
        applyAuto();
      };
      // 押しっぱなしで連続して増減
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        step();
        timer = setTimeout(function rpt() { step(); timer = setTimeout(rpt, HOLD_REPEAT); }, HOLD_DELAY);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(timer)));
    });
  }
  document.querySelectorAll('#ensType [data-ens]').forEach(b => {
    b.onclick = () => {
      const t = b.getAttribute('data-ens');
      const prev = ens();
      doc().ensemble = Object.assign(SS.auto.defaultState(t), { percInst: prev.percInst });
      renderSteppers();
      applyAuto({ fit: true });
    };
  });
  $('ensAnti').onchange = e => { ens().antiphonal = e.target.checked; applyAuto(); };
  // 配置のくふう（一括作成タブ）：自動配置のときだけ並べ直す。手で置いた配置は消さない
  const optAuto = () => {
    if (doc().items.some(it => it.auto)) applyAuto();
    else toast('「かんたん編成」で並べるときに使われます');
  };
  $('ensHornBox').onchange = e => { ens().hornBox = e.target.checked; optAuto(); };
  $('ensLowOuter').onchange = e => { ens().lowOuter = e.target.checked; optAuto(); };
  $('bandLayout').onchange = e => { ens().layout = e.target.value; applyAuto(); };
  $('percPlace').onchange = e => { ens().percPlace = e.target.value; applyAuto(); };
  document.querySelectorAll('#hinaSteps [data-steps]').forEach(b => {
    b.onclick = () => { ens().hina.steps = +b.getAttribute('data-steps'); renderSteppers(); applyAuto(); };
  });
  $('ensPerc').onchange = e => { ens().percInst = e.target.checked; applyAuto(); };

  // ------------------------------------------------------------ ホール（ステージ寸法）
  function buildHallSelect() {
    const sel = $('hallSelect');
    const groups = {};
    SS.HALLS.forEach((h, i) => { (groups[h.pref] = groups[h.pref] || []).push(`<option value="${i}">${h.q === 'est' || h.q === 'approx' ? '△ ' : '◎ '}${SS.esc(h.name)}（${h.fw}×${h.d}m${h.shape === 'arc' ? '・前が弧' : ''}）</option>`); });
    sel.innerHTML = '<option value="">いまの大きさのまま／手動で設定</option>' +
      Object.keys(groups).map(g => `<optgroup label="${g === '東京' ? '東京都' : g + '県'}">${groups[g].join('')}</optgroup>`).join('');
    sel.onchange = () => {
      const h = SS.HALLS[+sel.value];
      if (!h) { doc().hall = ''; updateHallNote(); return; }
      pushHistory();
      setHall(h);
    };
  }
  function setHall(h, quiet) {
    {
      doc().stage.w = Math.round(h.fw * 100);
      doc().stage.bw = Math.round(h.bw * 100);
      doc().stage.d = Math.round(h.d * 100);
      doc().stage.shape = h.shape || 'shell';
      if (h.sag != null) doc().stage.sag = Math.round(h.sag * 100); else delete doc().stage.sag;
      doc().hall = h.name;
      updateHallNote();
      if (doc().items.some(it => it.auto)) applyAuto({ fit: true });
      else { renderAll(); fitView(); }
      if (!quiet) toast(h.shape === 'arc' ? `${h.name}：幅${h.fw}m・奥行${h.d}m（前が弧）にしました。弧は ◠ のつまみで調整できます` : `${h.name}：反射板設置時 前幅${h.fw}m・奥幅${h.bw}m・奥行${h.d}m にしました`, true);
    }
  }
  function updateHallNote() {
    const h = SS.HALLS.find(x => x.name === doc().hall);
    const sel = $('hallSelect');
    sel.value = h ? String(SS.HALLS.indexOf(h)) : '';
    const st = doc().stage;
    $('hallNote').innerHTML = h
      ? `<b class="${h.q === 'est' || h.q === 'approx' ? 'q-est' : 'q-ok'}">${SS.HALL_Q[h.q]}</b><br>${h.shape === 'arc' ? `幅${h.fw}m／奥の幅${h.bw}m／奥行（中央）${h.d}m、前のふちは弧` : `反射板設置時：前の幅${h.fw}m／奥の幅${h.bw}m／奥行${h.d}m`}。${h.note ? SS.esc(h.note) + '。' : ''}<a href="${h.src}" target="_blank" rel="noopener">出典</a>。<br>本番前にホールの「反射板設置時の舞台図面」で確認し、違っていたら「設定」タブで直してください。`
      : `いまのステージ：前の幅${st.w / 100}m／奥の幅${Math.round(SS.render.backWidth(st)) / 100}m／奥行${st.d / 100}m`;
  }
  $('btn3d').onclick = () => SS.view3d.open(null);
  SS.app = { doc, conductor, players, toast, selected };

  // ------------------------------------------------------------ 起動
  async function init() {
    buildTemplates();
    buildPalette();
    buildHallSelect();
    setMode('select');
    let loaded = false;
    const m = /#d=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (m) {
      try {
        S.doc = normalize(await SS.render.decodeShare(m[1]));
        loaded = true;
        history.replaceState(null, '', location.pathname + location.search);
        setTimeout(() => toast('共有された配置図を開きました'), 300);
      } catch (e) { toast('共有リンクを読み込めませんでした'); }
    }
    if (!loaded) {
      try {
        const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null');
        if (saved && Array.isArray(saved.items)) { S.doc = normalize(saved); loaded = true; }
      } catch (e) { /* ignore */ }
    }
    if (!loaded) {
      const t = SS.TEMPLATES[0].make();
      S.doc = normalize({ stage: t.stage, items: t.items, ensemble: t.ensemble || null });
      try { if (!localStorage.getItem('stagesetting.helped')) { localStorage.setItem('stagesetting.helped', '1'); setTimeout(showHelp, 400); } } catch (e) { /* ignore */ }
    }
    if (S.doc.underlay) {
      $('overlayControls').classList.remove('hidden');
      syncOverlayUI();
    }
    renderAll();
    renderSteppers();
    updateHallNote();
    fitView();
    let resizeTimer = null;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitView, 150); });
  }
  // ------------------------------------------------------------ AIにお願いする
  let aiSample = null, aiCtl = null;
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('sample').then(fn => { aiSample = fn || null; }).catch(() => { aiSample = null; });
  }
  document.querySelectorAll('#aiExamples [data-ex]').forEach(b => { b.onclick = () => { $('aiText').value = b.getAttribute('data-ex'); $('aiText').focus(); }; });
  function aiShow(msg, err) {
    const o = $('aiOut');
    o.hidden = !msg; o.textContent = msg || ''; o.classList.toggle('err', !!err);
  }
  // AI・読み取りの結果（changes）を、かんたん編成の設定に反映して並べ直す
  function applyAIChanges(ch) {
    pushHistory();
    lastAutoPush = Date.now();
    if (ch.type && ch.type !== ens().type) doc().ensemble = Object.assign(SS.auto.defaultState(ch.type), { percInst: ens().percInst });
    const st = ens();
    if (ch.counts) Object.entries(ch.counts).forEach(([k, v]) => { if (k in st.counts) st.counts[k] = v; });
    ['layout', 'percPlace', 'percInst', 'hornBox', 'lowOuter', 'antiphonal'].forEach(k => { if (ch[k] !== undefined) st[k] = ch[k]; });
    if (ch.hina) {
      st.hina = Object.assign({}, st.hina, ch.hina);
      if (ch.hina.panel && !ch.hina.deep) {
        const t = SS.HINA_TYPES.find(x => x.panel === st.hina.panel && x.orient === (st.hina.orient || 'h'));
        if (t) st.hina.deep = t.deep;
      }
    }
    if (ch.stage) {
      const sg = doc().stage;
      const h = ch.stage.hall && SS.HALLS.find(x => x.name === ch.stage.hall);
      if (h) setHall(h, true);
      if (ch.stage.shape) { sg.shape = ch.stage.shape; if (['shell', 'arc', 'round'].includes(sg.shape) && !sg.bw) sg.bw = Math.round(sg.w * 0.7); }
      if (ch.stage.w) sg.w = Math.round(ch.stage.w * 100);
      if (ch.stage.d) sg.d = Math.round(ch.stage.d * 100);
      if (ch.stage.bw) sg.bw = Math.min(sg.w, Math.round(ch.stage.bw * 100));
      if (ch.stage.sag != null) sg.sag = Math.round(ch.stage.sag * 100);
      if (!h && (ch.stage.w || ch.stage.d || ch.stage.shape)) doc().hall = '';
    }
    renderSteppers();
    applyAuto({ fit: true, noHistory: true });
    updateHallNote();
    renderSettings();
  }
  function aiLocal(text, note) {
    const r = SS.assistant.parseLocal(text, ens());
    if (r.unknown) {
      aiShow((note ? note + '\n' : '') + '読み取れませんでした。「フルート6人」「打楽器は下手」「ひな壇2段」「ホルンをボックス型に」「ミューザで」のように書いてみてください。', true);
      return;
    }
    applyAIChanges(r.changes);
    aiShow((note ? note + '\n' : '') + '✔ ' + r.said.join('／'));
  }
  $('aiGo').onclick = async () => {
    const text = $('aiText').value.trim();
    if (!text) { $('aiText').focus(); return; }
    if (!aiSample) { aiLocal(text, 'かんたん読み取りで並べました（AIは claude.ai で開いたときに使えます）'); return; }
    aiCtl = new AbortController();
    $('aiGo').disabled = true; $('aiStop').hidden = false;
    aiShow('AIが考えています…（10〜60秒ほどかかることがあります）');
    try {
      const raw = await aiSample.json(SS.assistant.buildPrompt(text, ens(), doc().stage, doc().hall), { signal: aiCtl.signal, cache: false });
      const ch = SS.assistant.sanitize(raw);
      const keys = Object.keys(ch).filter(k => k !== 'message');
      if (!keys.length) { aiShow('🤖 ' + (ch.message || '変えるところが見つかりませんでした。もう少し具体的に書いてみてください。')); return; }
      applyAIChanges(ch);
      aiShow('🤖 ' + (ch.message || '要望に合わせて並べ直しました。') + '\n（気に入らなければ「戻す」で元に戻せます）');
    } catch (e) {
      const code = e && e.code;
      if (code === 'cancelled') aiShow('止めました。');
      else if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) { aiSample = null; aiLocal(text, 'AIが使えないので、かんたん読み取りで並べました'); }
      else if (code === 'rate_limited') aiShow('AIへのお願いが多すぎるようです。少し待ってからもう一度どうぞ。', true);
      else aiLocal(text, 'AIの答えを受け取れなかったので、かんたん読み取りで並べました');
    } finally {
      $('aiGo').disabled = false; $('aiStop').hidden = true; aiCtl = null;
    }
  };
  $('aiStop').onclick = () => { if (aiCtl) aiCtl.abort(); };

  init();
})(window.SS);
