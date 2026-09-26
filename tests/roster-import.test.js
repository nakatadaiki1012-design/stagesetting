// 名簿の取り込みで、編成（人数）が勝手に変わらないこと・読めなかった行が見えることを確かめるテスト
// 使い方：アプリのフォルダでサーバーを立ててから（例：npx http-server -p 8765 .）
//   node tests/roster-import.test.js [http://localhost:8765/index.html]
// 吹奏楽（44人）に、書き方をいろいろ混ぜた10人分の名簿を「Excelから貼り付け」で取り込む
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const URL = process.argv[2] || 'http://localhost:8765/index.html';

const ROSTER = [
  'Fl\t山田',          // パート（タブ）名前
  '佐藤（Ob）',         // 名前（パート）
  'Tp：鈴木',           // パート：名前
  '高橋 ホルン',        // 名前 パート
  'サックス\t伊藤',     // 言いかえ（空いているサックスの席へ）
  'パーカス\t渡辺',     // 言いかえ
  'ボーン 中村',        // 言いかえ
  '弦バス,小林',        // 言いかえ（カンマ区切り）
  'クラ 加藤',          // 言いかえ（空いているクラの席へ）
  '吉田（オーボエ２）', // 読めない行（「オーボエ２」というパートはない）
].join('\n');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stagesetting.helped', '1'); });
  await p.reload();
  await p.waitForTimeout(800);
  const snap = () => p.evaluate(() => ({ counts: JSON.stringify(SS.state.doc.ensemble.counts), n: SS.state.doc.items.filter(i => i.type === 'player').length }));
  const before = await snap();
  await p.evaluate(() => document.getElementById('btnRoster').click());
  await p.waitForTimeout(300);
  await p.click('#rsPasteBtn');
  await p.fill('#rsPasteText', ROSTER);
  await p.click('#rsPasteGo');
  await p.waitForTimeout(800);
  const after = await snap();
  const r = await p.evaluate(() => ({
    members: SS.state.doc.roster.members.map(m => m.part + ':' + m.name),
    named: SS.state.doc.items.filter(i => i.type === 'player' && i.name).map(i => i.label + ':' + i.name),
    result: (document.querySelector('.rs-result') || {}).textContent || '',
    bad: [...document.querySelectorAll('.rs-bad-row .rs-line')].map(e => e.textContent),
    countsBox: document.getElementById('rsCounts') ? document.getElementById('rsCounts').checked : null,
  }));
  let ng = 0;
  const check = (ok, msg) => { if (!ok) ng++; console.log((ok ? 'OK ' : 'NG ') + msg); };
  check(before.n === 44, `はじめは44人（${before.n}人）`);
  check(after.n === before.n, `取り込んでも人数が変わらない（${before.n} → ${after.n}人）`);
  check(after.counts === before.counts, 'かんたん編成のパートごとの人数が変わらない');
  check(r.members.length === 9, `9人を名簿に読み込む（${r.members.length}人：${r.members.join('、')}）`);
  check(r.named.length === 9, `9人の名前が舞台の席に入る（${r.named.join('、')}）`);
  check(r.bad.length === 1 && /吉田/.test(r.bad[0]), `読めなかった行が見える（${r.bad.join('、')}）`);
  check(/9人の名前を入れました/.test(r.result), `結果が名簿の画面の中に出る（${r.result.slice(0, 60)}）`);
  check(r.countsBox === false, '「人数も名簿に合わせる」は最初はオフ');
  // 読めなかった行を、その場で直す
  await p.selectOption('[data-bp="0"]', 'Ob');
  await p.click('[data-bfix="0"]');
  await p.waitForTimeout(500);
  const fixed = await p.evaluate(() => ({ n: SS.state.doc.items.filter(i => i.type === 'player').length, ob: SS.state.doc.items.filter(i => i.label === 'Ob').map(i => i.name) }));
  check(fixed.n === 44 && fixed.ob.includes('吉田'), `直した行（吉田・Ob）が名簿と席に入る（Ob：${fixed.ob.join('・')}）`);
  // 人数を合わせるをオンにして減るときは、確認が出る（やめると変わらない）
  await p.check('#rsCounts');
  await p.click('#rsApply');
  await p.waitForTimeout(300);
  const ask = await p.evaluate(() => (document.getElementById('cfYes') ? document.getElementById('modalBody').textContent : ''));
  check(/人減ります/.test(ask) && /Hr 4人→1人/.test(ask), `減るときは具体的に確認する（${ask.replace(/\s+/g, ' ').slice(0, 70)}）`);
  if (await p.$('#cfNo')) await p.click('#cfNo');
  await p.waitForTimeout(300);
  const after2 = await snap();
  check(after2.n === 44, `確認で「やめる」を押すと人数はそのまま（${after2.n}人）`);
  if (errs.length) { ng++; console.log('NG 画面のエラー：' + errs.join(' / ')); }
  console.log(ng ? `${ng}件 NG` : 'すべて OK');
  await b.close();
  process.exit(ng ? 1 : 0);
})();
