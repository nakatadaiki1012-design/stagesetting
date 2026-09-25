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
    // 扇形の外形の中か（m の余裕は、中心から外へ／内へ・左右へ広げて近似。m がマイナスなら縁から m だけ内側）
    const inside = inPoly(lx, ly, SS.hinaOutline(it));
    if (inside && m >= 0) return true;
    if (!m || (m < 0 && !inside)) return false;
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
    // ブリティッシュ・スタイルのブラスバンド（金管とパーカッションだけ。コルネットは9＋ソプラノ1）
    brass: {
      name: 'ブラスバンド',
      parts: [
        ['SopCnt', 1], ['SoloCnt', 4], ['RepCnt', 1], ['2ndCnt', 2], ['3rdCnt', 2], ['Flh', 1],
        ['SoloHn', 1], ['1stHn', 1], ['2ndHn', 1], ['Bar1', 1], ['Bar2', 1], ['Tb1', 1], ['Tb2', 1], ['B.Tb', 1],
        ['Euph', 2], ['EbBass', 2], ['BbBass', 2], ['Perc', 3],
      ],
    },
    // ビッグバンド（サックス5・トロンボーン4・トランペット4・リズム隊）
    bigband: {
      name: 'ビッグバンド',
      parts: [
        ['A.Sx1', 1], ['A.Sx2', 1], ['T.Sx1', 1], ['T.Sx2', 1], ['B.Sx', 1],
        ['Tb1', 1], ['Tb2', 1], ['Tb3', 1], ['B.Tb', 1], ['Tp1', 1], ['Tp2', 1], ['Tp3', 1], ['Tp4', 1],
        ['Pf', 1], ['Gt', 1], ['Bass', 1], ['Drs', 1], ['Vib', 0],
      ],
    },
    // 合唱（混声4部。女声・男声合唱は、使わないパートを0人に）
    choir: {
      name: '合唱',
      parts: [['S', 12], ['A', 12], ['T', 8], ['B', 8], ['Pf', 1]],
    },
  };

  // 舞台奥の通路（反射板と、ひな壇・楽器のあいだに空ける幅 cm）。ステージの設定で変えられる
  A.DEFAULT_AISLE = 60;
  A.DEFAULT_PODIUM_GAP = 100;
  A.podiumGapOf = stage => (stage && stage.podiumGap != null && isFinite(+stage.podiumGap) ? Math.max(0, +stage.podiumGap) : A.DEFAULT_PODIUM_GAP);
  A.podiumYOf = stage => Math.round(R().frontAt(stage, stage.w / 2) - A.podiumGapOf(stage) - 38);
  A.aisleOf = stage => (stage && stage.backAisle != null && isFinite(+stage.backAisle) ? Math.max(0, +stage.backAisle) : A.DEFAULT_AISLE);
  // 反射板の位置（ホールの設備で入れたとき）から通路を取る。図の奥のふちから、段・楽器を置いてよい所までの距離
  const backLimit = stage => A.aisleOf(stage) + (stage && stage.fixtures && stage.fixtures.shell != null && isFinite(+stage.fixtures.shell) ? Math.max(0, +stage.fixtures.shell) : 0);
  let AISLE = A.DEFAULT_AISLE; // いま並べているステージの、奥のふちから空ける幅

  A.defaultState = function (type) {
    const e = A.ENSEMBLES[type || 'band'];
    const counts = {};
    e.parts.forEach(([k, n]) => { counts[k] = n; });
    return {
      type: type || 'band', counts, antiphonal: false, percInst: true, hornBox: false, percPlace: type === 'orch' ? 'timpTop' : 'back', lowOuter: type === 'band', layout: type === 'choir' ? 'satb' : 'std',
      hina: type === 'orch' ? { steps: 3, panel: '46', orient: 'h', deep: 1 } : type === 'strings' || type === 'brass' ? { steps: 0, panel: '36', orient: 'h', deep: 2 }
        : type === 'choir' ? { steps: 3, panel: '36', orient: 'h', deep: 1 } : { steps: 2, panel: '36', orient: 'h', deep: 2 },
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
  // ブラスバンドの並び方（前の列から。1列の中は 下手→上手＝指揮者から見て左→右）
  // 前の列：ソロ・コルネット → フリューゲル → テナーホルン → バリトン → ユーフォニアム
  // 後ろの列：ソプラノ → レピアノ・2nd・3rd コルネット → ベース（真ん中） → バストロンボーン → トロンボーン
  A.BRASS_LAYOUTS = {
    std: {
      name: '標準（前：コルネット・ホルン・バリトン・ユーフォ／後ろ：コルネット・ベース・トロンボーン）',
      rows: [
        ['SoloCnt', 'Flh', 'SoloHn', '1stHn', '2ndHn', 'Bar2', 'Bar1', 'Euph'],
        ['SopCnt', 'RepCnt', '2ndCnt', '3rdCnt', 'BbBass', 'EbBass', 'B.Tb', 'Tb2', 'Tb1'],
      ],
    },
    hornsIn: {
      name: 'ホルン・フリューゲルを内側に（前：コルネット・ユーフォ／中：ホルン・バリトン）',
      rows: [
        ['SoloCnt', 'Euph'],
        ['Flh', 'SoloHn', '1stHn', '2ndHn', 'Bar2', 'Bar1'],
        ['SopCnt', 'RepCnt', '2ndCnt', '3rdCnt', 'BbBass', 'EbBass', 'B.Tb', 'Tb2', 'Tb1'],
      ],
    },
  };
  // 合唱の並び方
  A.CHOIR_LAYOUTS = {
    satb: { name: 'S・A・T・B を下手から（パートごとに縦のかたまり）' },
    womenFront: { name: '女声が前・男声が後ろ（前：S・A／後ろ：T・B）' },
    stba: { name: 'S・T・B・A（外声を外側に）' },
  };
  A.layoutsOf = type => (type === 'brass' ? A.BRASS_LAYOUTS : type === 'choir' ? A.CHOIR_LAYOUTS : A.BAND_LAYOUTS);
  const bandRows = st => (st.type === 'brass' ? (A.BRASS_LAYOUTS[st.layout] || A.BRASS_LAYOUTS.std) : (A.BAND_LAYOUTS[st.layout] || A.BAND_LAYOUTS.std)).rows;

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

  // よける点：奏者はいす（半径23）と譜面台（約64cm前・半径25）、そのほかの物は外接円
  const avoidOf = list => {
    const out = [];
    list.forEach(o => {
      if (o.type === 'player') {
        out.push({ x: o.x, y: o.y, r: 25 });
        const a = ((o.rot || 0) * Math.PI) / 180;
        out.push({ x: o.x - Math.sin(a) * 64, y: o.y + Math.cos(a) * 64, r: 25 });
      } else if (o.type !== 'hina' && o.type !== 'riser' && o.type !== 'riser46') {
        const C = SS.CATALOG[o.type] || {};
        out.push({ x: o.x, y: o.y, r: Math.max(o.w || C.w || 40, o.h || C.h || 40) / 2 });
      }
    });
    return out;
  };

  /**
   * 吹奏楽の「打楽器は下手」（奏者の目線の並べ方）
   * - ティンパニ：ひな壇の1段目の横（下手側）の床に、正面（客席）を向けて。低い太鼓が奏者の左（インターナショナル式）
   * - 鍵盤（前の列）：床の扇形のすぐ外側に、前（客席寄り）から グロッケン → シロフォン → ヴィブラフォン → マリンバ → チャイム（背の高いチャイムは端）。
   *   奏者は指揮者を見ながら、共鳴管の音が客席へ届くよう、客席の方へ少しひらく
   * - 太鼓類（すぐ後ろの列）：鍵盤の後ろに、バンドの真ん中に近い方（奥）から 大太鼓 → シンバル → 小太鼓 → 小物台（大太鼓とシンバルは同じリズムが多いのでとなりに）
   * - 奏者は自分の楽器のすぐ後ろ。楽器と奏者は「くっついて」いっしょに動く（grp）
   * opt: { c 指揮者, Rin 扇形の外の半径＋すき間, allowed(p, r), avoid [{x,y,r}], timpAt {x,y}（ティンパニの置き場所の候補） }
   * 置けたら true（items を動かす）
   */
  const KEYS_ORDER = ['glock', 'xylo', 'vib', 'marimba43', 'marimba', 'chimes'];
  const DRUM_ORDER = ['bd', 'cym', 'sd', 'tam', 'table', 'drums'];
  let grpSeq = 0;
  const newGrp = () => 'g' + Date.now().toString(36) + (grpSeq++).toString(36);
  // 持ち場（楽器と、それを演奏する奏者）を作る。Timp という名前の人はティンパニへ
  function percStations(items) {
    const C = SS.CATALOG;
    const inst = items.filter(it => PERC_TYPES.has(it.type));
    const pl = items.filter(it => it.type === 'player' && SS.partGroup(it.label).id === 'perc');
    const timps = inst.filter(it => TIMP.includes(it.type)).sort((a, b) => (b.w || C[b.type].w) - (a.w || C[a.type].w));
    const st = [];
    if (timps.length) st.push({ kind: 'timp', items: timps });
    inst.filter(it => !TIMP.includes(it.type)).forEach(it => st.push({ kind: it.type, items: [it] }));
    const free = pl.slice();
    const ts = st.find(q => q.kind === 'timp');
    if (ts) { const i = free.findIndex(p => /^tim/i.test(p.label || '')); if (i >= 0) ts.player = free.splice(i, 1)[0]; }
    // 鍵盤 → 太鼓類 の順に、奏者を割り当てる
    const rank = q => { const k = KEYS_ORDER.indexOf(q.kind), d = DRUM_ORDER.indexOf(q.kind); return k >= 0 ? k : d >= 0 ? 10 + d : 30; };
    st.slice().sort((a, b) => rank(a) - rank(b)).forEach(q => { if (!q.player && free.length) q.player = free.shift(); });
    free.forEach(p => st.push({ kind: 'stand', items: [], player: p }));
    return st;
  }
  // 楽器と奏者をひとまとまりに（grp が同じものは、図の上でいっしょに動く）。
  // 置いた位置から決める：打楽器の奏者ごとに、いちばん近い持ち場（ティンパニはひと組）を 1.7m 以内で1つ
  A.groupStations = function (items) {
    const C = SS.CATALOG;
    const inst = items.filter(it => PERC_TYPES.has(it.type));
    const pl = items.filter(it => it.type === 'player' && SS.partGroup(it.label).id === 'perc');
    inst.concat(pl).forEach(it => { delete it.grp; });
    const st = [];
    inst.filter(it => TIMP.includes(it.type)).forEach(t => {
      const g = st.find(q => q.timp && q.items.some(o => Math.hypot(o.x - t.x, o.y - t.y) < 200));
      if (g) g.items.push(t); else st.push({ timp: true, items: [t] });
    });
    inst.filter(it => !TIMP.includes(it.type)).forEach(it => st.push({ items: [it] }));
    st.forEach(q => { q.x = q.items.reduce((a, o) => a + o.x, 0) / q.items.length; q.y = q.items.reduce((a, o) => a + o.y, 0) / q.items.length; });
    const pairs = [];
    pl.forEach(p => st.forEach(q => {
      const d = Math.hypot(p.x - q.x, p.y - q.y) - (q.timp && /^tim/i.test(p.label || '') ? 60 : 0);
      const reach = q.timp ? 200 : Math.max(C[q.items[0].type].w || 60, C[q.items[0].type].h || 60) / 2 + 110;
      if (d < reach) pairs.push([d, p, q]);
    }));
    pairs.sort((a, b) => a[0] - b[0]);
    const usedP = new Set(), usedQ = new Set();
    pairs.forEach(([, p, q]) => {
      if (usedP.has(p) || usedQ.has(q)) return;
      usedP.add(p); usedQ.add(q);
      const g = newGrp();
      q.items.concat([p]).forEach(m => { m.grp = g; });
    });
  };
  A.arrangePercSide = function (items, stage, c, Rin, allowed, avoid, opt) {
    opt = opt || {};
    const C = SS.CATALOG;
    const st = percStations(items);
    if (!st.length) return true;
    // 持ち場の形（奏者を原点、楽器の方を +y とした向き）
    const shape = q => {
      if (q.kind === 'timp') return { w: (q.items.length > 1 ? 2 * 112 * Math.sin(66 * Math.PI / 180) : 0) + C[q.items[0].type].w + 20, front: 112 + 45, back: 35 };
      if (q.kind === 'stand') return { w: 75, front: 75, back: 35 };
      const it = q.items[0], w = it.w || C[it.type].w, h = it.h || C[it.type].h;
      return { w: w + 26, front: 24 + h, back: 35 };
    };
    // P：奏者の位置、rot：奏者の向き（楽器はその前）
    const placeAt = (q, P, rot) => {
      const a = (rot * Math.PI) / 180;
      const W = (lx, ly) => ({ x: P.x + lx * Math.cos(a) - ly * Math.sin(a), y: P.y + lx * Math.sin(a) + ly * Math.cos(a) });
      const out = [];
      if (q.player) out.push([q.player, { x: P.x, y: P.y, rot }]);
      if (q.kind === 'timp') timpPositions(0, 0, q.items.map(it => it.type)).forEach((p, i) => out.push([q.items[i], Object.assign(W(p.x, p.y), { rot })]));
      else if (q.kind !== 'stand') { const it = q.items[0], h = it.h || C[it.type].h; out.push([it, Object.assign(W(0, 24 + h / 2), { rot })]); }
      return out;
    };
    const fits = list => list.every(([it, p]) => {
      const hw = it.type === 'player' ? 25 : (it.w || C[it.type].w) / 2, hh = it.type === 'player' ? 25 : (it.h || C[it.type].h) / 2;
      const r = Math.max(hw, hh);
      if (it.type === 'player') return R().insideStage(stage, Object.assign({}, it, p), 30) && allowed(p, r) && !(avoid && avoid.some(o => Math.hypot(o.x - p.x, o.y - p.y) < o.r + 50));
      const a = ((p.rot || 0) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      if (avoid && avoid.some(o => { const dx = o.x - p.x, dy = o.y - p.y, lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca; return Math.hypot(Math.max(0, Math.abs(lx) - hw), Math.max(0, Math.abs(ly) - hh)) < o.r + 25; })) return false;
      const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: p.x + x * ca - y * sa, y: p.y + x * sa + y * ca }));
      return corners.every(q => R().insideStage(stage, q, 6)) && allowed(p, r);
    });
    const done = [];
    const clash = list => list.some(([it, p]) => done.some(([o, q]) => {
      const ra = it.type === 'player' ? 25 : Math.max(it.w || C[it.type].w, it.h || C[it.type].h) / 2;
      const rb = o.type === 'player' ? 25 : Math.max(o.w || C[o.type].w, o.h || C[o.type].h) / 2;
      return Math.hypot(p.x - q.x, p.y - q.y) < (ra + rb) * 0.82 + 8;
    }));
    // 1) ティンパニ：ひな壇1段目の横に正面向き（置けなければ、太鼓類の列のいちばん奥）
    const timp = st.find(q => q.kind === 'timp');
    let timpDone = false;
    if (timp && opt.timpAt) {
      const sh = shape(timp);
      for (let k = 0; k < 16 && !timpDone; k++) {
        // 少しずつ下手・前へずらして探す
        const P = { x: opt.timpAt.x - (k % 4) * 30, y: opt.timpAt.y - sh.front / 2 + Math.floor(k / 4) * 40 };
        const cand = placeAt(timp, P, 0);
        if (fits(cand) && !clash(cand)) { done.push(...cand); timpDone = true; }
      }
    }
    // 2) 弧に沿って並べる（dir 1：前から奥へ、-1：奥から前へ）。keysTilt：客席の方へ少しひらく角度（度）
    const T0 = -110 * Math.PI / 180, T1 = -25 * Math.PI / 180;
    const faceOf = (P, tilt) => G().faceAngle(P, c) + tilt;
    const lay = (list, ring0, dir, tilt0) => {
      const tiltOf = q => (typeof tilt0 === 'function' ? tilt0(q) : tilt0);
      let ring = ring0, ringDepth = 0, t = dir > 0 ? T0 : T1, maxDepth = 0;
      for (const q of list) {
        const sh = shape(q);
        let ok = null;
        for (let guard = 0; guard < 600 && !ok; guard++) {
          const Rp = ring + sh.front, Rm = ring + sh.front / 2, half = sh.w / 2 / Rm;
          if (dir > 0 ? t + 2 * half > T1 : t - 2 * half < T0) { ring += Math.max(ringDepth, 150) + 30; ringDepth = 0; t = dir > 0 ? T0 : T1; if (ring > Rin + 800) return -1; continue; }
          const P = G().fromPolar(Rp, t + dir * half, c);
          const cand = placeAt(q, P, faceOf(P, tiltOf(q)));
          if (fits(cand) && !clash(cand)) { ok = cand; t += dir * (2 * half + 18 / Rm); ringDepth = Math.max(ringDepth, sh.front + sh.back); maxDepth = Math.max(maxDepth, ring - ring0 + sh.front + sh.back); } else t += dir * 4 / Rm;
        }
        if (!ok) return -1;
        done.push(...ok);
      }
      return maxDepth;
    };
    const ord = (q, list) => { const i = list.indexOf(q.kind); return i < 0 ? 99 : i; };
    if (opt.mode === 'orch') {
      // オーケストラ：舞台の奥（ティンパニ・金管の近く）から、大太鼓 → 小太鼓 → シンバル → 小物 → 鍵盤 の順に、
      // 弦の扇形の外側を下手の前の方へまわりこむように並べる（鍵盤は客席へ少しひらく）
      const seq = st.filter(q => !(q === timp && timpDone)).sort((a, b) => {
        const r = q => (q.kind === 'timp' ? -1 : DRUM_ORDER.includes(q.kind) ? DRUM_ORDER.indexOf(q.kind) : KEYS_ORDER.includes(q.kind) ? 10 + KEYS_ORDER.indexOf(q.kind) : 30);
        return r(a) - r(b);
      });
      if (lay(seq, Rin, -1, q => (KEYS_ORDER.includes(q.kind) ? 12 : 0)) < 0) return false;
      done.forEach(([it, p]) => Object.assign(it, p));
      A.groupStations(items);
      return true;
    }
    const keys = st.filter(q => KEYS_ORDER.includes(q.kind)).sort((a, b) => ord(a, KEYS_ORDER) - ord(b, KEYS_ORDER));
    const drums = st.filter(q => !KEYS_ORDER.includes(q.kind) && !(q === timp && timpDone)).sort((a, b) => (a.kind === 'timp' ? -1 : b.kind === 'timp' ? 1 : ord(a, DRUM_ORDER) - ord(b, DRUM_ORDER)));
    // 鍵盤：前の列（指揮者の方から、客席の方へ 12° ひらく。下手にいるので向きの角度を 0°＝客席 へ近づける）
    const kd = keys.length ? lay(keys, Rin, 1, 12) : 0;
    if (kd < 0) return false;
    // 太鼓類：鍵盤のすぐ後ろの列に、奥（バンドの真ん中に近い方）から
    const dd = drums.length ? lay(drums, keys.length ? Rin + kd + 10 : Rin, -1, 0) : 0;
    if (dd < 0) return false;
    done.forEach(([it, p]) => Object.assign(it, p));
    A.groupStations(items);
    return true;
  };

  // 人数から打楽器の楽器を用意する（奏者1人に1つの持ち場）
  const PERC_STATIONS_BAND = ['timp', 'sd', 'bd', 'marimba', 'glock', 'xylo', 'chimes', 'vib'];
  const PERC_STATIONS_ORCH = ['bd', 'sd', 'glock', 'xylo', 'chimes', 'marimba', 'cym'];
  // かんたん編成で、打楽器の楽器を1つずつ増やしたり減らしたりできる（st.percKit）。決めていなければ、人数から自動で
  A.PERC_KIT = [['timp', 'ティンパニ'], ['bd', '大太鼓'], ['sd', '小太鼓'], ['cym', 'シンバル'], ['tam', 'タムタム'], ['glock', 'グロッケン'], ['xylo', 'シロフォン'], ['vib', 'ヴィブラフォン'], ['marimba', 'マリンバ'], ['chimes', 'チャイム'], ['table', '小物台'], ['drums', 'ドラムセット']];
  A.autoPercKit = function (st) {
    const n = st.counts || {}, P = n.Perc || 0, kit = {};
    const list = st.type === 'orch' ? (n.Timp ? ['timp'] : []).concat(PERC_STATIONS_ORCH.slice(0, Math.min(P, 7))) : PERC_STATIONS_BAND.slice(0, Math.min(P, 8));
    A.PERC_KIT.forEach(([k]) => { kit[k] = 0; });
    list.forEach(k => { kit[k] = (kit[k] || 0) + 1; });
    return kit;
  };
  A.percKitOf = st => Object.assign(A.autoPercKit(st), st.percKit || {});
  // 楽器の一覧（ティンパニは組の数、ほかは台数）→ percItems へ
  function kitList(st) {
    const kit = A.percKitOf(st), out = [];
    A.PERC_KIT.forEach(([k]) => { if (k !== 'timp') for (let i = 0; i < (kit[k] || 0); i++) out.push(k); });
    return { timp: Math.min(1, kit.timp || 0), stations: out };
  }
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
  // 指揮台の位置：指揮台の前のふちから舞台の縁まで podiumGap（はじめは1m）空ける。指揮台の奥行は76cm
  const podiumY = stage => A.podiumYOf(stage);
  // ひな壇の前の列：段の前のふちから奏者（椅子の真ん中）まで。譜面台（約64cm前）も段の上に乗るように
  const ROW_FRONT = 76;
  // その列の楽器の譜面台（弦バスは約78cm前）まで段に乗るよう、列ごとに前のふちからの距離を決める
  const rowFront = labels => Math.max(ROW_FRONT, ...labels.map(l => (typeof l === 'string' && SS.standOffset ? SS.standOffset({ label: l }, { figure: true })[1] + 14 : 0)));
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
    if (place === 'timpTop') {
      // ティンパニ（と Timp の人）は最上段の中央、ほかの打楽器は下手
      list.forEach(it => ((TIMP.includes(it.type) || (it.type === 'player' && /^tim/i.test(it.label || ''))) ? res.top : res.left).push(it));
      return res;
    }
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
    // 吹奏楽：まず扇形のすぐ外側・下手に、前から弧に沿って指揮者の方を向けて並べる
    if (parts.left.length && floor && floor.side) {
      const W0 = upW(Math.max(364, ...rows.map(r => r.want), parts.top.length ? percWidth(parts.top) + 40 : 0));
      const tierL = stage.w / 2 - W0 / 2 - 35;
      const trial = cloneList(parts.left);
      // ティンパニは、ひな壇の1段目の横（下手側）に正面向きで
      const t1 = rows[0];
      const timpAt = t1 && t1.hgt ? { x: tierL - 170, y: yFront0 - (t1.need ? t1.need(W0) : t1.depth) / 2 } : null;
      // オーケストラで、ティンパニを最上段に上げるときは、段の横に運び上げる通路（1.3m）を空けておく
      const lane = floor.timpTier ? 140 : 0;
      const ok = A.arrangePercSide(trial, stage, floor.c, floor.R + 75, (p, r) => p.x + r <= (p.y - r < yFront0 + 30 ? tierL - lane : 1e4) && p.y - r > AISLE, avoidOf(floor.pts || []), { timpAt: floor.mode === 'orch' ? null : timpAt, mode: floor.mode });
      if (ok) {
        trial.forEach((t2, i) => Object.assign(parts.left[i], { x: t2.x, y: t2.y, rot: t2.rot }));
        const C0 = SS.CATALOG;
        const bb = parts.left.reduce((b, it) => {
          const r = it.type === 'player' ? 25 : Math.max(it.w || C0[it.type].w, it.h || C0[it.type].h) / 2;
          return { x0: Math.min(b.x0, it.x - r), x1: Math.max(b.x1, it.x + r), y0: Math.min(b.y0, it.y - r), y1: Math.max(b.y1, it.y + r) };
        }, { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
        out.leftRect = { x0: bb.x0 - 10, x1: bb.x1 + 10, y0: bb.y0, y1: bb.y1 + 10, beside: true, side: true };
        out.items.push(...parts.left);
        out.leftItems = parts.left;
        beside = true;
      }
    }
    if (parts.left.length && floor && !beside) {
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
      // ティンパニを最上段に上げるときは、段の下手の横に運び上げる通路を残す
      if (floor && floor.timpTier) xl += 140;
      const Wmax = Math.max(pn.w * 2, Math.floor((xr - xl - 20) / pn.w) * pn.w);
      cx = Math.max(xl + 10 + Math.min(W, Wmax) / 2, Math.min(stage.w / 2, xr - 10 - Math.min(W, Wmax) / 2));
      if (W <= Wmax) break;
      W = Wmax;
    }
    let yFront = yFront0;
    const std = [21.2, 42.4, 63.6, 84.8];
    rows.forEach((r, i) => {
      const d = r.need ? r.need(W) : r.depth;
      if (r.hgt) out.tiers.push({ type: 'hina', x: cx, y: yFront - d / 2, w: W, h: d, hgt: r.hgt, panel: r.panel || H.panel || '36', orient: r.orient || H.orient || 'h', step: i + 1, rot: 0 });
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
            return mark(lineRow(labels.slice(0, half), yFront - ROW_FRONT, cx, sp, W - 70), 0)
              .concat(mark(lineRow(labels.slice(half), yFront - ROW_FRONT - 100, cx, sp, W - 70), half));
          }
          const yRow = hasBox ? yFront - ROW_FRONT : yFront - Math.max(rowFront(labels), d / 2 - 12);
          return mark(lineRow(labels, yRow, cx, sp, W - 70), 0);
        },
      };
    });
    // 打楽器
    const P = n.Perc || 0;
    let perc = [];
    if (P) {
      const kl = st.percInst ? kitList(st) : { timp: 0, stations: [] };
      const hasTimp = !!kl.timp;
      perc = percItems(hasTimp ? 4 : 0, kl.stations, rep('Perc', P).map((l, i) => (hasTimp && i === 0 ? 'Timp' : l)));
    }
    const tp = tiersAndPerc(stage, c.y - maxR - tune.clear, rowSpecs, H, perc, place, { c, R: maxR, yMax: c.y - 40 - (n.Pf ? 230 : 0) - (n.Hp ? 140 : 0), side: !n.Pf && !n.Hp, pts: items.slice() });
    items.push(...tp.items);
    // 低音グループ：いちばん外側の床の弧の、さらに外側（上手側）に並べる
    if (lowLabels.length) {
      // 1本の弧で置けなければ、2本の弧（内側：B.Cl・Euph／外側：Tuba・弦バス）にして短くする
      const arc = (labels, Rl, t0) => {
        const pts = [];
        let t = t0 || 1.48;
        for (let i = labels.length - 1; i >= 0; i--) {
          const p = G().fromPolar(Rl, t, c);
          pts.unshift({ type: 'player', label: labels[i], x: p.x, y: p.y, rot: G().faceAngle(p, c) });
          t -= sp / Rl;
        }
        return pts;
      };
      // 低音どうし（椅子と、前にいる人の譜面台）が重ならないかも ⚠ 確認と同じ見方で調べる
      const clashes = pts => SS.checks ? SS.checks({ stage, items: pts.concat(items.filter(o => o.type === 'player' && pts.some(p => Math.hypot(o.x - p.x, o.y - p.y) < 160))) }).some(w => w.kind === 'overlap') : false;
      const blocked = pts => pts.some(p => !inside(stage, p, 30) || tp.tiers.some(h => Math.abs(p.x - h.x) < h.w / 2 + 40 && Math.abs(p.y - h.y) < h.h / 2 + 40) ||
        tp.items.some(o => o.type !== 'player' && Math.hypot(o.x - p.x, o.y - p.y) < 90) ||
        items.some(o => o.type === 'player' && Math.hypot(o.x - p.x, o.y - p.y) < 60)) || clashes(pts);
      const Rl = maxR + gap;
      let pts = arc(lowLabels, Rl);
      if (blocked(pts) && lowLabels.length > 2) {
        // 2本の弧：外側の弧は半人分ずらして、前の人の椅子の間に譜面台がくるように
        const k = Math.ceil(lowLabels.length / 2), Ri = Rl - gap * 0.15, Ro = Rl + gap * 0.75;
        const tries = [1.48 - (sp * 0.5) / Ro, 1.48 + (sp * 0.5) / Ro, 1.48];
        for (const t0 of tries) { pts = arc(lowLabels.slice(0, k), Ri).concat(arc(lowLabels.slice(k), Ro, t0)); if (!blocked(pts)) break; }
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
    // 扇形の外側に指揮者の方を向けて並べたとき（side）は、向きを考えた重なりを ⚠ 確認と同じ見方で調べるので、ここでは見ない
    if (tp.leftRect && tp.leftRect.side) {
      // 何もしない
    } else if (tp.leftRect && tp.leftRect.beside) {
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

  // ---------------------------------------------------------------- ビッグバンド
  // 前の列：サックス（下手から T1・A2・A1・T2・Bari。リードのA1が真ん中、ソロのT1がリズム隊の近く、Bariは上手）
  // 2列目：トロンボーン（1段目の台。Tb2・Tb1・Tb3・B.Tb）／3列目：トランペット（2段目の台。Tp2・Tp1・Tp3・Tp4）
  // リズム隊は下手にまとめる：ピアノが前、ギター、ベースとドラムは奥でおたがいの手と顔が見えるように。管のリードは縦にそろえる
  const SAX_ORDER = ['T.Sx1', 'A.Sx2', 'A.Sx1', 'T.Sx2', 'B.Sx'];
  const TB_ORDER = ['Tb2', 'Tb1', 'Tb3', 'B.Tb'];
  const TP_ORDER = ['Tp2', 'Tp1', 'Tp3', 'Tp4'];
  function bigBand(st, stage, tune) {
    const n = st.counts, H = st.hina || { steps: 2 };
    const f = tune.spacing / 80; // ゆったり・つめる
    const row = order => order.flatMap(k => rep(k, n[k]));
    const sax = row(SAX_ORDER), tb = row(TB_ORDER), tp = row(TP_ORDER);
    const items = [], tiers = [];
    const front = R().frontAt(stage, stage.w / 2);
    const sp = { sax: 82 * f, tb: 90 * f, tp: 80 * f };
    const D = 182; // 台の奥行（3×6尺を横に2列）
    // 管の横幅と、リズム隊（下手）の幅
    const Ww = Math.max((sax.length - 1) * sp.sax, (tb.length - 1) * sp.tb, (tp.length - 1) * sp.tp) + 140;
    const rhythmW = n.Pf || n.Drs || n.Bass || n.Gt ? 500 : 0;
    const [xl, xr] = R().xRange(stage, front - 300);
    const total = Ww + rhythmW + 40;
    const x0 = Math.max(xl + 30, (xl + xr) / 2 - total / 2); // リズム隊の左はし
    const cx = Math.min(xr - 30 - Ww / 2, x0 + rhythmW + 40 + Ww / 2); // 管の真ん中
    // 前の列（床）：サックス。舞台の前のふちから約2.3m
    const ySax = front - 230;
    // 台：1段目（トロンボーン）・2段目（トランペット）。段がないときは床に1.3mずつ
    const fe1 = ySax - 45, onT1 = H.steps >= 1, onT2 = H.steps >= 2;
    const W = Math.max(364, Math.ceil(Ww / 182) * 182);
    const std = [21.2, 42.4];
    let yTb, yTp;
    if (onT1) { tiers.push({ type: 'hina', x: cx, y: fe1 - D / 2, w: W, h: D, hgt: (H.heights && H.heights[0]) || std[0], panel: '36', orient: 'h', deep: 2, step: 1, rot: 0 }); yTb = fe1 - Math.max(rowFront(tb), D / 2 - 12); } else yTb = ySax - 130 * f;
    const fe2 = onT1 ? fe1 - D : yTb - 45;
    if (onT2) { tiers.push({ type: 'hina', x: cx, y: fe2 - D / 2, w: W, h: D, hgt: (H.heights && H.heights[1]) || std[1], panel: '36', orient: 'h', deep: 2, step: 2, rot: 0 }); yTp = fe2 - Math.max(rowFront(tp), D / 2 - 12); } else yTp = (onT1 ? fe2 : yTb) - 110 * f;
    const line = (labels, y, spc) => labels.map((l, i) => ({ type: 'player', label: l, x: cx + (i - (labels.length - 1) / 2) * spc, y, rot: 0 }));
    items.push(...line(sax, ySax, sp.sax), ...line(tb, yTb, sp.tb), ...line(tp, yTp, sp.tp));
    // リズム隊（下手にまとめる）。管のすぐ下手どなりに：
    // ・ドラム：トロンボーンの台の下手どなり。奏者はセットの後ろに座り、客席と管の方を向く（リードTp・Tbが見え、ベースが右手側に）
    // ・ベース：ドラムの右手側（下手）の少し前。ドラマーの右手（ライド）とたがいに見える
    // ・ギター：サックスの列の下手どなりの少し前（アンプは下手どなり）
    // ・ピアノ：いちばん前の下手。ピアニストは下手側に座り、バンドの方を向く
    // 楽器と、その後ろ（向きの反対側）に奏者。rot：奏者の向き（0＝客席）
    const station = (type, label, x, y, rot, back) => {
      const a = (rot * Math.PI) / 180;
      const out = type ? [{ type, x, y, rot }] : [];
      out.push({ type: 'player', label, x: x + Math.sin(a) * back, y: y - Math.cos(a) * back, rot });
      return out;
    };
    const behind = (x, y, rot, d) => { const a = (rot * Math.PI) / 180; return { x: x + Math.sin(a) * d, y: y - Math.cos(a) * d }; };
    const hornL = Math.min(cx - W / 2, cx - Ww / 2 + 40); // 管（台）の下手のはし
    const kit = { x: hornL - 125, y: onT1 ? fe1 - 70 : ySax - 150 };
    if (n.Drs) items.push(...station('drums', 'Drs', kit.x, kit.y, -20, 85));
    const bs = { x: kit.x - 175, y: kit.y + 20 };
    if (n.Bass) { const a = behind(bs.x, bs.y, -30, 75); items.push(...station(null, 'Bass', bs.x, bs.y, -30, 0), { type: 'amp', x: a.x, y: a.y, rot: -30 }); }
    const gt = { x: hornL - 35, y: ySax + 50 };
    if (n.Gt) items.push(...station(null, 'Gt', gt.x, gt.y, -35, 0), { type: 'amp', x: gt.x - 80, y: gt.y + 20, rot: -35 });
    if (n.Pf) { const px = Math.min(x0 + 190, gt.x - 250); items.push({ type: 'piano', x: px, y: ySax + 60, rot: -90 }, { type: 'player', label: 'Pf', x: px - 118, y: ySax + 70, rot: -90 }); }
    rep('Vib', n.Vib).forEach((l, i) => items.push({ type: 'vib', x: cx + Ww / 2 + 100, y: yTb + 20 + i * 140, rot: 90 }, { type: 'player', label: l, x: cx + Ww / 2 + 170, y: yTb + 20 + i * 140, rot: 90 }));
    const over = tiers.some(t => t.y - t.h / 2 < AISLE - 1) || items.some(it => it.y < AISLE);
    return { items: tiers.concat(items), c: { x: cx, y: front + 200 }, overlap: over };
  }

  // ---------------------------------------------------------------- 合唱
  // 立って歌う。前の列は床、うしろの列はひな壇（合唱用の山台）に1段1列。うしろの列は半人分ずらして、前の人の頭のあいだから顔が見えるように。
  // 並び方：S・A・T・B を下手から（パートごとに縦のかたまり）／女声が前・男声が後ろ／S・T・B・A
  const VOICE_ORDER = { satb: ['S', 'A', 'T', 'B'], stba: ['S', 'T', 'B', 'A'], womenFront: ['S', 'A', 'T', 'B'] };
  function choir(st, stage, tune) {
    const n = st.counts, H = st.hina || { steps: 3 };
    const c = { x: stage.w / 2, y: podiumY(stage) };
    const sp = Math.round(58 * (tune.spacing / 80)); // となりとの間隔（肩幅＋少し）
    const order = VOICE_ORDER[st.layout] || VOICE_ORDER.satb;
    const voices = order.flatMap(v => rep(v, n[v]));
    const N = voices.length;
    const items = [], tiers = [];
    if (!N) return { items: [{ type: 'podium', x: c.x, y: c.y, rot: 0 }], c, overlap: false };
    const pn = SS.panelSize(H), D = Math.max(pn.d * (H.deep || 1), 76);
    const rowsN = Math.max(1, Math.min((H.steps || 0) + 1, Math.ceil(N / 2)));
    // 列の割り当て：列ごとの人数はだいたい同じ。パートは縦のかたまりになるように、列ごとに同じ順番で分ける
    const perRow = Math.ceil(N / rowsN);
    const rows = Array.from({ length: rowsN }, () => []);
    const assign = (list, rs) => {
      // list を rs 本の列に、パートの割合を保って分ける（前の列から）
      const cnt = {}; list.forEach(v => { cnt[v] = (cnt[v] || 0) + 1; });
      const kinds = Object.keys(cnt).sort((a, b) => order.indexOf(a) - order.indexOf(b));
      rs.forEach((r, ri) => kinds.forEach(k => { const share = Math.floor(cnt[k] / rs.length) + (ri < cnt[k] % rs.length ? 1 : 0); for (let i = 0; i < share; i++) r.push(k); }));
    };
    if (st.layout === 'womenFront') {
      const women = voices.filter(v => v === 'S' || v === 'A'), men = voices.filter(v => v === 'T' || v === 'B');
      const rw = !men.length ? rowsN : !women.length ? 0 : Math.max(1, Math.min(rowsN - 1, Math.round((rowsN * women.length) / N)));
      assign(women, rows.slice(0, rw));
      assign(men, rows.slice(rw));
    } else assign(voices, rows);
    void perRow;
    // 前の列（床）は指揮者から約1.9m。うしろの列は段ごとに1列（段の前のふちは、前の列の人の約60cm後ろ）
    const yFront = c.y - 190;
    const maxLen = Math.max(...rows.map(r => r.length));
    const W = Math.ceil(((maxLen - 1) * sp + sp + 80) / pn.w) * pn.w;
    const std = [21.2, 42.4, 63.6, 84.8];
    rows.forEach((r, ri) => {
      let yr = yFront;
      if (ri > 0) {
        const fe = yFront - 60 - (ri - 1) * D, yc = fe - D / 2;
        tiers.push({ type: 'hina', x: c.x, y: yc, w: W, h: D, hgt: (H.heights && H.heights[ri - 1]) || std[Math.min(ri - 1, 3)], panel: H.panel || '36', orient: H.orient || 'h', step: ri, rot: 0 });
        yr = yc;
      }
      const off = ri % 2 ? sp / 2 : 0;
      r.forEach((v, i) => items.push({ type: 'player', label: v, x: c.x + (i - (r.length - 1) / 2) * sp + off, y: yr, rot: 0 }));
    });
    // 指揮者の方を向く（まっすぐな列でも、端の人は少し内向きに）
    items.forEach(it => { const a = G().faceAngle(it, c); it.rot = Math.max(-25, Math.min(25, a)); });
    if (n.Pf) {
      // ピアノは下手の前。ピアニストはピアノの下手側に座り、上手（指揮者・合唱）の方を向く
      const [xl] = R().xRange(stage, c.y);
      const px = Math.max(xl + 250, c.x - (maxLen * sp) / 2 - 150);
      items.push({ type: 'piano', x: px, y: c.y - 40, rot: -90 }, { type: 'player', label: 'Pf', x: px - 118, y: c.y - 30, rot: -90 });
    }
    items.push({ type: 'podium', x: c.x, y: c.y, rot: 0 });
    const over = tiers.some(t => t.y - t.h / 2 < AISLE - 1);
    return { items: tiers.concat(items), c, overlap: over };
  }

  // ---------------------------------------------------------------- オーケストラ・弦楽
  // 1列 m 人を、2人ずつの組（譜面台1本）に。組の2人は少し近く、組と組のあいだは少し広く（平均は sp のまま）
  // 戻り値 [[列の真ん中からの距離, 組の番号(1〜)], …]
  function deskRow(m, sp, pair) {
    const g1 = Math.min(sp, pair || 64), g2 = 2 * sp - g1, out = [];
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
    // 扇を左右に広げるとき（tune.span が1より大きい）は、180°より少し広く使う
    const fan = 180 * Math.max(1, tune.span);
    const avail = fan - gapDeg * (order.length - 1);
    const sumN = order.reduce((a, kk) => a + (n[kk] || 0), 0) || 1;
    let t = -fan / 2;
    const items = [];
    let maxR = 200;
    const secRange = {}, secR = {};
    const rad = d => (d * Math.PI) / 180;
    const spS = tune.spacing, gapR = Math.max(100, tune.gap * 0.9);
    // パートごとの扇形（角度の範囲）は、人数に比例して最初に決めて、どの列（リング）でも同じにする。
    // 前のリングから順に、各パートの扇の中に「真ん中から」座る（2人で1本の譜面台なので、なるべく偶数）。
    // こうすると、パートの境目が指揮者から放射状にまっすぐ通り、Vn1・Vn2・Va・Vc のかたまりがくずれない
    const secs = order.filter(k => (n[k] || 0) > 0).map(k => ({ k, left: n[k], desk: 0, a0: Infinity, a1: -Infinity }));
    const sumS = secs.reduce((a2, q) => a2 + n[q.k], 0) || 1;
    const GAPA = rad(gapDeg);
    // 扇に入る人数（となりのパートの端の人とは、1人分の間隔をあける）。4人以上の列は偶数に（2人で1本）
    const seatsIn = (w, R, left) => { let m = Math.min(left, Math.max(1, Math.floor(((w + GAPA) * R) / spS))); if (m > 3 && m % 2 && m < left) m--; return m; };
    const fits = (w, K, cnt) => { let left = cnt; for (let r = 0; r < K && left > 0; r++) left -= seatsIn(w, tune.r0 + r * gapR, left); return left <= 0; };
    // いちばん少ない列の数で全員が入るように、パートごとに要る角度を求め、余った角度は人数の割合で分ける
    const FAN = rad(fan) - GAPA * (secs.length - 1);
    let need = null;
    for (let K = 1; K <= 14 && !need; K++) {
      const ws = secs.map(q => { let lo = 0, hi = FAN; if (!fits(hi, K, n[q.k])) return Infinity; for (let it = 0; it < 30; it++) { const md = (lo + hi) / 2; if (fits(md, K, n[q.k])) hi = md; else lo = md; } return hi; });
      if (ws.reduce((a2, v) => a2 + v, 0) <= FAN) need = ws;
    }
    if (!need) need = secs.map(q => (FAN * n[q.k]) / sumS);
    const spare = Math.max(0, FAN - need.reduce((a2, v) => a2 + v, 0));
    let w0 = -rad(fan) / 2;
    secs.forEach((q, i) => { const w = need[i] + (spare * n[q.k]) / sumS; q.w0 = w0; q.w1 = w0 + w; w0 += w + GAPA; });
    for (let ring = 0; ring < 14 && secs.some(q => q.left > 0); ring++) {
      const R = tune.r0 + ring * gapR;
      secs.forEach(q => {
        if (q.left <= 0) return;
        const m = seatsIn(q.w1 - q.w0, R, q.left);
        const mid = (q.w0 + q.w1) / 2;
        deskRow(m, spS).forEach(([off, dn]) => {
          const a = mid + off / R;
          const p = G().fromPolar(R, a, c);
          items.push({ type: 'player', label: q.k, x: p.x, y: p.y, rot: G().faceAngle(p, c), desk: `${q.k}-${q.desk + dn}` });
          q.a0 = Math.min(q.a0, (a * 180) / Math.PI); q.a1 = Math.max(q.a1, (a * 180) / Math.PI);
        });
        q.desk += Math.ceil(m / 2);
        q.left -= m;
        secR[q.k] = R;
        maxR = Math.max(maxR, R);
      });
    }
    secs.forEach(q => { secRange[q.k] = [q.a0, q.a1]; });
    void t; void avail; void sumN;
    if (n.Cb) {
      // コントラバスはチェロの後ろ（上手寄り）に、90cm 間隔で
      const vr = secRange.Vc || [60, 88];
      const midD = Math.min((vr[0] + vr[1]) / 2 - 4, 66);
      // その方向（チェロの角度の範囲の少し外まで）で、いちばん後ろにいる弦の人より後ろに
      const inDir = it => { const a = (Math.atan2(it.x - c.x, c.y - it.y) * 180) / Math.PI; return a >= vr[0] - 12 && a <= vr[1] + 12; };
      const behind = Math.max(secR.Vc || 0, ...items.filter(inDir).map(it => Math.hypot(it.x - c.x, it.y - c.y)));
      // コントラバスの譜面台は約78cm前にあるので、前の列（チェロ）から25cm多めに離す
      let left = n.Cb, R = (behind || maxR) + gapR + 25, cbDesk = 0;
      while (left > 0) {
        // なるべく1列に（列が増えると、管楽器のひな壇が奥へ下がる）。チェロの後ろから、扇の端までの範囲で並べる
        const maxW = Math.max(vr[1] - vr[0] + 10, 70);
        const cap = Math.max(1, Math.floor((rad(maxW) * R) / 95) + 1);
        const m = Math.min(left, cap);
        const half = ((m - 1) * 95) / 2 / R, edge = rad(fan / 2 + 4);
        // チェロが下手側（対向配置）のときは、下手の外側へ寄せる（真ん中の奥に来ると、ひな壇が奥へ下がる）
        const mid = midD >= 0 ? Math.min(rad(midD), edge - half) : -edge + half;
        deskRow(m, 95, 84).forEach(([off, dn]) => {
          const p = G().fromPolar(R, mid + off / R, c);
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
      place: (cx, yFront, d, W) => lineRow(row, yFront - Math.max(rowFront(row), d / 2 - 8), cx, sp, W - 70),
    }));
    const hrN = n.Hr || 0;
    const brass = [...rep('Tp', n.Tp), ...rep('Tb', n.Tb), ...rep('Tuba', n.Tuba)];
    // ティンパニ・打楽器
    const P = n.Perc || 0;
    let perc = [];
    if (n.Timp || P) {
      const kl = st.percInst ? kitList(st) : { timp: n.Timp ? 1 : 0, stations: [] };
      perc = percItems(kl.timp ? 4 : 0, kl.stations, [...rep('Timp', n.Timp ? 1 : 0), ...rep('Perc', P)]);
    }
    // 「ティンパニは最上段の中央」：いちばん高い段（金管の段）の真ん中、Hr と Tp のあいだの奥に置く。ほかの打楽器は下手
    const timpOnTop = st.percPlace === 'timpTop' && n.Timp && (hrN || brass.length) && H.steps > specs.length;
    let timpSet = [];
    if (timpOnTop) {
      timpSet = perc.filter(it => TIMP.includes(it.type) || (it.type === 'player' && /^tim/i.test(it.label || '')));
      perc = perc.filter(it => !timpSet.includes(it));
    }
    const TW = timpOnTop ? 330 : 0;
    if (hrN || brass.length) {
      const i = specs.length;
      const box = st.hornBox && hrN >= 3;
      const hrSlots = box ? Math.ceil(hrN / 2) : hrN;
      const wh = hrSlots * sp, wb = brass.length * sp, mid = timpOnTop ? TW : 90;
      specs.push({
        // ティンパニの段は 3×6尺を横2列（奥行182cm）：ティンパニ4台と奏者が入る
        depth: timpOnTop ? Math.max(tierD, 182) : box ? Math.max(tierD, ROW_FRONT + 80 + 45) : tierD,
        panel: timpOnTop && tierD < 182 ? '36' : undefined, orient: timpOnTop && tierD < 182 ? 'h' : undefined,
        want: wh + mid + wb + 60,
        hgt: H.steps > i ? ((H.heights && H.heights[i]) || std[Math.min(i, 3)]) : 0,
        place: (cx, yFront, d, W) => {
          const out = [];
          const yRow = box ? yFront - ROW_FRONT : yFront - Math.max(ROW_FRONT, d / 2 - 8);
          // 段の幅に入りきらないときは、奏者の間隔を詰める（段からはみ出さないように）
          const room = (W || 1e9) - 60;
          // それでも入らないときは、ホルンを前後2列（ボックス）にする（段の奥行が足りるときだけ）
          const box2 = box || (hrN >= 3 && hrN * sp + mid + wb > room && d >= ROW_FRONT + 80 + 26);
          const hrS = box2 ? Math.ceil(hrN / 2) : hrN, slots = hrS + brass.length;
          const sp2 = slots && (hrS + brass.length) * sp + mid > room ? Math.max(62, (room - mid) / slots) : sp;
          const wh2 = hrS * sp2, wb2 = brass.length * sp2;
          const x0 = cx - (wh2 + mid + wb2) / 2;
          for (let k = 0; k < hrS; k++) {
            out.push({ type: 'player', label: 'Hr', x: x0 + sp2 / 2 + k * sp2, y: box2 && !box ? yFront - ROW_FRONT : yRow, rot: 0 });
            // 後ろの列は半人分ずらす（後ろの人の譜面台が、前の人の椅子のあいだにくるように）
            if (box2 && k < Math.floor(hrN / 2)) out.push({ type: 'player', label: 'Hr', x: x0 + sp2 / 2 + k * sp2 + (box ? 0 : sp2 / 2), y: (box2 && !box ? yFront - ROW_FRONT : yRow) - 80, rot: 0 });
          }
          brass.forEach((l, k) => out.push({ type: 'player', label: l, x: x0 + wh2 + mid + sp2 / 2 + k * sp2, y: yRow, rot: 0 }));
          if (timpOnTop) {
            const zc = x0 + wh2 + TW / 2;
            A.arrangePerc(timpSet, stage, { yTop: yFront - d + 12, x0: zc - TW / 2, x1: zc + TW / 2 });
            out.push(...timpSet);
          }
          return out;
        },
      });
    }
    // ひな壇の前のふちは、弦のいちばん奥の人（いすの後ろ 約25cm）から clear だけ離す
    // （上手の横にいるコントラバスは、奥までは来ないので数えない）
    const yStr = items.length ? Math.min(...items.map(it => it.y)) - 25 : c.y - maxR;
    const tp = tiersAndPerc(stage, yStr - tune.clear, specs, H, perc, timpOnTop ? 'left' : st.percPlace || 'back', { c, R: maxR, side: !n.Hp && !n.Pf, mode: 'orch', pts: items.slice(), timpTier: !!(timpOnTop && timpSet.length) });
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
  // opt.side：吹奏楽の「下手」（扇形の外側に、前から指揮者の方を向けて）
  A.arrangePercIn = function (items, stage, place, opt) {
    AISLE = backLimit(stage);
    const list = items.filter(it => PERC_TYPES.has(it.type) || (it.type === 'player' && SS.partGroup(it.label).id === 'perc'));
    if (!list.length) return false;
    const parts = splitPerc(list, place);
    // 吹奏楽の「下手」：床の扇形のすぐ外側に、前から指揮者の方を向けて並べる（入らなければ、これまでどおり奥の角に）
    const pod = items.find(it => it.type === 'podium');
    if (parts.left.length && pod && opt && opt.side) {
      const c = { x: pod.x, y: pod.y };
      const tiers = items.filter(it => it.type === 'hina' || it.type === 'riser' || it.type === 'riser46');
      const onTier = p => tiers.some(h => (SS.hinaContains ? SS.hinaContains(h, p.x, p.y, 0) : Math.abs(p.x - h.x) < (h.w || 0) / 2 && Math.abs(p.y - h.y) < (h.h || 0) / 2));
      const pset = new Set(parts.left);
      const floorPl = items.filter(it => it.type === 'player' && !pset.has(it) && SS.partGroup(it.label).id !== 'perc' && !onTier(it) && it.x < c.x);
      const Rf = floorPl.reduce((m, it) => Math.max(m, Math.hypot(it.x - c.x, it.y - c.y)), 200);
      const others = items.filter(it => !pset.has(it) && !tiers.includes(it) && it.type !== 'podium');
      const trial = cloneList(parts.left);
      const t1 = items.filter(it => it.type === 'hina').sort((a, b) => (a.hgt || 0) - (b.hgt || 0) || b.y - a.y)[0];
      const timpAt = t1 ? { x: t1.x - (t1.w || 0) / 2 - 190, y: t1.y } : null;
      const ok = A.arrangePercSide(trial, stage, c, Rf + 75, (p, r) => p.y - r > AISLE &&
        !tiers.some(h => Math.abs(p.x - h.x) < (h.w || 0) / 2 + r && Math.abs(p.y - h.y) < (h.h || 0) / 2 + r), avoidOf(others), { timpAt });
      if (ok) { trial.forEach((t, i) => Object.assign(parts.left[i], { x: t.x, y: t.y, rot: t.rot })); parts.left = []; }
    }
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
    A.groupStations(list);
    return true;
  };

  // 何回か詰めながら、ステージに収まる並べ方を探す
  const TUNES = [
    { spacing: 82, gap: 125, r0: 205, span: 0.92, clear: 70 },
    { spacing: 80, gap: 115, r0: 195, span: 0.95, clear: 60 },
    // 扇形を左右に広げて（180°より少し広く）、舞台の左右の空いた所も使う
    { spacing: 80, gap: 112, r0: 190, span: 1.08, clear: 55 },
    { spacing: 78, gap: 108, r0: 185, span: 1.14, clear: 50 },
    { spacing: 77, gap: 108, r0: 185, span: 0.97, clear: 50 },
    { spacing: 74, gap: 102, r0: 175, span: 0.98, clear: 45 },
    // ここから先は、ひな壇の奥行を 4×6尺1枚（121cm）まで詰める
    { spacing: 82, gap: 118, r0: 195, span: 1.1, clear: 50, slim: true },
    { spacing: 80, gap: 112, r0: 190, span: 1.14, clear: 45, slim: true },
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

  function clashCount(items, stage, c) {
    if (!SS.checks) return 0;
    const ws = SS.checks({ stage, items: items.concat([{ type: 'podium', x: c.x, y: c.y, rot: 0 }]) });
    return ws.filter(w => w.kind === 'overlap' || w.kind === 'tieredge' || w.kind === 'loadin').reduce((a, w) => a + (w.kind === 'loadin' ? 1 : w.spots.length), 0);
  }

  A.build = function (st, stage) {
    const r = buildInner(st, stage);
    if (r && r.items) A.groupStations(r.items);
    return r;
  };
  function buildInner(st, stage) {
    AISLE = backLimit(stage);
    const f = st.type === 'band' || st.type === 'brass' ? band : st.type === 'bigband' ? bigBand : st.type === 'choir' ? choir : orch;
    const s2 = st.type === 'strings' ? Object.assign({}, st, { percInst: false, counts: Object.assign({}, st.counts) }) : st;
    let best = null;
    // となりとの間隔：ゆったり＝1割広い並べ方から試す（入らなければ、ふつうの並べ方へ）／つめる＝1割近くつめた並べ方だけ
    const scaleTune = (t, f) => Object.assign({}, t, { spacing: Math.round(t.spacing * f), gap: Math.round(t.gap * f), r0: Math.round(t.r0 * f), scaled: f });
    const tunes = st.space === 'wide' ? TUNES.map(t => scaleTune(t, 1.1)).concat(TUNES) : st.space === 'tight' ? TUNES.map(t => scaleTune(t, 0.92)) : TUNES;
    for (const tune of tunes) {
      let s3 = s2;
      if (tune.slim && s2.hina && (SS.panelSize(s2.hina).d * (s2.hina.deep || 1)) > 121) {
        s3 = Object.assign({}, s2, { hina: Object.assign({}, s2.hina, { panel: '46', orient: 'h', deep: 1 }) });
      }
      const r = f(s3, stage, tune);
      const outside = r.items.filter(it => it.type === 'player' && !inside(stage, it, 28)).length;
      const hinaOut = r.items.filter(it => it.type === 'hina' && !it.perc && it.y - it.h / 2 < AISLE - 1).length;
      // 椅子・譜面台・楽器の重なり、ひな壇の縁にかかる人（⚠ 確認と同じ見方）
      const clash = clashCount(r.items, stage, r.c);
      const score = outside * 10 + hinaOut * 10 + (r.overlap ? 5 : 0) + clash * 2 + (tune.slim ? 1 : 0);
      r.slim = !!(tune.slim && s3 !== s2);
      r.tune = tune;
      if (A.debug) A.debug.push({ tune, outside, hinaOut, overlap: r.overlap, clash, score });
      // ゆったり：同じ点数なら、間隔の広いほうを
      if (!best || score < best.score || (st.space === 'wide' && score === best.score && tune.spacing > best.tune.spacing)) best = Object.assign(r, { score, outside });
      if (score === 0) break;
    }
    // それでも入らないときは、打楽器の場所を変えて試す（最上段 → 最上段＋下手 → 下手）
    if (best.score > 1 && ['band', 'orch', 'brass'].includes(st.type) && !st._retry) {
      let alt = null;
      for (const pl of st.type === 'orch' ? ['timpTop', 'left', 'back', 'both'] : ['back', 'both', 'left']) {
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
    // 指揮台（ビッグバンドは指揮者なし、合唱は自分で置く）
    if (st.type !== 'bigband' && st.type !== 'choir') r.items.push({ type: 'podium', x: r.c.x, y: r.c.y, rot: 0 });
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
