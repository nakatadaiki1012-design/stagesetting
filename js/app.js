/* アプリ本体 */
(function (SS) {
  'use strict';
  const $ = id => document.getElementById(id);
  const G = SS.geo;
  const svg = $('canvas');
  const vp = $('viewport');
  const layerStage = $('layerStage'), layerUnderlay = $('layerUnderlay'), layerItems = $('layerItems'), layerOverlay = $('layerOverlay');
  const AUTOSAVE_KEY = 'stagesetting.autosave.v1';
  const SNAP = 25;

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
    return { showNames: true, showStands: true, showNumbers: false, grid: true, snap: false, colorBy: true, seatR: 24, figure: true, guides: true };
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
    return JSON.stringify({ title: d.title, subtitle: d.subtitle, stage: d.stage, items: d.items, options: d.options, ensemble: d.ensemble, hall: d.hall });
  }
  function pushHistory() {
    S.undo.push(snapshot());
    if (S.undo.length > 150) S.undo.shift();
    S.redo = [];
    updateUndoButtons();
  }
  function restore(snap) {
    const u = doc().underlay;
    S.doc = normalize(JSON.parse(snap));
    S.doc.underlay = u;
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
    return { showNames: o.showNames, showStands: o.showStands, showNumbers: o.showNumbers, colorBy: o.colorBy, seatR: o.seatR, grid: o.grid, figure: o.figure };
  }

  function render() {
    const d = doc();
    layerStage.innerHTML = SS.render.stageSVG(d, opts().grid);
    const u = d.underlay;
    layerUnderlay.innerHTML = u
      ? `<image href="${u.src}" x="${u.x}" y="${u.y}" width="${u.w}" height="${u.h}" opacity="${u.opacity}" preserveAspectRatio="none" pointer-events="none"/>` +
        (S.underlayEdit ? `<rect x="${u.x}" y="${u.y}" width="${u.w}" height="${u.h}" fill="none" stroke="#2f6fde" stroke-width="${3 / S.view.k}" stroke-dasharray="${10 / S.view.k}"/>` : '')
      : '';
    layerItems.innerHTML = SS.render.itemsSVG(d, renderOpts(), conductor(), true);
    renderOverlay();
    scheduleSave();
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
    if (drag && drag.guides) {
      const gs = `stroke="#e8467c" stroke-width="${1.6 / k}" stroke-dasharray="${8 / k} ${5 / k}" fill="none"`;
      drag.guides.forEach(g => {
        if (g.kind === 'x') s += `<line x1="${g.v}" y1="-200" x2="${g.v}" y2="${doc().stage.d + 200}" ${gs}/>`;
        if (g.kind === 'y') s += `<line x1="-200" y1="${g.v}" x2="${doc().stage.w + 200}" y2="${g.v}" ${gs}/>`;
        if (g.kind === 'r') s += `<circle cx="${g.c.x}" cy="${g.c.y}" r="${g.v}" ${gs}/>`;
      });
    }
    if (marquee) {
      const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1);
      s += `<rect x="${x}" y="${y}" width="${Math.abs(marquee.x1 - marquee.x0)}" height="${Math.abs(marquee.y1 - marquee.y0)}" fill="rgba(47,111,222,.1)" stroke="#2f6fde" stroke-width="${1.5 / k}" stroke-dasharray="${5 / k}"/>`;
    }
    layerOverlay.innerHTML = s;
    positionCtxBar();
  }

  function applyView() {
    const v = S.view;
    vp.setAttribute('transform', `translate(${v.tx} ${v.ty}) scale(${v.k})`);
  }

  function fitView() {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const st = doc().stage;
    const x0 = -80, y0 = -80, x1 = st.w + 80, y1 = SS.render.frontY(st) + 110;
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
    if (e.pointerType === 'touch' && S.mode !== 'marquee') {
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
      case 'pan': {
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
            dx = Math.round((p.x + dx) / SNAP) * SNAP - p.x;
            dy = Math.round((p.y + dy) / SNAP) * SNAP - p.y;
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
        render();
        renderProps(true);
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
        S.sel = new Set(drag.base);
        doc().items.forEach(it => { if (it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1) S.sel.add(it.id); });
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
    if (!sel.length || (drag && drag.kind !== 'marquee') || S.placing) { ctxBar.hidden = true; return; }
    const o = renderOpts();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    sel.forEach(it => {
      const sz = SS.itemSize(it, o);
      const r = Math.max(sz.w, sz.h) / 2 + 10;
      x0 = Math.min(x0, it.x - r); x1 = Math.max(x1, it.x + r);
      y0 = Math.min(y0, it.y - r); y1 = Math.max(y1, it.y + r);
    });
    const k = S.view.k, v = S.view;
    const wrapR = $('stageWrap').getBoundingClientRect();
    ctxBar.hidden = false;
    const bw = ctxBar.offsetWidth, bh = ctxBar.offsetHeight;
    let left = (x0 + x1) / 2 * k + v.tx - bw / 2;
    let top = y0 * k + v.ty - bh - 10;
    if (top < 8) top = y1 * k + v.ty + 10;
    left = Math.max(8, Math.min(wrapR.width - bw - 8, left));
    top = Math.max(8, Math.min(wrapR.height - bh - 70, top));
    ctxBar.style.left = left + 'px';
    ctxBar.style.top = top + 'px';
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
    if (e.key === 'Escape') { setPlacing(null); closeModal(); if (!typing) { S.sel.clear(); renderOverlay(); renderProps(); } return; }
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

  function tidyAuto(list, silent) {
    list = list || targetsPlayers();
    if (list.length < 2) { if (!silent) toast('整える奏者がいません'); return; }
    const c = conductor();
    const shape = G.guessShape(list, c);
    const n = shape === 'arc' ? G.tidyArc(list, c, tidyOpts()) : G.tidyLine(list, c, tidyOpts());
    G.fixOverlap(list, opts().seatR * 2 + 8);
    if (!silent) toast(`${n}列を${shape === 'arc' ? '扇形' : '横一列'}にきれいにそろえました`, true);
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
        const list = targetsPlayers(); if (list.length < 2) return toast('奏者が2人以上必要です');
        pushHistory();
        const n = G.tidyArc(list, c, tidyOpts());
        G.fixOverlap(list, opts().seatR * 2 + 8);
        toast(`${n}列を扇形にそろえました`, true);
        break;
      }
      case 'tidyLine': {
        const list = targetsPlayers(); if (list.length < 2) return toast('奏者が2人以上必要です');
        pushHistory();
        const n = G.tidyLine(list, c, tidyOpts());
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
    $('optNames').checked = o.showNames;
    $('optStands').checked = o.showStands;
    $('optNumbers').checked = o.showNumbers;
    $('optGrid').checked = o.grid;
    $('optSnap').checked = o.snap;
    $('optColor').checked = o.colorBy;
    $('optSeatSize').value = o.seatR;
    $('optFigure').checked = o.figure;
    $('optGuides').checked = o.guides;
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
  bindSetting('stageShape', 'change', el => { doc().stage.shape = el.value; });
  bindSetting('optNames', 'change', el => { opts().showNames = el.checked; });
  bindSetting('optStands', 'change', el => { opts().showStands = el.checked; });
  bindSetting('optNumbers', 'change', el => { opts().showNumbers = el.checked; });
  bindSetting('optGrid', 'change', el => { opts().grid = el.checked; });
  bindSetting('optSnap', 'change', el => { opts().snap = el.checked; });
  bindSetting('optColor', 'change', el => { opts().colorBy = el.checked; });
  bindSetting('optSeatSize', 'input', el => { opts().seatR = +el.value; });
  bindSetting('optFigure', 'change', el => { opts().figure = el.checked; });
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
    $('modePan').classList.toggle('active', m === 'pan');
    svg.classList.toggle('panning', m === 'pan');
  }
  $('modeSelect').onclick = () => setMode('select');
  $('modePan').onclick = () => setMode('pan');
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
    S.doc = normalize({ title: keep.title, subtitle: keep.subtitle, stage: Object.assign({ shape: keep.stage.shape }, made.stage), items: made.items, options: keep.options, underlay: keep.underlay });
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

  // ------------------------------------------------------------ トレース
  async function handleImageFile(file) {
    if (!file || !/^image\//.test(file.type)) return toast('画像ファイルを選んでください');
    try {
      toast('画像を読み込んでいます…');
      const { img } = await SS.trace.loadImageFromFile(file);
      S.traceSrc = { img, rot: 0 };
      setTraceImage(SS.trace.toCanvas(img, 2400, 0), false);
      $('traceControls').classList.remove('hidden');
      openTab('leftPanel', 'traceTab');
      // ステージの外枠が見つかったら、四隅合わせの画面を自動で開く
      const frame = SS.trace.findFrame(S.trace.prep);
      if (frame) openCropEditor(frame, true);
      else { openPanel('leftPanel'); toast('画像を読み込みました。「✂ トリミング・四隅合わせ」で範囲を決められます'); }
    } catch (err) {
      toast(err.message || '画像を読み込めませんでした');
    }
  }

  // 解析する画像（キャンバス）を決めて、下絵として置く
  function setTraceImage(canvas, framed) {
    const prep = SS.trace.prepare(canvas);
    S.trace = { prep, result: null, canvas, framed };
    const st = doc().stage;
    const u = { src: canvas.toDataURL('image/jpeg', 0.85), opacity: +$('underlayOpacity').value / 100 };
    if (framed) { u.x = 0; u.y = 0; u.w = st.w; u.h = st.d; }
    else {
      const k = Math.min(st.w / prep.w, st.d / prep.h);
      u.w = prep.w * k; u.h = prep.h * k; u.x = (st.w - u.w) / 2; u.y = (st.d - u.h) / 2;
    }
    doc().underlay = u;
    $('traceScale').checked = !framed;
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
      const ox = W / 2 - ((minX + maxX) / 2) * cm;
      const oy = 150 - minY * cm;
      toW = p => ({ x: ox + p.x * cm, y: oy + p.y * cm });
      center = toW(cImg);
      center.y = Math.min(center.y, D - 60);
      u.x = ox; u.y = oy; u.w = prep.w * cm; u.h = prep.h * cm;
    } else {
      const kx = u.w / prep.w, ky = u.h / prep.h;
      toW = p => ({ x: u.x + p.x * kx, y: u.y + p.y * ky });
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
  $('underlayEdit').addEventListener('change', e => { S.underlayEdit = e.target.checked; render(); if (S.underlayEdit) toast('下絵をドラッグで移動、ホイールで拡大縮小できます'); });
  $('btnUnderlayFit').onclick = () => {
    const u = doc().underlay; if (!u) return;
    const st = doc().stage;
    const k = Math.min(st.w / u.w, st.d / u.h);
    u.w *= k; u.h *= k; u.x = (st.w - u.w) / 2; u.y = (st.d - u.h) / 2;
    render();
  };
  $('btnUnderlayRemove').onclick = () => {
    doc().underlay = null;
    S.trace = null;
    S.underlayEdit = false;
    $('underlayEdit').checked = false;
    $('traceControls').classList.add('hidden');
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
      ${doc().underlay ? '<label class="check"><input type="checkbox" id="exUnderlay"> 下絵を入れる</label>' : ''}
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
      legend: $('exLegend').checked, grid: $('exGrid').checked, underlay: $('exUnderlay') && $('exUnderlay').checked, pxPerCm: +$('exScale').value,
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
        <li><b>かんたん編成</b>：ホールを選んで、パートの人数を▲▼で変えるだけ。<b>すぐに自動で並べ直します</b>。</li>
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
    return doc().ensemble;
  }
  function applyAuto(opts2) {
    opts2 = opts2 || {};
    const st = ens();
    if (Date.now() - lastAutoPush > 1500) pushHistory();
    lastAutoPush = Date.now();
    const d = doc();
    // 今の名前を、パートごとに覚えておく
    const names = {};
    d.items.filter(it => it.type === 'player' && it.name).forEach(it => { (names[it.label] = names[it.label] || []).push(it.name); });
    const hadAuto = d.items.some(it => it.auto);
    const keepTypes = new Set(['text', 'box', 'circle', 'mic', 'amp']);
    d.items = d.items.filter(it => (hadAuto ? !it.auto : keepTypes.has(it.type)));
    const r = SS.auto.build(st, d.stage);
    r.items.forEach(it => {
      it.id = newId();
      if (it.type === 'player' && names[it.label] && names[it.label].length) it.name = names[it.label].shift();
      d.items.push(it);
    });
    S.sel.clear();
    renderAll();
    if (opts2.fit) fitView();
    if (!r.fits) toast('このステージだと奥行が足りないかもしれません（はみ出した人は端に寄せています）');
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
  $('ensPerc').onchange = e => { ens().percInst = e.target.checked; applyAuto(); };

  // ------------------------------------------------------------ ホール（ステージ寸法）
  function buildHallSelect() {
    const sel = $('hallSelect');
    const groups = {};
    SS.HALLS.forEach((h, i) => { (groups[h.pref] = groups[h.pref] || []).push(`<option value="${i}">${SS.esc(h.name)}（${h.w}×${h.d}m）</option>`); });
    sel.innerHTML = '<option value="">いまの大きさのまま／手動で設定</option>' +
      Object.keys(groups).map(g => `<optgroup label="${g === '東京' ? '東京都' : g + '県'}">${groups[g].join('')}</optgroup>`).join('');
    sel.onchange = () => {
      const h = SS.HALLS[+sel.value];
      if (!h) { doc().hall = ''; updateHallNote(); return; }
      pushHistory();
      doc().stage.w = Math.round(h.w * 100);
      doc().stage.d = Math.round(h.d * 100);
      doc().hall = h.name;
      updateHallNote();
      if (doc().items.some(it => it.auto)) applyAuto({ fit: true });
      else { renderAll(); fitView(); }
      toast(`${h.name}（間口${h.w}m×奥行${h.d}m）にしました`, true);
    };
  }
  function updateHallNote() {
    const h = SS.HALLS.find(x => x.name === doc().hall);
    const sel = $('hallSelect');
    sel.value = h ? String(SS.HALLS.indexOf(h)) : '';
    $('hallNote').innerHTML = h
      ? `間口${h.w}m × 奥行${h.d}m${h.note ? '（' + SS.esc(h.note) + '）' : ''}。<a href="${h.src}" target="_blank" rel="noopener">出典</a>。反射板を置くと奥行が短くなることがあります。本番前にホールの図面で確認してください。`
      : `いまのステージ：幅${doc().stage.w / 100}m × 奥行${doc().stage.d / 100}m`;
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
      S.doc = normalize({ stage: t.stage, items: t.items });
      try { if (!localStorage.getItem('stagesetting.helped')) { localStorage.setItem('stagesetting.helped', '1'); setTimeout(showHelp, 400); } } catch (e) { /* ignore */ }
    }
    if (S.doc.underlay) {
      $('traceControls').classList.remove('hidden');
      $('underlayOpacity').value = Math.round(S.doc.underlay.opacity * 100);
      $('traceStatus').textContent = '自動で読み取るには、もう一度画像を選んでください';
    }
    renderAll();
    renderSteppers();
    updateHallNote();
    fitView();
    let resizeTimer = null;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitView, 150); });
  }
  init();
})(window.SS);
