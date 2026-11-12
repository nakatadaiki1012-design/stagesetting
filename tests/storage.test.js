// 保存データが壊れない・消えないことを確かめるテスト
// 使い方：アプリのフォルダでサーバーを立ててから（例：npx http-server -p 8765 .）
//   node tests/storage.test.js [http://localhost:8765/index.html]
// 確かめること：
//   1) 自動保存が壊れていても、黙って上書きせず「読めなかったデータ」として取っておく。前に開いていた配置図があればそれで開く
//   2) 保存一覧が壊れていても、名前を付けて保存したときに一覧が消えない（壊れたデータは取っておく）。読めない1件は消さずに残る
//   3) ファイルを開く前の配置図を「前に開いていた配置図」として取っておき、戻せる
//   4) 位置が数でない部品・種類のない部品が入っていても開ける（数でない位置は直し、種類のない物は外す）
//   5) 画面を閉じる（pagehide）と、待たずにすぐ自動保存する
//   6) 自動保存できないとき（容量いっぱい）は知らせる
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const fs = require('fs'), os = require('os'), path = require('path');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
const AUTO = 'stagesetting.autosave.v1', LIST = 'stagesetting.saved.v1';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  let ng = 0;
  const check = (ok, msg) => { if (!ok) ng++; console.log((ok ? 'OK ' : 'NG ') + msg); };
  const fresh = async (setup) => {
    await p.goto(URL);
    await p.waitForTimeout(700); // 開いた直後の自動保存の予約が終わってから、データを用意する
    await p.evaluate(setup || (() => {}));
    await p.reload();
    await p.waitForTimeout(900);
  };
  const toastText = () => p.evaluate(() => document.getElementById('toast').textContent);
  const nPlayers = () => p.evaluate(() => SS.state.doc.items.filter(i => i.type === 'player').length);

  // 1) 壊れた自動保存
  await fresh(() => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); localStorage.setItem('stagesetting.autosave.v1', '{"items":[{"type":"player"'); });
  await p.waitForTimeout(400);
  let broken = await p.evaluate(() => localStorage.getItem('stagesetting.broken.stagesetting.autosave.v1'));
  check(!!broken && JSON.parse(broken).raw.startsWith('{"items"'), '壊れた自動保存は「読めなかったデータ」として取ってある');
  check(/読めませんでした|読めなかった/.test(await toastText()), '壊れていたことを知らせる');
  // 前に開いていた配置図があれば、それで開く
  await fresh(() => {
    localStorage.clear(); localStorage.setItem('stagesetting.helped', '1');
    const prev = { items: [{ type: 'player', x: 100, y: 100, label: 'Fl' }, { type: 'player', x: 200, y: 100, label: 'Ob' }, { type: 'player', x: 300, y: 100, label: 'Cl1' }], stage: { w: 1400, d: 900 } };
    localStorage.setItem('stagesetting.autosave.prev.v1', JSON.stringify({ date: Date.now(), reason: 'test', raw: JSON.stringify(prev) }));
    localStorage.setItem('stagesetting.autosave.v1', 'not json');
  });
  check(await nPlayers() === 3, '自動保存が壊れていたら、前に開いていた配置図（3人）で開く');

  // 2) 壊れた保存一覧
  await fresh(() => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); localStorage.setItem('stagesetting.saved.v1', '[{"id":"a","name":"大事な図"'); });
  await p.evaluate(() => SS.render.saveToList('新しい図', SS.state.doc, null));
  broken = await p.evaluate(() => localStorage.getItem('stagesetting.broken.stagesetting.saved.v1'));
  check(!!broken && JSON.parse(broken).raw.includes('大事な図'), '壊れた保存一覧は、上書きする前に取ってある');
  // 読めない1件は消さずに残る
  await fresh(() => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); localStorage.setItem('stagesetting.saved.v1', JSON.stringify([{ id: 'x', name: '半分壊れた', doc: { items: 'oops' } }])); });
  await p.evaluate(() => SS.render.saveToList('ふつうの図', SS.state.doc, null));
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem('stagesetting.saved.v1')));
  check(raw.length === 2 && raw.some(x => x.name === '半分壊れた'), '読めない1件は一覧から消さずに残す');
  check(await p.evaluate(() => SS.render.savedList().length) === 1, '画面の一覧には読める1件だけ出す');

  // 3) ファイルを開く前の配置図を取っておき、戻せる
  await fresh(() => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); });
  const before = await nPlayers();
  const file = path.join(os.tmpdir(), 'ss-test-' + Date.now() + '.stage.json');
  fs.writeFileSync(file, JSON.stringify({ items: [{ type: 'player', x: 700, y: 500, label: 'Tp' }], stage: { w: 1400, d: 900 } }));
  await p.evaluate(() => document.getElementById('btnFile').click());
  await p.setInputFiles('#openFile', file);
  await p.waitForTimeout(600);
  check(await nPlayers() === 1, 'ファイル（1人）を開けた');
  check(await p.evaluate(() => { const b = SS.store.readBackup(); return b && b.doc.items.filter(i => i.type === 'player').length; }) === before, `開く前の配置図（${before}人）を取ってある`);
  await p.evaluate(() => document.getElementById('btnFile').click());
  await p.waitForTimeout(200);
  check(await p.isVisible('#restorePrev'), '「前に開いていた配置図に戻す」が出る');
  await p.click('#restorePrev');
  await p.waitForTimeout(500);
  check(await nPlayers() === before, '前に開いていた配置図に戻せた');
  fs.unlinkSync(file);

  // 4) 壊れた値の入った配置図
  await fresh(() => {
    localStorage.clear(); localStorage.setItem('stagesetting.helped', '1');
    localStorage.setItem('stagesetting.autosave.v1', JSON.stringify({ items: [null, 5, { x: 1, y: 2 }, { type: 'player', x: null, y: 'abc', rot: 'x', label: 'Fl' }, { type: 'player', x: '300', y: 200, label: 'Ob' }], stage: { w: -5, d: 'x' } }));
  });
  const d = await p.evaluate(() => ({ n: SS.state.doc.items.length, ok: SS.state.doc.items.every(i => isFinite(i.x) && isFinite(i.y) && isFinite(i.rot)), w: SS.state.doc.stage.w, ob: SS.state.doc.items.find(i => i.label === 'Ob').x }));
  check(d.n === 2, '種類のない物・壊れた物は外した（2つ残る）');
  check(d.ok, '数でない位置・向きは直した');
  check(d.w > 0, '舞台の大きさがおかしいときは標準に戻した');
  check(d.ob === 300, '文字で書かれた数（"300"）は数として読む');
  check(errs.length === 0, '画面にエラーが出ない' + (errs.length ? '：' + errs.join(' / ') : ''));

  // 5) 閉じるときはすぐ保存
  await fresh(() => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); });
  // ▲を押して、並べ直し（押し終わってから0.25秒待つ）より前に閉じても、増えた人まで保存される
  const n0 = await nPlayers();
  await p.locator('#partSteppers button[data-d="1"]').first().click();
  await p.waitForTimeout(100);
  await p.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const savedN = await p.evaluate(() => (JSON.parse(localStorage.getItem('stagesetting.autosave.v1') || '{"items":[]}').items || []).filter(i => i.type === 'player').length);
  check(savedN === n0 + 1, `閉じる（pagehide）ときは、並べ直しを待たずに済ませて保存する（${n0} → 保存 ${savedN}人）`);

  // 6) 保存できないときは知らせる
  await fresh(() => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); });
  await p.evaluate(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'stagesetting.autosave.v1') throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, k, v); }; });
  await p.locator('#partSteppers button[data-d="1"]').first().click();
  await p.waitForTimeout(1200);
  check(/自動保存できませんでした/.test(await toastText()), '自動保存できないときは知らせる');

  await b.close();
  console.log(ng ? `NG が ${ng} 件あります` : 'すべて OK');
  process.exit(ng ? 1 : 0);
})();
