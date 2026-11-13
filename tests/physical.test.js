// 「物理的にありえない置き方」と「実物の規格」を確かめるテスト
// - ⚠ 確認：舞台のふちにまたがる物・台（ひな壇・平台）どうしの重なり・段と段のあいだのすき間（3〜40cm）を見つける
// - 🔧 自動で直す：台のすき間・重なりを、ぴったりくっつけて直す
// - 動かして離したとき・部品を置いたとき：重なり・床の外なら、いちばん近い置ける所へずらす（Alt を押しながらはそのまま）
// - 規格品（平台・ピアノなど）は大きさを変えられない。ひな壇の幅は平台の枚数ぶんにそろう
// - かんたん編成で並べた図には、これらの ⚠ が出ない
// 使い方：アプリのフォルダでサーバーを立ててから（例：npx http-server -p 8765 .）
//   node tests/physical.test.js [http://localhost:8765/index.html]
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
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); window.addEventListener('pagehide', () => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); }); }); // 開き直すときの自動保存で、前の図が残らないように
    await p.reload();
    await p.waitForTimeout(800);
  };
  const kinds = () => p.evaluate(() => SS.checks(SS.state.doc).map(w => w.kind));
  // 舞台を空にして、平台を置く（描き直しは画面の大きさが変わったことにして）
  const setItems = async list => { await p.evaluate(list => { SS.state.doc.items = list.map((it, i) => Object.assign({ id: 'x' + i, rot: 0 }, it)); window.dispatchEvent(new Event('resize')); }, list); await p.waitForTimeout(400); };
  const R = (x, y) => ({ type: 'riser', x, y, w: 182, h: 91 });
  const scr = (x, y) => p.evaluate(([x, y]) => { const r = document.getElementById('canvas').getBoundingClientRect(), v = SS.state.view; return [r.left + v.tx + x * v.k, r.top + v.ty + y * v.k]; }, [x, y]);
  const drag = async (from, to) => { const a = await scr(...from), c = await scr(...to); await p.mouse.move(...a); await p.mouse.down(); await p.mouse.move(a[0] + 5, a[1] + 5, { steps: 2 }); await p.mouse.move(...c, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(500); };

  // 1) ⚠ 確認
  await fresh();
  const xl = await p.evaluate(() => SS.render.xRange(SS.state.doc.stage, 600)[0]);
  await setItems([R(xl + 20, 600)]);
  check((await kinds()).includes('offedge'), '平台が舞台のふちにまたがる → 「一部が床の外」');
  await setItems([R(500, 600), R(600, 640)]);
  check((await kinds()).includes('platform'), '平台どうしが半分重なる → 「台どうしが重なっています」');
  await setItems([{ type: 'hina', x: 600, y: 600, w: 728, h: 182, hgt: 21.2 }, R(600, 600)]);
  check(!(await kinds()).includes('platform'), 'ひな壇の上にまるごと乗せた平台は、重なりにしない');
  await setItems([R(500, 600), R(702, 600)]);
  check((await kinds()).includes('gap'), '平台のあいだに20cmのすき間 → 「足やいすの脚が落ちるすき間」');
  await setItems([R(500, 600), R(682, 600)]);
  const k0 = await kinds();
  check(!k0.includes('gap') && !k0.includes('platform'), 'くっつけて並べた平台は ⚠ なし');
  await setItems([R(500, 600), R(800, 600)]);
  check(!(await kinds()).includes('gap'), '1m以上はなれた平台は ⚠ なし（通路）');

  // 2) 🔧 自動で直す：すき間・重なりをくっつける
  await setItems([R(500, 600), R(702, 600), R(500, 750), R(560, 790)]);
  await p.evaluate(() => { document.getElementById('warnChip').click(); });
  await p.waitForTimeout(200);
  await p.evaluate(() => document.getElementById('warnFix').click());
  await p.waitForTimeout(600);
  const k1 = await kinds();
  check(!k1.includes('gap') && !k1.includes('platform'), `🔧 自動で直す：すき間・重なりがなくなる（残り：${k1.join(',') || 'なし'}）`);

  // 3) 動かして離したとき
  await fresh();
  let [a, c] = await p.evaluate(() => { const d = SS.state.doc; const f = d.items.find(i => i.label === 'Fl'), o = d.items.find(i => i.label === 'Ob'); return [[f.x, f.y], [o.x + 10, o.y]]; });
  await drag(a, c);
  check(!(await kinds()).includes('overlap'), '人を人の上に置く → 重ならない所へずらす');
  await fresh();
  [a, c] = await p.evaluate(() => { const d = SS.state.doc; const f = d.items.find(i => i.label === 'Fl'), o = d.items.find(i => i.label === 'Ob'); return [[f.x, f.y], [o.x + 10, o.y]]; });
  await p.keyboard.down('Alt'); await drag(a, c); await p.keyboard.up('Alt');
  check((await kinds()).includes('overlap'), 'Alt を押しながらだと、そのまま（重なったまま）');
  await fresh();
  await p.evaluate(() => { SS.state.doc.items.push({ id: 'rz', type: 'riser', x: 300, y: 900, w: 182, h: 91, rot: 0 }); window.dispatchEvent(new Event('resize')); });
  await p.waitForTimeout(400);
  const xl2 = await p.evaluate(() => SS.render.xRange(SS.state.doc.stage, 900)[0]);
  await drag([300, 900], [xl2 + 20, 900]);
  check(!(await kinds()).includes('offedge'), '平台を舞台のふちへ → 床の上へずらす');
  // 部品を置く：ひな壇に半分かかる所に平台
  await fresh();
  const t = await p.evaluate(() => { const t = SS.state.doc.items.filter(i => i.type === 'hina').sort((a, b) => b.y - a.y)[0]; return { x: t.x - t.w / 2 + 30, y: t.y }; });
  await p.evaluate(() => document.querySelector('[data-tab="partsTab"]').click());
  await p.evaluate(() => document.querySelector('#palette [data-type="riser"]').click());
  const s = await scr(t.x, t.y);
  await p.mouse.click(...s);
  await p.waitForTimeout(500);
  check(!(await kinds()).includes('platform'), '平台をひな壇に半分かけて置く → となりにぴったりずらす');

  // 4) 規格品の大きさ
  await p.evaluate(() => document.querySelector('[data-tab="selTab"]').click());
  await p.waitForTimeout(200);
  const r1 = await p.evaluate(() => ({ handle: !!document.querySelector('[data-handle="resize"]'), w: !!document.getElementById('propW'), note: /規格品/.test(document.getElementById('props') ? document.getElementById('props').textContent : document.body.textContent) }));
  check(!r1.handle && !r1.w && r1.note, '平台を選ぶと：大きさのつまみ・数字の欄がなく「規格品」と出る');
  await fresh();
  const ht = await p.evaluate(() => { const t = SS.state.doc.items.filter(i => i.type === 'hina' && !SS.hinaLift(i) && !i.perc).sort((a, b) => b.y - a.y)[0]; return { id: t.id, x: t.x - t.w / 2 + 8, y: t.y + t.h / 2 - 8 }; });
  const hid = ht.id;
  await p.mouse.click(...(await scr(ht.x, ht.y)));
  await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('[data-tab="selTab"]').click());
  await p.waitForTimeout(200);
  const okW = await p.evaluate(id => { const el = document.getElementById('propW'); if (!el) return 'no field'; el.value = '700'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); const t = SS.state.doc.items.find(i => i.id === id); return t.w % SS.panelSize(t).w === 0 ? 'ok:' + t.w : 'bad:' + t.w; }, hid);
  check(/^ok/.test(okW), `ひな壇の幅に700cmと入れると、平台の枚数ぶん（${okW}）にそろう`);

  // 5) かんたん編成の図には出ない
  await fresh();
  for (const e of ['band', 'orch', 'strings', 'brass', 'bigband', 'choir']) {
    await p.evaluate(e => document.querySelector('#ensType [data-ens="' + e + '"]').click(), e);
    await p.waitForTimeout(1200);
    const k = await kinds();
    check(!k.some(x => ['offedge', 'platform', 'gap'].includes(x)), `${e}：自動で並べた図に、床の外・台の重なり・すき間の ⚠ がない`);
  }

  check(!errs.length, 'エラーなし' + (errs.length ? '：' + errs.join(' / ') : ''));
  await b.close();
  console.log(ng ? `NG ${ng}件` : 'すべて OK');
  process.exit(ng ? 1 : 0);
})();
