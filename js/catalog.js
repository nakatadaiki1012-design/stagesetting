/* 部品の種類・パートの色・描画 */
window.SS = window.SS || {};

(function (SS) {
  // パート名 → グループ（色分け・編成表用）。上から順に判定する。
  SS.PART_GROUPS = [
    { id: 'fl',   name: 'フルート',         color: '#8ecdf2', re: /^(picc|pic|fl|ピッコロ|フルート)/i },
    { id: 'dr',   name: 'オーボエ・ファゴット', color: '#9fd9a6', re: /^(ob|e\.?h|c\.?a|fg|bsn|fag|オーボエ|ファゴット|バスーン|イングリッシュ)/i },
    { id: 'cl',   name: 'クラリネット',       color: '#7fb0e6', re: /^(e?s?b?\.?\s?cl|a\.?cl|クラ|バスクラ)/i },
    { id: 'sax',  name: 'サックス',           color: '#cda8e2', re: /^([satb]\.?\s?sx|[satb]\.?\s?sax|sax|as\d?$|ts\d?$|bs\d?$|サックス|アルト|テナー|バリトン|ソプラノ)/i },
    { id: 'hr',   name: 'ホルン',             color: '#f6c177', re: /^(hr|hn|horn|ホルン)/i },
    { id: 'tp',   name: 'トランペット',       color: '#f4a6a6', re: /^(tp|trp|tpt|cor|cnt|flh|トランペット|コルネット)/i },
    { id: 'tb',   name: 'トロンボーン',       color: '#ec9a78', re: /^(b\.?\s?tb|tb|trb|トロンボーン)/i },
    { id: 'lb',   name: 'ユーフォ・チューバ', color: '#d9b083', re: /^(euph|eup|eu|bar|tu|tuba|ユーフォ|チューバ)/i },
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

  // 部品カタログ（大きさの単位は cm）
  SS.CATALOG = {
    player:  { name: '奏者', cat: '基本', desc: '椅子＋譜面台' },
    chair:   { name: '椅子だけ', cat: '基本', w: 46, h: 46, shape: 'circle', fill: '#ffffff', label: '' },
    stand:   { name: '譜面台', cat: '基本', w: 50, h: 12, shape: 'rect', fill: '#5b6472', label: '' },
    podium:  { name: '指揮台', cat: '基本', w: 90, h: 90, shape: 'rect', fill: '#b08a5a', label: '指揮' },
    riser:   { name: 'ひな壇(平台)', cat: '基本', w: 360, h: 180, shape: 'riser', fill: '#efe3cc', label: '' },
    text:    { name: '文字', cat: '基本', w: 200, h: 50, shape: 'text', label: 'テキスト', fontSize: 36 },
    box:     { name: '四角', cat: '基本', w: 120, h: 70, shape: 'rect', fill: '#f2f2f2', label: '' },
    circle:  { name: '丸', cat: '基本', w: 80, h: 80, shape: 'circle', fill: '#f2f2f2', label: '' },

    timp:    { name: 'ティンパニ', cat: '打楽器', w: 72, h: 72, shape: 'circle', fill: '#eed9b5', label: 'Timp' },
    bd:      { name: '大太鼓', cat: '打楽器', w: 90, h: 55, shape: 'drum', fill: '#e6e6e6', label: 'B.D.' },
    sd:      { name: '小太鼓', cat: '打楽器', w: 42, h: 42, shape: 'circle', fill: '#e6e6e6', label: 'S.D.' },
    cym:     { name: 'シンバル', cat: '打楽器', w: 50, h: 50, shape: 'circle', fill: '#f3e4a2', label: 'Cym' },
    drums:   { name: 'ドラムセット', cat: '打楽器', w: 160, h: 140, shape: 'drums', fill: '#e6e6e6', label: 'Drs' },
    marimba: { name: 'マリンバ', cat: '打楽器', w: 250, h: 80, shape: 'keys', fill: '#d8b98f', label: 'Mar' },
    xylo:    { name: 'シロフォン', cat: '打楽器', w: 150, h: 55, shape: 'keys', fill: '#d8b98f', label: 'Xylo' },
    vib:     { name: 'ヴィブラフォン', cat: '打楽器', w: 140, h: 65, shape: 'keys', fill: '#c9ced6', label: 'Vib' },
    glock:   { name: 'グロッケン', cat: '打楽器', w: 85, h: 45, shape: 'keys', fill: '#c9ced6', label: 'Glk' },
    chimes:  { name: 'チャイム', cat: '打楽器', w: 140, h: 50, shape: 'rect', fill: '#c9ced6', label: 'Chime' },
    table:   { name: '小物台', cat: '打楽器', w: 100, h: 50, shape: 'rect', fill: '#e9e2d6', label: '台' },

    piano:   { name: 'グランドピアノ', cat: '鍵盤など', w: 150, h: 200, shape: 'piano', fill: '#2d2d2d', label: 'Pf' },
    upright: { name: 'アップライト', cat: '鍵盤など', w: 150, h: 60, shape: 'rect', fill: '#3a3a3a', label: 'Pf' },
    keyboard:{ name: 'キーボード', cat: '鍵盤など', w: 130, h: 40, shape: 'keys', fill: '#555', label: 'Key' },
    harp:    { name: 'ハープ', cat: '鍵盤など', w: 70, h: 110, shape: 'harp', fill: '#e9b6d8', label: 'Hp' },
    amp:     { name: 'アンプ', cat: '鍵盤など', w: 60, h: 40, shape: 'rect', fill: '#444', label: 'Amp' },
    mic:     { name: 'マイク', cat: '鍵盤など', w: 30, h: 30, shape: 'mic', fill: '#444', label: '' },
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
    let body = '', text = '';
    if (it.type === 'player') {
      const r = opts.seatR || SS.PLAYER_R;
      if (opts.showStands !== false) {
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
          const hw = w / 2, hh = h / 2;
          body += `<path d="M${-hw} ${hh}L${-hw} ${-hh + w * 0.1}Q${-hw} ${-hh} ${-hw + w * 0.25} ${-hh}Q${hw} ${-hh + h * 0.02} ${hw * 0.55} ${-hh + h * 0.45}Q${hw} ${hh * 0.3} ${hw} ${hh}Z" fill="${fill}" stroke="#111" stroke-width="2"/>`;
          body += `<rect x="${-hw}" y="${hh - 14}" width="${w}" height="14" fill="#f5f5f5" stroke="#111" stroke-width="1.5"/>`;
          break;
        }
        case 'harp':
          body += `<path d="M${-w / 2} ${h / 2}L${-w / 2 + 8} ${-h / 2}Q${w / 2} ${-h / 2} ${w / 2} ${-h / 4}L${w / 2 - 10} ${h / 2}Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
          break;
        case 'mic':
          body += `<circle r="${w / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><path d="M0 ${-w / 2}V${-w}" stroke="${stroke}" stroke-width="3"/>`;
          break;
        case 'text':
          break;
        default:
          body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
      }
      const lab = it.label != null ? it.label : c.label;
      if (shape === 'text') {
        const fs = it.fontSize || c.fontSize || 36;
        text += `<text x="${x}" y="${y}" dy="0.35em" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${it.color || '#1f2733'}">${esc(lab)}</text>`;
        // クリックできるよう透明の当たり判定
        body += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="transparent"/>`;
      } else if (lab) {
        const fs = fitFont(lab, Math.max(w, h) * 0.9, Math.min(34, Math.max(12, Math.min(w, h) * 0.38)));
        const tc = shape === 'riser' ? '#8a6d3b' : textColorFor(fill);
        text += `<text x="${x}" y="${y}" dy="0.35em" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="700" fill="${tc}">${esc(lab)}</text>`;
      }
    }
    return { body: `<g transform="translate(${x} ${y}) rotate(${rot})">${body}</g>`, text };
  };

  // アイテムのおおよその半径（重なり判定・選択枠用）
  SS.itemSize = function (it, opts) {
    if (it.type === 'player') { const r = (opts && opts.seatR) || SS.PLAYER_R; return { w: r * 2, h: r * 2 }; }
    const c = SS.CATALOG[it.type] || SS.CATALOG.box;
    return { w: it.w || c.w, h: it.h || c.h };
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
