// 「✨ きれいに整える」と「並べ直しても手で動かした所を残す」を確かめるテスト
// - 自動で並べた図を少しずつ崩して整えると、⚠ が0件に戻る（6つの編成）
// - パートごとまとめて動かした所・1人だけ大きく動かした人は、整えてもその場所のまま
// - 手で作った図（自動の印なし）でも、整えると ⚠ が増えない
// - パートごと動かしてから ▲ で人数を変えても、動かした場所のまま。舞台の外へ出した所は戻す
// 使い方：アプリのフォルダでサーバーを立ててから（例：npx http-server -p 8765 .）
//   node tests/tidy.test.js [http://localhost:8765/index.html]
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
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); });
    await p.reload();
    await p.waitForTimeout(800);
  };
  const warnN = () => p.evaluate(() => SS.checks(SS.state.doc).reduce((a, w) => a + (w.spots ? w.spots.length : 1), 0));
  // 奏者を ±J cm ずらし、向きも少し変える（決まった乱数）
  const jitter = (J, manual) => p.evaluate(([J, manual]) => {
    const d = SS.state.doc;
    if (manual) { d.items.forEach(it => { delete it.auto; delete it.ax; delete it.ay; }); delete d.ensemble; }
    let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
    d.items.filter(it => it.type === 'player').forEach(it => { it.x += r() * J; it.y += r() * J; it.rot = (it.rot || 0) + r() * 12; });
  }, [J, manual]);
  const tidy = async () => { await p.evaluate(() => document.getElementById('btnTidy').click()); await p.waitForTimeout(500); };
  const ens = async e => { await p.evaluate(e => document.querySelector('#ensType [data-ens="' + e + '"]').click(), e); await p.waitForTimeout(1300); };

  // 1) 自動で並べた図を崩して整える
  await fresh();
  for (const e of ['band', 'orch', 'strings', 'brass', 'bigband', 'choir']) {
    await ens(e);
    const w0 = await warnN();
    await jitter(30);
    const w1 = await warnN();
    await tidy();
    check(await warnN() <= w0, `${e}：崩して（⚠ ${w1}件）整えると、⚠ ${w0}件以下に戻る（${await warnN()}件）`);
  }

  // 2) わざと動かした所は残す
  await fresh();
  const hr0 = await p.evaluate(() => SS.state.doc.items.filter(i => i.label === 'Hr').map(i => i.x));
  await p.evaluate(() => SS.state.doc.items.filter(i => i.label === 'Hr').forEach(i => { i.x += 150; i.y += 20; }));
  await p.evaluate(() => { const q = SS.state.doc.items.find(i => i.label === 'Ob'); q.x -= 250; q.y += 30; q.keep = 1; });
  await jitter(15);
  await tidy();
  const hr1 = await p.evaluate(() => SS.state.doc.items.filter(i => i.label === 'Hr').map(i => i.x));
  const dx = hr1.reduce((a, v) => a + v, 0) / hr1.length - hr0.reduce((a, v) => a + v, 0) / hr0.length;
  check(Math.abs(dx - 150) < 25, `ホルンをまとめて右へ1.5m：整えても右へ ${Math.round(dx)}cm のまま`);
  const spread = Math.max(...hr1) - Math.min(...hr1) - (Math.max(...hr0) - Math.min(...hr0));
  check(Math.abs(spread) < 8, 'ホルンの並び（間隔）は自動の席と同じにそろう');
  const ob = await p.evaluate(() => { const q = SS.state.doc.items.find(i => i.keep); return Math.hypot(q.x - q.ax, q.y - q.ay); });
  check(ob > 150, `1人だけ2.5m動かしたオーボエは、その場所のまま（自動の席から ${Math.round(ob)}cm）`);
  check(await warnN() === 0, `⚠ は0件（${await warnN()}件）`);

  // 3) 手で作った図でも、整えると ⚠ が増えない
  for (const e of ['band', 'strings', 'choir', 'bigband']) {
    await fresh();
    await ens(e);
    await jitter(12, true);
    const w1 = await warnN();
    await tidy();
    check(await warnN() <= w1, `手で作った図（${e}）：整えると ⚠ が増えない（${w1}→${await warnN()}件）`);
  }

  // 4) 並べ直しても、手で動かした所を残す
  await fresh();
  await p.evaluate(() => SS.state.doc.items.filter(i => i.label === 'Hr').forEach(i => { i.x += 150; i.y += 20; }));
  await p.evaluate(() => SS.state.doc.items.filter(i => i.label === 'Tuba').forEach(i => { i.x -= 1500; }));
  await p.click('.stepper[data-part="Fl"] [data-d="1"]');
  await p.waitForFunction(() => !SS.state.autoPending);
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const d = SS.state.doc, hr = d.items.filter(i => i.label === 'Hr'), tu = d.items.filter(i => i.label === 'Tuba');
    return { hr: hr.reduce((a, i) => a + (i.x - i.ax), 0) / hr.length, tu: Math.max(...tu.map(i => Math.abs(i.x - i.ax))), toast: document.getElementById('toast').textContent };
  });
  check(Math.abs(r.hr - 150) < 25, `▲で並べ直しても、ホルンは右へ ${Math.round(r.hr)}cm のまま`);
  check(r.tu < 5, '舞台の外へ出したチューバは、自動の席に戻す');
  check(/手で動かした所（Hr）/.test(r.toast), 'お知らせ：「手で動かした所（Hr）は、動かした場所のままにしました」');
  check(await warnN() === 0, `⚠ は0件（${await warnN()}件）`);

  check(!errs.length, 'エラーなし' + (errs.length ? '：' + errs.join(' / ') : ''));
  await b.close();
  console.log(ng ? `NG ${ng}件` : 'すべて OK');
  process.exit(ng ? 1 : 0);
})();
