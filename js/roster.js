/* 名簿・乗り番表：メンバー（パート・名前）と、曲ごとの乗り番（○＝乗り・空欄＝降り・ほかの字＝乗り＋メモ）
 * doc.roster = { members: [{ part, name, marks: ['○', '', 'Picc持ち替え', …] }], pieces: ['曲名', …] }
 * 取り込み様式は CSV（Excel・Googleスプレッドシートで開ける）。Excel からの貼り付け（タブ区切り）も読める
 */
(function (SS) {
  const R = {};
  // 全角の英数字・記号を半角に、全角空白を半角に
  const norm = s => String(s == null ? '' : s).replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ').trim();
  const key = s => norm(s).toLowerCase().replace(/[\s.・_\-]/g, '');
  R.norm = norm;

  // パート名をそろえる：known（編成のパート名・舞台にあるパート名）と同じ書き方ならそれ、ちがえば日本語などのよびかたから
  R.matchPart = function (text, known) {
    const t = norm(text);
    if (!t) return '';
    const k = key(t);
    const hit = known.find(p => key(p) === k);
    if (hit) return hit;
    const words = (SS.assistant && SS.assistant.PART_WORDS) || [];
    for (const [re, cands] of words) if (re.test(t)) { const c = cands.find(x => known.includes(x)); if (c) return c; }
    return t; // 知らないパート名は、書いてあるまま
  };

  // 乗り番の印：空欄・×・降り・休 などは降り。○・1 などは乗り。ほかの字（「Picc持ち替え」など）は乗り（メモとして残す）
  R.isOn = m => { const t = norm(m); return !!t && !/^(×|✕|x|降|降り|休|休み|-|―|—|0|なし)$/i.test(t); };
  const ON_MARK = /^(○|◯|〇|o|1|乗|乗り|yes|y)$/i;
  R.isPlain = m => ON_MARK.test(norm(m));

  // CSV（, 区切り・" で囲む）か、タブ区切り（Excel から貼り付け）を表にする
  R.parseTable = function (text) {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split('\n')[0] || '';
    const sep = first.split('\t').length > first.split(',').length ? '\t' : ',';
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if (ch === '"' && !cell.trim()) { q = true; cell = ''; continue; }
      if (ch === sep) { row.push(cell); cell = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
      cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
  };
  R.toCSV = rows => '﻿' + rows.map(r => r.map(c => { c = String(c == null ? '' : c); return /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',')).join('\r\n') + '\r\n';

  const DEFAULT_PIECE = /^\d+曲目$/;
  const SKIP_COL = /^(no\.?|番号|席|席順|備考|メモ|学年|クラス|ふりがな|フリガナ|よみ|読み)$/i;

  /**
   * 表（CSV・貼り付け）から名簿を作る。known：編成のパート名
   * 1行目に「パート」「名前」の見出しがあれば見出しで列を探す。なければ 1列目＝パート・2列目＝名前・3列目から＝曲
   * パートの欄が空の行は、上の行と同じパート（Excel でセルを結合したときなど）
   */
  R.parse = function (text, known) {
    const rows = R.parseTable(text);
    if (!rows.length) return { members: [], pieces: [], unknown: [], error: '中身がありません' };
    const h = rows[0].map(norm);
    const isHead = h.some(c => /パート|楽器|part|名前|氏名|name/i.test(c));
    let pc = 0, nc = 1;
    if (isHead) {
      const fp = h.findIndex(c => /パート|楽器|part/i.test(c)), fn = h.findIndex(c => /名前|氏名|name/i.test(c));
      if (fp >= 0) pc = fp;
      if (fn >= 0) nc = fn;
    }
    const body = isHead ? rows.slice(1) : rows;
    const width = Math.max(...rows.map(r => r.length));
    const cols = [];
    for (let i = 0; i < width; i++) if (i !== pc && i !== nc && !(isHead && SKIP_COL.test(h[i] || ''))) cols.push(i);
    let pieces = cols.map((i, j) => (isHead && h[i] ? h[i] : `${j + 1}曲目`));
    const members = [];
    let lastPart = '';
    body.forEach(r => {
      const name = norm(r[nc]);
      let part = norm(r[pc]);
      if (!part) part = lastPart;
      if (!name && !part) return;
      if (!name && r.every((c, i) => i === pc || !norm(c))) { lastPart = part; return; } // パートだけの見出し行
      lastPart = part;
      members.push({ part: R.matchPart(part, known), name, marks: cols.map(i => norm(r[i])) });
    });
    // 様式のままの「○曲目」の列で、全員○のもの（名前だけ書いたとき）は曲として数えない
    const keep = pieces.map((p, j) => !(DEFAULT_PIECE.test(p) && members.every(m => R.isPlain(m.marks[j]))) && !(members.every(m => !norm(m.marks[j])) && DEFAULT_PIECE.test(p)));
    pieces = pieces.filter((_, j) => keep[j]);
    members.forEach(m => { m.marks = m.marks.filter((_, j) => keep[j]); });
    const unknown = [...new Set(members.map(m => m.part).filter(p => p && !known.includes(p)))];
    return { members, pieces, unknown };
  };

  // 名簿の表（CSV の行）。roster がなければ、parts [[パート, 人数, [名前…]]] から空の様式
  R.rows = function (roster, parts) {
    if (roster && roster.members && roster.members.length) {
      const ps = roster.pieces || [];
      return [['パート', '名前'].concat(ps)].concat(roster.members.map(m => [m.part, m.name].concat(ps.map((_, j) => (m.marks[j] == null ? '' : m.marks[j])))));
    }
    const ps = ['1曲目', '2曲目', '3曲目'];
    const out = [['パート', '名前'].concat(ps)];
    parts.forEach(([p, n, names]) => { for (let i = 0; i < Math.max(n, 1); i++) out.push([p, (names && names[i]) || ''].concat(ps.map(() => '○'))); });
    return out;
  };

  // 曲（j）に乗る人。j が null なら全員
  R.onMembers = (roster, j) => (roster.members || []).filter(m => j == null || j === '' || R.isOn(m.marks[j]));
  // パートごとの乗る人数（名簿に出てくるパートは、0人でも入れる）
  R.onCounts = function (roster, j) {
    const out = {};
    (roster.members || []).forEach(m => { if (m.part && !(m.part in out)) out[m.part] = 0; });
    R.onMembers(roster, j).forEach(m => { if (m.part) out[m.part]++; });
    return out;
  };

  /**
   * 舞台の奏者に名前を入れる（名簿に出てくるパートだけ。首席の★の席から、前の列・下手から順に）
   * 戻り値 { placed, short: { パート: 席が足りない人数 }, empty: { パート: 名前のない席の数 } }
   */
  R.assign = function (players, roster, j, c) {
    const G = SS.geo, res = { placed: 0, short: {}, empty: {} };
    const by = {};
    R.onMembers(roster, j).forEach(m => { (by[m.part] = by[m.part] || []).push(m); });
    const partsIn = new Set((roster.members || []).map(m => m.part));
    partsIn.forEach(part => {
      const ms = by[part] || [];
      const ps = players.filter(p => (p.label || '') === part);
      const order = (G && G.seatOrder ? G.seatOrder(ps, c) : ps).slice().sort((a, b) => (b.lead ? 1 : 0) - (a.lead ? 1 : 0));
      order.forEach((p, i) => { p.name = ms[i] ? ms[i].name : ''; if (ms[i] && ms[i].name) res.placed++; });
      if (ms.length > order.length) res.short[part] = ms.length - order.length;
      if (order.length > ms.length) res.empty[part] = order.length - ms.length;
    });
    return res;
  };

  // 乗り番表の印（表示用）：乗り＝○、降り＝空、メモはそのまま
  R.markText = m => (R.isOn(m) ? (R.isPlain(m) ? '○' : norm(m)) : '');

  SS.roster = R;
})(window.SS);
