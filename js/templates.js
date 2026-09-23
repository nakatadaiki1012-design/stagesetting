/* ひな形（テンプレート） */
window.SS = window.SS || {};

(function (SS) {
  function arcRows(rows, c, r0, gap, spacing) {
    const G = SS.geo;
    const out = [];
    rows.forEach((labels, ri) => {
      const pts = G.generate([labels.length], { shape: 'arc', r0: r0 + ri * gap, gap: 0, spacing: spacing || 74 }, c);
      pts.forEach((p, i) => out.push({ type: 'player', label: labels[i], x: p.x, y: p.y, rot: p.rot }));
    });
    return out;
  }
  function lineRow(labels, y, cx, spacing) {
    spacing = spacing || 74;
    const w = (labels.length - 1) * spacing;
    return labels.map((l, i) => ({ type: 'player', label: l, x: cx - w / 2 + i * spacing, y, rot: 0 }));
  }
  const rep = (l, n) => Array(n).fill(l);
  const podium = c => ({ type: 'podium', x: c.x, y: c.y, rot: 0 });

  SS.TEMPLATES = [
    {
      id: 'band-std',
      name: '吹奏楽（標準・約50人）',
      desc: 'フルートとクラリネットが前列。よくある配置',
      make() {
        const stage = { w: 1400, d: 950 };
        const c = { x: 700, y: 840 };
        const items = arcRows([
          ['Picc', 'Fl1', 'Fl1', 'Fl2', 'Fl2', 'Cl1', 'Cl1', 'Cl1', 'Cl2', 'Cl2'],
          ['A.Sx1', 'A.Sx2', 'T.Sx', 'B.Sx', 'Ob1', 'Ob2', 'Fg', 'Cl2', 'Cl3', 'Cl3', 'Cl3', 'B.Cl'],
          ['Hr1', 'Hr2', 'Hr3', 'Hr4', 'Tb1', 'Tb2', 'Tb3', 'B.Tb', 'Euph', 'Euph', 'Tuba', 'Tuba', 'St.B'],
          ['Tp1', 'Tp1', 'Tp2', 'Tp2', 'Tp3', 'Tp3'],
        ], c, 190, 115);
        items.push(
          { type: 'riser', x: 700, y: 150, w: 1100, h: 200, rot: 0, label: '' },
          { type: 'marimba', x: 300, y: 130, rot: 0 },
          { type: 'xylo', x: 520, y: 120, rot: 0 },
          { type: 'glock', x: 660, y: 120, rot: 0 },
          { type: 'bd', x: 800, y: 130, rot: 0 },
          { type: 'sd', x: 900, y: 150, rot: 0 },
          { type: 'cym', x: 960, y: 110, rot: 0 },
          { type: 'timp', x: 1060, y: 170, rot: 0 }, { type: 'timp', x: 1135, y: 120, rot: 0 },
          { type: 'timp', x: 1215, y: 120, rot: 0 }, { type: 'timp', x: 1285, y: 170, rot: 0 },
          ...lineRow(rep('Perc', 5), 215, 760, 130).map(p => Object.assign(p, { rot: 180 })),
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
        const stage = { w: 1200, d: 800 };
        const c = { x: 600, y: 700 };
        const items = arcRows([
          ['Fl1', 'Fl2', 'Ob', 'Cl1', 'Cl1', 'Cl2'],
          ['A.Sx1', 'A.Sx2', 'T.Sx', 'B.Sx', 'Fg', 'Cl3', 'B.Cl'],
          ['Hr1', 'Hr2', 'Tb1', 'Tb2', 'Euph', 'Tuba', 'St.B'],
          ['Tp1', 'Tp2', 'Tp3'],
        ], c, 170, 110);
        items.push(
          { type: 'marimba', x: 280, y: 110, rot: 0 },
          { type: 'bd', x: 560, y: 100, rot: 0 },
          { type: 'sd', x: 650, y: 115, rot: 0 },
          { type: 'timp', x: 860, y: 130, rot: 0 }, { type: 'timp', x: 935, y: 95, rot: 0 }, { type: 'timp', x: 1005, y: 130, rot: 0 },
          ...lineRow(rep('Perc', 3), 185, 600, 200).map(p => Object.assign(p, { rot: 180 })),
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
        const stage = { w: 1600, d: 1100 };
        const c = { x: 800, y: 1000 };
        const items = [
          ...G.sector('Vn1', 14, -90, -52, 150, 100, 0, c),
          ...G.sector('Vn2', 12, -48, -12, 200, 100, 0, c),
          ...G.sector('Va', 10, 12, 48, 200, 100, 0, c),
          ...G.sector('Vc', 8, 52, 90, 150, 100, 0, c),
          ...G.sector('Cb', 6, 58, 86, 520, 95, 0, c),
          ...lineRow(['Fl2', 'Fl1', 'Ob1', 'Ob2'], 430, 800),
          ...lineRow(['Cl2', 'Cl1', 'Fg1', 'Fg2'], 330, 800),
          ...lineRow(['Hr3', 'Hr1', 'Hr2', 'Hr4'], 225, 520),
          ...lineRow(['Tp1', 'Tp2', 'Tb1', 'Tb2', 'Tb3', 'Tuba'], 225, 1000),
          { type: 'riser', x: 800, y: 380, w: 420, h: 200, rot: 0 },
          { type: 'riser', x: 800, y: 175, w: 1100, h: 200, rot: 0 },
          { type: 'timp', x: 740, y: 110, rot: 0 }, { type: 'timp', x: 815, y: 90, rot: 0 }, { type: 'timp', x: 890, y: 110, rot: 0 },
          { type: 'player', label: 'Timp', x: 815, y: 170, rot: 0 },
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
        const stage = { w: 1600, d: 1100 };
        const c = { x: 800, y: 1000 };
        const items = [
          ...G.sector('Vn1', 14, -90, -52, 150, 100, 0, c),
          ...G.sector('Vc', 8, -48, -12, 200, 100, 0, c),
          ...G.sector('Va', 10, 12, 48, 200, 100, 0, c),
          ...G.sector('Vn2', 12, 52, 90, 150, 100, 0, c),
          ...G.sector('Cb', 6, -86, -58, 520, 95, 0, c),
          ...lineRow(['Fl2', 'Fl1', 'Ob1', 'Ob2'], 430, 800),
          ...lineRow(['Cl2', 'Cl1', 'Fg1', 'Fg2'], 330, 800),
          ...lineRow(['Hr3', 'Hr1', 'Hr2', 'Hr4'], 225, 600),
          ...lineRow(['Tp1', 'Tp2', 'Tb1', 'Tb2', 'Tb3', 'Tuba'], 225, 1060),
          { type: 'riser', x: 800, y: 380, w: 420, h: 200, rot: 0 },
          { type: 'riser', x: 800, y: 175, w: 1200, h: 200, rot: 0 },
          { type: 'timp', x: 1250, y: 110, rot: 0 }, { type: 'timp', x: 1325, y: 90, rot: 0 }, { type: 'timp', x: 1400, y: 110, rot: 0 },
          { type: 'player', label: 'Timp', x: 1325, y: 170, rot: 0 },
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
        const stage = { w: 1200, d: 800 };
        const c = { x: 600, y: 700 };
        const items = [
          ...G.sector('Vn1', 6, -90, -48, 150, 100, 0, c),
          ...G.sector('Vn2', 5, -44, -6, 190, 100, 0, c),
          ...G.sector('Va', 4, 6, 44, 190, 100, 0, c),
          ...G.sector('Vc', 4, 48, 90, 150, 100, 0, c),
          ...G.sector('Cb', 2, 60, 84, 400, 95, 0, c),
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
        const stage = { w: 1300, d: 800 };
        const items = [
          { type: 'riser', x: 560, y: 390, w: 760, h: 120, rot: 0, label: '' },
          { type: 'riser', x: 560, y: 270, w: 760, h: 120, rot: 0, label: '' },
          ...lineRow(['B.Sx', 'T.Sx2', 'A.Sx1', 'A.Sx2', 'T.Sx1'], 540, 560, 110),
          ...lineRow(['Tb4', 'Tb3', 'Tb1', 'Tb2'], 400, 560, 110),
          ...lineRow(['Tp4', 'Tp3', 'Tp1', 'Tp2'], 280, 560, 110),
          { type: 'piano', x: 1080, y: 560, rot: -90 },
          { type: 'player', label: 'Pf', x: 1080, y: 670, rot: 180 },
          { type: 'drums', x: 1070, y: 250, rot: 0 },
          { type: 'player', label: 'Drs', x: 1070, y: 170, rot: 0 },
          { type: 'player', label: 'Bass', x: 1100, y: 390, rot: -90 },
          { type: 'amp', x: 1190, y: 390, rot: -90 },
          { type: 'player', label: 'Gt', x: 960, y: 420, rot: -90 },
          { type: 'mic', x: 600, y: 700, rot: 0 },
          { type: 'text', x: 600, y: 760, label: 'ソロマイク', fontSize: 26, w: 200, h: 40 },
        ];
        return { stage, items };
      },
    },
    {
      id: 'blank',
      name: '白紙から作る',
      desc: 'ステージと指揮台だけ',
      make() {
        const stage = { w: 1400, d: 900 };
        return { stage, items: [podium({ x: 700, y: 790 })] };
      },
    },
  ];
})(window.SS);
