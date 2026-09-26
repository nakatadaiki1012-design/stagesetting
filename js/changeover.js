/* 転換の計画：前の部（A）の配置図から次の部（B）の配置図へ、何をはける（片付ける）・出す・動かすかを数える
 * 物は「種類」ごとに入れかえがきくもの（いすはどのいすでもよい）として、近いものどうしを組にする。
 *   ・20cm 以内に同じ種類がある → そのまま
 *   ・残りを近いものから組にする → 動かす
 *   ・前の部にだけ残った物 → はける／次の部にだけ残った物 → 出す
 * はける・出す物は、いちばん近い出入り口（出入り口の部品・ホールの設備の出入り口。なければ下手・上手のそで）に分ける
 */
(function (SS) {
  const KEEP = 20;
  const SKIP = new Set(['player', 'text', 'box', 'circle', 'cable', 'outlet', 'tap', 'door', 'runway']);
  const STANDING = ['voice', 'perc', 'bass'];
  const NO_STAND = ['perc', 'drs', 'pf', 'hp', 'voice'];
  const BASE = {
    chair: ['奏者のいす', '脚'], bassChair: ['バス椅子（高いいす）', '脚'], timpChair: ['ティンパニ椅子', '脚'], pianoBench: ['ピアノ椅子', '脚'], drumThrone: ['ドラム椅子', '脚'],
    stand: ['譜面台', '本'], light: ['譜面灯', '個'], podium: ['指揮台', '台'], cstand: ['指揮者用譜面台', '本'],
  };
  const ORDER = Object.keys(BASE);
  const isTimp = it => /^tim/i.test(String(it.label || '').trim());

  // 配置図の中の「運ぶ物」の一覧（いす・譜面台は奏者から数える。数え方は「用意する物」と同じ）
  function tokens(items, opts) {
    const out = [];
    const pairs = SS.standPairs ? SS.standPairs(items) : new Map();
    items.filter(it => it.type === 'player').forEach(p => {
      const k = SS.instrumentKind(p.label);
      const c = isTimp(p) ? 'timpChair' : k === 'cb' ? 'bassChair' : k === 'pf' ? 'pianoBench' : k === 'drs' ? 'drumThrone' : STANDING.includes(k) ? null : 'chair';
      if (c) out.push({ kind: c, x: p.x, y: p.y });
      if (NO_STAND.includes(k)) return;
      const mate = pairs.get(p);
      if (mate && items.indexOf(mate) < items.indexOf(p)) return; // 2人で1本の譜面台は1本
      const a = SS.standPoint(p, opts), b = mate ? SS.standPoint(mate, opts) : null;
      const s = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
      out.push({ kind: 'stand', x: s.x, y: s.y });
      if (p.light || (mate && mate.light)) out.push({ kind: 'light', x: s.x, y: s.y });
    });
    items.forEach(it => {
      if (SKIP.has(it.type)) return;
      if (it.type === 'hina') {
        // ひな壇は大きさ・高さが同じものだけを同じ種類にする（ちがえば組み替え）
        out.push({ kind: `hina:${Math.round(it.w)}x${Math.round(it.h)}@${it.hgt || 21.2}`, x: it.x, y: it.y, it, hina: true });
        return;
      }
      out.push({ kind: BASE[it.type] ? it.type : 'item:' + it.type, x: it.x, y: it.y, it });
    });
    return out;
  }
  function nameOf(kind, t) {
    if (BASE[kind]) return BASE[kind][0];
    if (kind.startsWith('hina:')) { const it = t && t.it; return it ? `ひな壇（${(it.w / 100).toFixed(2)}×${(it.h / 100).toFixed(2)}m・高さ${Math.round(it.hgt || 21.2)}cm）` : 'ひな壇'; }
    const c = SS.CATALOG[kind.slice(5)] || {};
    return c.name || kind.slice(5);
  }
  function unitOf(kind) {
    if (BASE[kind]) return BASE[kind][1];
    if (kind.startsWith('hina:')) return '台';
    return /^item:mic/.test(kind) ? '本' : '台';
  }

  // 出入り口（はける・出す先）。出入り口がなければ、下手・上手のそで
  function exitsOf(stage, items) {
    const R = SS.render, ex = [];
    const sideName = (x, y, rot) => {
      const s = Math.sin(((rot || 0) * Math.PI) / 180);
      if (Math.abs(s) < 0.7 && y < stage.d / 2) return '奥';
      return x < stage.w / 2 ? '下手' : '上手';
    };
    items.filter(it => it.type === 'door').forEach(d => {
      const own = d.label && d.label !== '出入口' ? d.label : '';
      ex.push({ name: own || sideName(d.x, d.y, d.rot) + 'の出入口', x: d.x, y: d.y });
    });
    ((SS.fixtureGeom && SS.fixtureGeom(stage).doors) || []).forEach(d => ex.push({ name: (d.side === 'L' ? '下手' : '上手') + 'の出入口', x: d.x, y: (d.y0 + d.y1) / 2 }));
    // 同じ名前が2つ以上あれば番号を付ける
    const cnt = {};
    ex.forEach(e => { cnt[e.name] = (cnt[e.name] || 0) + 1; });
    const seen = {};
    ex.forEach(e => { if (cnt[e.name] > 1) { seen[e.name] = (seen[e.name] || 0) + 1; e.name += '①②③④⑤⑥⑦⑧⑨'[seen[e.name] - 1] || seen[e.name]; } });
    if (ex.length) return { list: ex, near: t => ex.reduce((a, e) => (Math.hypot(e.x - t.x, e.y - t.y) < Math.hypot(a.x - t.x, a.y - t.y) ? e : a)) };
    const L = { name: '下手のそで', side: 'L' }, Rr = { name: '上手のそで', side: 'R' };
    return {
      list: [L, Rr], wings: true,
      near: t => { const [xl, xr] = R.xRange(stage, Math.max(0, Math.min(stage.d, t.y))); return t.x - xl <= xr - t.x ? L : Rr; },
    };
  }

  // 舞台のどのあたりか（例：「下手・奥」）
  SS.stageZone = function (stage, p) {
    const h = p.x < stage.w / 3 ? '下手' : p.x > (stage.w * 2) / 3 ? '上手' : '中央';
    const v = p.y < stage.d / 3 ? '奥' : p.y > (stage.d * 2) / 3 ? '前' : '中ほど';
    return p.x < 0 || p.x > stage.w || p.y < 0 ? '舞台の外' : `${h}・${v}`;
  };

  /**
   * A・B：前の部・次の部の items。opts：譜面台の位置の計算に使う描画の設定
   * 戻り値 { rows, keep, move, remove, add, exits, byExit, players, panels }
   */
  SS.changeover = function (A, B, stage, opts) {
    opts = opts || {};
    const ta = tokens(A, opts), tb = tokens(B, opts);
    const res = { keep: [], move: [], remove: [], add: [] };
    const kinds = [...new Set(ta.concat(tb).map(t => t.kind))];
    kinds.forEach(k => {
      const a = ta.filter(t => t.kind === k), b = tb.filter(t => t.kind === k);
      const cand = [];
      a.forEach(p => b.forEach(q => cand.push([Math.hypot(p.x - q.x, p.y - q.y), p, q])));
      cand.sort((x, y) => x[0] - y[0]);
      const ua = new Set(), ub = new Set();
      cand.forEach(([d, p, q]) => {
        if (ua.has(p) || ub.has(q)) return;
        ua.add(p); ub.add(q);
        (d <= KEEP ? res.keep : res.move).push({ kind: k, from: p, to: q, d });
      });
      a.filter(p => !ua.has(p)).forEach(p => res.remove.push(p));
      b.filter(q => !ub.has(q)).forEach(q => res.add.push(q));
    });
    // ひな壇は「はける・出す」ではなく「組み替え」として別に扱う（平台・足の数の増減で数える）
    const isH = t => !!(t.hina || (t.from && t.from.hina));
    res.tiers = { remove: res.remove.filter(isH), add: res.add.filter(isH), move: res.move.filter(isH), change: [] };
    ['remove', 'add', 'move'].forEach(k => { res[k] = res[k].filter(t => !isH(t)); });
    // 大きさ・高さが変わった段：なくなる段と新しい段を、近いものどうしで組にする
    const labA = new Map(), labB = new Map();
    if (SS.hinaSummary) { SS.hinaSummary(A).rows.forEach(r => labA.set(r.it, r.label)); SS.hinaSummary(B).rows.forEach(r => labB.set(r.it, r.label)); }
    const cands = [];
    res.tiers.remove.forEach(p => res.tiers.add.forEach(q => cands.push([Math.hypot(p.x - q.x, p.y - q.y), p, q])));
    cands.sort((x, y) => x[0] - y[0]);
    const ur = new Set(), ua2 = new Set();
    cands.forEach(([d, p, q]) => { if (d > 400 || ur.has(p) || ua2.has(q)) return; ur.add(p); ua2.add(q); res.tiers.change.push({ from: p, to: q }); });
    res.tiers.remove = res.tiers.remove.filter(p => !ur.has(p));
    res.tiers.add = res.tiers.add.filter(q => !ua2.has(q));
    res.tiers.labelA = t => labA.get(t.it) || 'ひな壇';
    res.tiers.labelB = t => labB.get(t.it) || 'ひな壇';
    // 次の部の出入り口を使う（なければ前の部）
    const ex = exitsOf(stage, B.some(it => it.type === 'door') ? B : A);
    res.remove.forEach(t => { t.exit = ex.near(t); });
    res.add.forEach(t => { t.exit = ex.near(t); });
    res.exits = ex;
    // 種類ごとの表
    const rank = k => (BASE[k] ? ORDER.indexOf(k) : k.startsWith('hina:') ? 100 : 50);
    res.rows = kinds.filter(k => !k.startsWith('hina:')).sort((x, y) => rank(x) - rank(y) || nameOf(x).localeCompare(nameOf(y), 'ja')).map(k => {
      const n = arr => arr.filter(t => (t.kind || t.from.kind) === k).length;
      const sample = ta.concat(tb).find(t => t.kind === k);
      return { kind: k, name: nameOf(k, sample), unit: unitOf(k), before: ta.filter(t => t.kind === k).length, after: tb.filter(t => t.kind === k).length, remove: n(res.remove), add: n(res.add), move: n(res.move), keep: n(res.keep) };
    });
    // 出入り口ごと
    res.byExit = ex.list.map(e => ({ name: e.name, x: e.x, y: e.y, remove: res.remove.filter(t => t.exit === e), add: res.add.filter(t => t.exit === e) })).filter(e => e.remove.length || e.add.length);
    res.players = { before: A.filter(it => it.type === 'player').length, after: B.filter(it => it.type === 'player').length };
    // ひな壇の平台・足の数の増減
    res.panels = [];
    if (SS.hinaSummary) {
      const sa = SS.hinaSummary(A), sb = SS.hinaSummary(B);
      const put = (o1, o2, pre) => [...new Set(Object.keys(o1).concat(Object.keys(o2)))].forEach(k => { const x = o1[k] || 0, y = o2[k] || 0; if (x !== y) res.panels.push({ name: pre + k, before: x, after: y }); });
      put(sa.pan, sb.pan, '平台 ');
      put(sa.leg, sb.leg, '');
      res.panels.forEach(p => { p.unit = /^平台/.test(p.name) ? '枚' : /角材|足/.test(p.name) ? '本' : '個'; });
    }
    return res;
  };

  // 「いす 5脚・譜面台 5本」のような並び
  function listOf(ts) {
    const cnt = new Map();
    ts.forEach(t => { const k = t.kind || t.from.kind; cnt.set(k, (cnt.get(k) || 0) + 1); });
    return [...cnt.keys()].sort((x, y) => (BASE[x] ? ORDER.indexOf(x) : 50) - (BASE[y] ? ORDER.indexOf(y) : 50)).map(k => `${nameOf(k, ts.find(t => (t.kind || t.from.kind) === k))} ${cnt.get(k)}${unitOf(k)}`).join('・');
  }
  SS.changeoverList = listOf;

  // 動かす向きと長さ（例：「上手へ1.2m・奥へ2.1m」）
  function moveText(m) {
    const dx = m.to.x - m.from.x, dy = m.to.y - m.from.y, f = v => (Math.abs(v) / 100).toFixed(1) + 'm';
    const t = [Math.abs(dx) >= 30 ? (dx > 0 ? '上手へ' : '下手へ') + f(dx) : '', Math.abs(dy) >= 30 ? (dy < 0 ? '奥へ' : '前へ') + f(dy) : ''].filter(Boolean).join('・');
    return t || `少し（${f(m.d)}）`;
  }
  // 手順（おすすめの順）：①はける ②ひな壇の組み替え ③動かす ④出す
  SS.changeoverSteps = function (res, stage) {
    const steps = [];
    const T = res.tiers, hinaChange = T.remove.length || T.add.length || T.move.length || T.change.length || res.panels.length;
    if (res.remove.length) {
      steps.push({ title: 'はける（片付ける）', lines: res.byExit.filter(e => e.remove.length).map(e => `${e.name}へ：${listOf(e.remove)}`), note: '出入り口に近い物から運び出すと、通り道が早く空きます。' });
    }
    if (hinaChange) {
      const sz = it => `幅${(it.w / 100).toFixed(2)}m×奥行${(it.h / 100).toFixed(2)}m・高さ${Math.round(it.hgt || 21.2)}cm`;
      const lines = [];
      T.change.forEach(c => lines.push(`${T.labelB(c.to)}：${sz(c.from.it)} → ${sz(c.to.it)}`));
      T.remove.forEach(t => lines.push(`${T.labelA(t)}（${sz(t.it)}）をなくす`));
      T.add.forEach(t => lines.push(`${T.labelB(t)}（${sz(t.it)}）を新しく組む`));
      T.move.forEach(m => lines.push(`${T.labelB(m.to)}を動かす：${moveText(m)}`));
      res.panels.forEach(p => lines.push(`${p.name}：${p.after > p.before ? `${p.after - p.before}${p.unit}足す` : `${p.before - p.after}${p.unit}減らす`}（${p.before} → ${p.after}）`));
      steps.push({ title: 'ひな壇を組み替える', lines, note: 'ひな壇は、いす・譜面台を並べる前に組みます（時間がかかるので、人手を多めに）。' });
    }
    const mv = res.move;
    if (mv.length) {
      const SMALL = ['chair', 'bassChair', 'timpChair', 'pianoBench', 'drumThrone', 'stand', 'light', 'cstand'];
      const small = mv.filter(m => SMALL.includes(m.kind)), big = mv.filter(m => !SMALL.includes(m.kind));
      const lines = big.map(m => `${nameOf(m.kind, m.from)}：${SS.stageZone(stage, m.from)}から ${moveText(m)}`);
      if (small.length) lines.push(`${listOf(small)}（図の矢印のとおり）`);
      steps.push({ title: '動かす', lines, note: '大きい楽器から先に動かします。' });
    }
    if (res.add.length) {
      steps.push({ title: '出す（運び入れる）', lines: res.byExit.filter(e => e.add.length).map(e => `${e.name}から：${listOf(e.add)}`), note: '奥の物から並べると、あとの物を運ぶ通り道がふさがりません。' });
    }
    return steps;
  };

  // 文字だけの計画（コピー・保存用）
  SS.changeoverText = function (res, stage, nameA, nameB) {
    const L = [`【転換】${nameA} → ${nameB}`, `奏者：${res.players.before}人 → ${res.players.after}人`, '', '■ 数'];
    res.rows.filter(r => r.remove || r.add || r.move).forEach(r => {
      const d = [r.remove && `${r.remove}${r.unit}はける`, r.add && `${r.add}${r.unit}出す`, r.move && `${r.move}${r.unit}動かす`].filter(Boolean).join('・');
      L.push(`・${r.name}：${r.before} → ${r.after}（${d}）`);
    });
    res.panels.forEach(p => L.push(`・${p.name}：${p.before} → ${p.after}（${p.after > p.before ? `${p.after - p.before}${p.unit}足す` : `${p.before - p.after}${p.unit}減らす`}）`));
    const steps = SS.changeoverSteps(res, stage);
    L.push('', '■ 手順');
    if (!steps.length) L.push('変えるものはありません');
    steps.forEach((s, i) => { L.push(`${'①②③④⑤'[i]} ${s.title}`); s.lines.forEach(l => L.push('　' + l)); });
    return L.join('\n');
  };

  // 図の上の印：はける＝赤い×、出す＝緑の○＋、動かす＝オレンジの矢印。出入り口には数を出す
  SS.changeoverSVG = function (res, k, stage) {
    k = k || 1;
    const fs = 13 / k, sw = 2.2 / k;
    const bigBox = t => { if (!t.it) return null; const b = SS.itemAABB(t.it, {}); return b; };
    let s = '<g class="changeover">';
    res.move.forEach(m => {
      const big = !BASE[m.kind];
      const dx = m.to.x - m.from.x, dy = m.to.y - m.from.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, ah = Math.min(16, L / 3) * (big ? 1.4 : 1);
      const ex = m.to.x - ux * 4, ey = m.to.y - uy * 4;
      s += `<line x1="${m.from.x.toFixed(1)}" y1="${m.from.y.toFixed(1)}" x2="${(ex - ux * ah * 0.6).toFixed(1)}" y2="${(ey - uy * ah * 0.6).toFixed(1)}" stroke="#e8590c" stroke-width="${(big ? 5 : 3).toFixed(1)}" stroke-linecap="round" opacity=".9"/>`;
      s += `<path d="M${ex.toFixed(1)} ${ey.toFixed(1)}L${(ex - ux * ah - uy * ah * 0.55).toFixed(1)} ${(ey - uy * ah + ux * ah * 0.55).toFixed(1)}L${(ex - ux * ah + uy * ah * 0.55).toFixed(1)} ${(ey - uy * ah - ux * ah * 0.55).toFixed(1)}Z" fill="#e8590c"/>`;
      if (big) { const b = bigBox(m.from); if (b) s += `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="none" stroke="#e8590c" stroke-width="${sw}" stroke-dasharray="${6 / k} ${4 / k}" opacity=".8"/>`; }
    });
    res.remove.forEach(t => {
      const b = bigBox(t);
      if (b) s += `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="#fff0f0" fill-opacity=".55" stroke="#c92a2a" stroke-width="${sw}" stroke-dasharray="${6 / k} ${4 / k}"/>`;
      const r = t.kind === 'stand' || t.kind === 'light' ? 9 : 14;
      s += `<path d="M${t.x - r} ${t.y - r}L${t.x + r} ${t.y + r}M${t.x + r} ${t.y - r}L${t.x - r} ${t.y + r}" stroke="#c92a2a" stroke-width="${t.kind === 'stand' ? 3.5 : 5}" stroke-linecap="round"/>`;
    });
    res.add.forEach(t => {
      const b = bigBox(t);
      if (b) s += `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="none" stroke="#1e8e4e" stroke-width="${sw}" stroke-dasharray="${6 / k} ${4 / k}"/>`;
      const r = t.kind === 'stand' || t.kind === 'light' ? 10 : 17;
      s += `<circle cx="${t.x}" cy="${t.y}" r="${r}" fill="none" stroke="#1e8e4e" stroke-width="3.5"/><path d="M${t.x - r * 0.55} ${t.y}H${t.x + r * 0.55}M${t.x} ${t.y - r * 0.55}V${t.y + r * 0.55}" stroke="#1e8e4e" stroke-width="3" stroke-linecap="round"/>`;
    });
    // ひな壇の組み替え：次の部の段をオレンジの点線で囲む（なくなる段は赤の点線）
    const T = res.tiers || { change: [], add: [], remove: [], move: [] };
    T.change.map(c => c.to).concat(T.add, T.move.map(m => m.to)).forEach(t => { const b = bigBox(t); if (b) s += `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="none" stroke="#e8590c" stroke-width="${(3 / k).toFixed(2)}" stroke-dasharray="${10 / k} ${5 / k}"/><text x="${b.x1 - 6 / k}" y="${b.y0 + fs}" text-anchor="end" font-size="${fs.toFixed(1)}" font-weight="700" fill="#d9480f" stroke="#fff" stroke-width="${3 / k}" paint-order="stroke">組み替え</text>`; });
    T.remove.forEach(t => { const b = bigBox(t); if (b) s += `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="none" stroke="#c92a2a" stroke-width="${(3 / k).toFixed(2)}" stroke-dasharray="${10 / k} ${5 / k}"/>`; });
    // 出入り口ごとの数
    const halo = `stroke="#fff" stroke-width="${3.5 / k}" paint-order="stroke"`;
    res.byExit.forEach(e => {
      const t1 = e.remove.length ? `×はける ${e.remove.length}` : '', t2 = e.add.length ? `○出す ${e.add.length}` : '';
      const nums = `${t1 ? `<tspan fill="#c92a2a">${t1}</tspan>` : ''}${t1 && t2 ? ' ' : ''}${t2 ? `<tspan fill="#1e8e4e">${t2}</tspan>` : ''}`;
      if (res.exits.wings) return; // そでの数は、図の下の帯に出す（図の寸法と重ならないように）
      s += `<text x="${e.x.toFixed(1)}" y="${(e.y - fs * 0.7).toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="700" fill="#39414d" ${halo}>${SS.esc(e.name)}</text>`;
      s += `<text x="${e.x.toFixed(1)}" y="${(e.y + fs * 0.6).toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="700" ${halo}>${nums}</text>`;
    });
    return s + '</g>';
  };
})(window.SS);
