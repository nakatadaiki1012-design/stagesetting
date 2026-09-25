/* 安全の確認：舞台奥の通路・上がり段・重い楽器の搬入経路・ホールの設備との重なり
   check(doc) → [{ kind, msg, spots: [{ x0, y0, x1, y1 }] }]（spots は図の上で示す場所。単位 cm） */
window.SS = window.SS || {};

(function (SS) {
  const R = () => SS.render;
  // 形のない書き込み（文字・四角・丸）は、物ではないので確かめない
  const NOT_THING = new Set(['text', 'box', 'circle', 'cable', 'outlet', 'tap', 'runway']); // 床のケーブル・コンセントも通れるので除く（花道は床の続き）
  const HEAVY = new Set(['marimba', 'marimba43', 'timp32', 'timp29', 'timp26', 'timp23', 'timp', 'piano', 'pianoFull', 'vib', 'chimes', 'xylo', 'tam']);
  const PLATFORM = new Set(['hina', 'riser', 'riser46']);
  const STEP_OK = 25; // 1回で上り下りできる高さの差（cm）。平台1段（21.2cm）まで
  const HIGH = 40; // これ以上の高さの段には上がり段が要る
  const PATH_W = 120; // 重い楽器の搬入経路の幅（cm）

  // 物が占める範囲（回転も考えた外枠）
  function box(it) {
    if (it.type === 'hina' && SS.hinaArc(it)) return SS.itemAABB(it, {});
    const s = SS.itemSize(it, {});
    const a = ((it.rot || 0) * Math.PI) / 180, c = Math.abs(Math.cos(a)), n = Math.abs(Math.sin(a));
    const w = s.w * c + s.h * n, h = s.w * n + s.h * c;
    return { x0: it.x - w / 2, x1: it.x + w / 2, y0: it.y - h / 2, y1: it.y + h / 2 };
  }
  const overlap = (a, b, m) => a.x0 < b.x1 - (m || 0) && b.x0 < a.x1 - (m || 0) && a.y0 < b.y1 - (m || 0) && b.y0 < a.y1 - (m || 0);
  const inBox = (p, b) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
  const hgtOf = it => it.hgt || 21.2; // 平台1枚（riser）は高さの記録がないので1段分とみなす
  const cm = v => `${Math.round(v)}cm`;

  // 部品の呼び名（警告の文に使う）
  function nameOf(it, hno) {
    if (it.type === 'player') return (it.label || '奏者') + (it.name ? `（${it.name}）` : '');
    if (it.type === 'hina') {
      const n = hno && hno.get(it);
      return it.perc ? '打楽器の段' : n && /^\d+$/.test(n) ? `ひな壇${n}段目` : `ひな壇${n || ''}`;
    }
    const c = SS.CATALOG[it.type];
    return (c && c.name) || it.type;
  }
  const names = (list, hno) => {
    const ns = [...new Set(list.map(it => nameOf(it, hno)))];
    return ns.slice(0, 4).join('・') + (ns.length > 4 ? ` ほか${ns.length - 4}` : '');
  };

  // 2つの台（段・上がり段）が、人が通れる幅（45cm）以上くっついているか
  function touching(a, b) {
    const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    return (dx >= 45 && dy >= -10) || (dy >= 45 && dx >= -10);
  }

  // いちばん高い台（その上に乗っているもの）
  function platformUnder(p, plats) {
    let best = null;
    plats.forEach(pl => { if ((pl.it.type === 'hina' ? SS.hinaContains(pl.it, p.x, p.y) : inBox(p, pl.b)) && (!best || pl.h > best.h)) best = pl; });
    return best;
  }

  // 舞台の上（ステージの形の内側）か
  function onStage(stage, b) {
    const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]];
    return pts.every(([x, y]) => R().insideStage(stage, { x, y }, 0));
  }

  // ホールの設備の位置（cm、図の座標）
  SS.fixtureGeom = function (stage) {
    const fx = stage.fixtures || {};
    const cx = stage.w / 2, front = R().frontAt(stage, cx);
    const num = v => v != null && v !== '' && isFinite(+v);
    const g = {};
    if (num(fx.shell)) g.shell = { y: +fx.shell };
    if (num(fx.curtain)) g.curtain = { y: front - +fx.curtain };
    if (fx.proscenium && num(fx.proscenium.y) && num(fx.proscenium.w)) g.proscenium = { y: front - +fx.proscenium.y, x0: cx - +fx.proscenium.w / 2, x1: cx + +fx.proscenium.w / 2 };
    g.lifts = (fx.lifts || []).filter(l => num(l.x) && num(l.y) && num(l.w) && num(l.h)).map(l => ({ x0: +l.x, y0: +l.y, x1: +l.x + +l.w, y1: +l.y + +l.h, name: l.name || '' }));
    if (fx.pit && num(fx.pit.depth) && +fx.pit.depth > 0) {
      const w = num(fx.pit.w) ? +fx.pit.w : stage.w;
      g.pit = { x0: cx - w / 2, x1: cx + w / 2, y0: R().frontY(stage), y1: R().frontY(stage) + +fx.pit.depth };
    }
    if (fx.hanamichi && num(fx.hanamichi.x) && num(fx.hanamichi.w) && num(fx.hanamichi.len)) {
      const hx = +fx.hanamichi.x, hw = +fx.hanamichi.w;
      g.hanamichi = { x0: hx - hw / 2, x1: hx + hw / 2, y0: R().frontAt(stage, hx), y1: R().frontAt(stage, hx) + +fx.hanamichi.len };
    }
    // 上手・下手の出入り口（扉）：横の壁の、奥のふちから y（扉の中心）・幅 w。扉の前 1.2m は人が出入りするので空けておく
    g.doors = (fx.doors || []).filter(d => (d.side === 'L' || d.side === 'R') && num(d.y) && num(d.w) && +d.w > 0).map(d => {
      const y = +d.y, w = +d.w, [xl, xr] = R().xRange(stage, y), x = d.side === 'L' ? xl : xr;
      return { side: d.side, x, y0: y - w / 2, y1: y + w / 2, zone: d.side === 'L' ? { x0: x, x1: x + DOOR_CLEAR, y0: y - w / 2, y1: y + w / 2 } : { x0: x - DOOR_CLEAR, x1: x, y0: y - w / 2, y1: y + w / 2 } };
    });
    return g;
  };
  const DOOR_CLEAR = 120;

  // 花道（部品）の上か（向きを変えた花道も）
  SS.onRunway = function (items, p) {
    return (items || []).some(r => {
      if (r.type !== 'runway') return false;
      const s = SS.itemSize(r, {}), a = ((r.rot || 0) * Math.PI) / 180, dx = p.x - r.x, dy = p.y - r.y;
      const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a);
      return Math.abs(lx) <= s.w / 2 && Math.abs(ly) <= s.h / 2;
    });
  };

  SS.checks = function (doc) {
    const st = doc.stage, out = [];
    const items = doc.items.filter(it => !NOT_THING.has(it.type));
    const hno = SS.hinaNumbers ? SS.hinaNumbers(doc.items) : new Map();
    const bx = new Map(items.map(it => [it, box(it)]));
    const fg = SS.fixtureGeom(st);
    const backY = fg.shell ? fg.shell.y : 0;

    // ---- 舞台奥の通路（反射板と、段・楽器・奏者のあいだ）
    const aisle = SS.auto && SS.auto.aisleOf ? SS.auto.aisleOf(st) : 60;
    if (aisle > 0) {
      const bad = items.filter(it => { const b = bx.get(it); return b.y0 < backY + aisle - 0.5 && b.y1 > backY; });
      if (bad.length) {
        const min = Math.max(0, Math.min(...bad.map(it => bx.get(it).y0 - backY)));
        out.push({ kind: 'aisle', msg: `舞台奥の通路が${cm(aisle)}より狭いところがあります（いちばん狭い所 ${cm(min)}：${names(bad, hno)}）。反射板とのあいだを人が通れるように空けてください`, spots: bad.map(it => bx.get(it)) });
      }
    }

    // ---- 上がり段（高さ40cm以上の段に、上がる道があるか）
    const plats = items.filter(it => PLATFORM.has(it.type)).map(it => ({ it, b: bx.get(it), h: hgtOf(it) }));
    const stairs = items.filter(it => it.type === 'stairs').map(it => bx.get(it));
    const reached = new Set(plats.filter(p => p.h <= STEP_OK || stairs.some(s => touching(s, p.b))));
    let grew = true;
    while (grew) {
      grew = false;
      plats.forEach(p => {
        if (reached.has(p)) return;
        if ([...reached].some(q => Math.abs(q.h - p.h) <= STEP_OK && touching(q.b, p.b))) { reached.add(p); grew = true; }
      });
    }
    const riders = items.filter(it => !PLATFORM.has(it.type) && it.type !== 'stairs');
    const on = new Map(plats.map(p => [p, []]));
    riders.forEach(it => { const p = platformUnder(it, plats); if (p) on.get(p).push(it); });
    plats.forEach(p => {
      if (p.h < HIGH || reached.has(p) || !on.get(p).length) return;
      out.push({ kind: 'stairs', msg: `${nameOf(p.it, hno)}（高さ${cm(p.h)}）に上がる段がありません。「上がり段」を段の横か前に付けるか、1段低い段とつなげてください`, spots: [p.b] });
    });

    // ---- 重い楽器の搬入経路（段の横・前・後ろに、幅1.2mほど空いた床があるか）
    plats.forEach(p => {
      const heavy = on.get(p).filter(it => HEAVY.has(it.type));
      if (!heavy.length || p.h < 10) return;
      if (hasPath(p, st, items, bx)) return;
      out.push({ kind: 'loadin', msg: `${names(heavy, hno)}を${nameOf(p.it, hno)}に運び上げる通路（幅1.2mほど）がありません。段の横か前を1.2m以上空けてください`, spots: [p.b].concat(heavy.map(it => bx.get(it))) });
    });

    // ---- 指揮台から舞台の縁まで
    const pod = doc.items.find(it => it.type === 'podium');
    if (pod && SS.auto && SS.auto.podiumGapOf) {
      const need = SS.auto.podiumGapOf(st), pb = bx.get(pod) || box(pod);
      const gap = R().frontAt(st, pod.x) - pb.y1;
      if (gap < need - 1) out.push({ kind: 'podium', msg: `指揮台から舞台の縁まで${(Math.max(0, gap) / 100).toFixed(2)}mしかありません（${(need / 100).toFixed(1)}m以上あけてください）。指揮台を奥へ動かすか、舞台の奥行を確かめてください`, spots: [pb] });
    }

    // ---- 人や物どうしの重なり（椅子・譜面台・楽器）
    overlaps(doc, items, bx, hno, out);

    // ---- ホールの設備との重なり
    const hitList = test => items.filter(it => test(bx.get(it))); // 段・奏者・楽器・上がり段など
    if (fg.shell) {
      const bad = hitList(b => b.y0 < fg.shell.y - 0.5 && b.y1 > 0);
      if (bad.length) out.push({ kind: 'shell', msg: `反射板より奥に出ています：${names(bad, hno)}`, spots: bad.map(it => bx.get(it)) });
    }
    if (fg.curtain) {
      const bad = hitList(b => b.y0 < fg.curtain.y && b.y1 > fg.curtain.y);
      if (bad.length) out.push({ kind: 'curtain', msg: `緞帳線の上にあります（緞帳を下ろすとぶつかります）：${names(bad, hno)}`, spots: bad.map(it => bx.get(it)) });
    }
    if (fg.proscenium) {
      const p = fg.proscenium;
      const bad = hitList(b => b.y0 < p.y + 15 && b.y1 > p.y - 15 && (b.x0 < p.x0 || b.x1 > p.x1));
      if (bad.length) out.push({ kind: 'proscenium', msg: `プロセニアム（舞台の額縁）の壁にかかっています：${names(bad, hno)}`, spots: bad.map(it => bx.get(it)) });
    }
    fg.lifts.forEach((l, i) => {
      const bad = hitList(b => overlap(b, l, 1));
      if (bad.length) out.push({ kind: 'lift', msg: `迫り${l.name ? '「' + l.name + '」' : fg.lifts.length > 1 ? i + 1 : ''}の上にあります（床が動く所・継ぎ目を確認してください）：${names(bad, hno)}`, spots: [l].concat(bad.map(it => bx.get(it))) });
    });
    if (fg.pit) {
      const bad = hitList(b => overlap(b, fg.pit, 1));
      if (bad.length) out.push({ kind: 'pit', msg: `オーケストラピットのふたの上にあります（ふたの耐荷重・すき間を確認してください）：${names(bad, hno)}`, spots: bad.map(it => bx.get(it)) });
    }
    fg.doors.forEach(d => {
      const bad = hitList(b => overlap(b, d.zone, 1));
      if (bad.length) out.push({ kind: 'door', msg: `${d.side === 'L' ? '下手' : '上手'}の出入り口の前（${cm(DOOR_CLEAR)}）がふさがっています（出入りや楽器の運び込みができません）：${names(bad, hno)}`, spots: [d.zone].concat(bad.map(it => bx.get(it))) });
    });
    if (fg.hanamichi) {
      const bad = hitList(b => overlap(b, fg.hanamichi, 1));
      if (bad.length) out.push({ kind: 'hanamichi', msg: `花道の上にあります：${names(bad, hno)}`, spots: bad.map(it => bx.get(it)) });
    }
    return out;
  };

  // ---- 重なりの確認
  // 奏者の椅子＝半径23cmの丸、譜面台＝支柱と机のまわり半径12cmの丸（2人で1本なら2人の真ん中に1本）、
  // 楽器・台など＝外枠の四角。8cm以上食い込んでいたら「重なり」とする
  const CHAIR = 23, STAND = 12, DEPTH = 8;
  const PLAYS_ITEM = new Set(['perc', 'drs', 'pf', 'hp', 'bass', 'gt']);
  function overlaps(doc, items, bx, hno, out) {
    const ps = items.filter(it => it.type === 'player');
    const pairs = SS.standPairs ? SS.standPairs(doc.items) : new Map();
    const fig = { figure: true };
    const shapes = [];
    ps.forEach(p => {
      shapes.push({ kind: 'chair', it: p, x: p.x, y: p.y, r: CHAIR });
      const kind = SS.instrumentKind ? SS.instrumentKind(p.label) : '';
      if (['perc', 'drs', 'pf', 'hp', 'voice'].includes(kind)) return;
      const b = pairs.get(p);
      if (b && doc.items.indexOf(b) < doc.items.indexOf(p)) return; // 2人で1本：1本だけ
      const s1 = SS.standPoint(p, fig), s2 = b ? SS.standPoint(b, fig) : s1;
      shapes.push({ kind: 'stand', it: p, it2: b || null, x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2, r: STAND });
    });
    const things = items.filter(it => it.type !== 'player' && !PLATFORM.has(it.type) && it.type !== 'stairs' && it.type !== 'podium');
    // 丸い楽器（ティンパニ・太鼓・シンバル）は丸で
    const ROUND = new Set(['timp', 'drumhead', 'cym', 'circle']);
    const circOf = t => { const c = SS.CATALOG[t.type] || {}; if (!ROUND.has(c.shape)) return null; const s = SS.itemSize(t, {}); return { x: t.x, y: t.y, r: Math.min(s.w, s.h) / 2 }; };
    const circBox = (c, b) => { const nx = Math.max(b.x0, Math.min(b.x1, c.x)), ny = Math.max(b.y0, Math.min(b.y1, c.y)); return c.r - Math.hypot(c.x - nx, c.y - ny); };
    // 向きを変えた楽器（扇形の外側に指揮者の方を向けて置いたマリンバなど）は、外枠の四角ではなく、向きどおりの四角で見る
    const rectOf = t => { const s = SS.itemSize(t, {}), a = ((t.rot || 0) * Math.PI) / 180; return { x: t.x, y: t.y, hw: s.w / 2, hh: s.h / 2, c: Math.cos(a), s: Math.sin(a) }; };
    const turned = t => Math.abs((((t.rot || 0) % 90) + 90) % 90) > 1;
    const circRect = (c, q) => { const dx = c.x - q.x, dy = c.y - q.y, lx = dx * q.c + dy * q.s, ly = -dx * q.s + dy * q.c; return c.r - Math.hypot(Math.max(0, Math.abs(lx) - q.hw), Math.max(0, Math.abs(ly) - q.hh)); };
    const rectRect = (p, q) => {
      // 分離軸で、いちばん浅い重なりの深さ
      let d = Infinity;
      [[p.c, p.s], [-p.s, p.c], [q.c, q.s], [-q.s, q.c]].forEach(([ax, ay]) => {
        const proj = r => Math.abs(r.hw * (r.c * ax + r.s * ay)) + Math.abs(r.hh * (-r.s * ax + r.c * ay));
        const dist = Math.abs((q.x - p.x) * ax + (q.y - p.y) * ay);
        d = Math.min(d, proj(p) + proj(q) - dist);
      });
      return d;
    };
    const hits = [], who = [];
    const owner = s => [s.it, s.it2].filter(Boolean);
    for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i], c = shapes[j];
      if (owner(a).some(o => owner(c).includes(o))) continue; // 自分の椅子と自分の譜面台
      const depth = a.r + c.r - Math.hypot(a.x - c.x, a.y - c.y);
      if (depth >= DEPTH) { hits.push({ x0: Math.min(a.x, c.x) - 20, x1: Math.max(a.x, c.x) + 20, y0: Math.min(a.y, c.y) - 20, y1: Math.max(a.y, c.y) + 20 }); who.push(a.it, c.it); }
    }
    shapes.forEach(sh => things.forEach(t => {
      // 打楽器・鍵盤・ハープなどの奏者は、自分の楽器のすぐ後ろに立つので、奏者と楽器の重なりは見ない
      if (sh.kind === 'chair' && PLAYS_ITEM.has(SS.instrumentKind ? SS.instrumentKind(sh.it.label) : '')) return;
      const b = bx.get(t), tc = circOf(t);
      if (tc ? sh.r + tc.r - Math.hypot(sh.x - tc.x, sh.y - tc.y) >= DEPTH : (turned(t) ? circRect(sh, rectOf(t)) : circBox(sh, b)) >= DEPTH) { hits.push({ x0: Math.min(b.x0, sh.x - sh.r), x1: Math.max(b.x1, sh.x + sh.r), y0: Math.min(b.y0, sh.y - sh.r), y1: Math.max(b.y1, sh.y + sh.r) }); who.push(sh.it, t); }
    }));
    for (let i = 0; i < things.length; i++) for (let j = i + 1; j < things.length; j++) {
      const a = bx.get(things[i]), c = bx.get(things[j]), ca = circOf(things[i]), cc = circOf(things[j]);
      const ti = turned(things[i]), tj = turned(things[j]);
      const hit = ca && cc ? ca.r + cc.r - Math.hypot(ca.x - cc.x, ca.y - cc.y) >= DEPTH
        : ca || cc ? ((ca ? tj : ti) ? circRect(ca || cc, rectOf(ca ? things[j] : things[i])) : circBox(ca || cc, ca ? c : a)) >= DEPTH
        : ti || tj ? rectRect(rectOf(things[i]), rectOf(things[j])) >= DEPTH
        : Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0) >= DEPTH && Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0) >= DEPTH;
      if (hit) { hits.push({ x0: Math.min(a.x0, c.x0), x1: Math.max(a.x1, c.x1), y0: Math.min(a.y0, c.y0), y1: Math.max(a.y1, c.y1) }); who.push(things[i], things[j]); }
    }
    if (hits.length) out.push({ kind: 'overlap', msg: `人や物が重なっています（${hits.length}か所：${names(who, hno)}）。椅子・譜面台・楽器の間をあけてください`, spots: hits });
    // ひな壇の縁にかかっている椅子・譜面台（段の上と床にまたがっている）
    const tiers = doc.items.filter(it => it.type === 'hina');
    const edge = [];
    const tierOf = (x, y) => tiers.filter(t => SS.hinaContains(t, x, y, 0)).sort((a, b) => (b.hgt || 0) - (a.hgt || 0))[0] || null;
    shapes.forEach(sh => {
      const r = sh.kind === 'chair' ? 18 : 8;
      if (tiers.some(t => SS.hinaContains(t, sh.x, sh.y, r) && !SS.hinaContains(t, sh.x, sh.y, -r))) edge.push(sh);
      // 奏者は段の上なのに、譜面台が段から落ちている（段の前の床に立っている）
      else if (sh.kind === 'stand') { const t = tierOf(sh.it.x, sh.it.y); if (t && tierOf(sh.x, sh.y) !== t && !(sh.it2 && tierOf(sh.it2.x, sh.it2.y) !== t)) edge.push(sh); }
    });
    if (edge.length) out.push({ kind: 'tieredge', msg: `ひな壇の縁にかかっています（${edge.length}か所：${names(edge.map(s => s.it), hno)}${edge.some(s => s.kind === 'stand') ? 'の椅子・譜面台' : ''}）。段の上か床に、きちんと置いてください（「✨きれいに整える」でも直せます）`, spots: edge.map(s => ({ x0: s.x - s.r - 6, x1: s.x + s.r + 6, y0: s.y - s.r - 6, y1: s.y + s.r + 6 })) });
  }

  // 段の4つの辺のどこかに、幅 PATH_W・奥行 PATH_W の空いた床（または同じ高さの段）があるか
  function hasPath(p, stage, all, bx) {
    const b = p.b, W = PATH_W;
    const sides = [
      { len: b.x1 - b.x0, rect: t => ({ x0: b.x0 + t, x1: b.x0 + t + W, y0: b.y1, y1: b.y1 + W }) }, // 前
      { len: b.x1 - b.x0, rect: t => ({ x0: b.x0 + t, x1: b.x0 + t + W, y0: b.y0 - W, y1: b.y0 }) }, // 後ろ
      { len: b.y1 - b.y0, rect: t => ({ x0: b.x0 - W, x1: b.x0, y0: b.y0 + t, y1: b.y0 + t + W }) }, // 下手側
      { len: b.y1 - b.y0, rect: t => ({ x0: b.x1, x1: b.x1 + W, y0: b.y0 + t, y1: b.y0 + t + W }) }, // 上手側
    ];
    const others = all.filter(it => it !== p.it);
    return sides.some(sd => {
      if (sd.len < W) return false;
      for (let t = 0; t <= sd.len - W + 0.1; t += 10) {
        const r = sd.rect(Math.min(t, sd.len - W));
        if (!onStage(stage, r)) continue;
        const blocked = others.some(it => {
          if (!overlap(bx.get(it), r, 1)) return false;
          // 同じ高さの段は、そのまま続く床なので通れる
          if (PLATFORM.has(it.type)) return Math.abs(hgtOf(it) - p.h) > 1;
          return true;
        });
        if (!blocked) return true;
      }
      return false;
    });
  }
})(window.SS);
