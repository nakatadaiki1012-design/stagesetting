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
  // ひな壇の番号（組み図・部材の表で使う）。段（step）が重ならなければ段の数字、重なるときは前から A, B, C…
  SS.hinaNumbers = function (items) {
    const hs = items.filter(it => it.type === 'hina');
    const steps = hs.map(h => h.step).filter(Boolean);
    const map = new Map();
    if (steps.length === hs.length && new Set(steps).size === steps.length) hs.forEach(h => map.set(h, String(h.step)));
    else hs.slice().sort((a, b) => b.y - a.y || a.x - b.x).forEach((h, i) => map.set(h, i < 26 ? String.fromCharCode(65 + i) : 'Z' + (i - 25)));
    return map;
  };

  // よく使われる段の高さ（7寸ずつ上がる）
  const STD_STEPS = [21.2, 42.4, 63.6, 84.8];
  SS.PANELS = {
    '36': { name: '3×6尺（サブロク）', w: 182, d: 91 },
    '46': { name: '4×6尺（ヨンロク）', w: 182, d: 121 },
    '66': { name: '6×6尺（ロクロク）', w: 182, d: 182 },
  };
  // 平台1枚の、置いたときの大きさ（w：横、d：奥行）。横置き＝6尺が横、縦置き＝6尺が奥行
  SS.panelSize = function (o) {
    const pn = SS.PANELS[(o && o.panel) || '36'] || SS.PANELS['36'];
    return o && o.orient === 'v' ? { w: pn.d, d: pn.w } : { w: pn.w, d: pn.d };
  };
  // ひな壇1段の組み方（よく使う型）
  SS.HINA_TYPES = [
    { id: '36h2', panel: '36', orient: 'h', deep: 2, name: '3×6 横・2列', hint: '3×6尺を横向き（6尺が横）に、奥へ2枚。いちばん一般的' },
    { id: '36v1', panel: '36', orient: 'v', deep: 1, name: '3×6 縦', hint: '3×6尺を縦向き（6尺が奥行）に。幅を91cm刻みで調整できる' },
    { id: '46h1', panel: '46', orient: 'h', deep: 1, name: '4×6 横', hint: '4×6尺を横向きに1枚。狭い舞台・オーケストラの管楽器' },
    { id: '46v1', panel: '46', orient: 'v', deep: 1, name: '4×6 縦', hint: '4×6尺を縦向きに。幅121cm刻み' },
    { id: '66', panel: '66', orient: 'h', deep: 1, name: '6×6', hint: '6×6尺（ロクロク）を1枚' },
    { id: '46h2', panel: '46', orient: 'h', deep: 2, name: '4×6 横・2列', hint: '4×6尺を横向きに奥へ2枚。ホルンのボックス・打楽器' },
    { id: '36h3', panel: '36', orient: 'h', deep: 3, name: '3×6 横・3列', hint: '3×6尺を横向きに奥へ3枚。打楽器の段' },
  ];
  SS.hinaTypeDepth = t => SS.panelSize(t).d * t.deep;
  SS.hinaTypeOf = o => SS.HINA_TYPES.find(t => t.panel === (o.panel || '36') && t.orient === (o.orient || 'h') && t.deep === (o.deep || 1)) || null;
  // 型の小さな図（平台の並びと寸法）
  SS.hinaTypeSVG = function (t) {
    const P = SS.panelSize(t), across = Math.max(2, Math.round(364 / P.w));
    const W = P.w * across, D = P.d * t.deep, k = 64 / Math.max(W, 273);
    let s = `<svg viewBox="-4 -4 ${W * k + 8} ${273 * k + 8}" width="${W * k + 8}" height="${273 * k + 8}" aria-hidden="true">`;
    for (let i = 0; i < across; i++) for (let j = 0; j < t.deep; j++) s += `<rect x="${i * P.w * k}" y="${(273 - D) * k + j * P.d * k}" width="${P.w * k}" height="${P.d * k}" fill="#ead9bb" stroke="#8a6d3b" stroke-width="1.2"/>`;
    return s + '</svg>';
  };
  SS.heightName = v => { const h = SS.RISER_HEIGHTS.find(x => Math.abs(x.v - v) < 0.6); return h ? h.name : `${Math.round(v)}cm`; };
  SS.heightHow = v => { const h = SS.RISER_HEIGHTS.find(x => Math.abs(x.v - v) < 0.6); return h ? h.how : ''; };

  // ---------------------------------------------------------------- 弧（円形）のひな壇
  // it.curve：前のふちの半径（cm）。円の中心は段の前（客席側・指揮者の方）。w＝前のふちの弧の長さ、h＝奥行
  // 部品の中の座標（向き rot を回す前）で、円の中心は (0, curve + h/2)
  SS.hinaArc = function (it) {
    if (!it || it.type !== 'hina' || !(+it.curve > 0)) return null;
    const R = +it.curve, h = it.h || 182;
    return { R, h, th: Math.min(Math.PI * 1.6, (it.w || 728) / R), cy: R + h / 2 };
  };
  // 平台1枚ずつの位置（部品の中の座標）。行 row は前から、列 col は下手から
  // まっすぐの段は格子。弧の段は、各列の平台の前の角が円にのるように、平台を扇に並べる
  SS.hinaPanels = function (it) {
    const P = SS.panelSize(it), a = SS.hinaArc(it), out = [];
    const w = it.w || 728, h = it.h || 182;
    if (!a) {
      const across = Math.max(1, Math.round(w / P.w)), deep = Math.max(1, Math.round(h / P.d));
      const cw = w / across, cd = h / deep;
      for (let j = 0; j < deep; j++) for (let i = 0; i < across; i++) out.push({ x: -w / 2 + (i + 0.5) * cw, y: h / 2 - (j + 0.5) * cd, rot: 0, w: cw, d: cd, row: j, col: i });
      return out;
    }
    const deep = Math.max(1, Math.round(h / P.d));
    for (let j = 0; j < deep; j++) {
      const rf = a.R + j * P.d, dl = 2 * Math.asin(Math.min(1, P.w / 2 / rf));
      const n = Math.max(1, Math.floor(a.th / dl + 0.25));
      const dist = rf * Math.cos(dl / 2) + P.d / 2;
      for (let i = 0; i < n; i++) {
        const ph = -((n - 1) * dl) / 2 + i * dl;
        out.push({ x: dist * Math.sin(ph), y: a.cy - dist * Math.cos(ph), rot: (ph * 180) / Math.PI, w: P.w, d: P.d, row: j, col: i });
      }
    }
    return out;
  };
  // 部品の中の座標で、段の外形（弧の段は扇形）
  SS.hinaOutline = function (it) {
    const a = SS.hinaArc(it), w = it.w || 728, h = it.h || 182;
    if (!a) return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    // 平台の角をつないだ形（うしろの角のあいだの三角のすき間も段に含める）
    const ps = SS.hinaPanels(it), rows = Math.max(...ps.map(q => q.row));
    const corner = (q, sx, sy) => { const t = (q.rot * Math.PI) / 180, lx = (sx * q.w) / 2, ly = (sy * q.d) / 2; return [q.x + lx * Math.cos(t) - ly * Math.sin(t), q.y + lx * Math.sin(t) + ly * Math.cos(t)]; };
    const back = ps.filter(q => q.row === rows), front = ps.filter(q => q.row === 0).reverse();
    const pts = [];
    back.forEach(q => pts.push(corner(q, -1, -1), corner(q, 1, -1)));
    front.forEach(q => pts.push(corner(q, 1, 1), corner(q, -1, 1)));
    return pts;
  };
  const inPoly = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  // 部品の中の座標での外枠 { x0, x1, y0, y1 }
  SS.hinaBounds = function (it) {
    const o = SS.hinaOutline(it);
    return { x0: Math.min(...o.map(p => p[0])), x1: Math.max(...o.map(p => p[0])), y0: Math.min(...o.map(p => p[1])), y1: Math.max(...o.map(p => p[1])) };
  };
  // 点（図の座標）が段の上か。m：ふちの余裕（cm）
  SS.hinaContains = function (it, px, py, m) {
    m = m || 0;
    const t = -((it.rot || 0) * Math.PI) / 180, dx = px - it.x, dy = py - it.y;
    const lx = dx * Math.cos(t) - dy * Math.sin(t), ly = dx * Math.sin(t) + dy * Math.cos(t);
    const a = SS.hinaArc(it);
    if (!a) return Math.abs(lx) <= (it.w || 728) / 2 + m && Math.abs(ly) <= (it.h || 182) / 2 + m;
    // 扇形の外形の中か（m の余裕は、中心から外へ／内へ・左右へ広げて近似）
    if (inPoly(lx, ly, SS.hinaOutline(it))) return true;
    if (!m) return false;
    const r = Math.hypot(lx, a.cy - ly), ang = Math.atan2(lx, a.cy - ly);
    return r >= a.R - m && r <= a.R + a.h + m && Math.abs(ang) <= a.th / 2 + m / r;
  };

  // ひな壇1段に使う部材の数（目安）
  SS.hinaMaterials = function (it) {
    const pn = SS.PANELS[it.panel || '36'], P = SS.panelSize(it);
    if (SS.hinaArc(it)) {
      // 弧の段：平台は1枚ずつ扇に並ぶので、足は1枚ごとに6か所（四隅と長い辺の真ん中）の目安
      const ps = SS.hinaPanels(it), v = it.hgt || 21.2;
      const across = Math.max(...ps.map(p => p.col)) + 1, deep = Math.max(...ps.map(p => p.row)) + 1;
      const legs = v > 13 ? ps.length * 6 : 0;
      const legName = v <= 13 ? '' : v < 25 ? '3寸の足（角材）' : v < 35 ? '箱馬（6寸の向き）' : v < 50 ? '箱馬（1尺の向き）' : v < 70 ? '箱馬（1尺7寸の向き）' : '高足（開き足）';
      return { panels: ps.length, panelName: pn.name + (it.orient === 'v' && it.panel !== '66' ? '・縦置き' : ''), across, deep, legs, legName, arc: true };
    }
    const across = Math.max(1, Math.round((it.w || 182) / P.w));
    const deep = Math.max(1, Math.round((it.h || 182) / P.d));
    const panels = across * deep;
    const v = it.hgt || 21.2;
    let legs = 0, legName = '';
    if (v > 13) {
      // 平台の前と後ろの辺に、つなぎ目ごとに足を置く（目安）
      legs = (deep + 1) * (across * 2 + 1);
      legName = v < 25 ? '3寸の足（角材）' : v < 35 ? '箱馬（6寸の向き）' : v < 50 ? '箱馬（1尺の向き）' : v < 70 ? '箱馬（1尺7寸の向き）' : '高足（開き足）';
    }
    return { panels, panelName: pn.name + (it.orient === 'v' && it.panel !== '66' ? '・縦置き' : ''), across, deep, legs, legName };
  };

  // ひな壇の部材の表（組み図・編成表で共通。平台の番号は組み図の番号と同じ）
  SS.hinaSummary = function (items) {
    const hno = SS.hinaNumbers(items);
    const rows = items.filter(it => it.type === 'hina').map(it => {
      const m = SS.hinaMaterials(it), no = hno.get(it);
      return Object.assign({ it, no, hgt: it.hgt || 21.2, w: it.w, h: it.h, label: it.perc ? `打楽器の段（${no}）` : /^\d+$/.test(no) ? `${no}段目` : `ひな壇${no}`, first: `${no}-1`, last: `${no}-${m.panels}` }, m);
    }).sort((a, b) => a.no.localeCompare(b.no, 'ja', { numeric: true }));
    const pan = {}, leg = {};
    rows.forEach(r => { pan[r.panelName] = (pan[r.panelName] || 0) + r.panels; if (r.legs) leg[r.legName] = (leg[r.legName] || 0) + r.legs; });
    return { rows, pan, leg, stairs: items.filter(it => it.type === 'stairs').length };
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

  // 舞台奥の通路（反射板と、ひな壇・楽器のあいだに空ける幅 cm）。ステージの設定で変えられる
  A.DEFAULT_AISLE = 60;
  A.aisleOf = stage => (stage && stage.backAisle != null && isFinite(+stage.backAisle) ? Math.max(0, +stage.backAisle) : A.DEFAULT_AISLE);
  // 反射板の位置（ホールの設備で入れたとき）から通路を取る。図の奥のふちから、段・楽器を置いてよい所までの距離
  const backLimit = stage => A.aisleOf(stage) + (stage && stage.fixtures && stage.fixtures.shell != null && isFinite(+stage.fixtures.shell) ? Math.max(0, +stage.fixtures.shell) : 0);
  let AISLE = A.DEFAULT_AISLE; // いま並べているステージの、奥のふちから空ける幅

  A.defaultState = function (type) {
    const e = A.ENSEMBLES[type || 'band'];
    const counts = {};
    e.parts.forEach(([k, n]) => { counts[k] = n; });
    return {
      type: type || 'band', counts, antiphonal: false, percInst: true, hornBox: false, percPlace: type === 'orch' ? 'top' : 'back', lowOuter: type === 'band', layout: 'std',
      hina: type === 'orch' ? { steps: 3, panel: '46', orient: 'h', deep: 1 } : type === 'strings' ? { steps: 0, panel: '36', orient: 'h', deep: 2 } : { steps: 2, panel: '36', orient: 'h', deep: 2 },
    };
  };

  // 吹奏楽の並び方（前の列から。1列の中は 下手→上手）
  // 床の列は扇形、ひな壇の列はまっすぐ。うしろの列から順にひな壇に乗る
  A.BAND_LAYOUTS = {
    std: {
      name: '標準（Fl・Cl前列／Hr・低音 1段目／Tp・Tb 2段目）',
      rows: [
        ['Picc', 'Fl', 'Ob', 'Es.Cl', 'Cl1'],
        ['A.Sx', 'T.Sx', 'B.Sx', 'Fg', 'Cl2', 'Cl3', 'B.Cl'],
        ['Hr', 'Euph', 'Tuba', 'St.B'],
        ['Tp', 'Tb', 'B.Tb'],
      ],
    },
    clLeft: {
      name: 'Cl下手・Sax上手（Clを1stバイオリンの位置に）',
      rows: [
        ['Es.Cl', 'Cl1', 'Picc', 'Fl', 'Ob'],
        ['Cl2', 'Cl3', 'B.Cl', 'Fg', 'A.Sx', 'T.Sx', 'B.Sx'],
        ['Hr', 'Euph', 'Tuba', 'St.B'],
        ['Tp', 'Tb', 'B.Tb'],
      ],
    },
    classic: {
      name: '昔ながら（Sax・Hr 2列目／Tb・低音 1段目／Tp 最上段）',
      rows: [
        ['Picc', 'Fl', 'Es.Cl', 'Cl1'],
        ['A.Sx', 'T.Sx', 'B.Sx', 'Ob', 'Fg', 'Cl2', 'Cl3', 'B.Cl'],
        ['Hr', 'Tb', 'B.Tb', 'Euph', 'Tuba', 'St.B'],
        ['Tp'],
      ],
    },
    german: {
      name: 'ドイツ式（Cl下手・Fl/Ob中央・Sax上手、後ろにTp｜Tuba｜Tb）',
      rows: [
        ['Es.Cl', 'Cl1', 'Picc', 'Fl', 'Ob'],
        ['Cl2', 'Cl3', 'B.Cl', 'Hr', 'Euph', 'Fg', 'A.Sx', 'T.Sx', 'B.Sx'],
        ['Tp', 'Tuba', 'St.B', 'Tb', 'B.Tb'],
      ],
    },
  };
  const bandRows = st => (A.BAND_LAYOUTS[st.layout] || A.BAND_LAYOUTS.std).rows;

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
    // 左右の端は数値でも、奥行 y ごとに変わる関数でもよい（台形の舞台・ひな壇や扇形の横）
    const fz = v => (typeof v === 'function' ? v : () => v);
    const zr = y => (zone.x0 != null ? [Math.max(fz(zone.x0)(y), fz(zone.x0)(y + 150)), Math.min(fz(zone.x1)(y), fz(zone.x1)(y + 150))] : R().xRange(stage, y + 60));
    stations.forEach(s => {
      const [l, rr] = zr(rowY(rows.length));
      const avail = rr - l - (zone.x0 != null ? 0 : 40);
      if (cur.length && used + width(s) > avail) { rows.push(cur); cur = []; used = 0; }
      cur.push(s); used += width(s);
    });
    if (cur.length) rows.push(cur);
    let total = 0;
    rows.forEach((row, ri) => {
      const y0 = rowY(ri);
      const [l, rr] = zr(y0);
      const tw = row.reduce((a, s) => a + width(s), 0);
      const pad = zone.x0 != null ? 0 : 40;
      const gapX = Math.max(0, Math.min(40, (rr - l - pad - tw) / Math.max(1, row.length)));
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
    // 横に置いた打楽器の奏者は指揮者の方を向く
    if (zone.faceTo) stations.forEach(s => { if (s.player && s.kind !== 'timp') s.player.rot = G().faceAngle(s.player, zone.faceTo); });
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
      out.push(Object.assign({}, it, { label: 'Hr' }));
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

  // 打楽器を「最上段」「下手」「舞台奥」に振り分ける
  const TOP_KINDS = new Set([...TIMP, 'marimba', 'marimba43', 'xylo', 'vib', 'glock', 'chimes']);
  function splitPerc(list, place) {
    const res = { top: [], left: [], back: [] };
    if (!list.length) return res;
    if (place !== 'both') { res[place === 'top' ? 'top' : place === 'left' ? 'left' : 'back'] = list.slice(); return res; }
    const inst = list.filter(it => it.type !== 'player');
    const pl = list.filter(it => it.type === 'player');
    const topI = inst.filter(it => TOP_KINDS.has(it.type)), leftI = inst.filter(it => !TOP_KINDS.has(it.type));
    // 持ち場の数だけ奏者を割り当てる（ティンパニの人は上へ）
    const topStations = (topI.some(it => TIMP.includes(it.type)) ? 1 : 0) + topI.filter(it => !TIMP.includes(it.type)).length;
    const ordered = pl.slice().sort((a, b) => (/^tim/i.test(b.label) ? 1 : 0) - (/^tim/i.test(a.label) ? 1 : 0));
    res.top = topI.concat(ordered.slice(0, topStations));
    res.left = leftI.concat(ordered.slice(topStations));
    return res;
  }
  // 打楽器の必要な幅（1行に並べたとき）
  function percWidth(list) {
    const C = SS.CATALOG;
    let w = 0, timp = false;
    list.forEach(it => {
      if (it.type === 'player') return;
      if (TIMP.includes(it.type)) { timp = true; return; }
      w += (it.w || C[it.type].w) + 28;
    });
    if (timp) w += 300;
    const players = list.filter(it => it.type === 'player').length;
    const stations = list.filter(it => it.type !== 'player' && !TIMP.includes(it.type)).length + (timp ? 1 : 0);
    w += Math.max(0, players - stations) * 75;
    return w;
  }
  const cloneList = list => list.map(it => Object.assign({}, it));

  // 打楽器をのせる平台の段（打楽器のまわりを平台の枚数単位で囲む）
  // 前は最上段にくっつけ、うしろは反射板とのあいだに通路（AISLE）を残す
  function percPlatform(list, stage, H, hgt, yLimit, step, D) {
    const C = SS.CATALOG, P = SS.panelSize(H);
    let x0 = Infinity, x1 = -Infinity;
    list.forEach(it => {
      const w = it.type === 'player' ? 50 : (it.w || C[it.type].w);
      x0 = Math.min(x0, it.x - w / 2); x1 = Math.max(x1, it.x + w / 2);
    });
    const cx = (x0 + x1) / 2;
    const [bl, br] = R().xRange(stage, Math.max(0, AISLE));
    let W = Math.ceil((x1 - x0 + 40) / P.w) * P.w;
    W = Math.min(W, Math.floor((br - bl) / P.w) * P.w);
    const x = Math.max(bl + W / 2, Math.min(br - W / 2, cx));
    return { type: 'hina', x, y: yLimit - D / 2, w: W, h: D, hgt: hgt || 42.4, panel: H.panel || '36', orient: H.orient || 'h', step, rot: 0, perc: true };
  }

  /**
   * ひな壇の段と打楽器をまとめて配置する
   * rows: [{ depth, want, hgt, place(cx, yFront, depth, W) → items }]（前の段から）
   * すべての段は同じ横幅にそろえる
   */
  function tiersAndPerc(stage, yFront0, rows, H, percList, place, floor) {
    const pn = SS.panelSize(H);
    const upW = v => Math.ceil(v / pn.w) * pn.w;
    const parts = splitPerc(percList, place);
    // 最上段に1列で並びきらない打楽器は、下手（または舞台奥）へ回す
    if (parts.top.length) {
      const [bl, br] = R().xRange(stage, 0);
      const leftW = place === 'top' ? 0 : Math.max(330, Math.min(400, stage.w * 0.2)) + 35;
      const maxTop = Math.floor((br - bl - leftW - 20) / pn.w) * pn.w - 40;
      const dest = place === 'top' ? parts.back : parts.left;
      while (percWidth(parts.top) > maxTop) {
        const inst = parts.top.filter(it => it.type !== 'player' && !TIMP.includes(it.type));
        if (!inst.length) break;
        const mv = inst[inst.length - 1];
        parts.top.splice(parts.top.indexOf(mv), 1);
        dest.push(mv);
        const pl = parts.top.filter(it => it.type === 'player' && !/^tim/i.test(it.label));
        if (pl.length) { parts.top.splice(parts.top.indexOf(pl[pl.length - 1]), 1); dest.push(pl[pl.length - 1]); }
      }
    }
    const out = { tiers: [], items: [], leftRect: null, backDepth: 0, yBack: yFront0 };
    // 下手の打楽器（客席から見て左）
    // まず、ひな壇は真ん中のまま、その左と、床の扇形の左に並べてみる
    let beside = false;
    if (parts.left.length && floor) {
      const W0 = upW(Math.max(364, ...rows.map(r => r.want), parts.top.length ? percWidth(parts.top) + 40 : 0));
      const tierL = stage.w / 2 - W0 / 2 - 35;
      const arcL = y => { const Rr = floor.R + 55, dy = floor.c.y - y; return dy >= Rr ? floor.c.x + 1e4 : floor.c.x - Math.sqrt(Rr * Rr - dy * dy); };
      const zone = {
        yTop: AISLE,
        x0: y => R().xRange(stage, Math.max(0, y))[0] + 18,
        x1: y => Math.min(y < yFront0 + 30 ? tierL : 1e4, arcL(y) - 30, stage.w / 2 - 120),
        faceTo: floor.c,
      };
      if (zone.x1(60) - zone.x0(60) >= 250) {
        const trial = cloneList(parts.left);
        A.arrangePerc(trial, stage, zone);
        const C = SS.CATALOG;
        const ok = trial.every(it => {
          const hw = it.type === 'player' ? 25 : (it.w || C[it.type].w) / 2, hh = it.type === 'player' ? 25 : (it.h || C[it.type].h) / 2;
          return it.x + hw <= zone.x1(it.y - hh) + 12 && it.x + hw <= zone.x1(it.y + hh) + 12 && it.x - hw >= R().xRange(stage, Math.max(0, it.y))[0] && it.y + hh < (floor.yMax || floor.c.y - 40);
        });
        if (ok) {
          trial.forEach((t, i) => Object.assign(parts.left[i], { x: t.x, y: t.y, rot: t.rot }));
          const C2 = SS.CATALOG;
          const bb = parts.left.reduce((b, it) => {
            const hw = it.type === 'player' ? 25 : (it.w || C2[it.type].w) / 2, hh = it.type === 'player' ? 25 : (it.h || C2[it.type].h) / 2;
            return { x0: Math.min(b.x0, it.x - hw), x1: Math.max(b.x1, it.x + hw), y0: Math.min(b.y0, it.y - hh), y1: Math.max(b.y1, it.y + hh) };
          }, { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
          out.leftRect = { x0: bb.x0 - 10, x1: bb.x1 + 10, y0: 0, y1: bb.y1 + 10, beside: true };
          out.items.push(...parts.left);
          out.leftItems = parts.left;
          beside = true;
        }
      }
    }
    if (parts.left.length && !beside) {
      const [xl] = R().xRange(stage, 30);
      const bw = Math.max(330, Math.min(400, stage.w * 0.2));
      const zone = { yTop: AISLE, x0: xl + 15, x1: xl + 15 + bw };
      const dep = A.arrangePerc(parts.left, stage, zone);
      out.leftRect = { x0: zone.x0 - 10, x1: zone.x1 + 10, y0: 0, y1: AISLE + dep + 10 };
      out.items.push(...parts.left);
    }
    const hasTopPerc = parts.top.length > 0;
    if (!rows.length && !hasTopPerc) {
      if (parts.back.length) { out.backDepth = A.arrangePerc(parts.back, stage, { yTop: AISLE }); out.items.push(...parts.back); }
      return out;
    }
    // 段の横幅（いちばん広い列に合わせ、平台の枚数単位）
    let W = upW(Math.max(364, ...rows.map(r => r.want), hasTopPerc ? percWidth(parts.top) + 40 : 0));
    let percD = 0, cx = stage.w / 2;
    for (let pass = 0; pass < 3; pass++) {
      if (hasTopPerc) {
        const dry = cloneList(parts.top);
        const d0 = A.arrangePerc(dry, stage, { yTop: 0, x0: 0, x1: W - 30 });
        percD = Math.ceil((d0 + 25) / pn.d) * pn.d;
      }
      const total = rows.reduce((a, r) => a + (r.need ? r.need(Math.min(W, 2000)) : r.depth), 0) + percD;
      const yBack = yFront0 - total;
      let [xl, xr] = R().xRange(stage, Math.max(0, yBack, AISLE));
      if (out.leftRect && !out.leftRect.beside && yBack < out.leftRect.y1) xl = Math.max(xl, out.leftRect.x1 + 10);
      const Wmax = Math.max(pn.w * 2, Math.floor((xr - xl - 20) / pn.w) * pn.w);
      cx = Math.max(xl + 10 + Math.min(W, Wmax) / 2, Math.min(stage.w / 2, xr - 10 - Math.min(W, Wmax) / 2));
      if (W <= Wmax) break;
      W = Wmax;
    }
    let yFront = yFront0;
    const std = [21.2, 42.4, 63.6, 84.8];
    rows.forEach((r, i) => {
      const d = r.need ? r.need(W) : r.depth;
      if (r.hgt) out.tiers.push({ type: 'hina', x: cx, y: yFront - d / 2, w: W, h: d, hgt: r.hgt, panel: H.panel || '36', orient: H.orient || 'h', step: i + 1, rot: 0 });
      out.items.push(...r.place(cx, yFront, d, W));
      yFront -= d;
    });
    if (hasTopPerc) {
      const i = rows.length;
      const hgt = (H.heights && H.heights[i]) || std[Math.min(i, 3)];
      out.tiers.push({ type: 'hina', x: cx, y: yFront - percD / 2, w: W, h: percD, hgt, panel: H.panel || '36', orient: H.orient || 'h', step: i + 1, rot: 0 });
      A.arrangePerc(parts.top, stage, { yTop: yFront - percD + 12, x0: cx - W / 2 + 15, x1: cx + W / 2 - 15 });
      out.items.push(...parts.top);
      yFront -= percD;
    }
    out.yBack = yFront;
    if (parts.back.length) {
      if (out.tiers.length) {
        // ひな壇があるときは、奥の打楽器も床に落ちないよう、最上段にくっつけた「打楽器の段」に乗せる
        // 段のうしろ（反射板側）には通路を残す。入りきらないときは「ぶつかる」として、詰めた並べ方を探す
        const P = SS.panelSize(H);
        const dep = A.arrangePerc(cloneList(parts.back), stage, { yTop: 0 });
        let D = Math.ceil((dep + 20) / P.d) * P.d;
        const room = yFront - AISLE;
        if (D > room) { out.percCramped = true; D = Math.max(P.d, Math.floor(room / P.d) * P.d); }
        out.backDepth = A.arrangePerc(parts.back, stage, { yTop: yFront - D + 10 });
        const top = Math.max(...out.tiers.map(t => t.hgt || 0));
        const next = [21.2, 42.4, 63.6, 84.8].find(v => v > top + 1) || top; // 最上段より1段高く
        out.tiers.push(percPlatform(parts.back, stage, H, next, yFront, out.tiers.length + 1, D));
      } else {
        out.backDepth = A.arrangePerc(parts.back, stage, { yTop: AISLE });
      }
      out.items.push(...parts.back);
    }
    return out;
  }

  // ---------------------------------------------------------------- 吹奏楽
  // 上手の外側の弧に置く低音グループ（内側→外側の順。弦バスがいちばん外）
  const LOW_GROUP = ['B.Cl', 'Euph', 'Tuba', 'St.B'];

  function band(st, stage, tune, lowFallback) {
    const n = st.counts;
    const lowOn = st.lowOuter && !lowFallback;
    const c = { x: stage.w / 2, y: podiumY(stage) };
    const H = st.hina || { steps: 0 };
    const pn = SS.panelSize(H);
    const tierD = pn.d * (H.deep || 1);
    const place = st.percPlace || 'back';
    const lowLabels = lowOn ? LOW_GROUP.flatMap(p => rep(p, n[p])) : [];
    let rows = bandRows(st).map(r => r.filter(p => !(lowOn && LOW_GROUP.includes(p))).flatMap(p => rep(p, n[p]))).filter(r => r.length);
    const K = Math.min(H.steps || 0, Math.max(0, rows.length - 1));
    const floorRows = rows.slice(0, rows.length - K);
    const tierRows = rows.slice(rows.length - K);
    const items = [];
    const sp = tune.spacing, gap = tune.gap, r0 = tune.r0;
    // 床の扇形
    let R0 = r0;
    // 列の中身は { v: ラベル, c: 前の列からはみ出してきたか }
    const queue = floorRows.map(r => hornSlots(r, st.hornBox).map(v => ({ v, c: false })));
    let maxR = r0 - gap;
    while (queue.length) {
      let row = queue.shift();
      if (!row.length) continue;
      const cap = Math.max(2, Math.floor((Math.PI * tune.span * R0) / sp) + 1);
      // 最後の列が少しだけあふれるときは、間隔を少し詰めて1列に収める（1人だけの列を作らない）
      const capTight = Math.floor((Math.PI * 0.99 * R0) / (sp * 0.9)) + 1;
      let spRow = sp;
      if (row.length > cap && !queue.length && row.length <= capTight) {
        spRow = Math.min(sp, (Math.PI * 0.99 * R0) / (row.length - 1));
      } else if (row.length > cap) {
        // 入りきらない分は、真ん中に近い人から1つ後ろの列の真ん中へ（下手・上手の位置関係を保つ）
        // 前の列から来た人は動かさない（同じ人たちがどんどん後ろへ押し出されないように）
        const mid = (row.length - 1) / 2;
        const near = (a, b) => Math.abs(a - mid) - Math.abs(b - mid);
        const idx = row.map((e, i) => i);
        const order = idx.filter(i => !row[i].c).sort(near).concat(idx.filter(i => row[i].c).sort(near));
        const out = new Set(order.slice(0, row.length - cap));
        const rest = row.filter((e, i) => out.has(i)).map(e => ({ v: e.v, c: true }));
        row = row.filter((e, i) => !out.has(i));
        if (queue.length) { const q = queue[0], m = Math.floor(q.length / 2); queue[0] = q.slice(0, m).concat(rest, q.slice(m)); } else queue.push(rest);
      }
      const labels = row.map(e => e.v);
      const pts = G().generate([labels.length], { shape: 'arc', r0: R0, gap: 0, spacing: spRow }, c);
      let hasBox = false;
      pts.forEach((p, i) => {
        const l = labels[i];
        if (typeof l === 'object') { hasBox = true; items.push({ type: 'player', label: 'Hr#box', pair: l.pair, x: p.x, y: p.y, rot: p.rot }); }
        else items.push({ type: 'player', label: l, x: p.x, y: p.y, rot: p.rot });
      });
      maxR = R0 + (hasBox ? 75 : 0);
      R0 += gap + (hasBox ? 75 : 0);
    }
    // ひな壇の列（まっすぐ）
    const std = [21.2, 42.4, 63.6, 84.8];
    const rowSpecs = tierRows.map((row0, ti) => {
      const row = hornSlots(row0, st.hornBox);
      const hasBox = row.some(l => typeof l === 'object');
      const depth = hasBox ? Math.max(tierD, 182 + pn.d) : tierD;
      const cap = W => Math.max(2, Math.floor((W - 70) / 70) + 1);
      return {
        depth, want: row.length * sp + 60,
        // 横幅に入りきらない列は、段の上で2列にする
        need: W => (row.length > cap(W) && !hasBox ? Math.max(depth, Math.ceil(205 / pn.d) * pn.d) : depth),
        hgt: (H.heights && H.heights[ti]) || std[Math.min(ti, 3)],
        place: (cx, yFront, d, W) => {
          const labels = row.map(l => (typeof l === 'object' ? 'Hr#box' : l));
          const mark = (list, off) => list.map((p, i) => { const l = row[i + off]; if (typeof l === 'object') { p.pair = l.pair; p.straight = true; } return p; });
          if (row.length > cap(W) && !hasBox) {
            const half = Math.ceil(row.length / 2);
            return mark(lineRow(labels.slice(0, half), yFront - 55, cx, sp, W - 70), 0)
              .concat(mark(lineRow(labels.slice(half), yFront - 55 - 100, cx, sp, W - 70), half));
          }
          const yRow = hasBox ? yFront - 62 : yFront - d / 2 + 12;
          return mark(lineRow(labels, yRow, cx, sp, W - 70), 0);
        },
      };
    });
    // 打楽器
    const P = n.Perc || 0;
    let perc = [];
    if (P) {
      const stations = st.percInst ? PERC_STATIONS_BAND.slice(0, Math.min(P, 8)) : [];
      const hasTimp = stations.includes('timp');
      perc = percItems(hasTimp ? 4 : 0, stations.filter(s => s !== 'timp'), rep('Perc', P).map((l, i) => (hasTimp && i === 0 ? 'Timp' : l)));
    }
    const tp = tiersAndPerc(stage, c.y - maxR - tune.clear, rowSpecs, H, perc, place, { c, R: maxR, yMax: c.y - 40 - (n.Pf ? 230 : 0) - (n.Hp ? 140 : 0) });
    items.push(...tp.items);
    // 低音グループ：いちばん外側の床の弧の、さらに外側（上手側）に並べる
    if (lowLabels.length) {
      // 1本の弧で置けなければ、2本の弧（内側：B.Cl・Euph／外側：Tuba・弦バス）にして短くする
      const arc = (labels, Rl) => {
        const pts = [];
        let t = 1.48;
        for (let i = labels.length - 1; i >= 0; i--) {
          const p = G().fromPolar(Rl, t, c);
          pts.unshift({ type: 'player', label: labels[i], x: p.x, y: p.y, rot: G().faceAngle(p, c) });
          t -= sp / Rl;
        }
        return pts;
      };
      const blocked = pts => pts.some(p => !inside(stage, p, 30) || tp.tiers.some(h => Math.abs(p.x - h.x) < h.w / 2 + 40 && Math.abs(p.y - h.y) < h.h / 2 + 40) ||
        tp.items.some(o => o.type !== 'player' && Math.hypot(o.x - p.x, o.y - p.y) < 90) ||
        items.some(o => o.type === 'player' && Math.hypot(o.x - p.x, o.y - p.y) < 60));
      const Rl = maxR + gap;
      let pts = arc(lowLabels, Rl);
      if (blocked(pts) && lowLabels.length > 2) {
        const k = Math.ceil(lowLabels.length / 2);
        pts = arc(lowLabels.slice(0, k), Rl - gap * 0.15).concat(arc(lowLabels.slice(k), Rl + gap * 0.75));
      }
      // ひな壇や打楽器とぶつかる・舞台からはみ出すときは、ふつうの列に戻す
      if (blocked(pts)) return band(st, stage, tune, true);
      items.push(...pts);
    }
    // ハープ・ピアノは舞台の左右（前寄り）
    // ピアノ・ハープは下手（客席から見て左）の、扇形の外側。ピアノは鍵盤を下手に向け、奏者は指揮者の方を向く。
    // 大屋根は客席側に開く
    let yL = c.y - 60;
    const xOut = c.x - maxR - 70;
    rep('Pf', n.Pf).forEach(() => {
      const C = SS.CATALOG.piano;
      const [xl] = R().xRange(stage, yL - C.w / 2);
      const px = Math.max(xl + 80 + C.h / 2, xOut - C.h / 2);
      items.push({ type: 'piano', x: px, y: yL - C.w / 2, rot: 90 }, { type: 'player', label: 'Pf', x: px - C.h / 2 - 38, y: yL - C.w / 2, rot: -90 });
      yL -= C.w + 40;
    });
    rep('Hp', n.Hp).forEach(() => {
      const [xl] = R().xRange(stage, yL - 50);
      const hx = Math.max(xl + 110, xOut - 40);
      items.push({ type: 'harp', x: hx, y: yL - 50, rot: 90 }, { type: 'player', label: 'Hp', x: hx - 70, y: yL - 50, rot: -90 });
      yL -= 130;
    });
    const out = tp.tiers.concat(expandHornBox(items, c, 72));
    return { items: out, c, overlap: overlapCheck(tp, out), lowFallback: !!(st.lowOuter && lowFallback) };
  }

  // 打楽器と他の奏者・ひな壇がぶつかっていないか
  function overlapCheck(tp, all) {
    if (tp.percCramped) return true;
    if (tp.backDepth && tp.yBack < AISLE + tp.backDepth + 10) return true;
    if (tp.yBack < AISLE - 1) return true;
    if (tp.leftRect && tp.leftRect.beside) {
      // 横に並べたときは、1つずつ他の奏者・ひな壇とぶつからないか確かめる
      const C = SS.CATALOG;
      const percSet = new Set(tp.leftItems);
      const others = all.filter(it => !percSet.has(it) && (it.type === 'player' || it.type === 'hina'));
      const hit = tp.leftItems.some(p => {
        const hw = p.type === 'player' ? 25 : (p.w || C[p.type].w) / 2, hh = p.type === 'player' ? 25 : (p.h || C[p.type].h) / 2;
        return others.some(o => {
          const ow = o.type === 'hina' ? o.w / 2 : 26, oh = o.type === 'hina' ? o.h / 2 : 26;
          return Math.abs(p.x - o.x) < hw + ow + 5 && Math.abs(p.y - o.y) < hh + oh + 5;
        });
      });
      if (hit) return true;
    } else if (tp.leftRect) {
      const r = tp.leftRect;
      const percSet = new Set(tp.items);
      const hit = all.some(it => !percSet.has(it) && (it.type === 'player' || it.type === 'hina') && (() => {
        const hw = it.type === 'hina' ? it.w / 2 : 28, hh = it.type === 'hina' ? it.h / 2 : 28;
        return it.x + hw > r.x0 && it.x - hw < r.x1 && it.y + hh > r.y0 && it.y - hh < r.y1;
      })());
      if (hit) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- オーケストラ・弦楽
  // 1列 m 人を、2人ずつの組（譜面台1本）に。組の2人は少し近く、組と組のあいだは少し広く（平均は sp のまま）
  // 戻り値 [[列の真ん中からの距離, 組の番号(1〜)], …]
  function deskRow(m, sp) {
    const g1 = Math.min(sp, 64), g2 = 2 * sp - g1, out = [];
    let x = 0;
    for (let i = 0; i < m; i++) { if (i) x += i % 2 ? g1 : g2; out.push([x, Math.floor(i / 2) + 1]); }
    return out.map(([v, d]) => [v - x / 2, d]);
  }

  function orch(st, stage, tune) {
    const n = st.counts;
    const c = { x: stage.w / 2, y: podiumY(stage) };
    const anti = st.antiphonal;
    const order = anti ? ['Vn1', 'Vc', 'Va', 'Vn2'] : ['Vn1', 'Vn2', 'Va', 'Vc'];
    const gapDeg = 3;
    const avail = 180 - gapDeg * (order.length - 1);
    const sumN = order.reduce((a, kk) => a + (n[kk] || 0), 0) || 1;
    let t = -90;
    const items = [];
    let maxR = 200;
    const secRange = {}, secR = {};
    const rad = d => (d * Math.PI) / 180;
    const spS = tune.spacing, gapR = Math.max(100, tune.gap * 0.9);
    // どのパートも同じ半径の列（同心円）に座り、扇の角度は人数に比例。列の中は等間隔で、扇の真ん中にそろえる
    order.forEach(k => {
      const cnt = n[k] || 0;
      if (!cnt) return;
      const span = Math.max(16, (avail * cnt) / sumN);
      const mid = rad(t + span / 2);
      let left = cnt, row = 0, desk = 0;
      while (left > 0 && row < 14) {
        const R = tune.r0 - 20 + row * gapR;
        let cap = Math.max(1, Math.floor((rad(span - 2) * R) / spS) + 1);
        // 2人で1本の譜面台（プルト）なので、列の人数はなるべく偶数に
        if (cap > 1 && cap % 2 && left > cap) cap--;
        const m = Math.min(left, cap);
        deskRow(m, spS).forEach(([off, dn]) => {
          const p = G().fromPolar(R, mid + off / R, c);
          items.push({ type: 'player', label: k, x: p.x, y: p.y, rot: G().faceAngle(p, c), desk: `${k}-${desk + dn}` });
        });
        desk += Math.ceil(m / 2);
        maxR = Math.max(maxR, R);
        secR[k] = R;
        left -= m; row++;
      }
      secRange[k] = [t, t + span];
      t += span + gapDeg;
    });
    if (n.Cb) {
      // コントラバスはチェロの後ろ（上手寄り）に、90cm 間隔で
      const vr = secRange.Vc || [60, 88];
      const midD = Math.min((vr[0] + vr[1]) / 2 - 4, 66);
      let left = n.Cb, R = (secR.Vc || maxR) + gapR, cbDesk = 0;
      while (left > 0) {
        const cap = Math.max(1, Math.floor((rad(vr[1] - vr[0] + 10) * R) / 90) + 1);
        const m = Math.min(left, cap);
        deskRow(m, 90).forEach(([off, dn]) => {
          const p = G().fromPolar(R, rad(midD) + off / R, c);
          items.push({ type: 'player', label: 'Cb', x: p.x, y: p.y, rot: G().faceAngle(p, c), desk: `Cb-${cbDesk + dn}` });
        });
        cbDesk += Math.ceil(m / 2);
        maxR = Math.max(maxR, R);
        left -= m; R += gapR;
      }
    }
    // 管楽器（ひな壇の上にまっすぐ）
    const H = st.hina || { steps: 0 };
    const pn = SS.panelSize(H);
    const tierD = Math.max(121, pn.d * (H.deep || 1));
    const std = [21.2, 42.4, 63.6, 84.8];
    const sp = tune.spacing + 4;
    const rowsW = [
      [...rep('Picc', n.Picc), ...rep('Fl', n.Fl), ...rep('Ob', n.Ob), ...rep('E.H.', n['E.H.'])],
      [...rep('Cl', n.Cl), ...rep('B.Cl', n['B.Cl']), ...rep('Fg', n.Fg), ...rep('C.Fg', n['C.Fg'])],
    ].filter(r => r.length);
    const specs = rowsW.map((row, i) => ({
      depth: tierD, want: row.length * sp + 60,
      hgt: H.steps > i ? ((H.heights && H.heights[i]) || std[i]) : 0,
      place: (cx, yFront, d, W) => lineRow(row, yFront - d / 2 + 8, cx, sp, W - 70),
    }));
    const hrN = n.Hr || 0;
    const brass = [...rep('Tp', n.Tp), ...rep('Tb', n.Tb), ...rep('Tuba', n.Tuba)];
    if (hrN || brass.length) {
      const i = specs.length;
      const box = st.hornBox && hrN >= 3;
      const hrSlots = box ? Math.ceil(hrN / 2) : hrN;
      const wh = hrSlots * sp, wb = brass.length * sp, mid = 90;
      specs.push({
        depth: box ? Math.max(tierD, 182 + 30) : tierD,
        want: wh + mid + wb + 60,
        hgt: H.steps > i ? ((H.heights && H.heights[i]) || std[Math.min(i, 3)]) : 0,
        place: (cx, yFront, d) => {
          const out = [];
          const yRow = box ? yFront - 55 : yFront - d / 2 + 8;
          const x0 = cx - (wh + mid + wb) / 2;
          for (let k = 0; k < hrSlots; k++) {
            out.push({ type: 'player', label: 'Hr', x: x0 + sp / 2 + k * sp, y: yRow, rot: 0 });
            if (box && k < Math.floor(hrN / 2)) out.push({ type: 'player', label: 'Hr', x: x0 + sp / 2 + k * sp, y: yRow - 80, rot: 0 });
          }
          brass.forEach((l, k) => out.push({ type: 'player', label: l, x: x0 + wh + mid + sp / 2 + k * sp, y: yRow, rot: 0 }));
          return out;
        },
      });
    }
    // ティンパニ・打楽器
    const P = n.Perc || 0;
    let perc = [];
    if (n.Timp || P) {
      const stations = st.percInst ? PERC_STATIONS_ORCH.slice(0, Math.min(P, 7)) : [];
      perc = percItems(n.Timp ? 4 : 0, stations, [...rep('Timp', n.Timp ? 1 : 0), ...rep('Perc', P)]);
    }
    const tp = tiersAndPerc(stage, c.y - maxR - tune.clear, specs, H, perc, st.percPlace || 'back', { c, R: maxR });
    items.push(...tp.items);
    rep('Hp', n.Hp).forEach((l, i) => {
      // 奏者は指揮者の方を向き、ハープはその前（響板の上が奏者側）
      const p = G().fromPolar(maxR + 40, -1.25 + i * 0.22, c);
      const r = G().faceAngle(p, c), a = r * Math.PI / 180;
      items.push({ type: 'player', label: 'Hp', x: p.x, y: p.y, rot: r }, { type: 'harp', x: p.x - Math.sin(a) * 70, y: p.y + Math.cos(a) * 70, rot: r + 180 });
    });
    rep('Pf', n.Pf).forEach(() => { const p = G().fromPolar(maxR + 120, -0.85, c); items.push({ type: 'piano', x: p.x, y: p.y, rot: 90 }, { type: 'player', label: 'Pf', x: p.x - 100, y: p.y, rot: 90 }); });
    const all = tp.tiers.concat(items);
    return { items: all, c, overlap: overlapCheck(tp, all) };
  }

  // 今の配置図の打楽器を、指定の場所に並べ直す（「打楽器を整列」ボタン）
  A.arrangePercIn = function (items, stage, place) {
    AISLE = backLimit(stage);
    const list = items.filter(it => PERC_TYPES.has(it.type) || (it.type === 'player' && SS.partGroup(it.label).id === 'perc'));
    if (!list.length) return false;
    const parts = splitPerc(list, place);
    if (parts.left.length) {
      const [xl] = R().xRange(stage, 30);
      const bw = Math.max(330, Math.min(400, stage.w * 0.2));
      A.arrangePerc(parts.left, stage, { yTop: AISLE, x0: xl + 15, x1: xl + 15 + bw });
    }
    if (parts.top.length) {
      // いちばん高い（同じ高さなら奥の）ひな壇の上へ
      const hs = items.filter(it => it.type === 'hina').sort((a, b) => (b.hgt || 0) - (a.hgt || 0) || a.y - b.y);
      const t0 = hs[0];
      if (t0) A.arrangePerc(parts.top, stage, { yTop: t0.y - t0.h / 2 + 12, x0: t0.x - t0.w / 2 + 15, x1: t0.x + t0.w / 2 - 15 });
      else A.arrangePerc(parts.top, stage, { yTop: AISLE });
    }
    if (parts.back.length) A.arrangePerc(parts.back, stage, { yTop: AISLE });
    return true;
  };

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

  // 弧（円形）のひな壇：まっすぐに並べた段を、指揮者を中心にした弧に曲げる。
  // 段の上の人・楽器も、指揮者からの距離と、列の中の間隔（弧の長さ）を保ったまま弧にのせ、指揮者の方を向ける。
  // 舞台からはみ出す段・床の人とぶつかる段は、まっすぐのままにする（戻り値 true）
  function bendTiers(items, c, stage) {
    const tiers = items.filter(it => it.type === 'hina');
    const onTier = new Map();
    items.forEach(it => {
      if (it.type === 'hina') return;
      let best = null;
      tiers.forEach(t => { if (SS.hinaContains(t, it.x, it.y) && (!best || (t.hgt || 0) > (best.hgt || 0))) best = t; });
      if (best) onTier.set(it, best);
    });
    const floor = items.filter(it => it.type !== 'hina' && !onTier.has(it));
    let fallback = false;
    // 弧の中心：ふつうは指揮者。幅の広い段が急な弧（約63°より大きい）にならないよう、必要なら中心を客席側へずらす（どの段も同じ中心）
    const TH = 1.1;
    const yc = Math.max(c.y, ...tiers.filter(t => !Math.abs(t.rot || 0)).map(t => t.y + t.h / 2 + t.w / TH));
    // 前の段から順に。曲げられない段があったら、それより奥の段もまっすぐのまま（曲げた段の両はしが前の段に重ならないように）
    let stop = false;
    tiers.slice().sort((p, q) => (q.y + q.h / 2) - (p.y + p.h / 2)).forEach(t => {
      const Rf = Math.round(yc - (t.y + t.h / 2));
      if (stop) return;
      const no = () => { stop = true; if (!t.perc) fallback = true; };
      if (Rf < 150 || Math.abs(t.rot || 0) > 1) { no(); return; }
      const trial = Object.assign({}, t, { curve: Rf });
      const cx = t.x;
      const outline = SS.hinaOutline(trial).map(([lx, ly]) => ({ x: t.x + lx, y: t.y + ly }));
      if (!outline.every(p => R().insideStage(stage, p, 5)) || floor.some(f => SS.hinaContains(trial, f.x, f.y, 30))) { no(); return; }
      t.curve = Rf;
      onTier.forEach((tt, it) => {
        if (tt !== t) return;
        const r = yc - it.y, a = (it.x - cx) / r;
        it.x = cx + r * Math.sin(a); it.y = yc - r * Math.cos(a);
        // 奏者は指揮者の方を向く。楽器は弧に合わせて回す
        it.rot = it.type === 'player' ? G().faceAngle(it, c) : (it.rot || 0) + (a * 180) / Math.PI;
      });
    });
    return fallback;
  }

  A.build = function (st, stage) {
    AISLE = backLimit(stage);
    const f = st.type === 'band' ? band : orch;
    const s2 = st.type === 'strings' ? Object.assign({}, st, { percInst: false, counts: Object.assign({}, st.counts) }) : st;
    let best = null;
    for (const tune of TUNES) {
      let s3 = s2;
      if (tune.slim && s2.hina && (SS.panelSize(s2.hina).d * (s2.hina.deep || 1)) > 121) {
        s3 = Object.assign({}, s2, { hina: Object.assign({}, s2.hina, { panel: '46', orient: 'h', deep: 1 }) });
      }
      const r = f(s3, stage, tune);
      const outside = r.items.filter(it => it.type === 'player' && !inside(stage, it, 28)).length;
      const hinaOut = r.items.filter(it => it.type === 'hina' && !it.perc && it.y - it.h / 2 < AISLE - 1).length;
      const score = outside * 10 + hinaOut * 10 + (r.overlap ? 5 : 0) + (tune.slim ? 1 : 0);
      r.slim = !!(tune.slim && s3 !== s2);
      if (!best || score < best.score) best = Object.assign(r, { score, outside });
      if (score === 0) break;
    }
    // それでも入らないときは、打楽器の場所を変えて試す（最上段 → 最上段＋下手 → 下手）
    if (best.score > 1 && st.type !== 'strings' && !st._retry) {
      let alt = null;
      for (const pl of ['back', 'both', 'left']) {
        if (pl === st.percPlace) continue;
        const r2 = A.build(Object.assign({}, st, { percPlace: pl, _retry: true }), stage);
        r2.percMoved = pl;
        if (r2.fits) return r2; // 入った最初の場所を使う
        if (!alt || r2.score < alt.score) alt = r2;
      }
      if (alt && alt.score < best.score) return alt;
    }
    const r = best;
    if (st.hina && st.hina.curve && !r.bent) { r.curveFallback = bendTiers(r.items, r.c, stage); r.bent = true; }
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
