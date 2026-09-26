// 文章での指示の人数の読み取りを確かめるテスト（「クラ10人」で Cl1 が 0人になる不具合など）
// 使い方：アプリのフォルダでサーバーを立ててから（例：npx http-server -p 8765 .）
//   node tests/assistant-counts.test.js [http://localhost:8765/index.html]
// 吹奏楽のはじめの人数（Cl1・Cl2・Cl3 が 3人ずつ、A.Sx 2・T.Sx 1・B.Sx 1）から読み取った人数をくらべる
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const URL = process.argv[2] || 'http://localhost:8765/index.html';

const CL10 = { Cl1: 4, Cl2: 3, Cl3: 3 };
const CASES = [
  ['クラ10人', CL10],
  ['クラ１０人', CL10],
  ['クラリネット十人', CL10],
  ['クラ10名', CL10],
  ['クラ10', CL10],
  ['クラ×10', CL10],
  ['クラリネットを10人に', CL10],
  ['Cl1 4人', { Cl1: 4, Cl2: 3, Cl3: 3 }],
  ['1stクラ3人', { Cl1: 3 }],
  ['Cl1 4人、Cl2 2人', { Cl1: 4, Cl2: 2, Cl3: 3 }],
  ['クラ2 5人', { Cl2: 5 }],
  ['クラ3人', { Cl1: 1, Cl2: 1, Cl3: 1 }],
  ['クラリネット9名', { Cl1: 3, Cl2: 3, Cl3: 3 }],
  ['バスクラ2人', { 'B.Cl': 2, Cl1: 3, Cl2: 3, Cl3: 3 }],
  ['B.Tb 1人', { 'B.Tb': 1, Tb: 3 }],
  ['フルート6人', { Fl: 6 }],
  ['Tp 5', { Tp: 5 }],
  ['ホルンを2人増やす', { Hr: 6 }],
  ['サックス5人', { 'A.Sx': 3, 'T.Sx': 1, 'B.Sx': 1 }],
  ['パーカス4人', { Perc: 4 }],
  ['打楽器4人', { Perc: 4 }],
  ['ペット5人、ボーン4人', { Tp: 5, Tb: 4 }],
  ['弦バス2人', { 'St.B': 2 }],
  ['サックス5人、パーカス4人', { 'A.Sx': 3, 'T.Sx': 1, 'B.Sx': 1, Perc: 4 }],
  ['金管だけ', { Fl: 0, Cl1: 0, 'A.Sx': 0, Perc: 0, Hr: 4, Tp: 4, Tb: 3, Tuba: 2 }],
  ['木管だけ', { Hr: 0, Tp: 0, Tuba: 0, Perc: 0, Fl: 4, Cl1: 3, 'A.Sx': 2 }],
];
// 人数以外（打楽器の場所・ひな形）
const OTHER = [
  ['打楽器は上手に', r => r.changes.percPlace === 'right'],
  ['打楽器は下手、低音は上手', r => r.changes.percPlace === 'left'],
  ['パーカスは上手', r => r.changes.percPlace === 'right'],
  ['Aの部 高校55人', r => /コンクールA/.test(r.said.join()) && Object.values(r.changes.counts || {}).reduce((a, v) => a + v, 0) === 55],
  ['A部門55人', r => /コンクールA/.test(r.said.join()) && Object.values(r.changes.counts || {}).reduce((a, v) => a + v, 0) === 55],
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); });
  await p.reload();
  await p.waitForTimeout(600);
  let ng = 0;
  for (const [text, want] of CASES) {
    const r = await p.evaluate(text => { const st = SS.auto.defaultState('band'); const out = SS.assistant.parseLocal(text, st); const c = Object.assign({}, st.counts, out.changes.counts || {}); return { c, said: out.said.join('／') }; }, text);
    const bad = Object.keys(want).filter(k => r.c[k] !== want[k]).map(k => `${k}=${r.c[k]}（${want[k]}のはず）`);
    // クラ・サックスの合計
    if (bad.length) { ng++; console.log(`NG 「${text}」 ${bad.join(' ')} ／ ${r.said}`); } else console.log(`OK 「${text}」 ${r.said}`);
  }
  for (const [text, ok] of OTHER) {
    const r = await p.evaluate(text => SS.assistant.parseLocal(text, SS.auto.defaultState('band')), text);
    const good = ok(r);
    if (!good) ng++;
    console.log(`${good ? 'OK' : 'NG'} 「${text}」 ${r.said.join('／')}`);
  }
  if (errs.length) { ng++; console.log('NG 画面のエラー：' + errs.join(' / ')); }
  console.log(ng ? `${ng}件 NG` : 'すべて OK');
  await b.close();
  process.exit(ng ? 1 : 0);
})();
