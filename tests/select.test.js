// 「まとめて選ぶ」と「選んだ人だけ ✨ きれいに整える」を確かめるテスト
// 使い方：アプリのフォルダでサーバーを立ててから（例：npx http-server -p 8765 .）
//   node tests/select.test.js [http://localhost:8765/index.html]
// 確かめること：
//   1) 「列を選択」：同じひな壇（または床）の、同じ列の人だけを選ぶ（オーケストラ・合唱・吹奏楽）
//   2) もう一度押すと パート → 楽器の仲間 → 全員 と広がり、全員の次は列に戻る
//   3) 奏者をすばやく2回タップ → 列、続けてタップ → もっと広く
//   4) ⬚（囲んで選ぶ）のときは、タップで1人ずつ足す・外す
//   5) 自動で並べた図で、選んだ人だけ整える → その人たちは自動の席に戻り、ほかの人は動かない
//   6) 手で作った図で、選んだ1列だけ整える → 1列にそろい、ほかの人は動かない・⚠ が増えない
//   7) 打楽器の人だけ選んで整えても「整える奏者がいません」にならない
//   8) 左右に分かれた列（左のヴァイオリンと右のチェロ）を1列として整えても、真ん中へ集めない
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const URL = process.argv[2] || 'http://localhost:8765/index.html';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  let ng = 0;
  const check = (ok, msg) => { if (!ok) ng++; console.log((ok ? 'OK ' : 'NG ') + msg); };
  const fresh = async () => {
    await p.goto(URL);
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); window.addEventListener('pagehide', () => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); }); });
    await p.reload();
    await p.waitForTimeout(800);
  };
  const ens = async e => { await p.evaluate(e => document.querySelector('#ensType [data-ens="' + e + '"]').click(), e); await p.waitForTimeout(1300); };
  const toastText = () => p.evaluate(() => document.getElementById('toast').textContent);

  // 1) 列を選択
  for (const [e, max] of [['orch', 16], ['choir', 12], ['band', 15]]) {
    await fresh();
    await ens(e);
    const r = await p.evaluate(() => {
      const d = SS.state.doc, ps = d.items.filter(i => i.type === 'player'), tiers = d.items.filter(i => i.type === 'hina');
      const plat = q => tiers.filter(t => SS.hinaContains(t, q.x, q.y, 0)).sort((a, b) => (b.hgt || 0) - (a.hgt || 0))[0] || null;
      let worst = 0, mixed = 0;
      ps.forEach(q => {
        if (/^(perc|kb)$/.test(SS.partGroup(q.label).id)) return; // 打楽器・ピアノなどは列に並ばない
        SS.state.sel = new Set([q.id]); SS.state.selAnchor = q.id;
        document.querySelector('[data-ctx="row"]').click();
        const sel = [...SS.state.sel].map(id => d.items.find(i => i.id === id));
        worst = Math.max(worst, sel.length);
        if (!sel.includes(q) || new Set(sel.map(plat)).size > 1) mixed++;
      });
      return { worst, mixed, n: ps.length };
    });
    check(r.worst <= max && r.mixed === 0, `${e}：「列を選択」で、同じ段（床）の1列だけを選ぶ（いちばん多い列 ${r.worst}人／全${r.n}人、段をまたいだ選択 ${r.mixed}回）`);
  }

  // 2) 押すたびに広がる（吹奏楽のクラリネット2）
  await fresh();
  await ens('band');
  const steps = await p.evaluate(() => {
    const d = SS.state.doc, q = d.items.find(i => i.label === 'Cl2');
    SS.state.sel = new Set([q.id]); SS.state.selAnchor = q.id;
    const out = [];
    for (let i = 0; i < 4; i++) { document.querySelector('[data-ctx="row"]').click(); out.push({ n: SS.state.sel.size, has: SS.state.sel.has(q.id), t: document.getElementById('toast').textContent }); }
    return { out, all: d.items.filter(i => i.type === 'player').length };
  });
  const ns = steps.out.map(s => s.n);
  check(ns[0] < ns[1] && ns[1] < ns[2] && ns[2] === steps.all && ns[3] === ns[0] && steps.out.every(s => s.has), `押すたびに広がる：列 ${ns[0]} → ${ns[1]} → 全員 ${ns[2]} → 列に戻る ${ns[3]}`);
  check(/木管/.test(steps.out[1].t), `列の次は楽器の仲間（${steps.out[1].t.replace(' 元に戻す', '')}）`);

  // 3) 2回タップ → 列、続けてタップ → もっと広く（本物のタップで）
  const box = async id => { const bb = await p.locator(`.item[data-id="${id}"]`).first().boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
  await p.evaluate(() => { SS.state.sel.clear(); });
  const cl1 = await p.evaluate(() => SS.state.doc.items.find(i => i.label === 'Cl1').id);
  const pt = await box(cl1);
  await p.mouse.click(pt.x, pt.y);
  await p.waitForTimeout(80);
  await p.mouse.click(pt.x, pt.y);
  await p.waitForTimeout(80);
  const n2 = await p.evaluate(() => SS.state.sel.size);
  await p.mouse.click(pt.x, pt.y);
  await p.waitForTimeout(80);
  const n3 = await p.evaluate(() => SS.state.sel.size);
  check(n2 > 1 && n3 > n2, `2回タップで列（${n2}人）、続けてタップでもっと広く（${n3}人）`);
  await p.waitForTimeout(500);

  // 4) ⬚ のときは、タップで足す・外す
  await p.evaluate(() => { SS.state.sel.clear(); document.getElementById('modeBox').click(); });
  const ids = await p.evaluate(() => SS.state.doc.items.filter(i => i.label === 'Tp').slice(0, 2).map(i => i.id));
  const a = await box(ids[0]), c = await box(ids[1]);
  await p.mouse.click(a.x, a.y); await p.waitForTimeout(450);
  await p.mouse.click(c.x, c.y); await p.waitForTimeout(450);
  const both = await p.evaluate(ids => ids.every(id => SS.state.sel.has(id)) && SS.state.sel.size === 2, ids);
  await p.mouse.click(a.x, a.y); await p.waitForTimeout(450);
  const one = await p.evaluate(ids => !SS.state.sel.has(ids[0]) && SS.state.sel.has(ids[1]), ids);
  check(both && one, '⬚ のとき：タップで1人ずつ足せて、もう一度タップで外せる');
  await p.evaluate(() => document.getElementById('modeSelect').click());

  // 5) 自動で並べた図で、選んだ人だけ整える
  for (const e of ['band', 'orch', 'choir']) {
    await fresh();
    await ens(e);
    const r = await p.evaluate(() => {
      const d = SS.state.doc, ps = d.items.filter(i => i.type === 'player');
      const home = new Map(ps.map(q => [q, { x: q.x, y: q.y }]));
      const q = ps[Math.floor(ps.length / 2)];
      SS.state.sel = new Set([q.id]); SS.state.selAnchor = q.id;
      document.querySelector('[data-ctx="row"]').click();
      const row = ps.filter(o => SS.state.sel.has(o.id));
      let s = 5; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
      row.forEach(o => { o.x += rnd() * 25; o.y += rnd() * 25; });
      document.getElementById('btnTidy').click();
      const back = Math.max(...row.map(o => Math.hypot(o.x - home.get(o).x, o.y - home.get(o).y)));
      const others = ps.filter(o => !row.includes(o) && Math.hypot(o.x - home.get(o).x, o.y - home.get(o).y) > 0.5).length;
      return { n: row.length, back, others };
    });
    check(r.back < 2 && r.others === 0, `${e}（自動）：選んだ${r.n}人だけ整える → 自動の席に戻る（ずれ ${r.back.toFixed(1)}cm）・ほかの人は動かない（${r.others}人）`);
  }

  // 6) 手で作った図で、選んだ1列だけ整える
  for (const e of ['band', 'orch', 'choir']) {
    await fresh();
    await ens(e);
    const r = await p.evaluate(() => {
      const d = SS.state.doc;
      d.items.forEach(it => { delete it.auto; delete it.ax; delete it.ay; }); delete d.ensemble;
      const ps = d.items.filter(i => i.type === 'player');
      const warn = () => SS.checks(d).reduce((a, w) => a + (w.spots ? w.spots.length : 1), 0);
      const res = [];
      const seen = new Set();
      ps.forEach(q => {
        if (seen.has(q.id) || /^(perc|kb)$/.test(SS.partGroup(q.label).id)) return;
        SS.state.sel = new Set([q.id]); SS.state.selAnchor = q.id;
        document.querySelector('[data-ctx="row"]').click();
        const row = ps.filter(o => SS.state.sel.has(o.id));
        row.forEach(o => seen.add(o.id));
        if (row.length < 3) return;
        const home = ps.map(o => [o, o.x, o.y, o.rot]);
        const w0 = warn();
        let s = 9; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
        row.forEach(o => { o.x += rnd() * 20; o.y += rnd() * 20; });
        document.getElementById('btnTidy').click();
        const t = document.getElementById('toast').textContent;
        const others = home.filter(([o, x, y]) => !row.includes(o) && Math.hypot(o.x - x, o.y - y) > 0.5).length;
        res.push({ label: q.label, n: row.length, oneRow: /^1列/.test(t), others, more: warn() > w0 });
        home.forEach(([o, x, y, rot]) => { o.x = x; o.y = y; o.rot = rot; });
      });
      return res;
    });
    const bad = r.filter(x => !x.oneRow || x.others || x.more);
    check(r.length > 0 && !bad.length, `${e}（手で作った図）：列を1つずつ選んで整える（${r.length}列）→ 1列にそろい、ほかの人は動かず、⚠ が増えない${bad.length ? '：' + JSON.stringify(bad) : ''}`);
  }

  // 7) 打楽器の人だけ選んで整える
  await fresh();
  await ens('band');
  await p.evaluate(() => {
    const d = SS.state.doc;
    const perc = d.items.filter(i => i.type === 'player' && SS.partGroup(i.label).id === 'perc');
    SS.state.sel = new Set(perc.map(i => i.id));
    perc.forEach(i => { i.x += 15; });
    document.getElementById('btnTidy').click();
  });
  check(!/整える奏者がいません/.test(await toastText()), `打楽器の人だけ選んで整えられる（${(await toastText()).replace(' 元に戻す', '')}）`);

  // 8) 左右に分かれた列を、真ん中へ集めない
  const moved = await p.evaluate(() => {
    const c = { x: 900, y: 1012 };
    const pts = [[338, 777, 'a'], [295, 850, 'a'], [272, 916, 'b'], [1528, 916, 'c'], [1505, 850, 'c']].map(([x, y, desk]) => ({ x, y, rot: 0, desk }));
    const q = pts.map(o => Object.assign({}, o));
    SS.geo.tidyArc(q, c, { oneRow: true, minGap: 70 });
    return Math.max(...q.map((o, i) => Math.hypot(o.x - pts[i].x, o.y - pts[i].y)));
  });
  check(moved < 60, `左右に分かれた列（2人で1本の組あり）を整えても、真ん中へ集めない（いちばん動いた人 ${Math.round(moved)}cm）`);

  check(errs.length === 0, '画面にエラーが出ない' + (errs.length ? '：' + errs.join(' / ') : ''));
  await b.close();
  console.log(ng ? `NG が ${ng} 件あります` : 'すべて OK');
  process.exit(ng ? 1 : 0);
})();
