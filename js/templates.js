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
      words: ['コンクールA', 'A編成', 'A部門', 'Aの部', 'A部', '大編成'], // AI・読み取りで、このひな形を指すことば
      name: '吹奏楽コンクールA（55人）',
      desc: '大きめの舞台（20×12.5m）。ひな壇2段＋打楽器段。打楽器はいちばん奥の打楽器段に1か所にまとめる',
      make: auto('band', SHELL_L, { layout: 'std', percPlace: 'back' },
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
      words: ['小編成', 'コンクールB', 'B編成', 'B部門', 'Bの部', 'B部'], // AI・読み取りで、このひな形を指すことば
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
      make: auto('orch', SHELL_L, { percPlace: 'timpTop' }),
    },
    {
      id: 'orch-antiphonal',
      name: 'オーケストラ（対向配置）',
      desc: 'Vn1とVn2が向かい合う古典的な配置',
      make: auto('orch', SHELL_L, { antiphonal: true, percPlace: 'timpTop' }),
    },
    {
      id: 'strings',
      words: ['弦楽合奏'], // AI・読み取りで、このひな形を指すことば
      name: '弦楽合奏',
      desc: '弦楽器だけの小さめ編成',
      make: auto('strings', SHELL_S, {}),
    },
    {
      id: 'brassband',
      words: ['ブラスバンド', 'ブリティッシュ', '金管バンド'], // AI・読み取りで、このひな形を指すことば
      name: 'ブラスバンド（ブリティッシュ・スタイル）',
      desc: 'コルネット10・ホルン3・バリトン2・トロンボーン3・ユーフォ2・ベース4＋打楽器。前：ソロ・コルネット〜ユーフォ、後ろ：コルネット・ベース・トロンボーン',
      make: auto('brass', SHELL, {}),
    },
    {
      id: 'bigband',
      words: ['ビッグバンド', 'ジャズ'], // AI・読み取りで、このひな形を指すことば
      name: 'ビッグバンド',
      desc: 'サックス5（前）・トロンボーン4（1段目）・トランペット4（2段目）、リズム隊（ピアノ・ギター・ベース・ドラム）は下手',
      make: auto('bigband', { shape: 'rect', w: 1500, d: 950 }, {}),
    },
    {
      id: 'choir',
      words: ['合唱', '混声合唱', 'コーラス'], // AI・読み取りで、このひな形を指すことば
      name: '合唱（混声4部・40人＋ピアノ）',
      desc: '下手から S・A・T・B。前の列は床、うしろは合唱用のひな壇3段（うしろの列は半人分ずらす）。ピアノは下手',
      make: auto('choir', SHELL, { layout: 'satb' }),
    },
    {
      id: 'choir-women',
      words: ['女声合唱'], // AI・読み取りで、このひな形を指すことば
      name: '女声合唱（32人＋ピアノ）',
      desc: 'ソプラノ・アルトを下手から。ひな壇3段',
      make: auto('choir', SHELL, { layout: 'satb' }, { S: 16, A: 16, T: 0, B: 0 }),
    },
    {
      id: 'blank',
      name: '白紙から作る',
      desc: 'ステージと指揮台だけ',
      make() {
        const stage = Object.assign({}, SHELL);
        return { stage, items: [podium({ x: stage.w / 2, y: SS.auto.podiumYOf(stage) })] };
      },
    },
  ];
})(window.SS);
