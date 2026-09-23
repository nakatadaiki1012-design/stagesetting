/* ひな形（テンプレート）。大きさは cm・実寸の目安 */
window.SS = window.SS || {};

(function (SS) {
  function arcRows(rows, c, r0, gap, spacing) {
    const G = SS.geo;
    const out = [];
    rows.forEach((labels, ri) => {
      const pts = G.generate([labels.length], { shape: 'arc', r0: r0 + ri * gap, gap: 0, spacing: spacing || 80 }, c);
      pts.forEach((p, i) => out.push({ type: 'player', label: labels[i], x: p.x, y: p.y, rot: p.rot }));
    });
    return out;
  }
  function lineRow(labels, y, cx, spacing) {
    spacing = spacing || 80;
    const w = (labels.length - 1) * spacing;
    return labels.map((l, i) => ({ type: 'player', label: l, x: cx - w / 2 + i * spacing, y, rot: 0 }));
  }
  const podium = c => ({ type: 'podium', x: c.x, y: c.y, rot: 0 });

  // ティンパニ奏者と、そのまわりに扇形に並ぶティンパニ（左が低音＝大きい）
  function timpSet(px, py, sizes) {
    sizes = sizes || ['timp32', 'timp29', 'timp26', 'timp23'];
    const n = sizes.length, R = 112;
    const out = [{ type: 'player', label: 'Timp', x: px, y: py, rot: 0 }];
    sizes.forEach((t, i) => {
      const th = (66 - (132 * i) / (n - 1)) * Math.PI / 180; // 奏者から見て左（図では右）が低音
      out.push({ type: t, x: Math.round(px + R * Math.sin(th)), y: Math.round(py + R * Math.cos(th)), rot: 0 });
    });
    return out;
  }
  // 鍵盤打楽器などと、その後ろに立つ奏者
  function withPlayer(type, x, y, label) {
    const h = SS.CATALOG[type].h;
    return [{ type, x, y, rot: 0 }, { type: 'player', label: label || 'Perc', x, y: y - h / 2 - 22, rot: 0 }];
  }

  SS.TEMPLATES = [
    {
      id: 'band-std',
      name: '吹奏楽（標準・約50人）',
      desc: 'フルートとクラリネットが前列。よくある配置',
      make() {
        const stage = { w: 1700, d: 1150 };
        const c = { x: 850, y: 1030 };
        const items = arcRows([
          ['Picc', 'Fl1', 'Fl1', 'Fl2', 'Fl2', 'Cl1', 'Cl1', 'Cl1', 'Cl2', 'Cl2'],
          ['A.Sx1', 'A.Sx2', 'T.Sx', 'B.Sx', 'Ob1', 'Ob2', 'Fg', 'Cl2', 'Cl3', 'Cl3', 'Cl3', 'B.Cl'],
          ['Hr1', 'Hr2', 'Hr3', 'Hr4', 'Tb1', 'Tb2', 'Tb3', 'B.Tb', 'Euph', 'Euph', 'Tuba', 'Tuba', 'St.B'],
          ['Tp1', 'Tp1', 'Tp2', 'Tp2', 'Tp3', 'Tp3'],
        ], c, 210, 125, 82);
        items.push(
          ...withPlayer('marimba', 290, 250),
          ...withPlayer('xylo', 560, 235),
          ...withPlayer('glock', 740, 225),
          ...withPlayer('chimes', 900, 225),
          ...withPlayer('bd', 1060, 235),
          { type: 'cym', x: 1135, y: 280, rot: 0 },
          ...withPlayer('sd', 1190, 215),
          ...timpSet(1420, 95),
          podium(c)
        );
        return { stage, items };
      },
    },
    {
      id: 'band-small',
      name: '吹奏楽（小編成・約25人）',
      desc: 'コンクールB組・少人数バンド向け',
      make() {
        const stage = { w: 1500, d: 1000 };
        const c = { x: 750, y: 890 };
        const items = arcRows([
          ['Fl1', 'Fl2', 'Ob', 'Cl1', 'Cl1', 'Cl2'],
          ['A.Sx1', 'A.Sx2', 'T.Sx', 'B.Sx', 'Fg', 'Cl3', 'B.Cl'],
          ['Hr1', 'Hr2', 'Tb1', 'Tb2', 'Euph', 'Tuba', 'St.B'],
          ['Tp1', 'Tp2', 'Tp3'],
        ], c, 200, 125, 82);
        items.push(
          ...withPlayer('marimba43', 270, 230),
          ...withPlayer('bd', 620, 200),
          ...withPlayer('sd', 760, 185),
          ...timpSet(1180, 90, ['timp29', 'timp26', 'timp23']),
          podium(c)
        );
        return { stage, items };
      },
    },
    {
      id: 'orch-normal',
      name: 'オーケストラ（通常配置）',
      desc: '左からVn1・Vn2・Va・Vc。2管編成',
      make() {
        const G = SS.geo;
        const stage = { w: 1800, d: 1250 };
        const c = { x: 900, y: 1130 };
        const items = [
          { type: 'riser46', x: 900, y: 490, w: 728, h: 121, rot: 0 },
          { type: 'riser46', x: 900, y: 370, w: 728, h: 121, rot: 0 },
          { type: 'riser46', x: 900, y: 250, w: 1456, h: 121, rot: 0 },
          ...G.sector('Vn1', 14, -90, -52, 160, 100, 0, c, 78),
          ...G.sector('Vn2', 12, -48, -12, 210, 100, 0, c, 78),
          ...G.sector('Va', 10, 12, 48, 210, 100, 0, c, 78),
          ...G.sector('Vc', 8, 52, 90, 160, 105, 0, c, 82),
          ...G.sector('Cb', 6, 60, 86, 560, 100, 0, c, 85),
          ...lineRow(['Fl2', 'Fl1', 'Ob1', 'Ob2'], 480, 900),
          ...lineRow(['Cl2', 'Cl1', 'Fg1', 'Fg2'], 360, 900),
          ...lineRow(['Hr3', 'Hr1', 'Hr2', 'Hr4'], 240, 560),
          ...lineRow(['Tp1', 'Tp2', 'Tb1', 'Tb2', 'Tb3', 'Tuba'], 240, 1180, 84),
          ...timpSet(900, 45, ['timp32', 'timp29', 'timp26', 'timp23']),
          podium(c),
        ];
        return { stage, items };
      },
    },
    {
      id: 'orch-antiphonal',
      name: 'オーケストラ（対向配置）',
      desc: 'Vn1とVn2が向かい合う古典的な配置',
      make() {
        const G = SS.geo;
        const stage = { w: 1800, d: 1250 };
        const c = { x: 900, y: 1130 };
        const items = [
          { type: 'riser46', x: 900, y: 490, w: 728, h: 121, rot: 0 },
          { type: 'riser46', x: 900, y: 370, w: 728, h: 121, rot: 0 },
          { type: 'riser46', x: 900, y: 250, w: 1456, h: 121, rot: 0 },
          ...G.sector('Vn1', 14, -90, -52, 160, 100, 0, c, 78),
          ...G.sector('Vc', 8, -48, -12, 210, 105, 0, c, 82),
          ...G.sector('Va', 10, 12, 48, 210, 100, 0, c, 78),
          ...G.sector('Vn2', 12, 52, 90, 160, 100, 0, c, 78),
          ...G.sector('Cb', 6, -86, -60, 560, 100, 0, c, 85),
          ...lineRow(['Fl2', 'Fl1', 'Ob1', 'Ob2'], 480, 900),
          ...lineRow(['Cl2', 'Cl1', 'Fg1', 'Fg2'], 360, 900),
          ...lineRow(['Hr3', 'Hr1', 'Hr2', 'Hr4'], 240, 620),
          ...lineRow(['Tp1', 'Tp2', 'Tb1', 'Tb2', 'Tb3', 'Tuba'], 240, 1180, 84),
          ...timpSet(1480, 60, ['timp32', 'timp29', 'timp26']),
          podium(c),
        ];
        return { stage, items };
      },
    },
    {
      id: 'strings',
      name: '弦楽合奏',
      desc: '弦楽器だけの小さめ編成',
      make() {
        const G = SS.geo;
        const stage = { w: 1400, d: 950 };
        const c = { x: 700, y: 840 };
        const items = [
          ...G.sector('Vn1', 6, -90, -48, 160, 100, 0, c, 78),
          ...G.sector('Vn2', 5, -44, -6, 200, 100, 0, c, 78),
          ...G.sector('Va', 4, 6, 44, 200, 100, 0, c, 78),
          ...G.sector('Vc', 4, 48, 90, 160, 105, 0, c, 82),
          ...G.sector('Cb', 2, 60, 84, 430, 100, 0, c, 85),
          podium(c),
        ];
        return { stage, items };
      },
    },
    {
      id: 'bigband',
      name: 'ビッグバンド',
      desc: 'Sax・Tb・Tpのひな壇＋リズム隊',
      make() {
        const stage = { w: 1500, d: 950 };
        const items = [
          { type: 'riser46', x: 600, y: 500, w: 728, h: 121, rot: 0 },
          { type: 'riser46', x: 600, y: 375, w: 728, h: 121, rot: 0 },
          ...lineRow(['B.Sx', 'T.Sx2', 'A.Sx1', 'A.Sx2', 'T.Sx1'], 650, 600, 115),
          ...lineRow(['Tb4', 'Tb3', 'Tb1', 'Tb2'], 500, 600, 120),
          ...lineRow(['Tp4', 'Tp3', 'Tp1', 'Tp2'], 375, 600, 115),
          { type: 'piano', x: 1270, y: 680, rot: -90 },
          { type: 'player', label: 'Pf', x: 1135, y: 690, rot: -90 },
          { type: 'drums', x: 1230, y: 330, rot: 0 },
          { type: 'player', label: 'Drs', x: 1230, y: 245, rot: 0 },
          { type: 'player', label: 'Bass', x: 1070, y: 470, rot: 0 },
          { type: 'amp', x: 1070, y: 400, rot: 0 },
          { type: 'player', label: 'Gt', x: 960, y: 560, rot: 0 },
          { type: 'mic', x: 700, y: 820, rot: 0 },
          { type: 'text', x: 700, y: 880, label: 'ソロマイク', fontSize: 26, w: 200, h: 40 },
        ];
        return { stage, items };
      },
    },
    {
      id: 'blank',
      name: '白紙から作る',
      desc: 'ステージと指揮台だけ',
      make() {
        const stage = { w: 1600, d: 1100 };
        return { stage, items: [podium({ x: 800, y: 990 })] };
      },
    },
  ];
})(window.SS);
