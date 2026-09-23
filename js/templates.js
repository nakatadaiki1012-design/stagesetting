/* ひな形（テンプレート）。大きさは cm・実寸の目安 */
window.SS = window.SS || {};

(function (SS) {
  function lineRow(labels, y, cx, spacing) {
    spacing = spacing || 80;
    const w = (labels.length - 1) * spacing;
    return labels.map((l, i) => ({ type: 'player', label: l, x: cx - w / 2 + i * spacing, y, rot: 0 }));
  }
  const podium = c => ({ type: 'podium', x: c.x, y: c.y, rot: 0 });

  // 反射板を置いたときのよくある舞台（前の幅・奥の幅・奥行 cm）
  const SHELL = { shape: 'shell', w: 1800, bw: 1260, d: 1150 };
  const SHELL_L = { shape: 'shell', w: 2000, bw: 1400, d: 1250 };
  const SHELL_S = { shape: 'shell', w: 1500, bw: 1050, d: 1000 };

  // 「かんたん編成」と同じしくみで作る（ひな壇は平台の実寸・全段同じ幅）
  function auto(type, stage, set, counts) {
    // 配置を作らずに、ひな形の編成（人数・設定）だけを取り出す（AI・読み取りで使う）
    const ensemble = () => {
      const st = Object.assign(SS.auto.defaultState(type), set || {});
      if (counts) Object.assign(st.counts, counts);
      if (set && set.hina) st.hina = Object.assign(SS.auto.defaultState(type).hina, set.hina);
      return st;
    };
    const make = () => {
      const st = ensemble();
      const sg = Object.assign({}, stage);
      const r = SS.auto.build(st, sg);
      return { stage: sg, items: r.items, ensemble: st };
    };
    make.ensemble = ensemble;
    return make;
  }

  SS.TEMPLATES = [
    {
      id: 'band-std',
      words: ['吹奏楽の標準', '標準編成', '45人編成'], // AI・読み取りで、このひな形を指すことば
      name: '吹奏楽（標準・約45人）',
      desc: '前列Fl・Cl、2列目Sax〜Cl、ひな壇1段目Hr、2段目Tp・Tb。低音は上手の外側',
      make: auto('band', SHELL, { layout: 'std' }),
    },
    {
      id: 'band-contest',
      words: ['コンクールA', 'A編成', 'A部門', '大編成'], // AI・読み取りで、このひな形を指すことば
      name: '吹奏楽コンクールA（55人）',
      desc: '大きめの舞台（20×12.5m）。ひな壇2段＋打楽器段。ティンパニ・鍵盤は最上段、太鼓類は下手',
      make: auto('band', SHELL_L, { layout: 'std', percPlace: 'both' },
        { Picc: 1, Fl: 5, Ob: 2, Fg: 2, 'Es.Cl': 1, Cl1: 4, Cl2: 4, Cl3: 4, 'B.Cl': 2, 'A.Sx': 2, 'T.Sx': 1, 'B.Sx': 1, Hr: 4, Tp: 5, Tb: 3, 'B.Tb': 1, Euph: 2, Tuba: 3, 'St.B': 1, Perc: 7 }),
    },
    {
      id: 'band-clleft',
      name: '吹奏楽（Cl下手・Sax上手）',
      desc: 'クラリネットを下手（オーケストラの1stバイオリンの位置）に、サックスを上手に',
      make: auto('band', SHELL, { layout: 'clLeft' }),
    },
    {
      id: 'band-classic',
      name: '吹奏楽（昔ながらの配置）',
      desc: '2列目にSax・Ob、ひな壇1段目にHr・Tb・低音、最上段にTp',
      make: auto('band', SHELL, { layout: 'classic', lowOuter: false }),
    },
    {
      id: 'band-german',
      name: '吹奏楽（ドイツ式）',
      desc: '下手Cl・中央Fl/Ob・上手Sax、後ろに下手Tp｜Tuba｜上手Tb',
      make: auto('band', SHELL, { layout: 'german', lowOuter: false, hina: { steps: 1 } }),
    },
    {
      id: 'band-small',
      words: ['小編成', 'コンクールB', 'B編成', 'B部門'], // AI・読み取りで、このひな形を指すことば
      name: '吹奏楽（小編成・約25人）',
      desc: 'コンクール小編成向け。ひな壇2段、打楽器は下手',
      make: auto('band', SHELL_S, { layout: 'std', percPlace: 'left', hina: { steps: 2 } },
        { Picc: 0, Fl: 2, Ob: 1, Fg: 0, Cl1: 2, Cl2: 2, Cl3: 1, 'B.Cl': 1, 'A.Sx': 2, 'T.Sx': 1, 'B.Sx': 1, Hr: 2, Tp: 3, Tb: 2, 'B.Tb': 0, Euph: 1, Tuba: 1, 'St.B': 0, Perc: 3 }),
    },
    {
      id: 'orch-normal',
      words: ['2管編成', '二管編成', '2管', '二管'], // AI・読み取りで、このひな形を指すことば
      name: 'オーケストラ（通常配置）',
      desc: '左からVn1・Vn2・Va・Vc。2管編成、管楽器はひな壇3段（4×6尺）、ティンパニはその後ろ',
      make: auto('orch', SHELL_L, { percPlace: 'back' }),
    },
    {
      id: 'orch-antiphonal',
      name: 'オーケストラ（対向配置）',
      desc: 'Vn1とVn2が向かい合う古典的な配置',
      make: auto('orch', SHELL_L, { antiphonal: true, percPlace: 'back' }),
    },
    {
      id: 'strings',
      words: ['弦楽合奏'], // AI・読み取りで、このひな形を指すことば
      name: '弦楽合奏',
      desc: '弦楽器だけの小さめ編成',
      make: auto('strings', SHELL_S, {}),
    },
    {
      id: 'bigband',
      name: 'ビッグバンド',
      desc: 'Sax・Tb・Tpのひな壇＋リズム隊',
      make() {
        const stage = { shape: 'rect', w: 1500, d: 950 };
        // 平台3×6尺を横4枚・奥2枚（728×182cm）。1段目7寸、2段目1尺4寸
        const items = [
          { type: 'hina', x: 600, y: 470, w: 728, h: 182, hgt: 21.2, panel: '36', step: 1, rot: 0 },
          { type: 'hina', x: 600, y: 288, w: 728, h: 182, hgt: 42.4, panel: '36', step: 2, rot: 0 },
          ...lineRow(['B.Sx', 'T.Sx2', 'A.Sx1', 'A.Sx2', 'T.Sx1'], 650, 600, 115),
          ...lineRow(['Tb4', 'Tb3', 'Tb1', 'Tb2'], 480, 600, 120),
          ...lineRow(['Tp4', 'Tp3', 'Tp1', 'Tp2'], 298, 600, 115),
          { type: 'piano', x: 1270, y: 680, rot: -90 },
          { type: 'player', label: 'Pf', x: 1135, y: 690, rot: -90 },
          { type: 'drums', x: 1230, y: 360, rot: 0 },
          { type: 'player', label: 'Drs', x: 1230, y: 275, rot: 0 },
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
        const stage = Object.assign({}, SHELL);
        return { stage, items: [podium({ x: 900, y: 1060 })] };
      },
    },
  ];
})(window.SS);
