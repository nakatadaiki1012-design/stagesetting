// 「戻す」を100回以上押せること・最初の状態に戻ること・▲▼を続けて押したときは1回分にまとまることを確かめるテスト
// 使い方：アプリのフォルダでサーバーを立ててから（例：npx http-server -p 8765 .）
//   node tests/undo.test.js [http://localhost:8765/index.html]
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const URL = process.argv[2] || 'http://localhost:8765/index.html';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); });
  await p.reload();
  await p.waitForTimeout(800);
  let ng = 0;
  const check = (ok, msg) => { if (!ok) ng++; console.log((ok ? 'OK ' : 'NG ') + msg); };
  const state = () => p.evaluate(() => JSON.stringify(SS.state.doc.items.map(i => [i.type, i.label || '', Math.round(i.x), Math.round(i.y)])) + JSON.stringify(SS.state.doc.ensemble.counts));
  const start = await state();
  // ▲を続けて5回（1秒以内）→ 1回分
  const u0 = await p.evaluate(() => SS.state.undo.length);
  for (let i = 0; i < 5; i++) {
    await p.evaluate(() => { const bt = document.querySelector('.stepper[data-part="Fl"] button[data-d="1"]'); bt.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); bt.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
    await p.waitForTimeout(120);
  }
  const u1 = await p.evaluate(() => SS.state.undo.length);
  check(u1 - u0 === 1, `▲を続けて5回押すと、「戻す」1回分（${u1 - u0}回分）`);
  await p.waitForTimeout(1100);
  // 奏者を選んで、矢印キーで110回動かす（1回ずつ「戻す」に入る）
  await p.evaluate(() => { const it = SS.state.doc.items.find(i => i.type === 'player'); SS.state.sel = new Set([it.id]); });
  for (let i = 0; i < 110; i++) await p.keyboard.press(i % 2 ? 'ArrowDown' : 'ArrowRight');
  const n = await p.evaluate(() => SS.state.undo.length);
  check(n >= 111, `111回分の操作が「戻す」に入る（${n}回分）`);
  let c = 0;
  while (!(await p.evaluate(() => document.getElementById('btnUndo').disabled)) && c < 400) { await p.click('#btnUndo'); c++; }
  check(c >= 100, `「戻す」を${c}回押せる（100回以上）`);
  check((await state()) === start, '「戻す」を全部押すと、はじめの状態にもどる');
  // 設定を変えて並べ直したあとの「戻す」で、設定と図が食いちがわない（打楽器の場所・ホール・▲）
  const pair = () => p.evaluate(() => JSON.stringify([SS.state.doc.ensemble, SS.state.doc.stage, SS.state.doc.items.map(i => [i.type, i.label || '', Math.round(i.x), Math.round(i.y)])]));
  for (const [name, act] of [
    ['打楽器の場所', () => p.evaluate(() => { const s = document.getElementById('percPlace'); s.value = 'right'; s.dispatchEvent(new Event('change')); })],
    ['ホール', () => p.evaluate(() => { const s = document.getElementById('hallSelect'); s.value = '1'; s.dispatchEvent(new Event('change')); })],
    ['▲', () => p.evaluate(() => { const bt = document.querySelector('.stepper[data-part="Tp"] button[data-d="1"]'); bt.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); bt.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); })],
  ]) {
    await p.waitForTimeout(1100);
    const before = await pair();
    await act();
    await p.waitForTimeout(500);
    const changed = (await pair()) !== before;
    await p.click('#btnUndo');
    await p.waitForTimeout(300);
    check(changed && (await pair()) === before, `${name}を変えて「戻す」→ 設定も図も前のとおり`);
  }
  if (errs.length) { ng++; console.log('NG 画面のエラー：' + errs.join(' / ')); }
  console.log(ng ? `${ng}件 NG` : 'すべて OK');
  await b.close();
  process.exit(ng ? 1 : 0);
})();
