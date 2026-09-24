/* 安全の確認：舞台奥の通路・上がり段・重い楽器の搬入経路・ホールの設備との重なり
   check(doc) → [{ kind, msg, spots: [{ x0, y0, x1, y1 }] }]（spots は図の上で示す場所。単位 cm） */
window.SS = window.SS || {};

(function (SS) {
  const R = () => SS.render;
  // 形のない書き込み（文字・四角・丸）は、物ではないので確かめない
  const NOT_THING = new Set(['text', 'box', 'circle', 'cable', 'outlet', 'tap']); // 床のケーブル・コンセントも通れるので除く
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
    return g;
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
    if (fg.hanamichi) {
      const bad = hitList(b => overlap(b, fg.hanamichi, 1));
      if (bad.length) out.push({ kind: 'hanamichi', msg: `花道の上にあります：${names(bad, hno)}`, spots: bad.map(it => bx.get(it)) });
    }
    return out;
  };

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
