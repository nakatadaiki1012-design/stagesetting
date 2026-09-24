/* 部品の種類・パートの色・描画 */
window.SS = window.SS || {};

(function (SS) {
  // パート名 → グループ（色分け・編成表用）。上から順に判定する。
  SS.PART_GROUPS = [
    // 合唱のパート（1文字の S・A・T・B など、ぴったり同じときだけ）
    { id: 'sop',  name: 'ソプラノ',           color: '#f5a3c2', re: /^(s|s1|s2|sop|soprano|ソプラノ)$/i },
    { id: 'alt',  name: 'アルト',             color: '#f7c784', re: /^(a|a1|a2|alt|alto|アルト)$/i },
    { id: 'ten',  name: 'テノール',           color: '#9bd6a4', re: /^(t|t1|t2|ten|tenor|テノール)$/i },
    { id: 'bas',  name: 'バス',               color: '#8db3e8', re: /^(b|b1|b2|bas|バス)$/i },
    { id: 'fl',   name: 'フルート',         color: '#8ecdf2', re: /^(picc|pic|fl(?!h)|ピッコロ|フルート)/i },
    { id: 'dr',   name: 'オーボエ・ファゴット', color: '#9fd9a6', re: /^(ob|e\.?h|c\.?a|fg|bsn|fag|オーボエ|ファゴット|バスーン|イングリッシュ)/i },
    { id: 'cl',   name: 'クラリネット',       color: '#7fb0e6', re: /^(e?s?b?\.?\s?cl|a\.?cl|クラ|バスクラ)/i },
    { id: 'sax',  name: 'サックス',           color: '#cda8e2', re: /^([satb]\.?\s?sx|[satb]\.?\s?sax|sax|as\d?$|ts\d?$|bs\d?$|サックス|アルト|テナー|バリトン|ソプラノ)/i },
    { id: 'hr',   name: 'ホルン',             color: '#f6c177', re: /^(hr|hn|horn|ホルン)|^(solo|1st|2nd|3rd)\s?hn$/i },
    { id: 'tp',   name: 'トランペット',       color: '#f4a6a6', re: /^(tp|trp|tpt|cor|cnt|flh|トランペット|コルネット)|cnt$/i },
    { id: 'tb',   name: 'トロンボーン',       color: '#ec9a78', re: /^(b\.?\s?tb|tb|trb|トロンボーン)/i },
    { id: 'lb',   name: 'ユーフォ・チューバ', color: '#d9b083', re: /^(euph|eup|eu|bar|tu|tuba|ユーフォ|チューバ)|^(eb|bb)\s?bass$/i },
    { id: 'vn',   name: 'ヴァイオリン',       color: '#f7da74', re: /^(vn|vl|vln|vi\d|violin|ヴァイオリン|バイオリン|1st|2nd)/i },
    { id: 'va',   name: 'ヴィオラ',           color: '#b8dc9c', re: /^(va|vla|viola|ヴィオラ|ビオラ)/i },
    { id: 'vc',   name: 'チェロ',             color: '#9bd2dc', re: /^(vc|vcl|cello|チェロ)/i },
    { id: 'cb',   name: 'コントラバス',       color: '#a9afe0', re: /^(cb|kb|db|str\.?\s?b|st\.?\s?b|s\.?b|contra|コンバス|コントラバス|弦バス|ストリングベース)/i },
    { id: 'perc', name: '打楽器',             color: '#cfcfcf', re: /^(perc|per|pc|timp|tim|sd|s\.d|bd|b\.d|cym|mar|xyl|vib|glk|glock|chime|tri|tamb|drs|drum|ティンパニ|打|パーカッション|ドラム)/i },
    { id: 'kb',   name: '鍵盤・ハープ',       color: '#e9b6d8', re: /^(pf|piano|pno|hp|harp|cel|org|key|ピアノ|ハープ|チェレスタ|オルガン)/i },
    { id: 'etc',  name: 'その他',             color: '#e2e2e2', re: /.*/ },
  ];

  SS.partGroup = function (label) {
    const l = String(label || '').trim();
    if (!l) return SS.PART_GROUPS[SS.PART_GROUPS.length - 1];
    for (const g of SS.PART_GROUPS) if (g.re.test(l)) return g;
    return SS.PART_GROUPS[SS.PART_GROUPS.length - 1];
  };

  // 部品カタログ（大きさの単位は cm。メーカー仕様などを参考にした実寸の目安）
  // グランドピアノの外形（上から見た形）。x：0＝低音側〜1＝高音側、y：0＝鍵盤側〜1＝しっぽ
  // 高音側は鍵盤から少しまっすぐ進み、内側へ反ってから丸いしっぽへ（ヤマハC3X・CFXの図面を参考）
  SS.pianoOutline = (function () {
    let cache = null;
    const bez = (p0, p1, p2, p3, n, out) => {
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
          u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
      }
    };
    return function () {
      if (cache) return cache;
      const pts = [[0, 0], [1, 0], [1, 0.2]];
      bez([1, 0.2], [1, 0.4], [0.64, 0.44], [0.56, 0.63], 14, pts);   // 内側へ反るところ
      bez([0.56, 0.63], [0.49, 0.79], [0.56, 0.93], [0.38, 0.99], 12, pts); // しっぽへ
      bez([0.38, 0.99], [0.25, 1.03], [0.05, 1.01], [0, 0.92], 10, pts);    // 丸いしっぽ
      cache = pts;
      return pts;
    };
  })();

  SS.CATALOG = {
    player:  { name: '奏者', cat: '基本', desc: '椅子＋譜面台' },
    podium:  { name: '指揮台', cat: '基本', w: 100, h: 76, shape: 'podium', fill: '#b08a5a', label: '指揮', note: '1000×755mm（ホール常設品の例）' },
    cstand:  { name: '指揮者用譜面台', cat: '基本', w: 60, h: 40, shape: 'rect', fill: '#5b6472', label: '' },
    chair:   { name: '椅子だけ', cat: '基本', w: 46, h: 46, shape: 'chair', fill: '#e1e5ea', label: '' },
    stand:   { name: '譜面台', cat: '基本', w: 50, h: 12, note: '机 約50cm・3本脚を開くと直径 約54cm', shape: 'rect', fill: '#5b6472', label: '' },
    riser:   { name: '平台 3×6尺', cat: '基本', w: 182, h: 91, shape: 'riser', fill: '#efe3cc', label: '', note: 'サブロク 910×1820mm' },
    riser46: { name: '平台 4×6尺', cat: '基本', w: 182, h: 121, shape: 'riser', fill: '#efe3cc', label: '', note: 'ヨンロク 1212×1820mm' },
    hina:    { name: 'ひな壇（1段）', cat: '基本', w: 728, h: 182, shape: 'hina', fill: '#ead9bb', label: '', note: '平台を並べた段。高さは箱馬で調整' },
    stairs:  { name: '上がり段', cat: '基本', w: 91, h: 60, shape: 'stairs', fill: '#efe3cc', label: '', note: 'ひな壇に上がる階段。段の横か前にくっつけて置く（矢印の向きに上がる）' },
    text:    { name: '文字', cat: '基本', w: 200, h: 50, shape: 'text', label: 'テキスト', fontSize: 36 },
    box:     { name: '四角', cat: '基本', w: 120, h: 70, shape: 'rect', fill: '#f2f2f2', label: '' },
    circle:  { name: '丸', cat: '基本', w: 80, h: 80, shape: 'circle', fill: '#f2f2f2', label: '' },

    timp32:  { name: 'ティンパニ 32"', cat: '打楽器', w: 89, h: 89, shape: 'timp', fill: '#eed9b5', label: '32', note: '鍋の直径 約81cm＋枠' },
    timp29:  { name: 'ティンパニ 29"', cat: '打楽器', w: 82, h: 82, shape: 'timp', fill: '#eed9b5', label: '29', note: '約74cm＋枠' },
    timp26:  { name: 'ティンパニ 26"', cat: '打楽器', w: 74, h: 74, shape: 'timp', fill: '#eed9b5', label: '26', note: '約66cm＋枠' },
    timp23:  { name: 'ティンパニ 23"', cat: '打楽器', w: 66, h: 66, shape: 'timp', fill: '#eed9b5', label: '23', note: '約58cm＋枠' },
    timp:    { name: 'ティンパニ(旧)', cat: '', w: 74, h: 74, shape: 'timp', fill: '#eed9b5', label: 'Timp' },
    marimba: { name: 'マリンバ 5oct', cat: '打楽器', w: 272, h: 116, shape: 'marimba', fill: '#b98a5a', label: 'Mar', note: '2720×1160mm（YM-6100）' },
    marimba43:{ name: 'マリンバ 4.3oct', cat: '打楽器', w: 225, h: 100, shape: 'marimba', fill: '#b98a5a', label: 'Mar' },
    xylo:    { name: 'シロフォン', cat: '打楽器', w: 165, h: 85, shape: 'keys', fill: '#c9a06e', label: 'Xylo', note: '3.5oct 目安' },
    vib:     { name: 'ヴィブラフォン', cat: '打楽器', w: 143, h: 82, shape: 'keys', fill: '#c9ced6', label: 'Vib', note: '1430×820mm（YV-3710）' },
    glock:   { name: 'グロッケン', cat: '打楽器', w: 106, h: 56, shape: 'keys', fill: '#c9ced6', label: 'Glk', note: '1060×560mm（YG-2500）' },
    chimes:  { name: 'チャイム', cat: '打楽器', w: 150, h: 60, shape: 'chimes', fill: '#c9ced6', label: 'Chime', note: '1.5oct 目安' },
    bd:      { name: '大太鼓', cat: '打楽器', w: 100, h: 60, shape: 'bd', fill: '#e6e6e6', label: 'B.D.', note: '36"×16"＋スタンド' },
    sd:      { name: '小太鼓', cat: '打楽器', w: 36, h: 36, shape: 'drumhead', fill: '#f4f4f4', label: 'S.D.', note: '14インチ' },
    cym:     { name: 'サスペンデッドシンバル', cat: '打楽器', w: 46, h: 46, shape: 'cym', fill: '#e8cf6a', label: 'Cym', note: '18インチ' },
    tam:     { name: 'タムタム(銅鑼)', cat: '打楽器', w: 100, h: 45, shape: 'rect', fill: '#b99a4a', label: 'T.T.' },
    drums:   { name: 'ドラムセット', cat: '打楽器', w: 180, h: 150, shape: 'drums', fill: '#e6e6e6', label: 'Drs' },
    table:   { name: '小物台', cat: '打楽器', w: 90, h: 45, shape: 'rect', fill: '#e9e2d6', label: '台' },

    piano:   { name: 'グランドピアノ(中型)', cat: '鍵盤など', w: 149, h: 186, shape: 'piano', fill: '#2d2d2d', label: 'Pf', note: '間口149×奥行186cm（C3X）' },
    pianoFull:{ name: 'グランドピアノ(フルコン)', cat: '鍵盤など', w: 160, h: 275, shape: 'piano', fill: '#2d2d2d', label: 'Pf', note: '奥行275cm（CFX）' },
    upright: { name: 'アップライト', cat: '鍵盤など', w: 153, h: 65, shape: 'rect', fill: '#3a3a3a', label: 'Pf' },
    keyboard:{ name: 'キーボード', cat: '鍵盤など', w: 130, h: 40, shape: 'keys', fill: '#555', label: 'Key' },
    harp:    { name: 'ハープ', cat: '鍵盤など', w: 55, h: 98, shape: 'harp', fill: '#e2c28a', label: 'Hp', note: '約55×98cm（ペダルハープ）' },
    amp:     { name: 'アンプ', cat: '鍵盤など', w: 60, h: 40, shape: 'rect', fill: '#444', label: 'Amp' },
    mic:     { name: 'マイク', cat: '鍵盤など', w: 30, h: 30, shape: 'mic', fill: '#444', label: '' },

    micTall: { name: '録音用マイク（高いスタンド）', cat: '電気・音響', w: 70, h: 70, shape: 'micTall', fill: '#333', label: '', audio: true, note: '3本脚を開くと直径 約70cm。選ぶと袖までのケーブルを引けます' },
    monitor: { name: 'モニタースピーカー', cat: '電気・音響', w: 55, h: 40, shape: 'monitor', fill: '#3a3f47', label: '', audio: true, power: true, note: '床置きの返しスピーカー（くさび形）。広い辺が音の出る側' },
    cable:   { name: 'ケーブル', cat: '', w: 10, h: 10, shape: 'cable', label: '', audio: true },
    outlet:  { name: 'コンセント（2口）', cat: '電気・音響', w: 24, h: 14, shape: 'outlet', fill: '#f4f4f4', label: '', note: '床・壁のコンセントの位置（差し込み口2つ）' },
    tap:     { name: '延長コード（4口タップ）', cat: '電気・音響', w: 50, h: 14, shape: 'tap', fill: '#f4f4f4', label: '', note: '差し込み口4つ。コンセント1口につなぐ' },
  };
  // 音響の機材（書き出し・印刷で出す／出さないを切り替える）
  SS.isAudio = it => it.type === 'mic' || !!(SS.CATALOG[it.type] && SS.CATALOG[it.type].audio);
  // 電源が要る機材（譜面灯は奏者ごとに別に数える）
  SS.needsPower = it => ['amp', 'keyboard', 'monitor'].includes(it.type);

  // 譜面灯（譜面台の右はし、指揮者側）。白黒でも分かるよう、光の線つきの丸
  function lightSVG(x, y) {
    let rays = '';
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; rays += `M${(x + Math.cos(a) * 9).toFixed(1)} ${(y + Math.sin(a) * 9).toFixed(1)}L${(x + Math.cos(a) * 13).toFixed(1)} ${(y + Math.sin(a) * 13).toFixed(1)}`; }
    return `<g class="stand-light"><path d="${rays}" stroke="#b08900" stroke-width="1.8" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="6.5" fill="#ffe066" stroke="#8a6d00" stroke-width="1.8"/></g>`;
  }
  SS.lightSVG = lightSVG;
  // 譜面灯と電源の数（編成表・図面の編成欄で使う）
  SS.powerSummary = function (items) {
    // 2人で1本の譜面台は、譜面灯も1つ
    const pairs = SS.standPairs ? SS.standPairs(items) : new Map();
    const lit = items.filter(it => it.type === 'player' && it.light);
    const lights = lit.filter(it => !pairs.has(it)).length + lit.filter(it => pairs.has(it) && (!pairs.get(it).light || items.indexOf(it) < items.indexOf(pairs.get(it)))).length;
    const devices = items.filter(SS.needsPower).length;
    const outlets = items.filter(it => it.type === 'outlet').length, taps = items.filter(it => it.type === 'tap').length;
    const need = lights + devices;
    // 2口コンセントは2口、4口タップはコンセント1口を使って4口になる（増えるのは3口）
    return { lights, devices, need, outlets, taps, have: outlets * 2 + taps * 3, wall: Math.ceil(need / 2) };
  };

  SS.PLAYER_R = 24;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  SS.esc = esc;

  function textColorFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#1f2733';
    const n = parseInt(m[1], 16);
    const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) < 120 ? '#ffffff' : '#1f2733';
  }

  // 文字の幅（字の大きさ1あたり）。日本語は1、英数字は0.6
  const labelWidth = label => Math.max(1, [...String(label)].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 1.0 : 0.62), 0));
  const labelText = (lb, p) => `<text x="${p.x}" y="${p.y}" dy="0.35em" text-anchor="middle" font-size="${lb.fs.toFixed(1)}" font-weight="700" fill="#1f2733" stroke="#fff" stroke-width="${(lb.fs * 0.28).toFixed(1)}" stroke-linejoin="round" paint-order="stroke">${esc(lb.text)}</text>`;
  SS.labelText = labelText;
  SS.labelWidth = labelWidth;
  function fitFont(label, maxW, base) {
    const len = Math.max(1, [...String(label)].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 1.0 : 0.6), 0));
    return Math.max(7, Math.min(base, maxW / len));
  }

  SS.itemColor = function (it, opts) {
    if (it.color) return it.color;
    if (it.type === 'player') return opts.colorBy ? SS.partGroup(it.label).color : '#ffffff';
    const c = SS.CATALOG[it.type];
    return (c && c.fill) || '#eeeeee';
  };

  // 1つの部品をSVG文字列にする
  SS.drawItem = function (it, opts) {
    opts = opts || {};
    const x = +it.x.toFixed(1), y = +it.y.toFixed(1), rot = +(it.rot || 0).toFixed(1);
    const fill = SS.itemColor(it, opts);
    let body = '', text = '', label = null;
    if (it.type === 'player' && opts.contest) {
      // コンクール用の配置図：椅子は○、譜面台は×（指揮者側）。色は付けない
      const kind = SS.instrumentKind ? SS.instrumentKind(it.label) : '';
      const noStand = ['perc', 'drs', 'pf', 'hp', 'voice'].includes(kind);
      body += '<circle r="30" fill="transparent"/>';
      body += `<circle r="20" fill="#fff" stroke="#111" stroke-width="2.6"${kind === 'perc' || kind === 'bass' ? ' stroke-dasharray="6 4"' : ''}/>`;
      if (opts.showStands !== false && !noStand && !opts.sharedStand) body += `<path d="M-12 40L12 64M12 40L-12 64" stroke="#111" stroke-width="3.4" stroke-linecap="round"/>`;
      const lab = it.label || '';
      if (lab && opts.mono) {
        // 図面用（白黒）：コピーやFAXでも読めるよう、パート名は椅子の後ろに大きく（重なるときはずらす）
        const a = rot * Math.PI / 180;
        const at = off => ({ x: +(x + Math.sin(a) * off).toFixed(1), y: +(y - Math.cos(a) * off).toFixed(1) });
        const side = off => ({ x: +(x + Math.cos(a) * off).toFixed(1), y: +(y + Math.sin(a) * off).toFixed(1) });
        const fs = fitFont(lab, 72, 26);
        label = { text: lab, fs, w: labelWidth(lab) * fs + 8, h: fs * 1.15, cands: [at(38), side(-40), side(40), at(56)] };
        if (!opts.deferLabels) text += labelText(label, label.cands[0]);
      } else if (lab) text += `<text x="${x}" y="${y}" dy="0.35em" text-anchor="middle" font-size="${fitFont(lab, 34, 15).toFixed(1)}" font-weight="700" fill="#111">${esc(lab)}</text>`;
      if (opts.showNames !== false && it.name) {
        const a = rot * Math.PI / 180;
        const nx = x + Math.sin(a) * 33, ny = y - Math.cos(a) * 33;
        text += `<text x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" dy="0.35em" text-anchor="middle" font-size="13" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(it.name)}</text>`;
      }
      if (opts.showNumbers && opts.number) {
        text += `<text x="${x + 20}" y="${y - 18}" text-anchor="middle" font-size="13" fill="#b03030" font-weight="700" stroke="#fff" stroke-width="3" paint-order="stroke">${opts.number}</text>`;
      }
    } else if (it.type === 'player' && opts.figure !== false && SS.drawFigure) {
      const fig = SS.drawFigure(it, fill, opts);
      body += fig.body;
      const a = rot * Math.PI / 180;
      const at = off => ({ x: +(x + Math.sin(a) * off).toFixed(1), y: +(y - Math.cos(a) * off).toFixed(1) });
      const lab = it.label || '';
      // パート名：椅子の上（体のすぐ後ろ）に大きめの字で。となりと重なるときは itemsSVG が別の候補へずらす
      if (lab) {
        const fs = fitFont(lab, 74, 28);
        const side = off => ({ x: +(x + Math.cos(a) * off).toFixed(1), y: +(y + Math.sin(a) * off).toFixed(1) });
        const cands = fig.standing ? [at(24), at(40), side(-40), side(40)] : [at(20), at(36), side(-40), side(40), at(52)];
        label = { text: lab, fs, w: labelWidth(lab) * fs + 8, h: fs * 1.15, cands };
        if (!opts.deferLabels) text += labelText(label, cands[0]);
      }
      if (opts.showNames !== false && it.name) {
        const np = at(fig.standing ? 44 : 58);
        text += `<text x="${np.x}" y="${np.y}" dy="0.35em" text-anchor="middle" font-size="14" fill="#1f2733" stroke="#fff" stroke-width="3.5" paint-order="stroke">${esc(it.name)}</text>`;
      }
      if (opts.showNumbers && opts.number) {
        text += `<text x="${x + 22}" y="${y - 18}" text-anchor="middle" font-size="13" fill="#b03030" font-weight="700" stroke="#fff" stroke-width="3" paint-order="stroke">${opts.number}</text>`;
      }
    } else if (it.type === 'player') {
      const r = opts.seatR || SS.PLAYER_R;
      if (opts.showStands !== false && !opts.sharedStand) {
        if (opts.standLegs !== false && SS.standLegsSVG) body += `<g transform="translate(0 ${r + 16})" opacity=".6">${SS.standLegsSVG()}</g>`;
        body += `<rect x="${-r * 1.05}" y="${r + 9}" width="${r * 2.1}" height="7" rx="2" fill="#5b6472"/>`;
      }
      body += `<circle r="${r}" fill="${fill}" stroke="#39414d" stroke-width="2"/>`;
      const lab = it.label || '';
      if (lab) {
        const fs = fitFont(lab, r * 1.8, r * 0.62);
        text += `<text x="${x}" y="${y}" dy="0.35em" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="700" fill="${textColorFor(fill)}">${esc(lab)}</text>`;
      }
      if (opts.showNames !== false && it.name) {
        // 名前は譜面台と反対側（後ろ側）に表示する
        const a = rot * Math.PI / 180;
        const off = r + 13;
        const nx = x + Math.sin(a) * off, ny = y - Math.cos(a) * off;
        text += `<text x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" dy="0.35em" text-anchor="middle" font-size="${Math.max(9, r * 0.5).toFixed(1)}" fill="#1f2733" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(it.name)}</text>`;
      }
      if (opts.showNumbers && opts.number) {
        text += `<text x="${x + r * 0.8}" y="${y - r * 0.8}" text-anchor="middle" font-size="${(r * 0.45).toFixed(1)}" fill="#b03030" font-weight="700" stroke="#fff" stroke-width="2.5" paint-order="stroke">${opts.number}</text>`;
      }
    } else {
      const c = SS.CATALOG[it.type] || SS.CATALOG.box;
      const w = it.w || c.w || 80, h = it.h || c.h || 60;
      const shape = c.shape || 'rect';
      const stroke = '#39414d';
      switch (shape) {
        case 'circle':
          body += `<ellipse rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
          break;
        case 'podium':
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="#6e5230" stroke-width="2.5"/>`;
          body += `<rect x="${-w / 2 + 7}" y="${-h / 2 + 7}" width="${w - 14}" height="${h - 14}" rx="2" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>`;
          break;
        case 'chair':
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="7" fill="${fill}" stroke="#8a929c" stroke-width="1.8"/>`;
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="8" rx="3" fill="#b8bfc8"/>`;
          break;
        case 'timp': {
          const r = Math.min(w, h) / 2;
          body += `<circle r="${r}" fill="#c7a36b" stroke="#7a5a2a" stroke-width="2"/>`;
          body += `<circle r="${r * 0.86}" fill="#f6ecd9" stroke="#b69868" stroke-width="1.5"/>`;
          body += `<rect x="-9" y="${r - 2}" width="18" height="12" rx="3" fill="#6b6f76"/>`;
          break;
        }
        case 'marimba': {
          // 低音側が広く、高音側がせまい台形。奏者（後ろ側に立つ）から見て左＝図の右側が低音
          const hw = w / 2, hh = h / 2, n = Math.max(8, Math.round(w / 9));
          body += `<path d="M${hw} ${-hh}L${-hw} ${-hh * 0.45}L${-hw} ${hh * 0.45}L${hw} ${hh}Z" fill="${fill}" stroke="#5e3a1c" stroke-width="2"/>`;
          let p = '';
          for (let i = 1; i < n; i++) { const xx = hw - (w * i) / n; const t = i / n; const yy = hh * (1 - 0.55 * t) - 3; p += `M${xx.toFixed(1)} ${(-yy).toFixed(1)}V${yy.toFixed(1)}`; }
          body += `<path d="${p}" stroke="rgba(60,30,10,.35)" stroke-width="1.5"/>`;
          break;
        }
        case 'chimes': {
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="4" fill="none" stroke="#6b6f76" stroke-width="2.5"/>`;
          const n = 18;
          for (let i = 0; i < n; i++) {
            const xx = -w / 2 + 8 + ((w - 16) * i) / (n - 1);
            const yy = i % 2 ? h * 0.12 : -h * 0.12;
            body += `<circle cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" r="3.4" fill="${fill}" stroke="#6b6f76" stroke-width="1"/>`;
          }
          break;
        }
        case 'bd':
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="6" fill="none" stroke="#9aa3ae" stroke-width="1.5" stroke-dasharray="5 4"/>`;
          body += `<rect x="${-w * 0.455}" y="${-h * 0.34}" width="${w * 0.91}" height="${h * 0.68}" rx="5" fill="${fill}" stroke="#39414d" stroke-width="2"/>`;
          body += `<rect x="${-w * 0.455}" y="${-h * 0.34}" width="${w * 0.91}" height="4" fill="#8a6d3b"/><rect x="${-w * 0.455}" y="${h * 0.34 - 4}" width="${w * 0.91}" height="4" fill="#8a6d3b"/>`;
          break;
        case 'drumhead':
          body += `<circle r="${w / 2}" fill="#9aa3ae" stroke="#39414d" stroke-width="2"/><circle r="${w / 2 - 3}" fill="${fill}"/>`;
          break;
        case 'cym':
          body += `<circle r="${w / 2}" fill="${fill}" stroke="#9a7a22" stroke-width="1.5"/><circle r="${w / 8}" fill="#c9a83a"/>`;
          break;
        case 'hina': {
          const pn = SS.panelSize ? SS.panelSize(it) : { w: 182, d: 91 };
          const hv = it.hgt || 21.2;
          const shade = Math.max(0, Math.min(1, hv / 90));
          const col = `rgb(${Math.round(236 - 40 * shade)},${Math.round(220 - 45 * shade)},${Math.round(190 - 50 * shade)})`;
          const arc = SS.hinaArc && SS.hinaArc(it);
          if (arc) {
            // 弧（円形）のひな壇：扇形の外形と、扇に並べた平台1枚ずつ
            const big = !!opts.assembly, detail = !!opts.hinaNo;
            body += `<path d="M${SS.hinaOutline(it).map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L')}Z" fill="${col}" stroke="#8a6d3b" stroke-width="3" stroke-linejoin="round"/>`;
            const ps = SS.hinaPanels(it), m = SS.hinaMaterials(it);
            let pp = '', nums = '', legs = '';
            const ls = big ? 16 : 11, fs = big ? Math.min(34, ps[0].w * 0.2, ps[0].d * 0.25) : Math.min(15, ps[0].w * 0.14, ps[0].d * 0.2);
            ps.forEach((q, k) => {
              const g0 = `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)}) rotate(${q.rot.toFixed(2)})`;
              // コンクール提出用の図には、平台の継ぎ目の点線を出さない
            if (!opts.contestSheet || detail) pp += `<rect transform="${g0}" x="${-q.w / 2}" y="${-q.d / 2}" width="${q.w}" height="${q.d}" fill="none" stroke="${detail ? '#8a6d3b' : '#b39463'}" stroke-width="${detail ? (big ? 2.5 : 1.6) : 1.5}"${detail ? '' : ' stroke-dasharray="8 5"'}/>`;
              if (!detail) return;
              if (m.legs) [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]].forEach(([sx, sy]) => { legs += `<rect transform="${g0}" x="${(sx * (q.w / 2 - ls / 2 - 1) - ls / 2).toFixed(1)}" y="${(sy * (q.d / 2 - ls / 2 - 1) - ls / 2).toFixed(1)}" width="${ls}" height="${ls}"/>`; });
              const n = `${opts.hinaNo}-${k + 1}`;
              nums += `<text transform="${g0}" ${big ? 'y="0" dy="0.35em" text-anchor="middle"' : `x="${(-q.w / 2 + 16).toFixed(1)}" y="${(-q.d / 2 + fs + 8).toFixed(1)}"`} font-size="${fs.toFixed(1)}" font-weight="700" fill="#6b5024" fill-opacity="${big ? 1 : 0.8}">${esc(n)}</text>`;
            });
            body += `<g>${pp}</g>`;
            if (legs) body += `<g class="hina-legs" fill="#6b5024" fill-opacity="${big ? 0.85 : 0.45}" stroke="none">${legs}</g>`;
            body += nums;
            // 段の名前は、下手のはしの前のふちに沿って（組み図では平台の番号と重ならないよう、段のすぐ前に）
            const tag = `${it.perc ? '打楽器の段 ' : it.step ? it.step + '段 ' : opts.hinaNo && !/^\d+$/.test(opts.hinaNo) ? 'ひな壇' + opts.hinaNo + ' ' : ''}${Math.round(hv)}cm${big ? `・弧 半径${(arc.R / 100).toFixed(1)}m` : ''}`;
            const t0 = -arc.th / 2 + 60 / arc.R, lr = big ? arc.R - 18 : arc.R + 14, lxl = lr * Math.sin(t0), lyl = arc.cy - lr * Math.cos(t0);
            const ra = (rot * Math.PI) / 180, tx = x + lxl * Math.cos(ra) - lyl * Math.sin(ra), ty = y + lxl * Math.sin(ra) + lyl * Math.cos(ra);
            text += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${big ? 16 : opts.contestSheet ? 14 : 22}" font-weight="700" fill="#6b5024" stroke="#f6eddc" stroke-width="3" paint-order="stroke" transform="rotate(${(rot + (t0 * 180) / Math.PI).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})">${esc(tag)}</text>`;
            break;
          }
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${col}" stroke="#8a6d3b" stroke-width="3"/>`;
          if (SS.hinaMaterials && opts.hinaNo) {
            // 組み図：平台1枚ずつの線と番号（段の番号-前の列の下手から数えた番号）、箱馬（足）の位置
            const m = SS.hinaMaterials(it), cw = w / m.across, cd = h / m.deep, big = !!opts.assembly;
            let p = '', nums = '', legs = '';
            for (let i = 1; i < m.across; i++) p += `M${(-w / 2 + i * cw).toFixed(1)} ${-h / 2}V${h / 2}`;
            for (let j = 1; j < m.deep; j++) p += `M${-w / 2} ${(h / 2 - j * cd).toFixed(1)}H${w / 2}`;
            body += `<path d="${p}" stroke="#8a6d3b" stroke-width="${big ? 2.5 : 1.6}"/>`;
            if (m.legs) {
              const ls = big ? 16 : 11;
              for (let j = 0; j <= m.deep; j++) for (let i = 0; i <= m.across * 2; i++) {
                const lx = Math.max(-w / 2 + ls / 2 + 1, Math.min(w / 2 - ls / 2 - 1, -w / 2 + (i * cw) / 2)), ly = Math.max(-h / 2 + ls / 2 + 1, Math.min(h / 2 - ls / 2 - 1, h / 2 - j * cd));
                legs += `<rect x="${(lx - ls / 2).toFixed(1)}" y="${(ly - ls / 2).toFixed(1)}" width="${ls}" height="${ls}"/>`;
              }
              body += `<g class="hina-legs" fill="#6b5024" fill-opacity="${big ? 0.85 : 0.45}" stroke="none">${legs}</g>`;
            }
            const fs = big ? Math.min(34, cw * 0.2, cd * 0.25) : Math.min(15, cw * 0.14, cd * 0.2);
            for (let j = 0; j < m.deep; j++) for (let i = 0; i < m.across; i++) {
              const n = `${opts.hinaNo}-${j * m.across + i + 1}`;
              const nx = big ? -w / 2 + (i + 0.5) * cw : -w / 2 + i * cw + 16, ny = big ? h / 2 - (j + 0.5) * cd : h / 2 - (j + 1) * cd + fs + 8;
              nums += `<text x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" ${big ? 'dy="0.35em" text-anchor="middle" ' : ''}font-size="${fs.toFixed(1)}" font-weight="700" fill="#6b5024" fill-opacity="${big ? 1 : 0.8}">${esc(n)}</text>`;
            }
            body += nums;
          } else if (!opts.contestSheet) {
            let p = '';
            for (let xx = -w / 2 + pn.w; xx < w / 2 - 5; xx += pn.w) p += `M${xx.toFixed(1)} ${-h / 2}V${h / 2}`;
            for (let yy = -h / 2 + pn.d; yy < h / 2 - 5; yy += pn.d) p += `M${-w / 2} ${yy.toFixed(1)}H${w / 2}`;
            body += `<path d="${p}" stroke="#b39463" stroke-width="1.5" stroke-dasharray="8 5"/>`;
          }
          const tag = `${it.perc ? '打楽器の段 ' : it.step ? it.step + '段 ' : opts.hinaNo && !/^\d+$/.test(opts.hinaNo) ? 'ひな壇' + opts.hinaNo + ' ' : ''}${Math.round(hv)}cm`;
          // 組み図では段の大きさ（幅×奥行）も書き、平台の番号とぶつからないよう小さめに下のふちへ
          if (opts.assembly) text += `<text x="${(x - w / 2 + 8).toFixed(1)}" y="${(y + h / 2 - 6).toFixed(1)}" font-size="16" font-weight="700" fill="#6b5024" stroke="#f6eddc" stroke-width="3" paint-order="stroke">${esc(tag)}・${(w / 100).toFixed(2)}m×${(h / 100).toFixed(2)}m</text>`;
          else if (opts.contestSheet) text += `<text x="${(x - w / 2 + 8).toFixed(1)}" y="${(y + h / 2 - 7).toFixed(1)}" font-size="14" fill="#6b5024">${esc(tag)}</text>`;
          else text += `<text x="${(x - w / 2 + 10).toFixed(1)}" y="${(y + h / 2 - 12).toFixed(1)}" font-size="22" font-weight="700" fill="#6b5024" stroke="#f6eddc" stroke-width="3" paint-order="stroke">${esc(tag)}</text>`;
          break;
        }
        case 'stairs': {
          // 上がり段：踏み板の線と、上がる向き（奥＝図の上）の矢印
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${fill}" stroke="#8a6d3b" stroke-width="2.5"/>`;
          let p = '';
          for (let i = 1; i < 3; i++) p += `M${-w / 2} ${(-h / 2 + (h * i) / 3).toFixed(1)}H${w / 2}`;
          body += `<path d="${p}" stroke="#8a6d3b" stroke-width="1.5"/>`;
          const aw = Math.min(w, h) * 0.22;
          body += `<path d="M0 ${(h / 2 - 6).toFixed(1)}V${(-h / 2 + 8).toFixed(1)}M${-aw} ${(-h / 2 + 8 + aw).toFixed(1)}L0 ${(-h / 2 + 8).toFixed(1)}L${aw} ${(-h / 2 + 8 + aw).toFixed(1)}" fill="none" stroke="#6b5024" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
          break;
        }
        case 'micTall': {
          // 高いスタンドの録音用マイク：3本脚と、上から見たマイク
          let p = '';
          for (let i = 0; i < 3; i++) { const a = (i * 2 * Math.PI) / 3 - Math.PI / 2; p += `M0 0L${(Math.cos(a) * w / 2).toFixed(1)} ${(Math.sin(a) * h / 2).toFixed(1)}`; }
          body += `<circle r="${w / 2}" fill="transparent"/><path d="${p}" stroke="#555" stroke-width="2.5" stroke-linecap="round"/>`;
          body += `<rect x="-5" y="-18" width="10" height="22" rx="4" fill="${fill}" stroke="#111" stroke-width="1.5"/><circle r="5" fill="#fff" stroke="#111" stroke-width="2"/>`;
          break;
        }
        case 'monitor':
          // くさび形。前（図の下＝広い辺）から音が出る
          body += `<path d="M${-w / 2} ${h / 2}L${w / 2} ${h / 2}L${w * 0.36} ${-h / 2}L${-w * 0.36} ${-h / 2}Z" fill="${fill}" stroke="#111" stroke-width="2"/>`;
          body += `<path d="M${-w * 0.3} ${h / 2 - 5}Q0 ${h / 2 + 6} ${w * 0.3} ${h / 2 - 5}" fill="none" stroke="#fff" stroke-width="2"/>`;
          break;
        case 'outlet':
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="#333" stroke-width="2"/>`;
          body += `<path d="M${-w / 4 - 2} -3V3M${-w / 4 + 2} -3V3M${w / 4 - 2} -3V3M${w / 4 + 2} -3V3" stroke="#333" stroke-width="1.6"/>`;
          break;
        case 'tap': {
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="#333" stroke-width="2"/>`;
          let p = '';
          for (let i = 0; i < 4; i++) { const cx = -w / 2 + (w * (i + 0.5)) / 4; p += `M${(cx - 2).toFixed(1)} -3V3M${(cx + 2).toFixed(1)} -3V3`; }
          body += `<path d="${p}" stroke="#333" stroke-width="1.4"/><path d="M${-w / 2} 0h-10" stroke="#333" stroke-width="2"/>`;
          break;
        }
        case 'cable': {
          // ケーブルの通り道（折れ線）。pts は (x, y) からの位置
          const pts = it.pts || [];
          if (pts.length > 1) {
            const d = 'M' + pts.map(q => `${(+q[0]).toFixed(1)} ${(+q[1]).toFixed(1)}`).join('L');
            body += `<path d="${d}" fill="none" stroke="transparent" stroke-width="22" stroke-linejoin="round"/>`;
            body += `<path class="cable-line" d="${d}" fill="none" stroke="#1f5fbf" stroke-width="4" stroke-dasharray="16 6 3 6" stroke-linejoin="round" stroke-linecap="round"/>`;
            const a = pts[pts.length - 2], b = pts[pts.length - 1];
            const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
            const ah = (t, r) => `${(b[0] + Math.cos(ang + t) * r).toFixed(1)} ${(b[1] + Math.sin(ang + t) * r).toFixed(1)}`;
            body += `<path d="M${ah(Math.PI - 0.45, 18)}L${b[0]} ${b[1]}L${ah(Math.PI + 0.45, 18)}" fill="none" stroke="#1f5fbf" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
            body += `<circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="5" fill="#1f5fbf"/>`;
            if (it.label) text += `<text x="${(x + b[0]).toFixed(1)}" y="${(y + b[1] - 16).toFixed(1)}" text-anchor="middle" font-size="24" font-weight="700" fill="#1f5fbf" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(it.label)}</text>`;
          }
          break;
        }
        case 'riser':
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${fill}" stroke="#b89b6a" stroke-width="2.5"/>`;
          break;
        case 'drum':
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
          body += `<ellipse cx="${-w / 2 + 6}" rx="6" ry="${h / 2 - 2}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>`;
          break;
        case 'drums': {
          const s = Math.min(w, h) / 140;
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="12" fill="none" stroke="#9aa3ae" stroke-dasharray="5 5"/>`;
          body += `<circle cx="0" cy="${-15 * s}" r="${30 * s}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
          body += `<circle cx="${-45 * s}" cy="${20 * s}" r="${18 * s}" fill="#fff" stroke="${stroke}" stroke-width="2"/>`;
          body += `<circle cx="${45 * s}" cy="${20 * s}" r="${22 * s}" fill="#fff" stroke="${stroke}" stroke-width="2"/>`;
          body += `<circle cx="${-55 * s}" cy="${-35 * s}" r="${20 * s}" fill="#f3e4a2" stroke="${stroke}" stroke-width="1.5"/>`;
          body += `<circle cx="${55 * s}" cy="${-35 * s}" r="${22 * s}" fill="#f3e4a2" stroke="${stroke}" stroke-width="1.5"/>`;
          body += `<circle cx="0" cy="${48 * s}" r="${15 * s}" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>`;
          break;
        }
        case 'keys': {
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
          const n = Math.max(4, Math.round(w / 14));
          let p = '';
          for (let i = 1; i < n; i++) { const xx = -w / 2 + (w * i) / n; p += `M${xx.toFixed(1)} ${-h / 2 + 4}V${h / 2 - 4}`; }
          body += `<path d="${p}" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>`;
          break;
        }
        case 'piano': {
          // 上から見たグランドピアノ：手前（+y）が鍵盤。左（低音側）はまっすぐ、右（高音側）は内側へ反ってしっぽへ
          const hw = w / 2, hh = h / 2;
          const kb = Math.min(22, h * 0.09); // 鍵盤の奥行
          const pts = SS.pianoOutline().map(([nx, ny]) => [-hw + nx * w, hh - kb - ny * (h - kb)]);
          const d = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
          body += `<path d="${d}" fill="${fill}" stroke="#111" stroke-width="2" stroke-linejoin="round"/>`;
          // 開いた屋根の内側（響板・フレーム）をうっすら
          const inner = SS.pianoOutline().map(([nx, ny]) => [-hw + (0.06 + nx * 0.88) * w, hh - kb - (0.04 + ny * 0.9) * (h - kb)]);
          body += `<path d="M${inner.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L')}Z" fill="none" stroke="#6b5a2e" stroke-width="1.5" opacity=".8"/>`;
          // 譜面台
          body += `<rect x="${(-hw * 0.55).toFixed(1)}" y="${(hh - kb - h * 0.1).toFixed(1)}" width="${(w * 0.55).toFixed(1)}" height="5" fill="#111" stroke="#555" stroke-width="1"/>`;
          // 鍵盤（白鍵と黒鍵のしるし）
          body += `<rect x="${-hw + 2}" y="${hh - kb}" width="${w - 4}" height="${kb}" fill="#f7f5ee" stroke="#111" stroke-width="1.5"/>`;
          let kp = '';
          for (let i = 1; i < 26; i++) { const xx = -hw + 2 + ((w - 4) * i) / 26; kp += `M${xx.toFixed(1)} ${hh - kb}V${(hh - kb * 0.45).toFixed(1)}`; }
          body += `<path d="${kp}" stroke="#222" stroke-width="2.2"/>`;
          break;
        }
        case 'harp': {
          // 上から見たペダルハープ：+y が奏者側（響板の上端が奏者の右肩へ）、-y の先が支柱
          const sx = w / 55, sy = h / 98;
          const P = (x, y) => `${(x * sx).toFixed(1)} ${(y * sy).toFixed(1)}`;
          body += `<path d="M${P(-24, -44)}L${P(24, -44)}Q${P(27, -44)} ${P(27, -40)}L${P(26, 8)}Q${P(26, 14)} ${P(20, 14)}L${P(-20, 14)}Q${P(-26, 14)} ${P(-26, 8)}L${P(-27, -40)}Q${P(-27, -44)} ${P(-24, -44)}Z" fill="#a8783e" stroke="#5a3d1c" stroke-width="2"/>`;
          let ped = '';
          for (let i = 0; i < 7; i++) { const xx = -21 + i * 7; ped += `M${P(xx, 14)}L${P(xx, 19)}`; }
          body += `<path d="${ped}" stroke="#c9a24a" stroke-width="2.4" stroke-linecap="round"/>`;
          body += `<path d="M${P(-16, -18)}L${P(16, -18)}L${P(8, 48)}L${P(-8, 48)}Z" fill="${fill}" stroke="#5a3d1c" stroke-width="2"/>`;
          body += `<path d="M${P(0, -16)}L${P(0, 46)}" stroke="#7a5a2a" stroke-width="1.5"/>`;
          body += `<path d="M${P(0, 46)}C${P(9, 30)} ${P(-9, 0)} ${P(0, -40)}" fill="none" stroke="#c9a060" stroke-width="${(6 * sx).toFixed(1)}" stroke-linecap="round"/>`;
          body += `<circle cx="0" cy="${(-42 * sy).toFixed(1)}" r="${(8 * sx).toFixed(1)}" fill="#e2c070" stroke="#8a6a2a" stroke-width="2"/>`;
          break;
        }
        case 'mic':
          body += `<circle r="${w / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><path d="M0 ${-w / 2}V${-w}" stroke="${stroke}" stroke-width="3"/>`;
          break;
        case 'text':
          break;
        default:
          if ((it.type === 'stand' || it.type === 'cstand') && opts.standLegs !== false && SS.standLegsSVG) body += `<g transform="translate(0 ${h / 2 + 2})" opacity=".75">${SS.standLegsSVG()}</g>`;
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
      }
      const lab = it.label != null ? it.label : c.label;
      if (shape === 'text') {
        const fs = it.fontSize || c.fontSize || 36;
        text += `<text x="${x}" y="${y}" dy="0.35em" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${it.color || '#1f2733'}">${esc(lab)}</text>`;
        // クリックできるよう透明の当たり判定
        body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="transparent"/>`;
      } else if (lab && ['micTall', 'monitor', 'outlet', 'tap'].includes(shape)) {
        // 小さい機材の名前（例：L・R・1番）は、形の下に黒い字で
        text += `<text x="${x}" y="${(y + Math.max(w, h) / 2 + 14).toFixed(1)}" dy="0.35em" text-anchor="middle" font-size="16" font-weight="700" fill="#1f2733" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(lab)}</text>`;
      } else if (lab && shape !== 'cable') {
        const fs = fitFont(lab, Math.max(w, h) * 0.9, Math.min(34, Math.max(12, Math.min(w, h) * 0.38)));
        const tc = shape === 'riser' ? '#8a6d3b' : textColorFor(fill);
        text += `<text x="${x}" y="${y}" dy="0.35em" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="700" fill="${tc}">${esc(lab)}</text>`;
      }
    }
    if (it.type === 'player' && it.light && opts.lights !== false && !opts.sharedStand) {
      // 譜面灯：譜面台の右はし
      const off = opts.contest ? 52 : opts.figure !== false && SS.drawFigure ? 64 : (opts.seatR || SS.PLAYER_R) + 12;
      body += lightSVG(27, off);
    }
    return { body: `<g transform="translate(${x} ${y}) rotate(${rot})">${body}</g>`, text, label };
  };

  // アイテムのおおよその半径（重なり判定・選択枠用）
  SS.itemSize = function (it, opts) {
    if (it.type === 'player') { const r = (opts && opts.seatR) || SS.PLAYER_R; return { w: r * 2, h: r * 2 }; }
    const c = SS.CATALOG[it.type] || SS.CATALOG.box;
    return { w: it.w || c.w, h: it.h || c.h };
  };

  // 部品の中の座標（向きを回す前）での外枠。ふつうは真ん中が (0,0) の四角。弧のひな壇は扇形の外枠
  SS.itemBounds = function (it, opts) {
    if (it.type === 'hina' && SS.hinaArc && SS.hinaArc(it)) return SS.hinaBounds(it);
    const s = SS.itemSize(it, opts);
    return { x0: -s.w / 2, x1: s.w / 2, y0: -s.h / 2, y1: s.h / 2 };
  };
  // 図の座標での外枠（向きも考える）
  SS.itemAABB = function (it, opts) {
    const b = SS.itemBounds(it, opts), a = ((it.rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(([x, y]) => [it.x + x * c - y * s, it.y + x * s + y * c]);
    return { x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])) };
  };

  // パレット用の小さなアイコン
  SS.iconFor = function (type) {
    const c = SS.CATALOG[type];
    let it;
    if (type === 'player') it = { type, x: 0, y: 0, rot: 0, label: 'Fl' };
    else it = { type, x: 0, y: 0, rot: 0, w: c.w, h: c.h, label: type === 'text' ? 'A' : '' };
    const s = SS.itemSize(it, {});
    const m = Math.max(s.w, s.h + (type === 'player' ? 30 : 0)) * 0.62;
    const d = SS.drawItem(it, { colorBy: true, showStands: true });
    return `<svg viewBox="${-m} ${-m} ${m * 2} ${m * 2}">${d.body}${d.text}</svg>`;
  };
})(window.SS);
