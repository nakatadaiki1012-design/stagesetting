/* 「こんな配置にしたい」という言葉から、かんたん編成の設定を変える
 * - claude.ai で開いたときは Claude（AI）が文章を読んで設定を決める
 * - それ以外（ダウンロードした1ファイル版など）は、よくある言い方を読み取るしくみで動く
 * どちらも「設定の変更（changes）」を返し、配置はいつもの自動配置で作り直す。
 */
window.SS = window.SS || {};

(function (SS) {
  const AI = {};

  // パートのよびかた → かんたん編成のパート
  const PART_WORDS = [
    [/ピッコロ|picc/i, ['Picc']],
    [/フルート|fl(?!ug)/i, ['Fl']],
    [/イングリッシュ|コールアングレ|e\.?h/i, ['E.H.']],
    [/オーボエ|ob/i, ['Ob']],
    [/コントラ?ファゴット|c\.?fg/i, ['C.Fg']],
    [/ファゴット|バスーン|fg/i, ['Fg']],
    [/エス?クラ|es\.?cl/i, ['Es.Cl']],
    [/バスクラ|b\.?cl/i, ['B.Cl']],
    [/1st\s*クラ|クラ(?:リネット)?\s*1|cl\s*1/i, ['Cl1']],
    [/2nd\s*クラ|クラ(?:リネット)?\s*2|cl\s*2/i, ['Cl2']],
    [/3rd\s*クラ|クラ(?:リネット)?\s*3|cl\s*3/i, ['Cl3']],
    [/クラ(?:リネット)?|cl/i, ['Cl1', 'Cl2', 'Cl3', 'Cl']],
    [/アルト\s*サックス|アルト|a\.?sx|a\.?sax/i, ['A.Sx']],
    [/テナー\s*サックス|テナー|t\.?sx|t\.?sax/i, ['T.Sx']],
    [/バリトン\s*サックス|バリサク|バリトン|b\.?sx|b\.?sax/i, ['B.Sx']],
    [/ホルン|hr|horn/i, ['Hr']],
    [/トランペット|ラッパ|tp|trp/i, ['Tp']],
    [/バス\s*トロンボーン|バストロ|b\.?tb/i, ['B.Tb']],
    [/トロンボーン|tb|trb/i, ['Tb']],
    [/ユーフォ(?:ニアム)?|euph/i, ['Euph']],
    [/チューバ|tuba/i, ['Tuba']],
    [/弦バス|ストリングベース|st\.?b/i, ['St.B', 'Cb']],
    [/コントラバス|コンバス|cb/i, ['Cb', 'St.B']],
    [/(?:1st|第?1)\s*(?:ヴァ|バ)イオリン|vn\s*1/i, ['Vn1']],
    [/(?:2nd|第?2)\s*(?:ヴァ|バ)イオリン|vn\s*2/i, ['Vn2']],
    [/(?:ヴィ|ビ)オラ|va/i, ['Va']],
    [/チェロ|vc/i, ['Vc']],
    [/ティンパニ|timp/i, ['Timp']],
    [/打楽器|パーカッション|perc/i, ['Perc']],
    [/ハープ|hp/i, ['Hp']],
    [/ピアノ|pf/i, ['Pf']],
  ];
  const NUM = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  const num = s => {
    s = String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/．/g, '.');
    if (/^[一二三四五六七八九十]+$/.test(s)) return s.length === 2 && s[0] === '十' ? 10 + NUM[s[1]] : s.length === 2 && s[1] === '十' ? NUM[s[0]] * 10 : NUM[s] || 0;
    return parseFloat(s);
  };
  const N = '([0-9０-９.．]+|[一二三四五六七八九十]+)';

  // 文章の中の、ひな形の名前・よびかた（長いことばから先に探す）
  AI.findTemplate = function (t) {
    const list = [];
    (SS.TEMPLATES || []).forEach(tp => {
      if (!tp.make || !tp.make.ensemble) return;
      (tp.words || []).forEach(w => { if (w && w.length >= 2) list.push({ w, tp }); });
    });
    list.sort((a, b) => b.w.length - a.w.length);
    const hit = list.find(x => t.includes(x.w));
    return hit ? hit.tp : null;
  };
  // 全体の人数（パート名のすぐ後ろの「〇人」は除く）
  AI.findTotal = function (t) {
    const re = new RegExp('(合計|総勢|全部で|全体で|みんなで)?\\s*' + N + '\\s*(人|名)\\s*(くらい|ぐらい|程度|ほど|前後|規模|編成|の編成)?', 'g');
    let m, found = 0;
    while ((m = re.exec(t))) {
      if (!m[1] && !m[4]) continue; // 「フルート6人」のようなパートの人数
      const before = t.slice(Math.max(0, m.index - 12), m.index);
      if (!m[1] && PART_WORDS.some(([pr]) => new RegExp('(?:' + pr.source + ')\\s*(?:を|は|が)?\\s*$', 'i').test(before))) continue;
      const v = num(m[2]);
      if (v >= 5 && v <= 150) found = v;
    }
    return found;
  };
  // 人数の割合を保ったまま、合計を total にする（fixed のパートはその人数のまま）
  AI.scaleCounts = function (counts, total, fixed) {
    fixed = fixed || {};
    const keys = Object.keys(counts).filter(k => !(k in fixed));
    const fixedSum = Object.values(fixed).reduce((a, v) => a + v, 0);
    const cur = keys.reduce((a, k) => a + (counts[k] || 0), 0);
    const want = Math.max(0, total - fixedSum);
    const out = Object.assign({}, fixed);
    if (!cur) { keys.forEach(k => { out[k] = counts[k] || 0; }); return out; }
    const raw = keys.map(k => ({ k, v: ((counts[k] || 0) * want) / cur }));
    raw.forEach(r => { out[r.k] = (counts[r.k] || 0) > 0 ? Math.max(1, Math.floor(r.v)) : 0; });
    let sum = keys.reduce((a, k) => a + out[k], 0);
    // 端数：小数部分の大きいパートから1人ずつ足す（多すぎるときは人数の多いパートから減らす）
    const byFrac = raw.filter(r => (counts[r.k] || 0) > 0).sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)));
    for (let i = 0; sum < want && byFrac.length; i = (i + 1) % byFrac.length) { out[byFrac[i].k]++; sum++; }
    const byBig = keys.slice().sort((a, b) => out[b] - out[a]);
    for (let i = 0; sum > want && byBig.length; i = (i + 1) % byBig.length) { if (out[byBig[i]] > 1) { out[byBig[i]]--; sum--; } if (byBig.every(k => out[k] <= 1)) break; }
    return out;
  };

  /**
   * よくある言い方を読み取る（AIが使えないとき）。
   * 戻り値 { changes, said: [何をしたか], unknown: 読み取れなかったか }
   */
  AI.parseLocal = function (text, st) {
    const t = String(text || '').replace(/\s+/g, ' ');
    const ch = {}, said = [];
    const parts = SS.auto.ENSEMBLES[(st && st.type) || 'band'].parts.map(p => p[0]);
    // 編成の種類
    if (/オーケストラ|オケ/.test(t)) { ch.type = 'orch'; said.push('オーケストラに'); }
    else if (/弦楽/.test(t)) { ch.type = 'strings'; said.push('弦楽合奏に'); }
    else if (/吹奏楽|ブラス/.test(t)) { ch.type = 'band'; said.push('吹奏楽に'); }
    // ひな形の名前（「コンクールA」「小編成」「2管編成」など）→ その編成の人数と設定
    let base = null;
    const tpl = AI.findTemplate(t);
    if (tpl) {
      base = tpl.make.ensemble();
      if (!ch.type || ch.type === base.type) {
        ch.type = base.type;
        ch.counts = Object.assign({}, base.counts);
        (base.type === 'band' ? ['layout', 'percPlace', 'lowOuter', 'hornBox'] : ['percPlace', 'antiphonal']).forEach(k => { if (base[k] !== undefined) ch[k] = base[k]; });
        ch.hina = Object.assign({}, base.hina);
        said.push(`ひな形「${tpl.name}」の編成`);
      } else base = null;
    }
    const type = ch.type || (st && st.type) || 'band';
    const allParts = SS.auto.ENSEMBLES[type].parts.map(p => p[0]);
    // 人数：「フルート6人」「Tp 5」「ホルンを4人に」「クラを2人増やす／減らす」
    const counts = {};
    PART_WORDS.forEach(([re, targets]) => {
      const m = new RegExp('(?:' + re.source + ')\\s*(?:を|は|が)?\\s*(?:あと)?' + N + '\\s*(人|名)?\\s*(増|減|ふや|へら)?', re.flags.replace('g', '')).exec(t);
      if (!m) return;
      const v = num(m[m.length - 3]);
      if (!(v >= 0 && v <= 40)) return;
      const tg = targets.filter(p => allParts.includes(p));
      if (!tg.length || tg.some(p => counts[p] != null)) return;
      const delta = m[m.length - 1];
      if (tg.length === 1) {
        const cur = (st && st.counts && st.counts[tg[0]]) || 0;
        counts[tg[0]] = delta ? Math.max(0, cur + (/増|ふや/.test(delta) ? v : -v)) : v;
      } else {
        // クラリネット9人 → 1st・2nd・3rd に分ける
        const k = tg.filter(p => p !== 'Cl');
        const base = Math.floor(v / k.length), extra = v - base * k.length;
        k.forEach((p, i) => { counts[p] = base + (i < extra ? 1 : 0); });
      }
    });
    // 全体の人数（「55人くらい」「合計40人」「総勢30名」）：パートの割合はそのままで合計を合わせる
    const total = AI.findTotal(t);
    if (total) {
      const from = Object.assign({}, (base && base.counts) || (ch.type && ch.type !== (st && st.type) ? SS.auto.defaultState(type).counts : (st && st.counts) || SS.auto.defaultState(type).counts));
      const fixed = Object.assign({}, counts);
      const scaled = AI.scaleCounts(from, total, fixed);
      ch.counts = Object.assign(ch.counts || {}, scaled);
      said.push(`合計 ${Object.values(scaled).reduce((a, v) => a + v, 0)}人に合わせる`);
    }
    if (/(?:ハープ|hp)(?:も|を)?(?:入れ|使|あり)/i.test(t) && counts.Hp == null) counts.Hp = 1;
    if (/(?:ピアノ|pf)(?:も|を)?(?:入れ|使|あり)/i.test(t) && counts.Pf == null) counts.Pf = 1;
    if (Object.keys(counts).length) { ch.counts = Object.assign(ch.counts || {}, counts); said.push('人数：' + Object.entries(counts).map(([k, v]) => `${k} ${v}人`).join('、')); }
    // 並び方
    let lay = '';
    if (/ドイツ/.test(t)) lay = 'german';
    else if (/昔|クラシック|伝統/.test(t)) lay = 'classic';
    else if (/クラ[^。、]*下手|サックス[^。、]*上手/.test(t)) lay = 'clLeft';
    else if (/標準|ふつう|一般/.test(t) && /並び|配置/.test(t)) lay = 'std';
    if (lay) { ch.layout = lay; said.push('並び方：' + SS.auto.BAND_LAYOUTS[lay].name); }
    // 打楽器の場所
    if (/打楽器|パーカッション|ティンパニ/.test(t)) {
      if (/両方|最上段.*下手|下手.*最上段/.test(t)) ch.percPlace = 'both';
      else if (/下手|左/.test(t)) ch.percPlace = 'left';
      else if (/最上段|上の段|ひな壇の上/.test(t)) ch.percPlace = 'top';
      else if (/奥|後ろ|うしろ/.test(t)) ch.percPlace = 'back';
      if (ch.percPlace) said.push('打楽器の場所：' + { both: '最上段＋下手', left: '下手', top: 'ひな壇の最上段', back: '舞台の奥' }[ch.percPlace]);
      if (/楽器(?:は|を)?(?:置かない|なし|いらない)/.test(t)) { ch.percInst = false; said.push('打楽器の楽器は置かない'); }
    }
    // ホルン・低音・対向
    if (/ホルン[^。]*ボックス|ボックス[^。]*ホルン/.test(t)) { ch.hornBox = !/やめ|なし|しない/.test(t); said.push(ch.hornBox ? 'ホルンをボックス型に' : 'ホルンを横一列に'); }
    if (/低音[^。]*(?:上手|外)/.test(t)) { ch.lowOuter = !/やめ|なし|しない/.test(t); said.push(ch.lowOuter ? '低音を上手の外側の弧に' : '低音をふつうの列に'); }
    if (/対向/.test(t)) { ch.antiphonal = !/やめ|なし|しない/.test(t); said.push(ch.antiphonal ? '対向配置に' : '通常配置に'); }
    // ひな壇
    const hs = new RegExp('ひな壇\\s*(?:は|を)?\\s*' + N + '\\s*段').exec(t) || new RegExp(N + '\\s*段(?:の)?\\s*ひな壇').exec(t);
    if (/ひな壇(?:は|を)?(?:なし|使わない|いらない|無し)/.test(t)) { ch.hina = { steps: 0 }; said.push('ひな壇なし'); }
    else if (hs) { const v = Math.max(0, Math.min(4, num(hs[1]))); ch.hina = { steps: v }; said.push(`ひな壇 ${v}段`); }
    const pm = /([346])\s*[×x✕*]\s*6/.exec(t);
    if (pm) {
      const om = /(縦|横)\s*(?:置き|向き|に|で)/.exec(t.slice(pm.index));
      ch.hina = Object.assign(ch.hina || {}, { panel: pm[1] + '6', orient: om && om[1] === '縦' ? 'v' : 'h' });
      said.push(`平台 ${pm[1]}×6尺${om ? '・' + om[1] + '置き' : ''}`);
    }
    // ホール・舞台
    const hall = (SS.HALLS || []).find(h => {
      const key = h.name.replace(/（.*?）|\s.*$/g, '');
      const short = key.replace(/(市民|文化|会館|ホール|大ホール|芸術劇場|シンフォニー|県立|区民|市立)/g, '');
      return t.includes(key) || (short.length >= 2 && t.includes(short));
    });
    if (hall) { ch.stage = { hall: hall.name }; said.push('ホール：' + hall.name); }
    const wm = new RegExp('(?:間口|幅|横)\\s*(?:は|を)?\\s*' + N + '\\s*m').exec(t);
    const dm = new RegExp('(?:奥行き?|縦)\\s*(?:は|を)?\\s*' + N + '\\s*m').exec(t);
    if (wm || dm) {
      ch.stage = Object.assign(ch.stage || {}, wm ? { w: num(wm[1]) } : {}, dm ? { d: num(dm[1]) } : {});
      said.push('舞台' + (wm ? ` 幅${num(wm[1])}m` : '') + (dm ? ` 奥行${num(dm[1])}m` : ''));
    }
    if (/円形|丸い舞台/.test(t)) { ch.stage = Object.assign(ch.stage || {}, { shape: 'round' }); said.push('舞台を円形に'); }
    else if (/弧|アーチ/.test(t) && /舞台|ステージ/.test(t)) { ch.stage = Object.assign(ch.stage || {}, { shape: 'arc' }); said.push('舞台の前を弧に'); }
    void parts;
    return { changes: ch, said, unknown: !said.length };
  };

  // Claude に渡す説明（今の設定と、変えられる項目・値）
  AI.buildPrompt = function (text, st, stage, hallName) {
    const halls = (SS.HALLS || []).map(h => h.name);
    const e = SS.auto.ENSEMBLES;
    return [
      'あなたは吹奏楽・オーケストラのステージ配置の専門家です。',
      '下の「要望」を読み、配置アプリの「かんたん編成」の設定をどう変えるかを JSON で答えてください。配置そのものはアプリが自動で作ります。',
      '要望にないことは変えないでください（変える項目だけ書く）。人数の合計・パートの内訳は要望どおりに。あいまいなら、日本の吹奏楽・オーケストラでよくある形を選んでください。',
      '',
      '## 返す JSON の形（使う項目だけ）',
      '{',
      '  "type": "band" | "orch" | "strings",',
      '  "counts": { "パート名": 人数, ... },   // パート名は下の一覧のもの。0〜40',
      '  "layout": "std" | "clLeft" | "classic" | "german",   // 吹奏楽の並び方',
      '  "percPlace": "back" | "top" | "left" | "both",       // 打楽器：舞台奥／ひな壇最上段／下手／最上段＋下手',
      '  "percInst": true | false,  // 打楽器の楽器も置くか',
      '  "hornBox": true | false,   // ホルンをボックス型に',
      '  "lowOuter": true | false,  // 吹奏楽の低音(B.Cl・Euph・Tuba・弦バス)を上手の外側の弧に',
      '  "antiphonal": true | false, // オーケストラの対向配置',
      '  "hina": { "steps": 0〜4, "panel": "36"|"46"|"66", "orient": "h"|"v", "deep": 1〜3, "heights": [段ごとの高さcm: 21.2, 42.4, 63.6, 84.8 などから] },',
      '  "stage": { "hall": "ホール名（一覧から完全一致）", "w": 前の幅m, "d": 奥行m, "bw": 奥の幅m, "shape": "rect"|"shell"|"arc"|"round"|"trapezoid"|"apron", "sag": 弧のふくらみm },',
      '  "message": "何をどう変えたかを、ふつうの日本語で2〜3文（専門用語はかみくだいて）"',
      '}',
      '',
      '## パート名',
      '吹奏楽: ' + e.band.parts.map(p => p[0]).join(', '),
      'オーケストラ: ' + e.orch.parts.map(p => p[0]).join(', '),
      '弦楽: ' + e.strings.parts.map(p => p[0]).join(', '),
      '',
      '## 並び方（吹奏楽）',
      Object.entries(SS.auto.BAND_LAYOUTS).map(([k, v]) => `${k}: ${v.name}`).join('\n'),
      '',
      '## 使えるホール',
      halls.join('、'),
      '',
      '## 今の設定',
      JSON.stringify({ type: st.type, counts: st.counts, layout: st.layout, percPlace: st.percPlace, percInst: st.percInst, hornBox: st.hornBox, lowOuter: st.lowOuter, antiphonal: st.antiphonal, hina: st.hina }),
      `今の舞台: 幅${stage.w / 100}m・奥行${stage.d / 100}m・形 ${stage.shape || 'rect'}${hallName ? '・ホール ' + hallName : ''}`,
      '',
      '## 要望',
      text,
      '',
      'JSON だけを返してください。',
    ].join('\n');
  };

  // Claude の答えを、使える値だけに絞る
  AI.sanitize = function (r) {
    const out = {};
    if (!r || typeof r !== 'object') return out;
    if (['band', 'orch', 'strings'].includes(r.type)) out.type = r.type;
    const type = out.type;
    if (r.counts && typeof r.counts === 'object') {
      const known = new Set(Object.values(SS.auto.ENSEMBLES).flatMap(e => e.parts.map(p => p[0])));
      out.counts = {};
      Object.entries(r.counts).forEach(([k, v]) => { const n = Math.round(+v); if (known.has(k) && n >= 0 && n <= 40) out.counts[k] = n; });
    }
    void type;
    if (SS.auto.BAND_LAYOUTS[r.layout]) out.layout = r.layout;
    if (['back', 'top', 'left', 'both'].includes(r.percPlace)) out.percPlace = r.percPlace;
    ['percInst', 'hornBox', 'lowOuter', 'antiphonal'].forEach(k => { if (typeof r[k] === 'boolean') out[k] = r[k]; });
    if (r.hina && typeof r.hina === 'object') {
      const h = {};
      if (r.hina.steps != null) h.steps = Math.max(0, Math.min(4, Math.round(+r.hina.steps) || 0));
      if (SS.PANELS[r.hina.panel]) h.panel = r.hina.panel;
      if (r.hina.orient === 'h' || r.hina.orient === 'v') h.orient = r.hina.orient;
      if (r.hina.deep != null) h.deep = Math.max(1, Math.min(3, Math.round(+r.hina.deep) || 1));
      if (Array.isArray(r.hina.heights)) h.heights = r.hina.heights.map(Number).filter(v => v > 0 && v < 120).slice(0, 4);
      out.hina = h;
    }
    if (r.stage && typeof r.stage === 'object') {
      const s = {};
      if (typeof r.stage.hall === 'string' && (SS.HALLS || []).some(h => h.name === r.stage.hall)) s.hall = r.stage.hall;
      ['w', 'd', 'bw', 'sag'].forEach(k => { const v = +r.stage[k]; if (v > 0 && v < 60) s[k] = v; });
      if (['rect', 'shell', 'arc', 'round', 'trapezoid', 'apron'].includes(r.stage.shape)) s.shape = r.stage.shape;
      out.stage = s;
    }
    if (typeof r.message === 'string') out.message = r.message.slice(0, 400);
    return out;
  };

  SS.assistant = AI;
})(window.SS);
