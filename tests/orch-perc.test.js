// オーケストラの打楽器の置き場所を確かめるテスト（ブラウザで開いて、打楽器と弦楽器の距離を測る）
// 使い方：アプリのフォルダでサーバーを立ててから（例：npx http-server -p 8765 .）
//   node tests/orch-perc.test.js [http://localhost:8765/index.html]
// 確かめること：
//   1) ティンパニは最上段にあり、舞台の中央から3m以内
//   2) 床に置いた打楽器は、弦楽器（Vn1・Vn2・Va・Vc・Cb）から2m以上はなれている
//   3) 大太鼓・小太鼓・シンバルなどは、ティンパニから4m以内か段の上
// ひな形「オーケストラ（通常配置）」「オーケストラ（対向配置）」と、かんたん編成で「オーケストラ」を選んだときを調べる
// さらに、せまいホール8か所でも 2) を調べる（入りきらないときは「入りきりません」の案内が出ていること）
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
  const measure = () => p.evaluate(() => {
    const d = SS.state.doc, items = d.items, st = d.stage;
    const tiers = items.filter(it => it.type === 'hina');
    const onTier = it => tiers.some(t => SS.hinaContains(t, it.x, it.y, 5));
    const top = tiers.filter(t => !t.perc).reduce((a, t) => ((t.hgt || 0) > (a ? a.hgt || 0 : -1) ? t : a), null);
    const strings = items.filter(it => it.type === 'player' && /^(vn1|vn2|va|vc|cb)$/i.test(it.label || ''));
    const perc = items.filter(it => SS.auto.PERC_TYPES.has(it.type));
    const timps = perc.filter(it => /^timp/.test(it.type));
    const out = [];
    if (!timps.length) out.push('ティンパニがない');
    else {
      if (!timps.every(t => top && SS.hinaContains(top, t.x, t.y, 5))) out.push('ティンパニが最上段にない');
      const mx = timps.reduce((a, t) => a + t.x, 0) / timps.length;
      if (Math.abs(mx - st.w / 2) > 300) out.push(`ティンパニが中央から ${Math.round(Math.abs(mx - st.w / 2))}cm はなれている`);
    }
    perc.filter(it => !onTier(it)).forEach(it => {
      const dmin = Math.min(...strings.map(s => Math.hypot(s.x - it.x, s.y - it.y)));
      if (dmin < 200) out.push(`${it.type} が弦楽器から ${Math.round(dmin)}cm（床）`);
    });
    perc.filter(it => !/^timp/.test(it.type) && ['bd', 'sd', 'cym', 'table', 'tam'].includes(it.type)).forEach(it => {
      const dt = timps.length ? Math.min(...timps.map(t => Math.hypot(t.x - it.x, t.y - it.y))) : 1e9;
      if (dt > 400 && !onTier(it)) out.push(`${it.type} がティンパニから ${Math.round(dt)}cm`);
    });
    return out;
  });
  let fail = 0;
  for (const id of ['orch-normal', 'orch-antiphonal']) {
    await p.evaluate(id => { const m = SS.TEMPLATES.find(x => x.id === id).make(); const d = SS.state.doc; d.items = m.items.map((it, i) => Object.assign({ id: 'z' + i }, it)); d.stage = m.stage; d.ensemble = m.ensemble || null; }, id);
    const r = await measure();
    console.log(r.length ? 'NG' : 'OK', id, r.join(' / '));
    if (r.length) fail++;
  }
  // かんたん編成で「オーケストラ」を押す
  await p.evaluate(() => document.querySelector('#ensType [data-ens="orch"]').click());
  await p.waitForTimeout(600);
  const r = await measure();
  console.log(r.length ? 'NG' : 'OK', 'かんたん編成のオーケストラ', r.join(' / '));
  if (r.length) fail++;
  // せまいホール（8か所）：入りきらないときでも、床の打楽器を弦楽器から2m以内に置かない。
  // 入りきらないときは「入りきりません」の案内（⚠ の一覧のいちばん上）が出ていること
  const TIGHT = ['神奈川県立音楽堂', 'ひまわりの郷', '横浜関内ホール', '杉並公会堂', '風のホール', 'きゅりあん', 'シアター1010', 'エコルマ'];
  for (const hn of TIGHT) {
    await p.evaluate(hn => { const i = SS.HALLS.findIndex(h => h.name.includes(hn)); const s = document.getElementById('hallSelect'); s.value = String(i); s.dispatchEvent(new Event('change')); }, hn);
    await p.waitForTimeout(700);
    const r2 = await measure();
    const near = r2.filter(x => /弦楽器から/.test(x));
    const info = await p.evaluate(() => ({ warn: SS.checks(SS.state.doc).length, card: !!document.querySelector('.fit-card'), stuck: SS.state.doc.items.some(it => it.offstage) }));
    const ok = !near.length && (info.warn === 0 || info.card);
    console.log(ok ? 'OK' : 'NG', hn, near.length ? near.join(' / ') : '床の打楽器は弦から2m以上', info.card ? '（入りきりませんの案内あり）' : '', info.stuck ? '（そでに置いた打楽器あり）' : '');
    if (!ok) fail++;
  }
  if (errs.length) { console.log('NG 画面のエラー', errs.join(' / ')); fail++; }
  await b.close();
  console.log(fail ? `失敗 ${fail}件` : 'すべて OK');
  process.exit(fail ? 1 : 0);
})();
