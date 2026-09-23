/* 編成（パートごとの人数）から、自動で配置を作る */
window.SS = window.SS || {};

(function (SS) {
  const A = {};
  const G = () => SS.geo;
  const R = () => SS.render;
  const rep = (label, n) => Array.from({ length: Math.max(0, n | 0) }, () => label);

  // ---------------------------------------------------------------- ひな壇（平台＋箱馬）
  // 1寸 = 3.03cm。平台の厚み 4寸(12.1cm)。箱馬 6寸×1尺×1尺7寸（向きで高さが変わる）
  SS.RISER_HEIGHTS = [
    { v: 12.1, name: '4寸（約12cm）', how: '平台を床にじか置き' },
    { v: 21.2, name: '7寸（約21cm）', how: '3寸の足（角材・半箱馬）＋平台' },
    { v: 30.3, name: '1尺（約30cm）', how: '箱馬を6寸の向き＋平台' },
    { v: 42.4, name: '1尺4寸（約42cm）', how: '箱馬を1尺の向き＋平台' },
    { v: 63.6, name: '2尺1寸（約64cm）', how: '箱馬を1尺7寸の向き（または中足）＋平台' },
    { v: 84.8, name: '2尺8寸（約85cm）', how: '高足（開き足）＋平台' },
  ];
  // よく使われる段の高さ（7寸ずつ上がる）
  const STD_STEPS = [21.2, 42.4, 63.6, 84.8];
  SS.PANELS = {
    '36': { name: '3×6尺（サブロク）', w: 182, d: 91 },
    '46': { name: '4×6尺（ヨンロク）', w: 182, d: 121 },
  };
  SS.heightName = v => { const h = SS.RISER_HEIGHTS.find(x => Math.abs(x.v - v) < 0.6); return h ? h.name : `${Math.round(v)}cm`; };
  SS.heightHow = v => { const h = SS.RISER_HEIGHTS.find(x => Math.abs(x.v - v) < 0.6); return h ? h.how : ''; };

  // ひな壇1段に使う部材の数（目安）
  SS.hinaMaterials = function (it) {
    const pn = SS.PANELS[it.panel || '36'];
    const across = Math.max(1, Math.round((it.w || 182) / pn.w));
    const deep = Math.max(1, Math.round((it.h || 182) / pn.d));
    const panels = across * deep;
    const v = it.hgt || 21.2;
    let legs = 0, legName = '';
    if (v > 13) {
      // 平台の前と後ろの辺に、つなぎ目ごとに足を置く（目安）
      legs = (deep + 1) * (across * 2 + 1);
      legName = v < 25 ? '3寸の足（角材）' : v < 35 ? '箱馬（6寸の向き）' : v < 50 ? '箱馬（1尺の向き）' : v < 70 ? '箱馬（1尺7寸の向き）' : '高足（開き足）';
    }
    return { panels, panelName: pn.name, across, deep, legs, legName };
  };

  // 編成の種類と、パートの初期人数
  A.ENSEMBLES = {
    band: {
      name: '吹奏楽',
      parts: [
        ['Picc', 1], ['Fl', 4], ['Ob', 2], ['Fg', 1], ['Es.Cl', 0], ['Cl1', 3], ['Cl2', 3], ['Cl3', 3], ['B.Cl', 1],
        ['A.Sx', 2], ['T.Sx', 1], ['B.Sx', 1], ['Hr', 4], ['Tp', 4], ['Tb', 3], ['B.Tb', 1], ['Euph', 2], ['Tuba', 2], ['St.B', 1],
        ['Perc', 5], ['Hp', 0], ['Pf', 0],
      ],
    },
    orch: {
      name: 'オーケストラ',
      parts: [
        ['Vn1', 14], ['Vn2', 12], ['Va', 10], ['Vc', 8], ['Cb', 6],
        ['Picc', 0], ['Fl', 2], ['Ob', 2], ['E.H.', 0], ['Cl', 2], ['B.Cl', 0], ['Fg', 2], ['C.Fg', 0],
        ['Hr', 4], ['Tp', 2], ['Tb', 3], ['Tuba', 1], ['Timp', 1], ['Perc', 2], ['Hp', 0], ['Pf', 0],
      ],
    },
    strings: {
      name: '弦楽合奏',
      parts: [['Vn1', 6], ['Vn2', 5], ['Va', 4], ['Vc', 4], ['Cb', 2]],
    },
  };

  A.defaultState = function (type) {
    const e = A.ENSEMBLES[type || 'band'];
    const counts = {};
    e.parts.forEach(([k, n]) => { counts[k] = n; });
    return {
      type: type || 'band', counts, antiphonal: false, percInst: true, hornBox: false,
      hina: type === 'orch' ? { steps: 3, panel: '46', deep: 1 } : type === 'strings' ? { steps: 0, panel: '36', deep: 2 } : { steps: 2, panel: '36', deep: 2 },
    };
  };

  // 吹奏楽の列の割り当て（前の列から。左→右）
  const BAND_ROWS = [
    ['Picc', 'Fl', 'Es.Cl', 'Cl1'],
    ['A.Sx', 'T.Sx', 'B.Sx', 'Ob', 'Fg', 'Cl2', 'Cl3', 'B.Cl'],
    ['Hr', 'Tb', 'B.Tb', 'Euph', 'Tuba', 'St.B'],
    ['Tp'],
  ];

  // ---------------------------------------------------------------- 打楽器の整列
  const TIMP = ['timp32', 'timp29', 'timp26', 'timp23', 'timp'];
  const PERC_TYPES = new Set([...TIMP, 'marimba', 'marimba43', 'xylo', 'vib', 'glock', 'chimes', 'bd', 'sd', 'cym', 'tam', 'drums', 'table']);
  // 舞台の左→右の並び順（下手：鍵盤、上手：ティンパニ）
  const STATION_ORDER = ['marimba', 'marimba43', 'xylo', 'vib', 'glock', 'chimes', 'tam', 'bd', 'cym', 'sd', 'table', 'drums', 'timp'];
  A.PERC_TYPES = PERC_TYPES;

  function timpPositions(px, py, sizes) {
    const k = sizes.length, R0 = 112;
    return sizes.map((t, i) => {
      const th = (k === 1 ? 0 : 66 - (132 * i) / (k - 1)) * Math.PI / 180;
      return { x: px + R0 * Math.sin(th), y: py + R0 * Math.cos(th) };
    });
  }

  /**
   * 打楽器（楽器と奏者）を舞台奥の帯に整列する。items を直接動かす。
   * zone: { yTop } 帯のいちばん奥。戻り値：使った奥行（cm）
   */
  A.arrangePerc = function (items, stage, zone) {
    const C = SS.CATALOG;
    const inst = items.filter(it => PERC_TYPES.has(it.type));
    const pl = items.filter(it => it.type === 'player' && SS.partGroup(it.label).id === 'perc');
    if (!inst.length && !pl.length) return 0;
    const timps = inst.filter(it => TIMP.includes(it.type)).sort((a, b) => (b.w || C[b.type].w) - (a.w || C[a.type].w));
    const others = inst.filter(it => !TIMP.includes(it.type));
    const stations = [];
    if (timps.length) stations.push({ kind: 'timp', items: timps, order: STATION_ORDER.indexOf('timp') });
    others.forEach(it => stations.push({ kind: it.type, items: [it], order: STATION_ORDER.indexOf(it.type) === -1 ? 50 : STATION_ORDER.indexOf(it.type) }));
    stations.sort((a, b) => a.order - b.order);
    // 奏者の割り当て（Timp という名前の人はティンパニへ）
    const free = pl.slice();
    const timpSt = stations.find(s => s.kind === 'timp');
    if (timpSt) {
      const i = free.findIndex(p => /^tim/i.test(p.label || ''));
      if (i >= 0) timpSt.player = free.splice(i, 1)[0];
    }
    stations.forEach(s => { if (!s.player && free.length) s.player = free.shift(); });
    free.forEach(p => stations.push({ kind: 'stand', items: [], player: p, order: 99 }));
    const width = s => s.kind === 'timp' ? (s.items.length > 1 ? 2 * 112 * Math.sin(66 * Math.PI / 180) : 0) + (C[s.items[0].type].w) + 20
      : s.kind === 'stand' ? 75 : (s.items[0].w || C[s.items[0].type].w) + 28;
    const depthOf = s => s.kind === 'timp' ? 230 : s.kind === 'stand' ? 90 : (s.items[0].h || C[s.items[0].type].h) + 100;
    // 行に分ける（入りきらなければ手前にもう1行）
    const rows = [];
    let cur = [], used = 0;
    const rowY = r => zone.yTop + (r === 0 ? 0 : rows.slice(0, r).reduce((a, row) => a + Math.max(...row.map(depthOf)) + 20, 0));
    stations.forEach(s => {
      const [l, rr] = R().xRange(stage, rowY(rows.length) + 60);
      const avail = rr - l - 40;
      if (cur.length && used + width(s) > avail) { rows.push(cur); cur = []; used = 0; }
      cur.push(s); used += width(s);
    });
    if (cur.length) rows.push(cur);
    let total = 0;
    rows.forEach((row, ri) => {
      const y0 = rowY(ri);
      const [l, rr] = R().xRange(stage, y0 + 60);
      const tw = row.reduce((a, s) => a + width(s), 0);
      const gapX = Math.max(0, Math.min(40, (rr - l - 40 - tw) / Math.max(1, row.length)));
      let x = (l + rr) / 2 - (tw + gapX * (row.length - 1)) / 2;
      row.forEach(s => {
        const w = width(s);
        const cx = x + w / 2;
        if (s.kind === 'timp') {
          const py = y0 + 35;
          timpPositions(cx, py, s.items.map(t => t.type)).forEach((p, i) => { Object.assign(s.items[i], { x: p.x, y: p.y, rot: 0 }); });
          if (s.player) Object.assign(s.player, { x: cx, y: py, rot: 0 });
        } else if (s.kind === 'stand') {
          Object.assign(s.player, { x: cx, y: y0 + 40, rot: 0 });
        } else {
          const it = s.items[0];
          const h = it.h || C[it.type].h;
          Object.assign(it, { x: cx, y: y0 + 62 + h / 2, rot: 0 });
          if (s.player) Object.assign(s.player, { x: cx, y: y0 + 62 - 24, rot: 0 });
        }
        x += w + gapX;
      });
      total = y0 - zone.yTop + Math.max(...row.map(depthOf));
    });
    return total;
  };

  // 人数から打楽器の楽器を用意する（奏者1人に1つの持ち場）
  const PERC_STATIONS_BAND = ['timp', 'sd', 'bd', 'marimba', 'glock', 'xylo', 'chimes', 'vib'];
  const PERC_STATIONS_ORCH = ['bd', 'sd', 'glock', 'xylo', 'chimes', 'marimba', 'cym'];
  function percItems(timpN, stations, players) {
    const out = [];
    if (timpN) {
      (timpN >= 4 ? ['timp32', 'timp29', 'timp26', 'timp23'] : ['timp29', 'timp26', 'timp23']).forEach(t => out.push({ type: t, x: 0, y: 0, rot: 0 }));
    }
    stations.forEach(s => out.push({ type: s, x: 0, y: 0, rot: 0 }));
    players.forEach(l => out.push({ type: 'player', label: l, x: 0, y: 0, rot: 0 }));
    return out;
  }

  // ---------------------------------------------------------------- 共通の部品
  const podiumY = stage => stage.d - 90;
  const inside = (stage, it, m) => R().insideStage(stage, it, m);

  // ひな壇の段（y は前のふち）
  function hinaTier(stage, yFront, depth, hgt, panel, wantW, step) {
    const [l, r] = R().xRange(stage, yFront - depth);
    const maxW = Math.floor((r - l - 20) / 182) * 182;
    const w = Math.max(182, Math.min(maxW, Math.ceil(wantW / 182) * 182));
    return { type: 'hina', x: stage.w / 2, y: yFront - depth / 2, w, h: depth, hgt, panel, step, rot: 0 };
  }

  // 1列をまっすぐに並べる（ひな壇の上）。幅に入らなければ間隔を詰める
  function lineRow(labels, y, cx, spacing, maxW) {
    const n = labels.length;
    let sp = spacing;
    if (n > 1 && (n - 1) * sp > maxW) sp = Math.max(58, maxW / (n - 1));
    const w = (n - 1) * sp;
    return labels.map((l, i) => ({ type: 'player', label: l, x: cx - w / 2 + i * sp, y, rot: 0 }));
  }

  // ホルンのボックス：先頭の人数の半分を前、残りをその後ろに
  function expandHornBox(items, c, back) {
    const out = [];
    items.forEach(it => {
      if (it.label !== 'Hr#box') { out.push(it); return; }
      const front = Object.assign({}, it, { label: 'Hr' });
      out.push(front);
      if (it.pair) {
        let dx = it.x - c.x, dy = it.y - c.y;
        if (it.straight) { dx = 0; dy = -1; }
        const L = Math.hypot(dx, dy) || 1;
        out.push(Object.assign({}, it, { label: 'Hr', x: it.x + (dx / L) * back, y: it.y + (dy / L) * back }));
      }
    });
    return out;
  }
  function hornSlots(labels, on) {
    if (!on) return labels;
    const n = labels.filter(l => l === 'Hr').length;
    if (n < 3) return labels;
    const slots = Math.ceil(n / 2);
    const out = [];
    let placed = false;
    labels.forEach(l => {
      if (l !== 'Hr') { out.push(l); return; }
      if (placed) return;
      placed = true;
      for (let i = 0; i < slots; i++) out.push({ box: true, pair: i < Math.floor(n / 2) });
    });
    return out;
  }

  // ---------------------------------------------------------------- 吹奏楽
  function band(st, stage, tune) {
    const n = st.counts;
    const c = { x: stage.w / 2, y: podiumY(stage) };
    const H = st.hina || { steps: 0 };
    const pn = SS.PANELS[H.panel || '36'];
    const tierD = pn.d * (H.deep || 2);
    let rows = BAND_ROWS.map(r => r.flatMap(p => rep(p, n[p]))).filter(r => r.length);
    const K = Math.min(H.steps || 0, Math.max(0, rows.length - 1));
    const floorRows = rows.slice(0, rows.length - K);
    const tierRows = rows.slice(rows.length - K);
    const items = [];
    const sp = tune.spacing, gap = tune.gap, r0 = tune.r0;
    // 床の扇形
    let R0 = r0;
    const queue = floorRows.map(r => hornSlots(r, st.hornBox));
    let maxR = r0 - gap;
    while (queue.length) {
      let labels = queue.shift();
      const cap = Math.max(2, Math.floor((Math.PI * tune.span * R0) / sp) + 1);
      if (labels.length > cap) {
        const rest = labels.slice(cap);
        labels = labels.slice(0, cap);
        if (queue.length) queue[0] = rest.concat(queue[0]); else queue.push(rest);
      }
      const pts = G().generate([labels.length], { shape: 'arc', r0: R0, gap: 0, spacing: sp }, c);
      let hasBox = false;
      pts.forEach((p, i) => {
        const l = labels[i];
        if (typeof l === 'object') { hasBox = true; items.push({ type: 'player', label: 'Hr#box', pair: l.pair, x: p.x, y: p.y, rot: p.rot }); }
        else items.push({ type: 'player', label: l, x: p.x, y: p.y, rot: p.rot });
      });
      maxR = R0 + (hasBox ? 75 : 0);
      R0 += gap + (hasBox ? 75 : 0);
    }
    // ひな壇（後ろの列はまっすぐ）
    let yFront = c.y - maxR - tune.clear;
    const tiers = [];
    tierRows.forEach((row0, ti) => {
      const row = hornSlots(row0, st.hornBox);
      const hasBox = row.some(l => typeof l === 'object');
      const depth = hasBox ? Math.max(tierD, 182 + pn.d) : tierD;
      const hgt = (H.heights && H.heights[ti]) || STD_STEPS[Math.min(ti, STD_STEPS.length - 1)];
      const t = hinaTier(stage, yFront, depth, hgt, H.panel || '36', row.length * sp + 60, ti + 1);
      tiers.push(t);
      const yRow = hasBox ? yFront - 62 : yFront - depth / 2 + 12;
      lineRow(row.map(l => (typeof l === 'object' ? 'Hr#box' : l)), yRow, c.x, sp, t.w - 70).forEach((p, i) => {
        const l = row[i];
        if (typeof l === 'object') { p.pair = l.pair; p.straight = true; }
        items.push(p);
      });
      yFront -= depth;
    });
    // ハープ・ピアノは舞台の左右（前寄り）
    rep('Hp', n.Hp).forEach((l, i) => { const p = G().fromPolar(r0 + gap * 0.5 + i * 90, -1.5, c); items.push({ type: 'harp', x: p.x - 45, y: p.y, rot: 0 }, { type: 'player', label: 'Hp', x: p.x + 5, y: p.y, rot: 90 }); });
    rep('Pf', n.Pf).forEach(() => { const p = G().fromPolar(r0 + gap * 0.8, 1.45, c); items.push({ type: 'piano', x: p.x, y: p.y - 30, rot: 90 }, { type: 'player', label: 'Pf', x: p.x - 100, y: p.y - 30, rot: 90 }); });
    // 打楽器（いちばん奥）
    const P = n.Perc || 0;
    let percDepth = 0;
    if (P) {
      const stations = st.percInst ? PERC_STATIONS_BAND.slice(0, Math.min(P, 8)) : [];
      const hasTimp = stations.includes('timp');
      const list = percItems(hasTimp ? 4 : 0, stations.filter(s => s !== 'timp'), rep('Perc', P).map((l, i) => (hasTimp && i === 0 ? 'Timp' : l)));
      percDepth = A.arrangePerc(list, stage, { yTop: 25 });
      items.push(...list);
    }
    const out = tiers.concat(expandHornBox(items, c, 72));
    // はみ出しの判定：打楽器の手前のふちより前に、いちばん奥の段が収まっているか
    const backEdge = yFront;
    const overlap = P ? backEdge < 25 + percDepth + 10 : backEdge < 20;
    return { items: out, c, overlap };
  }

  // ---------------------------------------------------------------- オーケストラ・弦楽
  function orch(st, stage, tune) {
    const n = st.counts;
    const c = { x: stage.w / 2, y: podiumY(stage) };
    const S = G().sector;
    const anti = st.antiphonal;
    const order = anti ? ['Vn1', 'Vc', 'Va', 'Vn2'] : ['Vn1', 'Vn2', 'Va', 'Vc'];
    const gapDeg = 4;
    const avail = 180 - gapDeg * (order.length - 1);
    const sumSq = order.reduce((a, kk) => a + Math.sqrt(n[kk] || 0), 0) || 1;
    let t = -90;
    const items = [];
    let maxR = 200;
    const secRange = {};
    order.forEach((k, i) => {
      const cnt = n[k] || 0;
      if (!cnt) return;
      const span = Math.max(14, (avail * Math.sqrt(cnt)) / sumSq);
      const r0 = (i === 0 || i === order.length - 1) ? tune.r0 - 40 : tune.r0;
      const list = S(k, cnt, t, t + span, r0, tune.gap * 0.8, 0, c, tune.spacing);
      list.forEach(p => { maxR = Math.max(maxR, G().polar(p, c).r); });
      items.push(...list);
      secRange[k] = [t, t + span];
      t += span + gapDeg;
    });
    if (n.Cb) {
      const vr = secRange.Vc || [60, 88];
      const mid = (vr[0] + vr[1]) / 2;
      const cbR = maxR + 85;
      items.push(...S('Cb', n.Cb, mid - 15, mid + 15, cbR, 90, 0, c, 85));
    }
    // 管楽器（ひな壇の上にまっすぐ）
    const H = st.hina || { steps: 0 };
    const pn = SS.PANELS[H.panel || '36'];
    const tierD = pn.d * (H.deep || 1);
    const rowsW = [
      [...rep('Picc', n.Picc), ...rep('Fl', n.Fl), ...rep('Ob', n.Ob), ...rep('E.H.', n['E.H.'])],
      [...rep('Cl', n.Cl), ...rep('B.Cl', n['B.Cl']), ...rep('Fg', n.Fg), ...rep('C.Fg', n['C.Fg'])],
    ].filter(r => r.length);
    const hrN = n.Hr || 0;
    const brass = [...rep('Tp', n.Tp), ...rep('Tb', n.Tb), ...rep('Tuba', n.Tuba)];
    let yFront = c.y - maxR - tune.clear;
    const tiers = [];
    const sp = tune.spacing + 4;
    rowsW.forEach((row, i) => {
      const hgt = H.steps > i ? ((H.heights && H.heights[i]) || STD_STEPS[i]) : 0;
      const depth = Math.max(tierD, 121);
      if (hgt) tiers.push(hinaTier(stage, yFront, depth, hgt, H.panel || '36', row.length * sp + 60, i + 1));
      lineRow(row, yFront - depth / 2 + 8, c.x, sp, stage.w * 0.5).forEach(p => items.push(p));
      yFront -= depth;
    });
    if (hrN || brass.length) {
      const i = rowsW.length;
      const hgt = H.steps > i ? ((H.heights && H.heights[i]) || STD_STEPS[Math.min(i, 3)]) : 0;
      const box = st.hornBox && hrN >= 3;
      const depth = box ? Math.max(tierD, 182 + 30) : Math.max(tierD, 121);
      const hrSlots = box ? Math.ceil(hrN / 2) : hrN;
      const wh = hrSlots * sp, wb = brass.length * sp, mid = 90;
      if (hgt) tiers.push(hinaTier(stage, yFront, depth, hgt, H.panel || '36', wh + mid + wb + 60, i + 1));
      const yRow = box ? yFront - 55 : yFront - depth / 2 + 8;
      const x0 = c.x - (wh + mid + wb) / 2;
      for (let k = 0; k < hrSlots; k++) {
        items.push({ type: 'player', label: 'Hr', x: x0 + sp / 2 + k * sp, y: yRow, rot: 0 });
        if (box && k < Math.floor(hrN / 2)) items.push({ type: 'player', label: 'Hr', x: x0 + sp / 2 + k * sp, y: yRow - 80, rot: 0 });
      }
      brass.forEach((l, k) => items.push({ type: 'player', label: l, x: x0 + wh + mid + sp / 2 + k * sp, y: yRow, rot: 0 }));
      yFront -= depth;
    }
    rep('Hp', n.Hp).forEach((l, i) => { const p = G().fromPolar(maxR + 60, -1.25 + i * 0.22, c); items.push({ type: 'harp', x: p.x - 45, y: p.y, rot: 0 }, { type: 'player', label: 'Hp', x: p.x + 5, y: p.y, rot: 0 }); });
    rep('Pf', n.Pf).forEach(() => { const p = G().fromPolar(maxR + 120, -0.85, c); items.push({ type: 'piano', x: p.x, y: p.y, rot: 90 }, { type: 'player', label: 'Pf', x: p.x - 100, y: p.y, rot: 90 }); });
    // ティンパニ・打楽器（いちばん奥）
    const P = n.Perc || 0;
    let percDepth = 0;
    if (n.Timp || P) {
      const stations = st.percInst ? PERC_STATIONS_ORCH.slice(0, Math.min(P, 7)) : [];
      const list = percItems(n.Timp ? 4 : 0, stations, [...rep('Timp', n.Timp ? 1 : 0), ...rep('Perc', P)]);
      percDepth = A.arrangePerc(list, stage, { yTop: 25 });
      items.push(...list);
    }
    const overlap = (n.Timp || P) ? yFront < 25 + percDepth + 10 : yFront < 20;
    return { items: tiers.concat(items), c, overlap };
  }

  // 何回か詰めながら、ステージに収まる並べ方を探す
  const TUNES = [
    { spacing: 82, gap: 125, r0: 205, span: 0.92, clear: 70 },
    { spacing: 80, gap: 115, r0: 195, span: 0.95, clear: 60 },
    { spacing: 77, gap: 108, r0: 185, span: 0.97, clear: 50 },
    { spacing: 74, gap: 102, r0: 175, span: 0.98, clear: 45 },
    // ここから先は、ひな壇の奥行を 4×6尺1枚（121cm）まで詰める
    { spacing: 77, gap: 108, r0: 185, span: 0.97, clear: 45, slim: true },
    { spacing: 72, gap: 98, r0: 168, span: 0.99, clear: 40, slim: true },
    { spacing: 68, gap: 94, r0: 160, span: 0.99, clear: 35, slim: true },
  ];

  A.build = function (st, stage) {
    const f = st.type === 'band' ? band : orch;
    const s2 = st.type === 'strings' ? Object.assign({}, st, { percInst: false, counts: Object.assign({}, st.counts) }) : st;
    let best = null;
    for (const tune of TUNES) {
      let s3 = s2;
      if (tune.slim && s2.hina && (SS.PANELS[s2.hina.panel || '36'].d * (s2.hina.deep || 1)) > 121) {
        s3 = Object.assign({}, s2, { hina: Object.assign({}, s2.hina, { panel: '46', deep: 1 }) });
      }
      const r = f(s3, stage, tune);
      const outside = r.items.filter(it => it.type === 'player' && !inside(stage, it, 28)).length;
      const hinaOut = r.items.filter(it => it.type === 'hina' && it.y - it.h / 2 < 5).length;
      const score = outside * 10 + hinaOut * 10 + (r.overlap ? 5 : 0) + (tune.slim ? 1 : 0);
      r.slim = !!(tune.slim && s3 !== s2);
      if (!best || score < best.score) best = Object.assign(r, { score, outside });
      if (score === 0) break;
    }
    const r = best;
    r.items.push({ type: 'podium', x: r.c.x, y: r.c.y, rot: 0 });
    // それでもはみ出したものはステージの内側に寄せる
    r.items.forEach(it => {
      it.auto = true;
      delete it.pair; delete it.straight;
      const sz = SS.itemSize(it, {});
      const m = it.type === 'player' ? 28 : Math.min(sz.w, sz.h) / 2 + 5;
      if (it.type !== 'hina') Object.assign(it, R().clampToStage(stage, it, m));
      it.x = Math.round(it.x); it.y = Math.round(it.y);
    });
    r.fits = r.score <= 1;
    return r;
  };

  SS.auto = A;
})(window.SS);
