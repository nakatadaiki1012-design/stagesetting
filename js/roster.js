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

  // 言いかえでまとめて書いたパート（「サックス」「クラ」）。舞台では、そのパートの空いている席の順に入れる
  R.GROUPS = { Sax: ['A.Sx', 'T.Sx', 'B.Sx'], Cl: ['Cl1', 'Cl2', 'Cl3'] };
  const groupName = tg => Object.keys(R.GROUPS).find(g => R.GROUPS[g].join() === tg.join()) || tg.join('・');
  /**
   * パート名をそろえる：known（編成のパート名・舞台にあるパート名）と同じ書き方ならそれ、
   * ちがえば言いかえの辞書（文章での指示と同じ）から。「サックス」→ Sax、「クラ」→ Cl のようにまとめたものもある。
   * 読めなければ ''（strict でないときは書いてあるまま）
   */
  R.matchPart = function (text, known, strict) {
    const t = norm(text);
    if (!t) return '';
    const k = key(t);
    const hit = known.find(p => key(p) === k) || Object.keys(R.GROUPS).find(g => key(g) === k);
    if (hit) return hit;
    const A = SS.assistant;
    const f = A && A.partOf ? A.partOf(t, known.concat(...Object.values(R.GROUPS))) : null;
    if (f) return f.split ? groupName(f.targets) : f.targets[0];
    return strict ? '' : t;
  };
  // 名簿のパート → 舞台の席のパート（まとめたものは中身）
  R.partsOf = part => R.GROUPS[part] || [part];
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
   * 1つのセルに名前とパートがいっしょに書いてあるとき：「小林（Ob）」「小林 Ob」「Ob：小林」「Ob 小林」「Ob・小林」
   * 戻り値 { part, name } か null
   */
  R.splitCell = function (cell, known) {
    const t = norm(cell);
    const tryPair = (a, b) => {
      const pa = R.matchPart(a, known, true), pb = R.matchPart(b, known, true);
      if (pa && !pb && norm(b)) return { part: pa, name: norm(b) };
      if (pb && !pa && norm(a)) return { part: pb, name: norm(a) };
      return null;
    };
    let m = /^(.+?)\s*[（(［\[]\s*(.+?)\s*[)）］\]]$/.exec(t);
    if (m) return tryPair(m[1], m[2]);
    m = /^(.+?)\s*[:：／/・|｜,、，]\s*(.+)$/.exec(t);
    if (m) { const r = tryPair(m[1], m[2]); if (r) return r; }
    const w = t.split(/\s+/);
    if (w.length >= 2) return tryPair(w[0], w.slice(1).join(' ')) || tryPair(w.slice(0, -1).join(' '), w[w.length - 1]);
    return null;
  };

  /**
   * 表（CSV・貼り付け）から名簿を作る。known：編成のパート名
   * 1行目に「パート」「名前」の見出しがあれば見出しで列を探す。なければ 1列目＝パート・2列目＝名前・3列目から＝曲
   * （パートと名前が逆でも、パートとして読める方をパートにする。1つのセルに「小林（Ob）」のように書いてあってもよい）
   * パートの欄が空の行は、上の行と同じパート（Excel でセルを結合したときなど）。パートだけの行は、下の行のパートの見出し
   * 読めなかった行は bad に { line, reason } で入れる（黙って捨てない）
   */
  R.parse = function (text, known) {
    const rows = R.parseTable(text);
    if (!rows.length) return { members: [], pieces: [], unknown: [], bad: [], error: '中身がありません' };
    const h = rows[0].map(norm);
    const isHead = h.some(c => /^(パート|楽器|part|名前|氏名|name)$/i.test(c.replace(/\s/g, '')));
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
    const members = [], bad = [];
    let lastPart = '', header = '';
    body.forEach(r => {
      const line = r.filter(Boolean).join(' ');
      const filled = r.map((c, i) => [i, norm(c)]).filter(([i, c]) => c && !cols.includes(i));
      let part = '', name = '';
      if (filled.length === 1) {
        // セルが1つだけ：「小林（Ob）」のような書き方か、パートだけの見出し行か、見出しの下の名前
        const one = filled[0][1];
        const sp = R.splitCell(one, known);
        if (sp) { part = sp.part; name = sp.name; }
        else if (filled[0][0] === nc && pc !== nc && lastPart && !R.matchPart(one, known, true)) { part = lastPart; name = one; } // パートの欄が空（セルの結合など）は上の行と同じ
        else if (R.matchPart(one, known, true)) { header = lastPart = R.matchPart(one, known, true); return; }
        else if (header) { part = header; name = one; }
        else { bad.push({ line, reason: 'パートが分かりません（「小林（Ob）」「Ob 小林」のように書いてください）' }); return; }
      } else {
        const partT = norm(r[pc]);
        name = norm(r[nc]);
        part = partT ? R.matchPart(partT, known, true) : '';
        // パートと名前の列が逆
        if (partT && !part && name) { const p2 = R.matchPart(name, known, true); if (p2) { part = p2; name = partT; } }
        // 名前の欄に「小林（Ob）」のように書いてある
        if (!part && !partT && name) { const sp = R.splitCell(name, known); if (sp) { part = sp.part; name = sp.name; } }
        if (!part && partT) { bad.push({ line, reason: `「${partT}」がどのパートか分かりません` }); return; }
        if (!part && !partT) part = lastPart; // パートの欄が空（Excel でセルを結合したときなど）は上の行と同じ
        if (!part) { bad.push({ line, reason: 'パートが分かりません' }); return; }
        if (!name) { bad.push({ line, reason: '名前がありません' }); return; }
      }
      lastPart = part;
      members.push({ part, name, marks: cols.map(i => norm(r[i])) });
    });
    // 様式のままの「○曲目」の列で、全員○か全員空のもの（名前だけ書いたとき）は曲として数えない
    const keep = pieces.map((p, j) => !(DEFAULT_PIECE.test(p) && (members.every(m => R.isPlain(m.marks[j])) || members.every(m => !norm(m.marks[j])))));
    pieces = pieces.filter((_, j) => keep[j]);
    members.forEach(m => { m.marks = m.marks.filter((_, j) => keep[j]); });
    const unknown = [...new Set(members.map(m => m.part).filter(p => p && !known.includes(p) && !R.GROUPS[p]))];
    return { members, pieces, unknown, bad };
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
   * 舞台の奏者に名前を入れる（首席の★の席から、前の列・下手から順に）。席の数は変えない
   * - すでにその人の名前が入っている席は、そのまま
   * - 残りの人は、名前のない席 → 名簿にない名前の席、の順に入れる（名簿に出てこない名前は、席が余れば消さずに残す）
   * - 「サックス」「クラ」のようにまとめて書いた人は、そのパートの空いている席の順に入れる
   * 戻り値 { placed, notPlaced: [{ name, part, reason }], empty: { パート: 名前のない席の数 } }
   */
  R.assign = function (players, roster, j, c) {
    const G = SS.geo, res = { placed: 0, notPlaced: [], empty: {} };
    const ms = R.onMembers(roster, j);
    const rosterNames = new Set((roster.members || []).map(m => m.name).filter(Boolean));
    const seatsOf = part => { const ps = players.filter(p => (p.label || '') === part); return (G && G.seatOrder ? G.seatOrder(ps, c) : ps).slice().sort((a, b) => (b.lead ? 1 : 0) - (a.lead ? 1 : 0)); };
    const taken = new Set();
    // 1) その人の名前がもう入っている席
    const rest = [];
    ms.forEach(m => {
      const seat = R.partsOf(m.part).flatMap(seatsOf).find(p => !taken.has(p) && p.name === m.name);
      if (seat) { taken.add(seat); res.placed++; } else rest.push(m);
    });
    // 2) 名前のない席 → 3) 名簿にない名前の席
    rest.forEach(m => {
      const seats = R.partsOf(m.part).flatMap(seatsOf).filter(p => !taken.has(p));
      const seat = seats.find(p => !p.name) || seats.find(p => !rosterNames.has(p.name) || !ms.some(x => x.name === p.name));
      if (seat) { seat.name = m.name; taken.add(seat); res.placed++; return; }
      const all = R.partsOf(m.part).flatMap(seatsOf);
      res.notPlaced.push({ name: m.name, part: m.part, reason: all.length ? `${m.part}の席が足りません（舞台に${all.length}席）` : `舞台に${m.part}の席がありません` });
    });
    // 名前のない席の数（名簿に出てくるパートだけ）
    new Set(ms.flatMap(m => R.partsOf(m.part))).forEach(part => { const n = seatsOf(part).filter(p => !p.name).length; if (n) res.empty[part] = n; });
    return res;
  };

  // 乗り番表の印（表示用）：乗り＝○、降り＝空、メモはそのまま
  R.markText = m => (R.isOn(m) ? (R.isPlain(m) ? '○' : norm(m)) : '');

  SS.roster = R;
})(window.SS);
