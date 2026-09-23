/* 編成（パートごとの人数）から、自動で配置を作る */
window.SS = window.SS || {};

(function (SS) {
  const A = {};

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
    return { type: type || 'band', counts, antiphonal: false, percInst: true };
  };

  // 吹奏楽の列の割り当て（前の列から。左→右）
  const BAND_ROWS = [
    ['Picc', 'Fl', 'Es.Cl', 'Cl1'],
    ['A.Sx', 'T.Sx', 'B.Sx', 'Ob', 'Fg', 'Cl2', 'Cl3', 'B.Cl'],
    ['Hr', 'Tb', 'B.Tb', 'Euph', 'Tuba', 'St.B'],
    ['Tp'],
  ];

  const G = () => SS.geo;
  const rep = (label, n) => Array.from({ length: Math.max(0, n | 0) }, () => label);

  // 打楽器の「持ち場」。人数に応じて上から順に使う
  const PERC_STATIONS_BAND = ['timp', 'sd', 'bd', 'marimba', 'glock', 'xylo', 'chimes', 'vib'];
  const PERC_STATIONS_ORCH = ['bd', 'sd', 'glock', 'xylo', 'chimes', 'marimba'];
  // 舞台の左→右の並び順
  const STATION_ORDER = ['marimba', 'xylo', 'vib', 'glock', 'chimes', 'bd', 'sd', 'timp'];

  function timpItems(px, py, n) {
    const sizes = n >= 4 ? ['timp32', 'timp29', 'timp26', 'timp23'] : ['timp29', 'timp26', 'timp23'];
    const k = sizes.length, R = 112;
    return sizes.map((t, i) => {
      const th = (66 - (132 * i) / (k - 1)) * Math.PI / 180;
      return { type: t, x: px + R * Math.sin(th), y: py + R * Math.cos(th), rot: 0 };
    });
  }

  // 打楽器エリア（舞台奥）を作る。戻り値：部品の配列と使った奥行
  function percussionArea(stations, extraPlayers, stage, yTop, playerLabel) {
    const out = [];
    const C = SS.CATALOG;
    const list = STATION_ORDER.filter(s => stations.includes(s));
    const widthOf = s => (s === 'timp' ? 300 : (C[s] ? C[s].w : 80) + 30);
    const total = list.reduce((a, s) => a + widthOf(s), 0) + extraPlayers * 80;
    let x = Math.max(60, (stage.w - total) / 2);
    list.forEach(s => {
      const wv = widthOf(s);
      const cx = x + wv / 2;
      if (s === 'timp') {
        const py = yTop + 30;
        out.push({ type: 'player', label: 'Timp', x: cx, y: py, rot: 0 });
        timpItems(cx, py, 4).forEach(t => out.push(t));
      } else {
        const h = C[s].h;
        const iy = yTop + 55 + h / 2;
        out.push({ type: s, x: cx, y: iy, rot: 0 });
        out.push({ type: 'player', label: playerLabel, x: cx, y: iy - h / 2 - 22, rot: 0 });
      }
      x += wv;
    });
    for (let i = 0; i < extraPlayers; i++) {
      out.push({ type: 'player', label: playerLabel, x: x + 40, y: yTop + 40, rot: 0 });
      x += 80;
    }
    return { items: out, depth: list.length || extraPlayers ? 230 : 0 };
  }

  // 1列を扇形に並べる。入りきらない分は次の列へ
  function layoutArcRows(rows, c, r0, gap, spacing, maxSpan) {
    const out = [];
    let ri = 0;
    const queue = rows.map(r => r.slice());
    let R = r0;
    while (queue.length) {
      let labels = queue.shift();
      if (!labels.length) continue;
      const cap = Math.max(2, Math.floor((maxSpan * R) / spacing) + 1);
      if (labels.length > cap) {
        // あふれた分（右側）は次の列の先頭へ
        const rest = labels.slice(cap);
        labels = labels.slice(0, cap);
        if (queue.length) queue[0] = rest.concat(queue[0]); else queue.push(rest);
      }
      const pts = G().generate([labels.length], { shape: 'arc', r0: R, gap: 0, spacing }, c);
      pts.forEach((p, i) => out.push({ type: 'player', label: labels[i], x: p.x, y: p.y, rot: p.rot }));
      R += gap;
      ri++;
    }
    return { items: out, maxR: R - gap, rows: ri };
  }

  function band(st, stage) {
    const n = st.counts;
    const c = { x: stage.w / 2, y: stage.d - 110 };
    const rows = BAND_ROWS.map(r => r.flatMap(p => rep(p, n[p])));
    const P = n.Perc || 0;
    // 奥行に合わせて列の間隔を決める
    const nonEmpty = rows.filter(r => r.length).length || 1;
    const percDepth = P ? 260 : 60;
    const avail = c.y - percDepth - 60;
    const r0 = 200;
    let gap = nonEmpty > 1 ? Math.min(125, (avail - r0) / (nonEmpty - 1)) : 125;
    gap = Math.max(95, gap);
    const res = layoutArcRows(rows, c, r0, gap, 82, Math.PI * 0.92);
    const items = res.items;
    // ハープ・ピアノは列の外側
    const sideR = r0 + gap;
    rep('Hp', n.Hp).forEach((l, i) => { const p = G().fromPolar(sideR + i * 90, -1.45, c); items.push({ type: 'harp', x: p.x - 45, y: p.y, rot: 0 }, { type: 'player', label: 'Hp', x: p.x + 5, y: p.y, rot: G().faceAngle(p, c) }); });
    rep('Pf', n.Pf).forEach((l, i) => { const p = G().fromPolar(sideR + 60 + i * 200, 1.4, c); items.push({ type: 'piano', x: p.x, y: p.y - 30, rot: 90 }, { type: 'player', label: 'Pf', x: p.x - 100, y: p.y - 30, rot: 90 }); });
    if (P) {
      const stations = st.percInst ? PERC_STATIONS_BAND.slice(0, Math.min(P, 8)) : [];
      const extra = Math.max(0, P - stations.length);
      const yTop = Math.max(20, c.y - res.maxR - 60 - 260);
      items.push(...percussionArea(stations, extra, stage, yTop, 'Perc').items);
    }
    const need = res.maxR + 60 + (P ? 260 : 0) + 130;
    return { items, c, fits: need <= stage.d + 1, rows: res.rows };
  }

  function orch(st, stage) {
    const n = st.counts;
    const c = { x: stage.w / 2, y: stage.d - 110 };
    const S = G().sector;
    const anti = st.antiphonal;
    const order = anti ? ['Vn1', 'Vc', 'Va', 'Vn2'] : ['Vn1', 'Vn2', 'Va', 'Vc'];
    const counts = order.map(k => n[k] || 0);
    const tot = counts.reduce((a, b) => a + b, 0) || 1;
    const gapDeg = 4;
    const avail = 180 - gapDeg * (order.length - 1);
    let t = -90;
    const items = [];
    let maxR = 200;
    const secRange = {};
    order.forEach((k, i) => {
      const cnt = counts[i];
      if (!cnt) return;
      const span = Math.max(14, (avail * Math.sqrt(cnt)) / order.reduce((a, kk) => a + Math.sqrt(n[kk] || 0), 0));
      const r0 = (i === 0 || i === order.length - 1) ? 160 : 210;
      const list = S(k, cnt, t, t + span, r0, 100, 0, c, 80);
      list.forEach(p => { maxR = Math.max(maxR, G().polar(p, c).r); });
      items.push(...list);
      secRange[k] = [t, t + span];
      t += span + gapDeg;
    });
    void tot;
    // コントラバスはチェロの後ろ
    if (n.Cb) {
      const vr = secRange.Vc || [60, 88];
      const mid = (vr[0] + vr[1]) / 2;
      const cbR = Math.max(maxR + 90, 480);
      const list = S('Cb', n.Cb, mid - 16, mid + 16, cbR, 95, 0, c, 85);
      items.push(...list);
    }
    // 管楽器（弦の後ろ、中央に横一列）
    const line = (labels, y, sp) => { sp = sp || 84; const w = (labels.length - 1) * sp; return labels.map((l, i) => ({ type: 'player', label: l, x: c.x - w / 2 + i * sp, y, rot: 0 })); };
    let y = c.y - maxR - 100;
    const w1 = [...rep('Picc', n.Picc), ...rep('Fl', n.Fl), ...rep('Ob', n.Ob), ...rep('E.H.', n['E.H.'])];
    const w2 = [...rep('Cl', n.Cl), ...rep('B.Cl', n['B.Cl']), ...rep('Fg', n.Fg), ...rep('C.Fg', n['C.Fg'])];
    const risers = [];
    [w1, w2].forEach(row => {
      if (!row.length) return;
      items.push(...line(row, y));
      risers.push({ type: 'riser46', x: c.x, y: y + 10, w: Math.max(364, Math.ceil((row.length * 84 + 60) / 182) * 182), h: 121, rot: 0 });
      y -= 120;
    });
    const hr = rep('Hr', n.Hr), br = [...rep('Tp', n.Tp), ...rep('Tb', n.Tb), ...rep('Tuba', n.Tuba)];
    if (hr.length || br.length) {
      const sp = 84;
      const wh = hr.length * sp, wb = br.length * sp;
      const gapMid = 100;
      const x0 = c.x - (wh + gapMid + wb) / 2;
      hr.forEach((l, i) => items.push({ type: 'player', label: l, x: x0 + sp / 2 + i * sp, y, rot: 0 }));
      br.forEach((l, i) => items.push({ type: 'player', label: l, x: x0 + wh + gapMid + sp / 2 + i * sp, y, rot: 0 }));
      risers.push({ type: 'riser46', x: c.x, y: y + 10, w: Math.ceil((wh + gapMid + wb + 60) / 182) * 182, h: 121, rot: 0 });
      y -= 120;
    }
    // ハープ・ピアノは第1ヴァイオリンの後ろ（上手・下手どちらも可）
    rep('Hp', n.Hp).forEach((l, i) => { const p = G().fromPolar(maxR + 80, -1.2 + i * 0.25, c); items.push({ type: 'harp', x: p.x - 45, y: p.y, rot: 0 }, { type: 'player', label: 'Hp', x: p.x + 5, y: p.y, rot: 0 }); });
    rep('Pf', n.Pf).forEach(() => { const p = G().fromPolar(maxR + 150, -0.8, c); items.push({ type: 'piano', x: p.x, y: p.y, rot: 90 }, { type: 'player', label: 'Pf', x: p.x - 100, y: p.y, rot: 90 }); });
    // ティンパニ・打楽器（いちばん奥）
    const yTop = Math.max(20, y - 170);
    const perc = [];
    if (n.Timp) perc.push('timp');
    const P = n.Perc || 0;
    const stations = st.percInst ? PERC_STATIONS_ORCH.slice(0, Math.min(P, 6)) : [];
    const pa = percussionArea(perc.concat(stations), Math.max(0, P - stations.length), stage, yTop, 'Perc');
    items.push(...pa.items);
    const need = c.y - yTop + 130;
    return { items: risers.concat(items), c, fits: need <= stage.d + 1 };
  }

  function strings(st, stage) {
    return orch({ counts: Object.assign({}, st.counts), antiphonal: st.antiphonal, percInst: false }, stage);
  }

  // メイン：編成 st とステージ stage から部品リストを作る
  A.build = function (st, stage) {
    const f = st.type === 'orch' ? orch : st.type === 'strings' ? strings : band;
    const r = f(st, stage);
    r.items.push({ type: 'podium', x: r.c.x, y: r.c.y, rot: 0 });
    r.items.forEach(it => {
      it.auto = true;
      it.x = Math.round(it.x); it.y = Math.round(it.y);
      if (it.type === 'player' && !it.rot && st.type !== 'band') it.rot = 0;
    });
    // ステージの外にはみ出したものを内側へ
    r.items.forEach(it => {
      it.x = Math.max(30, Math.min(stage.w - 30, it.x));
      it.y = Math.max(20, Math.min(stage.d - 20, it.y));
    });
    return r;
  };

  SS.auto = A;
})(window.SS);
