// 操作のなめらかさ・速さを測るテスト
// 使い方：アプリのフォルダでサーバーを立ててから（例：npx http-server -p 8765 .）
//   node tests/perf.test.js [http://localhost:8765/index.html] [--json 結果を書くファイル] [--check]
// 測ること（ふつうの速さと、CPUを4倍遅くした状態＝スマホの代わり。吹奏楽44人とオーケストラ71人）：
//   ドラッグ（1人・全員）・ホイールで拡大縮小・手のひらで画面を動かす …… 1秒あたりのコマ数・いちばん長いコマ・長い処理（50ms以上）の回数
//   ▲を1回押す …… 数字が変わるまで・並び終わるまでの時間
//   ひな形の切りかえ・ホールの切りかえ（オーケストラで神奈川県立音楽堂） …… 並び終わるまでの時間
// --check をつけると、目標（ふつう：ドラッグ55コマ/秒以上・最長50ms以下、CPU×4：30コマ/秒以上 など）に届かないとき NG にする
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const args = process.argv.slice(2);
const URL = args.find(a => /^http/.test(a)) || 'http://localhost:8765/index.html';
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const CHECK = args.includes('--check');

async function setup(b, W, rate, type) {
  const mob = W < 800;
  const ctx = await b.newContext({ viewport: { width: W, height: mob ? 844 : 900 }, isMobile: mob, hasTouch: mob });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); });
  await p.reload();
  await p.waitForTimeout(900);
  if (type === 'orch') { await p.evaluate(() => document.querySelector('#ensType [data-ens="orch"]').click()); await p.waitForTimeout(800); }
  await p.evaluate(() => document.getElementById('zoomFit').click());
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  // コマの記録（requestAnimationFrame の間隔）と長い処理（50ms以上）
  await p.evaluate(() => {
    window.__perf = { on: false, frames: [], long: 0 };
    const loop = t => { if (window.__perf.on) window.__perf.frames.push(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    try { new PerformanceObserver(l => { if (window.__perf.on) window.__perf.long += l.getEntries().length; }).observe({ type: 'longtask', buffered: false }); } catch (e) { /* 使えないブラウザ */ }
  });
  return { p, cdp, ctx, errs, mob };
}
const startRec = p => p.evaluate(() => { window.__perf.frames = []; window.__perf.long = 0; window.__perf.on = true; });
const stopRec = async p => {
  await p.waitForTimeout(120);
  return p.evaluate(() => {
    window.__perf.on = false;
    const f = window.__perf.frames, gaps = f.slice(1).map((t, i) => t - f[i]);
    const dur = f.length > 1 ? f[f.length - 1] - f[0] : 0;
    return { fps: dur ? Math.round(((f.length - 1) / dur) * 1000) : 0, maxMs: gaps.length ? Math.round(Math.max(...gaps)) : 0, long: window.__perf.long };
  });
};
const scr = (p, x, y) => p.evaluate(([x, y]) => { const m = document.getElementById('viewport').getScreenCTM(); const q = document.getElementById('canvas').createSVGPoint(); q.x = x; q.y = y; const r = q.matrixTransform(m); return [r.x, r.y]; }, [x, y]);

async function dragPath(env, x0, y0, dx, dy, n) {
  const { p, cdp, mob } = env;
  if (mob) {
    const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await tp('touchStart', x0, y0);
    for (let i = 1; i <= n; i++) { await tp('touchMove', x0 + (dx * i) / n, y0 + (dy * i) / n); await p.waitForTimeout(16); }
    await tp('touchEnd');
  } else {
    await p.mouse.move(x0, y0); await p.mouse.down();
    for (let i = 1; i <= n; i++) { await p.mouse.move(x0 + (dx * i) / n, y0 + (dy * i) / n); await p.waitForTimeout(16); }
    await p.mouse.up();
  }
}
async function measureDrag(env, all) {
  const { p } = env;
  const it = await p.evaluate(all => { const ps = SS.state.doc.items.filter(i => i.type === 'player'); const it = ps[Math.floor(ps.length / 2)]; SS.state.sel = new Set(all ? SS.state.doc.items.filter(i => i.type !== 'hina').map(i => i.id) : []); return { x: it.x, y: it.y }; }, all);
  const s = await scr(p, it.x, it.y);
  await startRec(p);
  await dragPath(env, s[0], s[1], 60, 30, 60);
  const r = await stopRec(p);
  await p.evaluate(() => { SS.state.sel = new Set(); });
  return r;
}
async function measureWheel(env) {
  const { p } = env;
  await p.mouse.move(700, 450);
  await startRec(p);
  for (let i = 0; i < 40; i++) { await p.mouse.wheel(0, i < 20 ? -40 : 40); await p.waitForTimeout(16); }
  return stopRec(p);
}
async function measurePan(env) {
  const { p } = env;
  await p.evaluate(() => document.getElementById('modePan').click());
  await startRec(p);
  await dragPath(env, env.mob ? 200 : 700, env.mob ? 600 : 700, 80, -40, 60);
  const r = await stopRec(p);
  await p.evaluate(() => document.getElementById('modeSelect').click());
  return r;
}
// ▲を1回：数字が変わるまで（shown）と、並び終わるまで（done）
async function measureStep(env) {
  const { p } = env;
  await p.waitForTimeout(1200);
  return p.evaluate(() => new Promise(res => {
    const part = SS.state.doc.ensemble.type === 'orch' ? 'Vn1' : 'Fl';
    const box = document.querySelector(`.stepper[data-part="${part}"]`), bt = box.querySelector('button[data-d="1"]');
    const n0 = SS.state.doc.items.filter(i => i.type === 'player').length, v0 = box.querySelector('b').textContent;
    const t0 = performance.now();
    bt.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    bt.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    let shown = null;
    const chk = () => {
      const b2 = document.querySelector(`.stepper[data-part="${part}"] b`);
      if (shown == null && b2 && b2.textContent !== v0) shown = performance.now() - t0;
      const n = SS.state.doc.items.filter(i => i.type === 'player').length;
      if (n !== n0 && !SS.state.autoPending) requestAnimationFrame(() => res({ shown: Math.round(shown == null ? performance.now() - t0 : shown), done: Math.round(performance.now() - t0) }));
      else setTimeout(chk, 4);
    };
    chk();
  }));
}
// 押してから、描き終わる（次のコマ）まで
const timed = (p, fn, arg) => p.evaluate(([src, arg]) => new Promise(res => { const t0 = performance.now(); (new Function('arg', src))(arg); const wait = () => { if (SS.state.autoPending) return setTimeout(wait, 4); requestAnimationFrame(() => res(Math.round(performance.now() - t0))); }; wait(); }), [fn, arg]);
async function measureTemplate(env) {
  await env.p.waitForTimeout(300);
  return timed(env.p, "const t = SS.TEMPLATES.find(x => x.id === arg); const c = [...document.querySelectorAll('.tpl-card')][SS.TEMPLATES.indexOf(t)]; SS.state.undo.length = 0; c.click(); const y = document.getElementById('cfYes'); if (y) y.click();", 'band-contest');
}
async function measureHall(env) {
  await env.p.waitForTimeout(300);
  return timed(env.p, "const s = document.getElementById('hallSelect'); s.value = String(SS.HALLS.findIndex(h => h.name.includes(arg))); s.dispatchEvent(new Event('change'));", '神奈川県立音楽堂');
}

(async () => {
  const b = await chromium.launch();
  const rows = [];
  // --only 1400x4orch のように、1つだけ測ることもできる
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  for (const [W, rate, type] of [[1400, 1, 'band'], [1400, 4, 'band'], [1400, 1, 'orch'], [1400, 4, 'orch'], [390, 4, 'band']]) {
    if (only && only !== `${W}x${rate}${type}`) continue;
    const env = await setup(b, W, rate, type);
    const name = `${W === 390 ? 'スマホ' : 'PC'}・${type === 'orch' ? 'オケ71人' : '吹奏楽44人'}・CPU×${rate}`;
    const r = { name, W, rate, type };
    r.drag1 = await measureDrag(env, false);
    r.dragAll = await measureDrag(env, true);
    if (!env.mob) r.wheel = await measureWheel(env);
    r.pan = await measurePan(env);
    r.step = await measureStep(env);
    if (!env.mob) r.template = type === 'band' ? await measureTemplate(env) : null;
    if (!env.mob && type === 'orch') r.hall = await measureHall(env);
    r.errors = env.errs.slice(0, 3);
    rows.push(r);
    const f = x => (x ? `${x.fps}コマ/秒・最長${x.maxMs}ms・長い処理${x.long}回` : '-');
    console.log(`■ ${name}`);
    console.log(`  1人をドラッグ：${f(r.drag1)}`);
    console.log(`  全員をドラッグ：${f(r.dragAll)}`);
    if (r.wheel) console.log(`  ホイールで拡大縮小：${f(r.wheel)}`);
    console.log(`  手のひらで画面を動かす：${f(r.pan)}`);
    console.log(`  ▲1回：数字 ${r.step.shown}ms・並び終わる ${r.step.done}ms（押し終わるのを待つ0.25秒をふくむ。並べ直しそのものは ${Math.max(0, r.step.done - 250)}ms）`);
    if (r.template != null) console.log(`  ひな形の切りかえ：${r.template}ms`);
    if (r.hall != null) console.log(`  ホールの切りかえ（県立音楽堂）：${r.hall}ms`);
    if (r.errors.length) console.log('  画面のエラー：' + r.errors.join(' / '));
    await env.ctx.close();
  }
  await b.close();
  if (jsonOut) require('fs').writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
  let ng = rows.reduce((a, r) => a + r.errors.length, 0);
  if (CHECK) {
    rows.forEach(r => {
      const need = r.rate === 1 ? 55 : 30;
      [['1人をドラッグ', r.drag1], ['全員をドラッグ', r.dragAll]].forEach(([k, x]) => {
        const ok = x.fps >= need && (r.rate > 1 || x.maxMs <= 50);
        if (!ok) { ng++; console.log(`NG ${r.name} ${k}：${x.fps}コマ/秒・最長${x.maxMs}ms（目標 ${need}コマ/秒以上${r.rate === 1 ? '・最長50ms以下' : ''}）`); }
      });
      if (r.W !== 390) {
        if (r.step.shown > 50) { ng++; console.log(`NG ${r.name} ▲の数字が変わるまで ${r.step.shown}ms（目標 50ms以内）`); }
        if (r.step.done > (r.rate === 1 ? 200 : 600) + 250) { ng++; console.log(`NG ${r.name} ▲で並び終わるまで ${r.step.done}ms（目標：押し終わってから ${r.rate === 1 ? 200 : 600}ms 以内）`); }
      }
    });
  }
  console.log(ng ? `${ng}件 NG` : 'すべて OK');
  process.exit(ng ? 1 : 0);
})();
