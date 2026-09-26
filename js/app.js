/* アプリ本体 */
(function (SS) {
  'use strict';
  const $ = id => document.getElementById(id);
  const G = SS.geo;
  const svg = $('canvas');
  const vp = $('viewport');
  const layerStage = $('layerStage'), layerUnderlay = $('layerUnderlay'), layerItems = $('layerItems'), layerOverlay = $('layerOverlay');
  const AUTOSAVE_KEY = 'stagesetting.autosave.v1';
  // 吸着の間隔：方眼の半分（1.82mの方眼なら91cm＝3尺）
  const snapSize = () => { const g = opts().gridSize || 50; return g / 2; };

  const S = {
    doc: null,
    sel: new Set(),
    view: { k: 1, tx: 0, ty: 0 },
    mode: 'select',
    undo: [], redo: [],
    underlayEdit: false,
    trace: null,
  };
  SS.state = S;

  let idCounter = 0;
  const newId = () => 'i' + Date.now().toString(36) + (idCounter++).toString(36);

  // ------------------------------------------------------------ 文書
  // はじめて使う人の表示：パート名・舞台の寸法・センター・上手下手客席は出し、方眼・譜面台の3本脚・平台の番号と足は出さない
  function defaultOptions() {
    return { showNames: true, showStands: true, standLegs: false, showNumbers: false, grid: false, gridSize: 50, snap: false, colorBy: true, seatR: 24, figure: true, contest: false, guides: true, dims: true, hinaDetail: false, showLeads: true };
  }
  // 前からある保存データ・共有リンクには、項目がないときの前の標準を使う（その人が見ていた表示を変えない）
  const LEGACY_OPTIONS = { grid: true, standLegs: true, hinaDetail: true };
  function normalize(doc) {
    doc = doc || {};
    const d = {
      version: 1,
      title: doc.title || '',
      subtitle: doc.subtitle || '',
      stage: Object.assign({ w: 1400, d: 900, shape: 'rect' }, doc.stage || {}),
      items: (doc.items || []).map(it => Object.assign({ rot: 0 }, it, { id: it.id || newId() })),
      underlay: doc.underlay || null,
      options: Object.assign(defaultOptions(), doc.options ? LEGACY_OPTIONS : {}, doc.options || {}),
      ensemble: doc.ensemble || null,
      hall: doc.hall || '',
      lighting: doc.lighting || null, // 3D の照明のテスト（ピンスポットなど）
      // 図面の情報欄（会場・日付・版・作成者・メモ）。古い保存データには無いので空で補う
      info: Object.assign({ venue: '', date: '', version: 1, author: '', memo: '', changeNote: '' }, doc.info || {}),
      // コンクール提出用の図（団体名・メモ・用紙の向き・編成表を入れるか）
      contest: Object.assign({ org: '', memo: '', orient: 'landscape', legend: false }, doc.contest || {}),
    };
    // 1部・2部…（2つ以上のときだけ）。いま開いている部の中身は items・ensemble にあり、parts の同じ番号の所は空
    const P = Array.isArray(doc.parts) && doc.parts.length > 1 ? doc.parts : null;
    d.parts = P ? P.map((p, i) => ({ name: String((p && p.name) || `第${i + 1}部`), items: p && Array.isArray(p.items) ? p.items.map(it => Object.assign({ rot: 0 }, it, { id: it.id || newId() })) : [], ensemble: (p && p.ensemble) || null })) : null;
    d.partIdx = P ? Math.max(0, Math.min(P.length - 1, doc.partIdx | 0)) : 0;
    if (d.parts) { d.parts[d.partIdx].items = null; d.parts[d.partIdx].ensemble = null; }
    // 名簿・乗り番表（どの部にも共通）
    const RS = doc.roster;
    d.roster = RS && Array.isArray(RS.members) ? { pieces: (RS.pieces || []).map(String), members: RS.members.map(m => ({ part: String(m.part || ''), name: String(m.name || ''), marks: Array.isArray(m.marks) ? m.marks.map(v => String(v == null ? '' : v)) : [] })) } : null;
    // 共有リンクから開いたとき：ピンスポットの「当てる人」（部品の番号）を id に戻す
    if (d.lighting && d.lighting.spots) d.lighting.spots.forEach(sp => { const m = /^#(\d+)$/.exec(sp.target || ''); if (m && d.items[+m[1]]) sp.target = d.items[+m[1]].id; });
    // 前の「コンクール用（椅子○・譜面台×）」は、「白黒◯×」に読み替える
    if (d.options.contest && !d.options.mono) { d.options.mono = true; d.options.contest = false; }
    if (d.options.paper && d.options.paper.style === 'contest') d.options.paper.style = 'mono';
    return d;
  }
  const doc = () => S.doc;
  const opts = () => doc().options;
  const byId = id => doc().items.find(it => it.id === id);
  const selected = () => doc().items.filter(it => S.sel.has(it.id));
  const players = () => doc().items.filter(it => it.type === 'player');

  function conductor() {
    const p = doc().items.find(it => it.type === 'podium');
    if (p) return { x: p.x, y: p.y };
    return { x: doc().stage.w / 2, y: doc().stage.d - 100 };
  }

  // ------------------------------------------------------------ 元に戻す
  function snapshot() {
    const d = doc();
    // 舞台図（下絵）は、画像そのものは入れず、位置・大きさ・回転などだけを記録する
    const ul = d.underlay ? Object.assign({}, d.underlay, { src: undefined }) : null;
    if (d.underlay) S.ulSrc = d.underlay.src;
    return JSON.stringify({ title: d.title, subtitle: d.subtitle, stage: d.stage, items: d.items, options: d.options, ensemble: d.ensemble, hall: d.hall, info: d.info, ul, parts: d.parts, partIdx: d.partIdx, roster: d.roster });
  }
  function pushHistory() {
    S.undo.push(snapshot());
    if (S.undo.length > 150) S.undo.shift();
    S.redo = [];
    updateUndoButtons();
  }
  function restore(snap) {
    const u = doc().underlay;
    const p = JSON.parse(snap);
    S.doc = normalize(p);
    const src = (u && u.src) || S.ulSrc;
    S.doc.underlay = p.ul && src ? Object.assign({ src }, p.ul) : p.ul === undefined ? u : null;
    $('overlayControls').classList.toggle('hidden', !S.doc.underlay);
    if (S.doc.underlay) syncOverlayUI();
    S.sel = new Set([...S.sel].filter(id => byId(id)));
    renderAll();
    renderSteppers();
    updateHallNote();
  }
  function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); restore(S.undo.pop()); }
  function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); }
  function updateUndoButtons() {
    $('btnUndo').disabled = !S.undo.length;
    $('btnRedo').disabled = !S.redo.length;
  }

  // ------------------------------------------------------------ 描画
  function renderOpts() {
    const o = opts();
    // 白黒◯×：奏者は椅子○・譜面台×で描き、色は使わない
    return { showNames: o.showNames, showStands: o.showStands, standLegs: o.standLegs, showNumbers: o.showNumbers, colorBy: o.colorBy && !o.mono, seatR: o.seatR, grid: o.grid, gridSize: o.gridSize, figure: o.figure && !o.mono, contest: o.contest || o.mono, mono: !!o.mono, dims: o.dims, hinaDetail: o.hinaDetail !== false, showLeads: o.showLeads !== false };
  }

  const layerDimsEl = () => document.getElementById('layerDims');
  // ドラッグ中は、画面の書き直しを1コマ（約1/60秒）に1回にまとめる（動きがカクカクしないように）
  let renderRaf = 0;
  function renderSoon() {
    if (renderRaf) return;
    renderRaf = requestAnimationFrame(() => { renderRaf = 0; render(); });
  }
  function renderNow() { if (renderRaf) { cancelAnimationFrame(renderRaf); renderRaf = 0; render(); } }
  function render() {
    const d = doc();
    ['layerStage', 'layerItems', 'layerDims'].forEach(id => $(id).classList.toggle('mono', !!opts().mono));
    layerStage.innerHTML = SS.render.stageSVG(d, opts().grid ? (opts().gridSize || 50) : 0);
    const u = d.underlay;
    layerUnderlay.innerHTML = u ? SS.render.underlaySVG(u, { edit: S.underlayEdit, k: S.view.k, id: 'main' }) : '';
    // 「図を奏者より上に」：下絵の層を部品の層の後ろ（上）に移す
    const onTop = !!(u && u.onTop);
    if (onTop !== (layerUnderlay.nextElementSibling === layerDimsEl())) {
      if (onTop) layerItems.after(layerUnderlay); else layerItems.before(layerUnderlay);
    }
    layerItems.innerHTML = SS.render.itemsSVG(d, renderOpts(), conductor(), true);
    S.warnings = SS.checks ? SS.checks(d) : [];
    renderWarnList();
    renderCompareBar();
    renderPartBar();
    renderFoldSummaries();
    renderOverlay();
    scheduleSave();
  }

  // ------------------------------------------------------------ 前の版・保存した配置図とくらべる
  function startCompare(name, base) {
    S.trans = null;
    S.compare = { name, items: JSON.parse(JSON.stringify(base.items || [])) };
    closeModal();
    render();
    fitView();
    const df = SS.render.diffItems(S.compare.items, doc().items);
    toast(df.added.length + df.removed.length + df.moved.length ? `「${name}」とくらべています（○＋ 増えた・□− 減った・→ 動いた）` : `「${name}」と違うところはありません`);
  }
  function renderCompareBar() {
    const bar = $('cmpBar');
    if (S.blocks) {
      bar.hidden = false;
      bar.innerHTML = `<span>🧩 <b>パートのかたまり</b>：ドラッグで動かす。ほかのパートの上で離すと並び順を入れかえ</span><button class="btn" id="blkStop">終わる</button>`;
      $('blkStop').onclick = () => setBlocks(false);
      return;
    }
    if (S.trans && doc().parts && doc().parts[S.trans.a] && doc().parts[S.trans.b]) {
      const r = transResult();
      // 出入り口（そで）ごとの数：「（下手 6・上手 4）」
      const by = k => { const es = r.byExit.filter(e => e[k].length); return es.length > 1 ? `<small>（${es.map(e => `${SS.esc(e.name.replace(/のそで$/, ''))} ${e[k].length}`).join('・')}）</small>` : es.length ? `<small>（${SS.esc(es[0].name.replace(/のそで$/, ''))}）</small>` : ''; };
      bar.hidden = false;
      bar.innerHTML = `<span>🔁 ${SS.esc(partName(S.trans.a))} → ${SS.esc(partName(S.trans.b))} の転換：<span class="cmp-n r">×はける ${r.remove.length}</span>${by('remove')} <span class="cmp-n g">○出す ${r.add.length}</span>${by('add')} <span class="cmp-n o">→動かす ${r.move.length}</span></span><button class="btn" id="trOpen">計画を見る</button><button class="btn" id="trStop">印を消す</button>`;
      $('trOpen').onclick = () => openTransModal(S.trans.a, S.trans.b);
      $('trStop').onclick = () => { S.trans = null; render(); };
      return;
    }
    S.trans = null;
    if (!S.compare) { bar.hidden = true; return; }
    const df = SS.render.diffItems(S.compare.items, doc().items);
    const sum = SS.render.diffSummary(df);
    bar.hidden = false;
    bar.innerHTML = `<span>🔍 「${SS.esc(S.compare.name)}」とくらべて：<span class="cmp-n g">○＋${df.added.length}</span> <span class="cmp-n r">□−${df.removed.length}</span> <span class="cmp-n o">→${df.moved.length}</span></span>
      ${sum ? `<button class="btn" id="cmpNote" title="${SS.esc(sum)}">変更の内容に入れる</button>` : ''}<button class="btn" id="cmpStop">くらべるのをやめる</button>`;
    $('cmpStop').onclick = () => { S.compare = null; render(); };
    if ($('cmpNote')) $('cmpNote').onclick = () => {
      pushHistory();
      doc().info.changeNote = `第${doc().info.version || 1}版：${sum}`;
      renderSettings(); scheduleSave(); render();
      toast(`変更の内容を「${doc().info.changeNote}」にしました（「📤 書き出す」の画面の「図面の情報欄」で直せます）`, true);
    };
  }

  // ------------------------------------------------------------ 1部・2部・3部と、転換の計画
  // いま開いている部の中身は doc.items・doc.ensemble にある。ほかの部は doc.parts[i].items・ensemble
  function partItems(i) { const d = doc(); return i === d.partIdx ? d.items : (d.parts[i].items || []); }
  const partName = i => (doc().parts && doc().parts[i] ? doc().parts[i].name : '');
  function switchPart(j) {
    const d = doc();
    if (!d.parts || j === d.partIdx || !d.parts[j]) return;
    const cur = d.parts[d.partIdx], nx = d.parts[j];
    cur.items = d.items; cur.ensemble = d.ensemble;
    d.items = nx.items || []; d.ensemble = nx.ensemble || null;
    nx.items = null; nx.ensemble = null;
    d.partIdx = j;
    S.sel.clear();
    if (S.trans && S.trans.b !== j) S.trans = null;
    renderAll(); renderSteppers(); updateHallNote();
  }
  function addPart(copy) {
    pushHistory();
    const d = doc();
    if (!d.parts) { d.parts = [{ name: '第1部', items: null, ensemble: null }]; d.partIdx = 0; }
    // 何もない舞台：出入り口・花道・コンセントだけ残す（ホールの物）
    const KEEP = new Set(['door', 'runway', 'outlet', 'tap']);
    const items = JSON.parse(JSON.stringify(copy ? d.items : d.items.filter(it => KEEP.has(it.type))));
    const name = `第${d.parts.length + 1}部`;
    d.parts.push({ name, items, ensemble: copy && d.ensemble ? JSON.parse(JSON.stringify(d.ensemble)) : null });
    switchPart(d.parts.length - 1);
    toast(copy ? `「${name}」を作りました（前の部のコピー）。増える人・減る人・動く物を直してください` : `「${name}」を作りました（何もない舞台）`, true);
  }
  function deletePart(i) {
    const d = doc();
    if (!d.parts || !d.parts[i]) return;
    pushHistory();
    if (i === d.partIdx) switchPart(i > 0 ? i - 1 : 1);
    d.parts.splice(i, 1);
    if (d.partIdx > i) d.partIdx--;
    if (d.parts.length < 2) { d.parts = null; d.partIdx = 0; }
    S.trans = null;
    renderAll(); renderSteppers(); updateHallNote();
  }
  function movePart(i, dir) {
    const d = doc(), j = i + dir;
    if (!d.parts || !d.parts[i] || !d.parts[j]) return;
    pushHistory();
    [d.parts[i], d.parts[j]] = [d.parts[j], d.parts[i]];
    if (d.partIdx === i) d.partIdx = j; else if (d.partIdx === j) d.partIdx = i;
    S.trans = null;
    render();
  }
  // 舞台図の上の部のタブ（1つだけのときは「＋ 2部を作る」）
  let partBarKey = '';
  function renderPartBar() {
    const bar = $('partBar'), d = doc();
    const key = d.parts ? d.partIdx + '|' + d.parts.map(p => p.name).join('|') + (S.trans ? '|t' : '') : '-';
    document.body.classList.toggle('has-parts', !!d.parts);
    if (key === partBarKey && bar.childElementCount) return;
    partBarKey = key;
    if (!d.parts) {
      bar.innerHTML = `<button class="pb-btn" id="pbNew" title="演奏会の1部・2部…を別々の配置図で作り、転換（いすを何脚はけるか・どう動かすか）の計画を立てます">＋ 2部を作る</button>`;
      $('pbNew').onclick = openPartsModal;
      return;
    }
    bar.innerHTML = d.parts.map((p, i) => `<button class="pb-tab${i === d.partIdx ? ' on' : ''}" data-part="${i}" title="${SS.esc(p.name)}">${SS.esc(p.name)}</button>`).join('') +
      `<button class="pb-btn" id="pbManage" title="部を足す・名前・順番・消す">＋</button><button class="pb-btn pb-trans${S.trans ? ' on' : ''}" id="pbTrans" title="部と部の間の転換の計画（はける・出す・動かす）">🔁 転換</button>`;
    bar.querySelectorAll('[data-part]').forEach(b => { b.onclick = () => { const j = +b.getAttribute('data-part'); if (j === doc().partIdx) openPartsModal(); else switchPart(j); }; });
    $('pbManage').onclick = openPartsModal;
    $('pbTrans').onclick = () => openTransModal();
  }
  function openPartsModal() {
    const d = doc(), ps = d.parts || [{ name: '第1部' }], cur = d.parts ? d.partIdx : 0;
    const nPl = i => (d.parts ? partItems(i) : d.items).filter(it => it.type === 'player').length;
    openModal(`<h2>📑 1部・2部・3部</h2>
      <p class="hint">演奏会の部ごとに配置図を作れます（舞台の大きさ・ホールの設備はどの部も同じ）。部と部の間の <b>🔁 転換</b> を押すと、<b>いすを何脚はけるか・どう動かすとよいか</b>の計画が出ます。</p>
      <ol class="part-list">${ps.map((p, i) => `<li${i === cur ? ' class="on"' : ''}>${d.parts ? `<input type="text" data-pname="${i}" value="${SS.esc(p.name)}" aria-label="部の名前" maxlength="20">` : '<span class="pl-name">いまの配置図（第1部になります）</span>'}<span class="small">${nPl(i)}人</span>${d.parts ? `<span class="pl-btns"><button class="btn" data-popen="${i}"${i === cur ? ' disabled' : ''}>${i === cur ? '開いています' : '開く'}</button><button class="btn" data-pmove="${i}|-1"${i === 0 ? ' disabled' : ''} title="前へ" aria-label="前へ">↑</button><button class="btn" data-pmove="${i}|1"${i === ps.length - 1 ? ' disabled' : ''} title="後ろへ" aria-label="後ろへ">↓</button><button class="btn danger" data-pdel="${i}" title="この部を消す" aria-label="この部を消す">✕</button></span>` : ''}</li>`).join('')}</ol>
      <div class="btn-row"><button class="btn primary" id="pAddCopy">＋ いまの部をコピーして次の部を作る</button><button class="btn" id="pAddBlank">＋ 何もない舞台で作る</button></div>
      <p class="hint small">コピーして作ると、同じ配置から「増える人・減る人・動く物」だけ直せばよいので楽です。書き出す図面には部の名前が入ります。</p>`);
    $('pAddCopy').onclick = () => { closeModal(); addPart(true); };
    $('pAddBlank').onclick = () => { closeModal(); addPart(false); };
    document.querySelectorAll('[data-pname]').forEach(inp => {
      inp.addEventListener('focus', () => pushHistory());
      inp.addEventListener('change', () => { const i = +inp.getAttribute('data-pname'); doc().parts[i].name = inp.value.trim() || `第${i + 1}部`; render(); });
    });
    document.querySelectorAll('[data-popen]').forEach(b => { b.onclick = () => { closeModal(); switchPart(+b.getAttribute('data-popen')); }; });
    document.querySelectorAll('[data-pmove]').forEach(b => { b.onclick = () => { const [i, dir] = b.getAttribute('data-pmove').split('|').map(Number); movePart(i, dir); openPartsModal(); }; });
    document.querySelectorAll('[data-pdel]').forEach(b => {
      b.onclick = () => { const i = +b.getAttribute('data-pdel'); askConfirm(`「${partName(i)}」を消します。\n（あとで「戻す」で元に戻せます）`, '消す', () => deletePart(i)); };
    });
  }
  // 転換の計画（S.trans = { a: 前の部, b: 次の部 }）。次の部を開いて、図に印を出す
  function transResult() { return SS.changeover(partItems(S.trans.a), partItems(S.trans.b), doc().stage, renderOpts()); }
  function transPair() {
    const d = doc();
    if (S.trans) return [S.trans.a, S.trans.b];
    return d.partIdx > 0 ? [d.partIdx - 1, d.partIdx] : [0, 1];
  }
  function startTrans(a, b) {
    S.compare = null;
    S.trans = { a, b };
    if (doc().partIdx !== b) switchPart(b); else render();
  }
  function openTransModal(a, b) {
    const d = doc();
    if (!d.parts) return;
    if (a == null) [a, b] = transPair();
    const sel = (id, v) => `<select id="${id}">${d.parts.map((p, i) => `<option value="${i}"${i === v ? ' selected' : ''}>${SS.esc(p.name)}</option>`).join('')}</select>`;
    let body = '';
    if (a === b) body = '<p class="hint">ちがう部をえらんでください。</p>';
    else {
      const res = SS.changeover(partItems(a), partItems(b), d.stage, renderOpts());
      const nR = res.remove.length, nA = res.add.length, nM = res.move.length;
      const cell = n => (n ? n : '<span class="co-zero">·</span>');
      const chg = r => r.remove || r.add || r.move;
      const same = res.rows.filter(r => !chg(r));
      const T = res.tiers, nT = T.change.length + T.add.length + T.remove.length + T.move.length;
      const rows = res.rows.filter(chg).map(r => `<tr><th>${SS.esc(r.name)}</th><td>${r.before}</td><td>${r.after}</td><td class="r">${cell(r.remove)}</td><td class="g">${cell(r.add)}</td><td class="o">${cell(r.move)}</td></tr>`).join('');
      const pan = res.panels.map(p => `<tr class="co-pan"><th>${SS.esc(p.name)}</th><td>${p.before}</td><td>${p.after}</td><td class="r">${p.after < p.before ? p.before - p.after : cell(0)}</td><td class="g">${p.after > p.before ? p.after - p.before : cell(0)}</td><td class="o">${cell(0)}</td></tr>`).join('');
      const steps = SS.changeoverSteps(res, d.stage);
      body = `<p class="co-head">奏者 ${res.players.before}人 → ${res.players.after}人　／　運ぶ物：<b class="r">× はける ${nR}</b>・<b class="g">○ 出す ${nA}</b>・<b class="o">→ 動かす ${nM}</b>（そのまま ${res.keep.length}）${nT || res.panels.length ? `<br><b class="o">ひな壇の組み替えがあります</b>（${nT}段）` : ''}</p>
        ${rows || pan ? `<div class="co-scroll"><table class="co-table"><thead><tr><th>物</th><th>${SS.esc(partName(a))}</th><th>${SS.esc(partName(b))}</th><th class="r">はける</th><th class="g">出す</th><th class="o">動かす</th></tr></thead><tbody>${rows}${pan}</tbody></table></div>` : ''}
        ${same.length ? `<details class="co-same"><summary>変わらない物（${same.length}種類）</summary><p class="small">${same.map(r => `${SS.esc(r.name)} ${r.after}${r.unit}`).join('・')}</p></details>` : ''}
        <h3>おすすめの手順</h3>
        ${steps.length ? `<ol class="co-steps">${steps.map(st => `<li><b>${st.title}</b>${st.lines.map(l => `<div>${SS.esc(l)}</div>`).join('')}<div class="small">${st.note}</div></li>`).join('')}</ol>` : '<p>変えるものはありません。</p>'}
        <p class="hint small">${res.exits.wings ? 'はける先・出す元は、近いほうのそで（下手・上手）にしています。「部品」の <b>出入り口（扉）</b> を置くと、その出入り口ごとに分けます。' : 'はける先・出す元は、いちばん近い出入り口にしています。'}いす・譜面台はどれも同じ物として、近い物どうしを組にしています（20cm以内はそのまま）。</p>`;
    }
    openModal(`<h2>🔁 転換の計画</h2>
      <div class="co-pick">${sel('coA', a)}<span>→</span>${sel('coB', b)}</div>
      ${body}
      <div class="btn-row">${a !== b ? `<button class="btn primary" id="coShow">🗺 図で見る（${SS.esc(partName(b))}に印）</button><button class="btn" id="coCopy">📋 文字でコピー</button><button class="btn" id="coSave">⬇ 文字で保存</button>` : ''}</div>`);
    const re = () => openTransModal(+$('coA').value, +$('coB').value);
    $('coA').onchange = re; $('coB').onchange = re;
    if (a === b) return;
    const text = () => SS.changeoverText(SS.changeover(partItems(a), partItems(b), d.stage, renderOpts()), d.stage, partName(a), partName(b));
    $('coShow').onclick = () => { closeModal(); startTrans(a, b); fitView(); toast('× はける・○ 出す・→ 動かす を図に出しました。この部を直すと、印もすぐ変わります'); };
    $('coCopy').onclick = async () => { try { await navigator.clipboard.writeText(text()); toast('転換の計画を文字でコピーしました'); } catch (e) { toast('コピーできませんでした。「文字で保存」を使ってください'); } };
    $('coSave').onclick = () => SS.render.download(new Blob([text()], { type: 'text/plain;charset=utf-8' }), SS.render.safeName(`${doc().title || '転換'}_${partName(a)}から${partName(b)}`) + '.txt');
  }

  // ------------------------------------------------------------ 名簿・乗り番表（個人名）
  const RSx = () => SS.roster;
  // 編成のパート名（名簿のパート名をそろえるのに使う）
  function knownParts() {
    const st = doc().ensemble, set = new Set();
    if (st && SS.auto.ENSEMBLES[st.type]) SS.auto.ENSEMBLES[st.type].parts.forEach(([k]) => set.add(k));
    players().forEach(p => { if (p.label) set.add(p.label); });
    return [...set];
  }
  // いまの舞台の奏者から名簿の様式の行を作る（パートの順は編成の順、名前は前の列・下手から）
  function stageParts() {
    const st = doc().ensemble, order = st && SS.auto.ENSEMBLES[st.type] ? SS.auto.ENSEMBLES[st.type].parts.map(([k]) => k) : [];
    const by = {};
    players().forEach(p => { const k = p.label || ''; (by[k] = by[k] || []).push(p); });
    const labs = Object.keys(by).sort((a, b) => ((order.indexOf(a) + 1) || 999) - ((order.indexOf(b) + 1) || 999));
    return labs.filter(Boolean).map(k => { const ps = G.seatOrder(by[k], conductor()).sort((a, b) => (b.lead ? 1 : 0) - (a.lead ? 1 : 0)); return [k, ps.length, ps.map(p => p.name || '')]; });
  }
  const rosterFileName = () => SS.render.safeName(`${doc().title || 'メンバー'}_名簿・乗り番表`) + '.csv';
  function downloadRoster() {
    const rows = RSx().rows(doc().roster, stageParts());
    SS.render.download(new Blob([RSx().toCSV(rows)], { type: 'text/csv;charset=utf-8' }), rosterFileName());
    toast(doc().roster ? '名簿・乗り番表を保存しました（Excelで直して、また取り込めます）' : '取り込み様式を保存しました。Excelで名前を書いて、「取り込む」で読み込んでください', false);
  }
  // 取り込んだ名簿を入れて、舞台図に名前を入れる（席の数・編成は変えない）。結果は名簿の画面の中に出す
  function importRoster(text, src) {
    const r = RSx().parse(text, knownParts());
    S.rosterBad = r.bad || [];
    if (!r.members.length) {
      S.rosterMsg = { err: r.error || `${src}から名前を読み取れませんでした。1列目にパート、2列目に名前（「Ob 小林」「小林（Ob）」も読めます）` };
      openRosterModal();
      return;
    }
    pushHistory();
    doc().roster = { members: r.members, pieces: r.pieces };
    const res = applyRoster(null, false, true);
    S.rosterMsg = { read: r.members.length, pieces: r.pieces.length, res, unknown: r.unknown };
    openRosterModal();
  }
  // 名簿（曲 j に乗る人）の人数に合わせたときの、かんたん編成のパートごとの人数の変化
  function rosterCountPlan(j) {
    const RS = doc().roster, st = doc().ensemble;
    if (!RS || !st || !doc().items.some(it => it.auto)) return [];
    const cnt0 = RSx().onCounts(RS, j), keys = SS.auto.ENSEMBLES[st.type].parts.map(([k]) => k);
    // 吹奏楽などの「Perc」の人数には、ティンパニ（Timp）の人も入る
    const keyOf = p => (keys.includes(p) ? p : p === 'Timp' && keys.includes('Perc') ? 'Perc' : null);
    const cnt = {};
    Object.keys(cnt0).forEach(p => { const k = keyOf(p); if (k) cnt[k] = (cnt[k] || 0) + cnt0[p]; });
    return Object.keys(cnt).filter(p => (st.counts[p] || 0) !== cnt[p]).map(p => ({ p, from: st.counts[p] || 0, to: cnt[p] }));
  }
  /**
   * 名簿を舞台図に反映：j＝曲（null は全員）。withCounts：かんたん編成の人数も名簿（その曲に乗る人数）に合わせる
   * （人数が減るときは、先に rosterApplyAsk で確かめる）
   */
  function applyRoster(j, withCounts, noHistory) {
    const RS = doc().roster;
    if (!RS || !RS.members.length) return null;
    if (!noHistory) pushHistory();
    if (withCounts) {
      const plan = rosterCountPlan(j);
      plan.forEach(c => { ens().counts[c.p] = c.to; });
      if (plan.length) applyAuto({ noHistory: true, quiet: true });
    }
    const res = RSx().assign(players(), RS, j, conductor());
    opts().showNames = true;
    renderAll(); renderSteppers();
    return res;
  }
  // 人数が減るときは、どのパートが何人になるかを見せてから
  function rosterApplyAsk(j, withCounts, done) {
    const down = withCounts ? rosterCountPlan(j).filter(c => c.to < c.from) : [];
    if (!down.length) { done(applyRoster(j, withCounts)); return; }
    const n = down.reduce((a, c) => a + c.from - c.to, 0);
    askConfirm(`${down.slice(0, 5).map(c => `${c.p} ${c.from}人→${c.to}人`).join('、')}${down.length > 5 ? ' など' : ''}、合わせて${n}人減ります。\nよいですか？（あとで「戻す」で元に戻せます）`, `${n}人減らして並べ直す`, () => done(applyRoster(j, true)));
  }
  // 名簿の画面の中に出す結果（舞台図に入れた人数・入れられなかった名前と理由・名前のない席）
  function rosterResultHTML(M) {
    if (!M) return '';
    if (M.err) return `<div class="rs-result err">⚠ ${SS.esc(M.err)}</div>`;
    const res = M.res || { placed: 0, notPlaced: [], empty: {} };
    const em = Object.keys(res.empty).map(k => `${SS.esc(k)} ${res.empty[k]}席`);
    const auto = doc().ensemble && doc().items.some(it => it.auto);
    let h = `<div class="rs-result"><b>✔ ${M.read != null ? `${M.read}人${M.pieces ? `・${M.pieces}曲` : ''}を読み込みました。` : ''}舞台図に${res.placed}人の名前を入れました</b>${M.piece ? `（「${SS.esc(M.piece)}」）` : ''}${M.counted ? '' : '<span class="small">（席の数・編成は変えていません）</span>'}`;
    if (res.notPlaced.length) h += `<div class="rs-np"><b>舞台図に入れられなかった名前（${res.notPlaced.length}人）</b><ul>${res.notPlaced.map(x => `<li>${SS.esc(x.name)}（${SS.esc(x.part)}）：${SS.esc(x.reason)}</li>`).join('')}</ul>${auto ? '<span class="small">席を増やすときは、下の「人数も名簿に合わせる」をオンにして「舞台図に名前を入れる」を押します。</span>' : '<span class="small">席を足してから、もう一度「舞台図に名前を入れる」を押してください。</span>'}</div>`;
    if (em.length) h += `<div class="small">名前のない席：${em.join('・')}</div>`;
    if (M.unknown && M.unknown.length) h += `<div class="small">編成にないパート：${M.unknown.map(SS.esc).join('・')}</div>`;
    return h + '</div>';
  }
  // 読めなかった行（その場でパートと名前を直して名簿に入れる）
  function rosterBadHTML() {
    const bad = S.rosterBad || [];
    if (!bad.length) return '';
    const parts = knownParts().concat(Object.keys(RSx().GROUPS));
    const guess = line => line.replace(/[（(［\[].*?[)）］\]]/g, '').replace(/[:：]/g, ' ').trim();
    return `<div class="rs-bad"><b>読めなかった行（${bad.length}行）</b><span class="small">パートをえらんで「名簿に入れる」を押すと直せます</span>
      ${bad.map((b, i) => `<div class="rs-bad-row"><div><span class="rs-line">${SS.esc(b.line)}</span><small>${SS.esc(b.reason)}</small></div>
        <div class="rs-fix"><select data-bp="${i}" aria-label="パート"><option value="">パート</option>${parts.map(p => `<option>${SS.esc(p)}</option>`).join('')}</select><input type="text" data-bn="${i}" value="${SS.esc(guess(b.line))}" aria-label="名前"><button type="button" class="btn" data-bfix="${i}">名簿に入れる</button><button type="button" class="btn" data-bskip="${i}" title="この行は使わない">✕</button></div></div>`).join('')}</div>`;
  }
  // 曲ごとに部を作る（1曲目はいまの部。部がすでにあれば後ろに足す）
  function piecesToParts() {
    const RS = doc().roster, n = RS.pieces.length;
    askConfirm(`${n}曲それぞれの配置図を「部」として、いまの配置図の後ろに作ります（${RS.pieces.join('・')}）。\nそれぞれの曲に乗る人の人数・名前で並べます（いまの配置図は変えません）。部と部の間の「🔁 転換」で、いすを何脚はけるかの計画も見られます。`, '作る', () => {
      const d = doc();
      for (let i = 0; i < n; i++) {
        addPart(true);
        d.parts[d.partIdx].name = RS.pieces[i].slice(0, 20) || `${i + 1}曲目`;
        applyRoster(i, true, true);
      }
      render();
      toast(`${n}曲の部を作りました。左下のタブで切りかえ、「🔁 転換」で曲の間の計画が見られます`);
    });
  }
  function printRoster() {
    const RS = doc().roster;
    if (!RS) return;
    const ps = RS.pieces, esc = SS.esc;
    const cnt = ps.map((_, j) => RSx().onMembers(RS, j).length);
    let rows = '', last = null;
    RS.members.forEach(m => {
      rows += `<tr${m.part !== last ? ' class="top"' : ''}><td>${m.part !== last ? esc(m.part) : ''}</td><td>${esc(m.name)}</td>${ps.map((_, j) => `<td class="c">${esc(RSx().markText(m.marks[j]))}</td>`).join('')}</tr>`;
      last = m.part;
    });
    const title = (doc().title ? doc().title + '　' : '') + (ps.length ? '乗り番表' : '名簿');
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic",Meiryo,sans-serif;margin:12mm;color:#111}
      h1{font-size:18px;margin:0 0 8px} p{font-size:11px;color:#555;margin:0 0 8px}
      table{border-collapse:collapse;font-size:12px;width:100%} th,td{border:1px solid #999;padding:3px 6px}
      th{background:#eef1f6} td.c{text-align:center;min-width:3em} tr.top td{border-top:2px solid #333} tfoot td{background:#f6f6f6;font-weight:700}
      @page{size:A4 ${ps.length > 6 ? 'landscape' : 'portrait'};margin:10mm}</style></head><body>
      <h1>${esc(title)}</h1>${ps.length ? '<p>○＝乗り・空欄＝降り（ほかの字はメモ：持ち替えなど）</p>' : ''}
      <table><thead><tr><th>パート</th><th>名前</th>${ps.map(p => `<th>${esc(p)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody>
      ${ps.length ? `<tfoot><tr><td colspan="2">乗る人数</td>${cnt.map(n => `<td class="c">${n}</td>`).join('')}</tr></tfoot>` : ''}</table></body></html>`;
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('印刷できませんでした。「Excel用で保存」から印刷してください'); } setTimeout(() => f.remove(), 2000); }, 300);
  }
  function openRosterModal() {
    const RS = doc().roster, has = RS && RS.members.length, ps = has ? RS.pieces : [];
    const st = doc().ensemble, auto = st && doc().items.some(it => it.auto);
    const cell = (m, r, j) => { const t = RSx().markText(m.marks[j]); return `<td class="rs-c"><button type="button" class="rs-mark${t ? ' on' : ''}" data-mk="${r}|${j}" title="${t ? '乗り（押すと降り）' : '降り（押すと乗り）'}">${t ? SS.esc(t) : '　'}</button></td>`; };
    let body = '';
    if (has) {
      let last = null;
      const rows = RS.members.map((m, r) => {
        const top = m.part !== last; last = m.part;
        return `<tr${top ? ' class="rs-top"' : ''}><td><input type="text" data-rp="${r}" value="${SS.esc(m.part)}" aria-label="パート" class="rs-part"></td><td><input type="text" data-rn="${r}" value="${SS.esc(m.name)}" aria-label="名前" placeholder="名前"></td>${ps.map((_, j) => cell(m, r, j)).join('')}<td class="rs-ops"><button type="button" data-radd="${r}" title="この下に同じパートの人を足す" aria-label="人を足す">＋</button><button type="button" data-rdel="${r}" title="この人を消す" aria-label="消す">✕</button></td></tr>`;
      }).join('');
      const foot = ps.length ? `<tfoot><tr><td colspan="2">乗る人数</td>${ps.map((_, j) => `<td class="rs-c">${RSx().onMembers(RS, j).length}</td>`).join('')}<td></td></tr></tfoot>` : '';
      body = `<div class="rs-apply">
          <label class="field">舞台図に入れる人<select id="rsPiece"><option value="">全員</option>${ps.map((p, j) => `<option value="${j}">「${SS.esc(p)}」に乗る人</option>`).join('')}</select></label>
          ${auto ? '<label class="check"><input type="checkbox" id="rsCounts"> 人数も名簿に合わせる（かんたん編成。減るときは確認します）</label>' : ''}
          <div class="btn-row"><button class="btn primary" id="rsApply">舞台図に名前を入れる</button>${ps.length >= 2 ? '<button class="btn" id="rsParts">🎼 曲ごとに部を作る</button>' : ''}</div>
        </div>
        <div class="rs-scroll"><table class="rs-table"><thead><tr><th>パート</th><th>名前</th>${ps.map((p, j) => `<th class="rs-c"><input type="text" data-pc="${j}" value="${SS.esc(p)}" aria-label="曲名"><button type="button" data-pcdel="${j}" title="この曲を消す" aria-label="この曲を消す">✕</button></th>`).join('')}<th><button type="button" class="btn" id="rsAddPiece" title="曲（乗り番の列）を足す">＋曲</button></th></tr></thead><tbody>${rows}</tbody>${foot}</table></div>
        <p class="hint small">${ps.length ? '○＝乗り・空欄＝降り（押すと切りかわります）。「持ち替え」などのメモは、Excelの様式で書けます。' : '「＋曲」で曲ごとの乗り番（○＝乗り・空欄＝降り）を作れます。'}名前や乗り番を直したら「舞台図に名前を入れる」で舞台図に入ります。</p>
        <div class="btn-row"><button class="btn" id="rsCsv">⬇ Excel用（CSV）で保存</button><button class="btn" id="rsPrint">🖨 ${ps.length ? '乗り番表' : '名簿'}を印刷</button><button class="btn danger" id="rsClear">名簿を消す</button></div>`;
    } else {
      body = `<ol class="rs-steps"><li><b>取り込み様式</b>をダウンロード（いまの舞台のパートと人数の行ができています）</li><li>Excel・Googleスプレッドシートで開いて、<b>パートごとに名前</b>を書く（曲の列に ○＝乗り・空欄＝降り。曲名も書きかえられます）</li><li>保存して <b>「取り込む」</b>。舞台図の席に名前が入ります</li></ol>
        <div class="btn-row"><button class="btn" id="rsFromStage">いまの舞台図から名簿を作る</button></div>`;
    }
    const msg = rosterResultHTML(S.rosterMsg) + rosterBadHTML();
    S.rosterMsg = null;
    openModal(`<h2>👥 名簿・乗り番表</h2>
      ${msg}
      <p class="hint">パートごとに名前を入れると、舞台図の席に名前が入ります。曲ごとの乗り番（○＝乗り・空欄＝降り）から、その曲の人数・名前の舞台図も作れます。</p>
      <div class="btn-row rs-io"><button class="btn${has ? '' : ' primary'}" id="rsTpl">⬇ ${has ? '名簿をExcel用で保存' : '取り込み様式をダウンロード'}</button><label class="btn filebtn${has ? '' : ' primary'}">⬆ 取り込む<input type="file" id="rsFile" accept=".csv,.tsv,.txt,text/csv" hidden></label><button class="btn" id="rsPasteBtn">📋 Excelから貼り付け</button></div>
      <div id="rsPasteBox" hidden><textarea id="rsPasteText" rows="6" placeholder="Excelで「パート」「名前」（と曲）の列をえらんでコピーし、ここに貼り付け"></textarea><button class="btn primary" id="rsPasteGo">読み込む</button></div>
      ${body}`);
    $('rsTpl').onclick = downloadRoster;
    $('rsFile').onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => importRoster(String(rd.result), 'ファイル'); rd.readAsText(f, 'utf-8'); };
    $('rsPasteBtn').onclick = () => { $('rsPasteBox').hidden = !$('rsPasteBox').hidden; if (!$('rsPasteBox').hidden) $('rsPasteText').focus(); };
    $('rsPasteGo').onclick = () => importRoster($('rsPasteText').value, '貼り付けた文');
    // 読めなかった行を直して名簿に入れる
    document.querySelectorAll('[data-bfix]').forEach(b => b.onclick = () => {
      const i = +b.getAttribute('data-bfix'), part = document.querySelector(`[data-bp="${i}"]`).value, name = document.querySelector(`[data-bn="${i}"]`).value.trim();
      if (!part) return toast('パートをえらんでください');
      if (!name) return toast('名前を入れてください');
      pushHistory();
      const RS0 = doc().roster || (doc().roster = { pieces: [], members: [] });
      RS0.members.push({ part, name, marks: RS0.pieces.map(() => '○') });
      S.rosterBad.splice(i, 1);
      const res = applyRoster(null, false, true);
      S.rosterMsg = { res, fixed: name };
      openRosterModal();
    });
    document.querySelectorAll('[data-bskip]').forEach(b => b.onclick = () => { S.rosterBad.splice(+b.getAttribute('data-bskip'), 1); openRosterModal(); });
    if (!has) {
      $('rsFromStage').onclick = () => {
        const rows = RSx().rows(null, stageParts()).slice(1);
        if (!rows.length) return toast('舞台に奏者がいません');
        pushHistory();
        doc().roster = { pieces: [], members: rows.map(r => ({ part: r[0], name: r[1], marks: [] })) };
        openRosterModal();
      };
      return;
    }
    const R2 = doc().roster;
    const edit = fn => { fn(); scheduleSave(); };
    document.querySelectorAll('#modalBody [data-rp],#modalBody [data-rn],#modalBody [data-pc]').forEach(inp => inp.addEventListener('focus', () => pushHistory()));
    document.querySelectorAll('[data-rp]').forEach(inp => inp.addEventListener('change', () => edit(() => { R2.members[+inp.getAttribute('data-rp')].part = RSx().matchPart(inp.value, knownParts()); })));
    document.querySelectorAll('[data-rn]').forEach(inp => inp.addEventListener('change', () => edit(() => { R2.members[+inp.getAttribute('data-rn')].name = inp.value.trim(); })));
    document.querySelectorAll('[data-pc]').forEach(inp => inp.addEventListener('change', () => edit(() => { R2.pieces[+inp.getAttribute('data-pc')] = inp.value.trim() || `${+inp.getAttribute('data-pc') + 1}曲目`; })));
    document.querySelectorAll('[data-mk]').forEach(b => b.onclick = () => {
      const [r, j] = b.getAttribute('data-mk').split('|').map(Number), m = R2.members[r];
      pushHistory();
      m.marks[j] = RSx().isOn(m.marks[j]) ? '' : '○';
      scheduleSave(); openRosterModal();
    });
    document.querySelectorAll('[data-radd]').forEach(b => b.onclick = () => { const r = +b.getAttribute('data-radd'); pushHistory(); R2.members.splice(r + 1, 0, { part: R2.members[r].part, name: '', marks: R2.pieces.map(() => '○') }); scheduleSave(); openRosterModal(); const inp = document.querySelector(`[data-rn="${r + 1}"]`); if (inp) inp.focus(); });
    document.querySelectorAll('[data-rdel]').forEach(b => b.onclick = () => { pushHistory(); R2.members.splice(+b.getAttribute('data-rdel'), 1); scheduleSave(); openRosterModal(); });
    document.querySelectorAll('[data-pcdel]').forEach(b => b.onclick = () => { const j = +b.getAttribute('data-pcdel'); pushHistory(); R2.pieces.splice(j, 1); R2.members.forEach(m => m.marks.splice(j, 1)); scheduleSave(); openRosterModal(); });
    $('rsAddPiece').onclick = () => { pushHistory(); R2.pieces.push(`${R2.pieces.length + 1}曲目`); R2.members.forEach(m => { m.marks[R2.pieces.length - 1] = '○'; }); scheduleSave(); openRosterModal(); };
    $('rsApply').onclick = () => {
      const v = $('rsPiece').value, j = v === '' ? null : +v, wc = $('rsCounts') ? $('rsCounts').checked : false;
      rosterApplyAsk(j, wc, res => { S.rosterMsg = { res, counted: wc, piece: j != null ? R2.pieces[j] : '' }; openRosterModal(); });
    };
    if ($('rsParts')) $('rsParts').onclick = () => { closeModal(); piecesToParts(); };
    $('rsCsv').onclick = downloadRoster;
    $('rsPrint').onclick = printRoster;
    $('rsClear').onclick = () => askConfirm('名簿・乗り番表を消します（舞台図の名前はそのまま）。\n（あとで「戻す」で元に戻せます）', '消す', () => { pushHistory(); doc().roster = null; scheduleSave(); openRosterModal(); });
  }
  $('btnRoster').onclick = openRosterModal;
  $('moreRoster').onclick = () => { showTabMore(false); closePanels(); openRosterModal(); };

  // ------------------------------------------------------------ パートのかたまり（パートごとに動かす・並び順を入れかえる）
  // 同じパートで、となりどうし（1.5m以内）の人を1つのかたまりにする。打楽器の楽器など、奏者といっしょに動く物も入れる
  function computeBlocks() {
    const by = new Map();
    players().forEach(p => { const k = (p.label || '').trim() || '（パートなし）'; if (!by.has(k)) by.set(k, []); by.get(k).push(p); });
    const out = [];
    by.forEach((ps, label) => {
      const left = new Set(ps);
      while (left.size) {
        const first = left.values().next().value, grp = [first];
        left.delete(first);
        for (let i = 0; i < grp.length; i++) left.forEach(q => { if (Math.hypot(q.x - grp[i].x, q.y - grp[i].y) <= 150) { grp.push(q); left.delete(q); } });
        const all = new Set(grp);
        grp.forEach(p => matesOf(p).forEach(m => all.add(m)));
        const cx = grp.reduce((a, p) => a + p.x, 0) / grp.length, cy = grp.reduce((a, p) => a + p.y, 0) / grp.length;
        out.push({ key: label + '@' + out.length, label, members: grp, all: [...all], cx, cy });
      }
    });
    return out;
  }
  // 凸包（かたまりの外形）
  function hullOf(pts) {
    const P = pts.map(p => [p.x, p.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (P.length < 3) return P;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    P.forEach(p => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    P.slice().reverse().forEach(p => { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); });
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function blocksSVG(k) {
    S.blockList = computeBlocks();
    const fs = Math.max(12, 12.5 / k), tgt = S.blockTarget, dragKey = drag && drag.kind === 'block' ? drag.blk.key : null;
    let s = '', labels = '';
    S.blockList.forEach(b => {
      const h = hullOf(b.members), col = SS.partGroup ? SS.partGroup(b.label).color : '#6b7686';
      const on = tgt && tgt.key === b.key, me = dragKey && b.members.includes(drag.blk.members[0]);
      const d = h.length === 1 ? `M${h[0][0]} ${h[0][1]}h0.1` : 'M' + h.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z';
      // ふちどり（少し太い濃い線）の上に、パートの色（かたまりの人より36cm外まで）
      s += `<path d="${d}" fill="#39414d" fill-opacity=".5" stroke="#39414d" stroke-opacity=".5" stroke-width="${(72 + 5 / k).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>`;
      s += `<path d="${d}" fill="${col}" fill-opacity="${me ? 0.95 : 0.8}" stroke="${col}" stroke-opacity="${me ? 0.95 : 0.8}" stroke-width="72" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (on) s += `<path d="${d}" fill="none" stroke="#e8590c" stroke-width="80" stroke-opacity=".35" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#e8590c" stroke-width="${(3 / k).toFixed(2)}" stroke-dasharray="${8 / k} ${5 / k}"/>`;
      labels += `<text x="${b.cx.toFixed(1)}" y="${b.cy.toFixed(1)}" dy="0.35em" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="800" fill="#1f2733" stroke="#fff" stroke-width="${(4 / k).toFixed(2)}" paint-order="stroke">${SS.esc(b.label)}<tspan font-weight="600" font-size="${(fs * 0.8).toFixed(1)}"> ${b.members.length}</tspan></text>`;
    });
    return s + labels;
  }
  function blockAt(w) {
    const list = S.blockList || computeBlocks();
    let best = null, bd = 60;
    list.forEach(b => b.members.forEach(p => { const d = Math.hypot(p.x - w.x, p.y - w.y); if (d < bd) { bd = d; best = b; } }));
    return best;
  }
  // 離した所にいちばん近い、ほかのパートのかたまり（1.2m以内）
  function blockTarget(dg) {
    const ms = dg.blk.members, cx = ms.reduce((a, p) => a + p.x, 0) / ms.length, cy = ms.reduce((a, p) => a + p.y, 0) / ms.length;
    let best = null, bd = 120;
    (dg.blocks || []).forEach(b => {
      if (b.key === dg.blk.key || b.label === dg.blk.label) return;
      b.members.forEach(p => { const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; best = b; } });
    });
    return best ? Object.assign({ dropX: cx }, best) : null;
  }
  const blockRestore = dg => dg.orig.forEach((o, id) => { const it = byId(id); if (it) { it.x = o.x; it.y = o.y; } });
  function dropBlock(dg) {
    const tgt = blockTarget(dg), A = dg.blk.label;
    const st = doc().ensemble, auto = st && doc().items.some(it => it.auto) && ['band', 'brass'].includes(st.type);
    if (auto) {
      // かんたん編成（吹奏楽・ブラスバンド）：列の中のパートの順を書きかえて、並べ直す（ひな壇・間隔もそろったまま）
      const rows = JSON.parse(JSON.stringify(SS.auto.layOf(st).rows));
      const where = lab => { for (let r = 0; r < rows.length; r++) { const i = rows[r].indexOf(lab); if (i >= 0) return [r, i]; } return null; };
      if (!tgt) { blockRestore(dg); render(); return toast('ほかのパートの上で離すと、そのとなりに並べかえます'); }
      const B = tgt.label;
      if (!where(A) || !where(B)) { blockRestore(dg); render(); return toast(`${!where(A) ? A : B} は列の並び順では動かせません（打楽器は「打楽器の置き場所」で決めます）`); }
      const before = tgt.dropX < tgt.cx;
      const [ra, ia] = where(A);
      rows[ra].splice(ia, 1);
      const [rb, ib] = where(B);
      rows[rb].splice(before ? ib : ib + 1, 0, A);
      let note = '';
      if (st.lowOuter && [A, B].some(l => (SS.auto.LOW_GROUP || []).includes(l))) { st.lowOuter = false; note = '（「低音を外側に」は切りました）'; }
      if (st.layout !== 'custom') st.customBase = st.layout;
      st.layout = 'custom';
      st.customRows = rows;
      applyAuto({ noHistory: true, quiet: true });
      renderSteppers();
      toast(`${A} を ${B} の${before ? '下手' : '上手'}側に並べかえました${note}`, true);
      return;
    }
    if (tgt) {
      // 手で並べた配置：2つのかたまりの席を入れかえる（人数が同じなら席ごと、ちがうときは下手から順に座り直す）
      blockRestore(dg);
      const c = conductor(), t = p => G.polar(p, c).t, byT = arr => arr.slice().sort((a, b) => t(a) - t(b));
      const a = byT(dg.blk.members), b = byT(tgt.members);
      const seat = p => ({ x: p.x, y: p.y, rot: p.rot || 0 });
      const moveTo = (p, q) => { const dx = q.x - p.x, dy = q.y - p.y; matesOf(p).forEach(m => { m.x += dx; m.y += dy; }); p.x = q.x; p.y = q.y; p.rot = q.rot; };
      if (a.length === b.length) {
        const sa = a.map(seat), sb = b.map(seat);
        a.forEach((p, i) => moveTo(p, sb[i])); b.forEach((p, i) => moveTo(p, sa[i]));
      } else {
        const seats = byT(a.concat(b)).map(seat);
        const aFirst = t({ x: a.reduce((s2, p) => s2 + p.x, 0) / a.length, y: a.reduce((s2, p) => s2 + p.y, 0) / a.length }) < t({ x: tgt.cx, y: tgt.cy });
        (aFirst ? b.concat(a) : a.concat(b)).forEach((p, i) => moveTo(p, seats[i]));
      }
      renderAll();
      toast(`${A} と ${tgt.label} の席を入れかえました`, true);
      return;
    }
    renderAll();
    toast(`${A} を動かしました`);
  }
  function setBlocks(on) {
    S.blocks = !!on;
    if (on) { S.sel.clear(); S.trans = null; S.compare = null; }
    $('modeBlocks').classList.toggle('active', S.blocks);
    $('modeBlocks').setAttribute('aria-pressed', S.blocks ? 'true' : 'false');
    document.body.classList.toggle('blocks-on', S.blocks);
    renderAll();
    if (on) toast('🧩 パートのかたまりをドラッグで動かせます。ほかのパートの上で離すと、並び順を入れかえます');
  }
  $('modeBlocks').onclick = () => setBlocks(!S.blocks);

  // ------------------------------------------------------------ 安全の確認（警告の一覧と、図の上の印）
  // かんたん編成の設定と舞台の大きさ（「入りきりません」の案内が、今の配置のものかを見分ける）
  function fitKey() { const d = doc(), st = d.stage; return JSON.stringify([d.ensemble, st.w, st.d, st.bw, st.shape, st.sag, d.items.filter(it => !it.auto && it.type === 'door').length]); }
  const fitBad = () => !!(doc().ensemble && doc().items.some(it => it.auto) && ((S.fit && !S.fit.fits && S.fit.key === fitKey()) || S.fixFail === fitKey()));
  // おすすめ（ひな壇を1段減らす・弦を1プルトずつ減らす・両方）を、先に試しに並べて、入るかどうかを見ておく
  function fitSuggestions() {
    const key = fitKey();
    if (S.fitSug && S.fitSug.key === key) return S.fitSug.list;
    const st = ens(), stage = doc().stage, list = [];
    const clone = () => JSON.parse(JSON.stringify(st));
    const tier = x => { x.hina = Object.assign({}, x.hina, { steps: Math.max(0, (x.hina.steps || 0) - 1) }); };
    const desk = x => { ['Vn1', 'Vn2', 'Va', 'Vc'].forEach(k => { if (x.counts[k]) x.counts[k] = Math.max(2, x.counts[k] - 2); }); if (x.counts.Cb) x.counts.Cb = Math.max(1, x.counts.Cb - 1); };
    const strings = ['orch', 'strings'].includes(st.type);
    if (st.hina && st.hina.steps > 0) list.push({ label: 'ひな壇を1段減らす', make: tier });
    if (strings) list.push({ label: '弦を1プルトずつ減らす', make: desk });
    if (strings && st.hina && st.hina.steps > 0) list.push({ label: 'ひな壇を1段減らして、弦を1プルトずつ減らす', make: x => { tier(x); desk(x); } });
    const ctx = doc().items.filter(it => !it.auto);
    list.forEach(v => {
      const x = clone(); v.make(x); v.state = x;
      SS.auto.ctxItems = ctx;
      const r = SS.auto.build(x, stage);
      SS.auto.ctxItems = null;
      const ws = SS.checks({ stage, items: r.items.concat(ctx) });
      v.fits = !!r.fits && !r.offstage && !ws.length;
      v.n = r.items.filter(it => it.type === 'player').length;
    });
    // どれも入らないとき：弦を何プルト減らせば入るかを探す（4プルトまで。ひな壇も1段減らした形も）
    if (strings && !list.some(v => v.fits)) {
      for (let k = 2; k <= 4; k++) {
        const found = [false, true].map(t2 => {
          if (t2 && !(st.hina && st.hina.steps > 0)) return null;
          const x = clone(); for (let i = 0; i < k; i++) desk(x); if (t2) tier(x);
          SS.auto.ctxItems = ctx;
          const r = SS.auto.build(x, stage);
          SS.auto.ctxItems = null;
          const ok = !!r.fits && !r.offstage && !SS.checks({ stage, items: r.items.concat(ctx) }).length;
          return ok ? { label: `弦を${k}プルトずつ減らす${t2 ? '（ひな壇も1段減らす）' : ''}`, state: x, fits: true, n: r.items.filter(it => it.type === 'player').length } : null;
        }).filter(Boolean);
        if (found.length) { list.push(found[0]); break; }
      }
    }
    list.sort((a, b) => (b.fits ? 1 : 0) - (a.fits ? 1 : 0));
    S.fitSug = { key, list };
    return list;
  }
  function fitCardHTML() {
    const st = doc().stage, n = players().length, sug = fitSuggestions();
    const size = `${st.w / 100}×${st.d / 100}m`;
    return `<div class="fit-card"><b>${S.fixFail === fitKey() ? '自動では直しきれませんでした。' : ''}この舞台（${size}）では、${n}人がゆったり入りません。</b>
      <span class="small">無理に詰めると、人の重なりや、ひな壇の縁にかかる人が出ます。${S.fit && S.fit.offstage ? `入りきらない打楽器（${S.fit.offstage}台）は、下手のそでに置いています。` : ''}</span>
      <div class="fit-sugs"><span class="small">おすすめ（押すと、その案で並べ直します）</span>
      ${sug.map((v, i) => `<button class="btn${v.fits && i === 0 ? ' primary' : ''}" data-fitv="${i}">${SS.esc(v.label)}<small>${v.n}人 → ${v.fits ? 'ゆったり入ります' : 'まだ入りきりません'}</small></button>`).join('')}
      <button class="btn" id="fitStage">舞台の大きさを確認する<small>ホールの図面の奥行・幅と合っているか</small></button></div></div>`;
  }
  function renderWarnList() {
    const ws = S.warnings || [];
    const chip = $('warnChip'), list = $('warnList'), bad = fitBad();
    chip.hidden = !ws.length && !bad;
    chip.textContent = bad ? `⚠ 入りきりません${ws.length ? `（確認 ${ws.length}件）` : ''}` : `⚠ 確認 ${ws.length}件`;
    if (!ws.length && !bad) { list.hidden = true; return; }
    if (list.hidden) return;
    const auto = doc().ensemble && doc().items.some(it => it.auto);
    const out = (S.warnMsg ? `<p class="warn-result">${SS.esc(S.warnMsg)}</p>` : '') + (S.warnReauto && auto ? `<button class="btn wide" id="warnReauto">↻ かんたん編成の設定で並べ直す（手で動かした所は元に戻ります）</button>` : '');
    list.innerHTML = (bad ? fitCardHTML() : '') + (ws.length ? `<h4>確認してほしいところ（${ws.length}件）</h4><button class="btn primary wide" id="warnFix">🔧 自動で直す</button>` : '') + `<div id="warnFixOut">${out}</div>` + (!ws.length ? '' : `<ol>${ws.map((w, i) => `<li data-warn="${i}"><span class="wn">${i + 1}</span><span>${SS.esc(w.msg)}</span></li>`).join('')}</ol><p class="small">押すと、その場所を図の上で示します（赤い点線の枠）。</p>`);
    if ($('warnReauto')) $('warnReauto').onclick = () => { applyAuto({ quiet: true }); const n = SS.checks(doc()).length; S.warnReauto = false; $('warnList').hidden = !n && !fitBad(); warnOut(n ? `並べ直しました（⚠ ${n}件）` : '並べ直しました。⚠ はありません'); };
    list.querySelectorAll('[data-warn]').forEach(li => { li.onclick = () => focusWarn(+li.getAttribute('data-warn')); });
    if ($('warnFix')) $('warnFix').onclick = autoFix;
    list.querySelectorAll('[data-fitv]').forEach(b => { b.onclick = () => {
      const v = fitSuggestions()[+b.getAttribute('data-fitv')];
      pushHistory();
      doc().ensemble = JSON.parse(JSON.stringify(v.state));
      applyAuto({ noHistory: true, quiet: true });
      renderSteppers();
      const n = SS.checks(doc()).length;
      $('warnList').hidden = false;
      warnOut(`「${v.label}」で並べ直しました（${players().length}人${fitBad() ? '・まだ入りきりません' : n ? `・⚠ ${n}件` : '・⚠ なし'}）。「戻す」で元に戻せます。`);
    }; });
    if ($('fitStage')) $('fitStage').onclick = () => editStageDim('d');
  }
  // ⚠ 確認の一覧の中に結果を書く（お知らせが一覧の後ろに隠れないように）
  function warnOut(msg) {
    if (!$('warnList').hidden) { S.warnMsg = msg; renderWarnList(); return; }
    S.warnMsg = null;
    toast(msg, true);
  }

  /**
   * 🔧 自動で直す：⚠ 確認の中で、形をくずさずに直せるものを直す。
   * 指揮台の前（床の人ごと奥へ）・舞台奥の通路（前へ）・ひな壇の縁（段に乗せる／降ろす）・重なり（少しずつ離す）・上がり段（段の横に付ける）。
   * 直したあとで ⚠ が増えるときは、元に戻す。直せなかったものは、手で直す場所として残す
   */
  function autoFix() {
    // ⚠ の重さ：場所（赤い枠）の数で数える（搬入経路だけは1件で1）。少しでも減った手直しだけを残す
    const d = doc(), count = () => SS.checks(d).reduce((a, w) => a + (w.kind === 'loadin' || w.kind === 'stairs' || w.kind === 'podium' ? 1 : w.spots.length), 0);
    const before = SS.checks(d).length, score0 = count();
    if (!before) return;
    pushHistory();
    const keep = JSON.stringify(d.items);
    S.sel.clear();
    const st = d.stage, R = SS.render;
    const tiers = () => d.items.filter(it => it.type === 'hina' || it.type === 'riser' || it.type === 'riser46');
    const onTier = it => tiers().some(t => SS.hinaContains(t, it.x, it.y, 14));
    const has = k => SS.checks(d).some(w => w.kind === k);
    // 手直しを1つ試して、⚠ が増えたら元に戻す
    const attempt = fn => {
      const snap = JSON.stringify(d.items), c0 = count();
      fn();
      if (count() > c0) { d.items = JSON.parse(snap); return false; }
      return true;
    };
    // いくつかの直し方をためして、⚠ がいちばん少ないものを残す（同じなら先に書いたもの）
    const best = fns => {
      const snap = JSON.stringify(d.items);
      let bi = -1, bc = Infinity;
      fns.forEach((fn, i) => { d.items = JSON.parse(snap); fn(); const c = count(); if (c < bc) { bc = c; bi = i; } });
      d.items = JSON.parse(snap);
      if (bi >= 0) fns[bi]();
    };
    const FIXED = new Set(['text', 'cable', 'outlet', 'tap', 'runway', 'podium', 'stairs', 'door']);
    const PLAT = new Set(['hina', 'riser', 'riser46']);
    const hit = (a, b) => a.x0 < b.x1 - 1 && a.x1 > b.x0 + 1 && a.y0 < b.y1 - 1 && a.y1 > b.y0 + 1;
    const unitOf = it => {
      if (PLAT.has(it.type)) return [it].concat(d.items.filter(o => o !== it && !PLAT.has(o.type) && o.type !== 'text' && SS.hinaContains(it, o.x, o.y, 0)));
      return [it].concat(matesOf(it));
    };
    const okPos = o => o.type === 'text' || onExtension(o) || (PLAT.has(o.type) ? (b => [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].every(([x, y]) => R.insideStage(st, { x, y }, -2)))(SS.itemAABB(o, {})) : R.insideStage(st, o, o.type === 'player' ? 26 : Math.min(SS.itemSize(o, {}).w, SS.itemSize(o, {}).h) / 2));
    function nudgeFix() {
      for (let pass = 0; pass < 4; pass++) {
        const ws = SS.checks(d).filter(w => !['stairs', 'podium', 'tieredge'].includes(w.kind));
        if (!ws.length) return;
        const spots = ws.flatMap(w => w.spots);
        const done = new Set();
        // 小さい物から（段は最後）
        const cands = d.items.filter(it => !FIXED.has(it.type) && spots.some(b => hit(SS.itemAABB(it, {}), b)))
          .sort((a, b) => (PLAT.has(a.type) ? 1 : 0) - (PLAT.has(b.type) ? 1 : 0));
        let moved = false;
        for (const it of cands) {
          if (done.has(it)) continue;
          const unit = unitOf(it);
          unit.forEach(o => done.add(o));
          const c0 = count();
          let ok = false;
          for (const step of [12, 25, 45, 70, 100]) {
            for (let k = 0; k < 8 && !ok; k++) {
              const a = (k * Math.PI) / 4, dx = Math.round(Math.cos(a) * step), dy = Math.round(Math.sin(a) * step);
              unit.forEach(o => { o.x += dx; o.y += dy; });
              if (unit.every(okPos) && count() < c0) ok = true;
              else unit.forEach(o => { o.x -= dx; o.y -= dy; });
            }
            if (ok) break;
          }
          // 段が出入り口の前にかかるとき：出入り口の側の平台を1列ずつ外して段をせまくする（外した所の人・物は内側へ）
          if (!ok && PLAT.has(it.type) && !(it.rot % 180)) {
            const doors = SS.doorZones(st, d.items).filter(dr => dr.side !== 'B' && hit(SS.itemAABB(it, {}), dr.zone));
            for (const dr of doors) {
              const pw = (SS.panelSize ? SS.panelSize(it).w : 182) || 182, b = SS.itemAABB(it, {});
              const over = dr.side === 'L' ? dr.zone.x1 - b.x0 : b.x1 - dr.zone.x0;
              const k = Math.ceil((over + 2) / pw);
              if (k * pw >= it.w - pw) continue;
              const snap = JSON.stringify(d.items), c0 = count(), sgn = dr.side === 'L' ? 1 : -1;
              const edge = dr.side === 'L' ? b.x0 + k * pw : b.x1 - k * pw;
              unit.slice(1).forEach(o => { if (sgn * (edge - o.x) > -30) o.x += sgn * (Math.abs(edge - o.x) + 40); });
              it.w -= k * pw; it.x += (sgn * k * pw) / 2;
              if (count() < c0) { ok = true; break; }
              const back = JSON.parse(snap); d.items.forEach((o, i) => { Object.keys(o).forEach(key => { if (!(key in back[i])) delete o[key]; }); Object.assign(o, back[i]); });
            }
          }
          if (ok) moved = true;
        }
        if (!moved) return;
      }
    }
    for (let round = 0; round < 3; round++) {
      // 指揮台の前：指揮台と床の人・物を、足りない分だけ奥へ
      // 指揮台の前：足りない分だけ奥へ。①全体を奥へ ②指揮台と床の人・物を奥へ ③指揮台だけ奥へ のうち、⚠ がいちばん少ないものを使う
      if (has('podium')) {
        const pod = d.items.find(it => it.type === 'podium');
        const pb = pod && SS.itemAABB(pod, {}), need = SS.auto.podiumGapOf(st), dy = pod ? need - (R.frontAt(st, pod.x) - pb.y1) + 2 : 0;
        if (dy > 0) {
          const movable = it => it.type !== 'text' && !onExtension(it);
          const floorOnly = it => it.type === 'podium' || (!PLAT.has(it.type) && it.type !== 'text' && !onTier(it) && !onExtension(it));
          best([
            () => d.items.filter(movable).forEach(it => { it.y -= dy; }),
            () => d.items.filter(floorOnly).forEach(it => { it.y -= dy; }),
            () => { d.items.find(it => it.type === 'podium').y -= dy; },
          ]);
        }
      }
      // 舞台奥の通路・反射板：段の上にない物を、通路の前まで出す
      if (has('aisle') || has('shell')) attempt(() => {
        const fx = st.fixtures || {}, back = SS.auto.aisleOf(st) + (fx.shell != null && isFinite(+fx.shell) ? +fx.shell : 0);
        d.items.forEach(it => {
          if (tiers().includes(it) || it.type === 'text' || onTier(it)) return;
          const b = SS.itemAABB(it, {});
          if (b.y0 < back) it.y += back - b.y0 + 2;
        });
      });
      // 舞台の前の縁に近すぎる人・楽器：楽器と奏者のまとまりごと、足りない分だけ奥へ
      if (has('edge')) attempt(() => {
        const moved = new Set();
        d.items.forEach(it => {
          if (moved.has(it) || ['podium', 'mic', 'micTall', 'monitor', 'text', 'stairs'].includes(it.type) || PLAT.has(it.type) || onExtension(it)) return;
          const b = SS.itemAABB(it, {});
          const need = SS.auto.EDGE_CLEAR + 3 - (Math.min(R.frontAt(st, b.x0), R.frontAt(st, b.x1), R.frontAt(st, (b.x0 + b.x1) / 2)) - b.y1);
          if (need <= 0) return;
          unitOf(it).forEach(o => { if (!moved.has(o)) { o.y -= need; moved.add(o); } });
        });
      });
      // ひな壇の縁・舞台からのはみ出し・段が通路にかかる：✨きれいに整えると同じ
      if (has('tieredge') || has('aisle') || has('shell')) attempt(() => tidyAuto(undefined, true));
      // 重なり：奏者を少しずつ離す。打楽器の楽器が重なるときは、打楽器を並べ直す
      if (has('overlap')) {
        attempt(() => G.fixOverlap(players().filter(it => !onExtension(it)), opts().seatR * 2 + 8));
        const ov = SS.checks(d).find(w => w.kind === 'overlap');
        if (ov && d.items.some(it => SS.auto.PERC_TYPES.has(it.type))) {
          const place = (d.ensemble && d.ensemble.percPlace) || 'back';
          const snap = JSON.stringify(d.items), c0 = count();
          SS.auto.arrangePercIn(d.items, st, place, { side: !['orch', 'strings'].includes((d.ensemble || {}).type) });
          if (count() > c0) { const back2 = JSON.parse(snap); d.items.forEach((it, i) => Object.assign(it, back2[i])); }
        }
      }
      // まだ残っている所：⚠ の枠にかかっている物を、楽器と奏者のまとまりごと（段なら上の人・物ごと）
      // 8方向に少しずつ（12cm〜1m）動かしてみて、⚠ が減る動かし方があれば残す（重なり・出入り口・緞帳線・迫り・ピット・通路など）
      nudgeFix();
      // 上がり段：高い段の横（下手・上手）か前に、上がり段を付ける
      if (has('stairs')) {
        SS.checks(d).filter(w => w.kind === 'stairs').forEach(w => {
          const b = w.spots[0];
          const cands = [
            { x: b.x0 - 30, y: b.y1 - 55, rot: 90 }, { x: b.x1 + 30, y: b.y1 - 55, rot: -90 },
            { x: b.x0 + 60, y: b.y1 + 30, rot: 0 }, { x: b.x1 - 60, y: b.y1 + 30, rot: 0 },
          ];
          const c0 = count();
          for (const q of cands) {
            const it = { id: newId(), type: 'stairs', x: q.x, y: q.y, rot: q.rot, w: 91, h: 60 };
            if (!R.insideStage(st, it, 35)) continue;
            d.items.push(it);
            if (count() < c0) break;
            d.items.pop();
          }
        });
      }
      if (!SS.checks(d).length) break;
    }
    const after = SS.checks(d);
    // 弦楽器がひな壇の縁にかかったまま・人が重なったままのときは、「入りきりません」の案内を出す
    const STR = /^(vn\s*1|vn\s*2|va|vc|cb)$/i;
    const stuck = ws2 => ws2.some(w => (w.kind === 'tieredge' || w.kind === 'overlap') && players().some(p => STR.test(p.label || '') && w.spots.some(b => p.x >= b.x0 - 30 && p.x <= b.x1 + 30 && p.y >= b.y0 - 30 && p.y <= b.y1 + 30)));
    if (count() > score0) {
      const back = JSON.parse(keep);
      d.items = back;
      if (stuck(SS.checks(d))) S.fixFail = fitKey();
      S.warnReauto = false;
      renderAll();
      $('warnList').hidden = false;
      return warnOut('自動では直せませんでした（かえって増えるので、元のままにしました）。赤い枠の所を手で直してください');
    }
    if (after.length && stuck(after)) S.fixFail = fitKey();
    const auto = d.ensemble && d.items.some(it => it.auto);
    S.warnReauto = !!(after.length && auto);
    renderAll();
    $('warnList').hidden = !after.length && !fitBad();
    if (!after.length && !fitBad()) { S.warnMsg = null; toast(`⚠ ${before}件をすべて直しました（「戻す」で元に戻せます）`, true); return; }
    warnOut(!after.length ? `⚠ ${before}件をすべて直しました（「戻す」で元に戻せます）` : `${after.length < before ? `⚠ ${before}件 → ${after.length}件になりました（「戻す」で元に戻せます）。残りは` : 'ここは自動では直せませんでした。'}下の一覧を押して、赤い枠の所を手で直してください。`);
  }
  // 「選択中」タブの ✨ きれいに整える（下のボタンと同じ）
  $('selTidy').onclick = () => $('btnTidy').click();
  $('warnChip').onclick = () => { $('warnList').hidden = !$('warnList').hidden; if ($('warnList').hidden) { S.warnMsg = null; S.warnReauto = false; } renderWarnList(); };
  function warnMarksSVG(k) {
    const ws = S.warnings || [];
    let s = '';
    ws.forEach((w, i) => {
      const hot = S.warnFlash === i, pad = 8;
      w.spots.forEach(b => {
        s += `<rect x="${b.x0 - pad}" y="${b.y0 - pad}" width="${b.x1 - b.x0 + pad * 2}" height="${b.y1 - b.y0 + pad * 2}" rx="${6 / k}" fill="rgba(214,48,49,${hot ? 0.18 : 0.06})" stroke="#d63031" stroke-width="${(hot ? 4 : 2.2) / k}" stroke-dasharray="${7 / k} ${4 / k}"/>`;
      });
      const b = w.spots[0];
      if (b) s += `<g transform="translate(${b.x0 - pad} ${b.y0 - pad})"><circle r="${11 / k}" fill="#d63031" stroke="#fff" stroke-width="${2 / k}"/><text dy="0.36em" text-anchor="middle" font-size="${12 / k}" font-weight="700" fill="#fff">${i + 1}</text></g>`;
    });
    return s;
  }
  function focusWarn(i) {
    const w = (S.warnings || [])[i];
    if (!w || !w.spots.length) return;
    const b = w.spots.reduce((a, q) => ({ x0: Math.min(a.x0, q.x0), y0: Math.min(a.y0, q.y0), x1: Math.max(a.x1, q.x1), y1: Math.max(a.y1, q.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    const r = svg.getBoundingClientRect(), m = 150;
    let k = Math.min(r.width / (b.x1 - b.x0 + 2 * m), (r.height - 60) / (b.y1 - b.y0 + 2 * m));
    k = Math.min(k, Math.max(S.view.k, 1));
    S.view.k = k;
    S.view.tx = r.width / 2 - ((b.x0 + b.x1) / 2) * k;
    S.view.ty = (r.height - 60) / 2 - ((b.y0 + b.y1) / 2) * k;
    if (isMobile()) { $('warnList').hidden = true; closePanels(); }
    applyView();
    S.warnFlash = i;
    renderOverlay();
    clearTimeout(focusWarn.t);
    focusWarn.t = setTimeout(() => { S.warnFlash = -1; renderOverlay(); }, 2200);
  }

  // 舞台の大きさをドラッグで変えるつまみ（前の幅・奥の幅・奥行）
  function stageHandlesSVG(k) {
    if (S.underlayEdit || S.placing || S.pick) return '';
    const st = doc().stage;
    const r = 11 / k, hit = 24 / k;
    const knob = (kind, x, y, arrow, title) =>
      `<g data-handle="${kind}" style="cursor:${arrow === '↔' ? 'ew-resize' : 'ns-resize'}"><title>${title}</title>` +
      `<circle cx="${x}" cy="${y}" r="${hit}" fill="transparent"/>` +
      `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="#3b6bb5" stroke-width="${2.5 / k}"/>` +
      `<text x="${x}" y="${y}" dy="0.36em" text-anchor="middle" font-size="${14 / k}" font-weight="700" fill="#3b6bb5" pointer-events="none">${arrow}</text></g>`;
    return SS.render.stageKnobs(st).map(q => knob(q.kind, q.x, q.y, q.arrow, q.title)).join('');
  }

  function renderOverlay(marquee) {
    const k = S.view.k;
    let s = '';
    const sel = selected();
    const o = renderOpts();
    sel.forEach(it => {
      const sz = SS.itemSize(it, o);
      if (it.type === 'player') {
        s += `<circle cx="${it.x}" cy="${it.y}" r="${sz.w / 2 + 6}" fill="rgba(47,111,222,.12)" stroke="#2f6fde" stroke-width="${2.5 / k}" stroke-dasharray="${6 / k} ${4 / k}"/>`;
      } else {
        const bb = SS.itemBounds(it, o);
        s += `<g transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0})"><rect x="${bb.x0 - 6}" y="${bb.y0 - 6}" width="${bb.x1 - bb.x0 + 12}" height="${bb.y1 - bb.y0 + 12}" fill="rgba(47,111,222,.08)" stroke="#2f6fde" stroke-width="${2.5 / k}" stroke-dasharray="${6 / k} ${4 / k}"/></g>`;
      }
    });
    if (sel.length === 1 && sel[0].type === 'cable') {
      // ケーブル：折れ点をドラッグで動かせる
      const it = sel[0];
      (it.pts || []).forEach((q, i) => { s += `<circle data-handle="cpt" data-i="${i}" cx="${it.x + q[0]}" cy="${it.y + q[1]}" r="${9 / k}" fill="#fff" stroke="#1f5fbf" stroke-width="${2.5 / k}" style="cursor:move"/>`; });
    } else if (sel.length === 1) {
      const it = sel[0];
      const sz = SS.itemSize(it, o);
      const hr = 9 / k;
      const back = sz.h / 2 + 40;
      s += `<g transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0})">`;
      s += `<line x1="0" y1="${-sz.h / 2 - 4}" x2="0" y2="${-back}" stroke="#2f6fde" stroke-width="${2 / k}"/>`;
      s += `<circle data-handle="rotate" cx="0" cy="${-back}" r="${hr * 1.3}" fill="#fff" stroke="#2f6fde" stroke-width="${2.5 / k}" style="cursor:grab"/>`;
      s += `<text x="0" y="${-back}" dy="0.35em" text-anchor="middle" font-size="${12 / k}" fill="#2f6fde" pointer-events="none">↻</text>`;
      if (it.type !== 'player' && !(SS.hinaArc && SS.hinaArc(it))) {
        s += `<rect data-handle="resize" x="${sz.w / 2 + 6 - hr}" y="${sz.h / 2 + 6 - hr}" width="${hr * 2}" height="${hr * 2}" fill="#2f6fde" stroke="#fff" stroke-width="${1.5 / k}" style="cursor:nwse-resize"/>`;
      }
      s += '</g>';
    }
    s += stageHandlesSVG(k);
    if (S.pick) {
      const tg = pickTargets(S.pick.kind);
      if (tg) tg.forEach((q, i) => { s += `<circle cx="${q.x}" cy="${q.y}" r="${14 / k}" fill="none" stroke="#e8467c" stroke-width="${3 / k}" stroke-dasharray="${5 / k}"/><text x="${q.x}" y="${q.y - 22 / k}" text-anchor="middle" font-size="${13 / k}" font-weight="700" fill="#e8467c">${i + 1}</text>`; });
      S.pick.pts.forEach((q, i) => { s += `<circle cx="${q.x}" cy="${q.y}" r="${9 / k}" fill="#2f6fde" stroke="#fff" stroke-width="${2.5 / k}"/><text x="${q.x}" y="${q.y - 16 / k}" text-anchor="middle" font-size="${13 / k}" font-weight="700" fill="#2f6fde" stroke="#fff" stroke-width="${3 / k}" paint-order="stroke">${i + 1}</text>`; });
    }
    if (drag && drag.guides) {
      const gs = `stroke="#e8467c" stroke-width="${1.6 / k}" stroke-dasharray="${8 / k} ${5 / k}" fill="none"`;
      drag.guides.forEach(g => {
        if (g.kind === 'x') s += `<line x1="${g.v}" y1="-200" x2="${g.v}" y2="${doc().stage.d + 200}" ${gs}/>`;
        if (g.kind === 'y') s += `<line x1="-200" y1="${g.v}" x2="${doc().stage.w + 200}" y2="${g.v}" ${gs}/>`;
        if (g.kind === 'r') s += `<circle cx="${g.c.x}" cy="${g.c.y}" r="${g.v}" ${gs}/>`;
      });
    }
    if (marquee && marquee.pts) {
      s += `<path d="M${marquee.pts.map(p => p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('L')}Z" fill="rgba(47,111,222,.1)" stroke="#2f6fde" stroke-width="${1.8 / k}" stroke-dasharray="${5 / k}"/>`;
    } else if (marquee) {
      const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1);
      s += `<rect x="${x}" y="${y}" width="${Math.abs(marquee.x1 - marquee.x0)}" height="${Math.abs(marquee.y1 - marquee.y0)}" fill="rgba(47,111,222,.1)" stroke="#2f6fde" stroke-width="${1.5 / k}" stroke-dasharray="${5 / k}"/>`;
    }
    layerOverlay.innerHTML = s;
    $('layerWarn').innerHTML = warnMarksSVG(k);
    $('layerBlocks').innerHTML = S.blocks ? blocksSVG(k) : '';
    $('layerCompare').innerHTML = S.trans ? SS.changeoverSVG(transResult(), k, doc().stage) : S.compare ? SS.render.compareSVG(SS.render.diffItems(S.compare.items, doc().items), k, renderOpts()) : '';
    // 寸法線（選んだ物が1つなら、そのまわりの距離も）
    const one = sel.length === 1 ? sel[0] : null;
    $('layerDims').innerHTML = (opts().dims ? SS.render.dimsSVG(doc(), k, one, { knobs: !(S.underlayEdit || S.placing || S.pick), small: isMobile(), basic: isMobile(), editable: !(S.underlayEdit || S.placing || S.pick) }) : '') + SS.render.marksSVG(doc(), k, opts().dims, true, isMobile());
    positionCtxBar();
  }

  function applyView() {
    const v = S.view;
    vp.setAttribute('transform', `translate(${v.tx} ${v.ty}) scale(${v.k})`);
  }

  function fitView(extra) {
    const r0 = svg.getBoundingClientRect();
    if (!r0.width || !r0.height) return;
    // スマホで下のパネルが開いているときは、パネルに隠れていない上の部分に舞台図を合わせる
    const sheet = document.querySelector('.panel.open');
    const r = { width: r0.width, height: r0.height };
    if (sheet && window.matchMedia('(max-width: 820px)').matches) {
      // 開く途中（動いている間）でも正しく測れるよう、開き終わったときの位置で計算する
      const bar = document.querySelector('.bottombar');
      const top = window.innerHeight - (bar ? bar.offsetHeight : 56) - sheet.offsetHeight;
      if (top > r0.top + 120) r.height = top - r0.top + 50; // 下の 60px は余白として差し引かれる
    }
    const st = doc().stage;
    const mx = opts().dims ? 110 : 80;
    // 左右は「下手」「上手」、上は「舞台奥」、下は「客席」の文字の分もあける（文字の大きさは画面上で一定）
    const kk = Math.min(r.width / (st.w + 2 * mx + 160), 2);
    let x0 = -mx - 48 / kk, y0 = Math.min(-95, -40 - 52 / kk), x1 = st.w + 80 + 48 / kk, y1 = SS.render.frontOuter(st) + 34 + 70 / kk;
    if (isMobile()) {
      // スマホ：舞台を画面の幅いっぱいに（左は「奥行」の寸法の線の分だけ。下手・上手は舞台の前の角の下に出す）
      const km = r.width / (st.w + 70);
      x0 = Math.min(opts().dims ? -52 : -10, -16 / km); x1 = st.w + 16 / km; // 角の丸いつまみが画面からはみ出さないように
      y0 = -34 / km; y1 = SS.render.frontOuter(st) + (opts().dims ? 34 : 0) + 78 / km;
    }
    // 舞台の外（そで・奥）に置いた出入り口・入りきらずにそでに置いた打楽器も入るように
    let dx1 = -Infinity;
    doc().items.filter(it => it.type === 'door' || it.offstage).forEach(it => { const b = SS.itemAABB(it, {}); x0 = Math.min(x0, b.x0 - 30); y0 = Math.min(y0, b.y0 - 30); y1 = Math.max(y1, b.y1 + 30); dx1 = Math.max(dx1, b.x1 + 30); });
    if (dx1 > x1 - 40) x1 = Math.max(x1, x0 + ((dx1 - x0) * r.width) / (r.width - 70)); // 右は画面の右のボタン（約70px）に隠れないように
    if (extra) { x0 = Math.min(x0, extra.x0 - 30); y0 = Math.min(y0, extra.y0 - 30); x1 = Math.max(x1, extra.x1 + 30); y1 = Math.max(y1, extra.y1 + 30); }
    const k = Math.min(r.width / (x1 - x0), (r.height - 60) / (y1 - y0));
    S.view.k = k;
    S.view.tx = (r.width - (x1 - x0) * k) / 2 - x0 * k;
    S.view.ty = (r.height - 60 - (y1 - y0) * k) / 2 - y0 * k;
    applyView();
    render();
  }

  function zoomAt(factor, sx, sy) {
    const v = S.view;
    const nk = Math.max(0.05, Math.min(8, v.k * factor));
    factor = nk / v.k;
    v.tx = sx - (sx - v.tx) * factor;
    v.ty = sy - (sy - v.ty) * factor;
    v.k = nk;
    applyView();
    renderOverlay();
    if (S.underlayEdit) render();
  }

  function toWorld(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return { x: (clientX - r.left - S.view.tx) / S.view.k, y: (clientY - r.top - S.view.ty) / S.view.k };
  }

  function renderAll() {
    render();
    renderProps();
    renderCounts();
    renderSettings();
    updateUndoButtons();
  }

  // ------------------------------------------------------------ 保存
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc()));
      } catch (e) {
        try {
          const d = Object.assign({}, doc(), { underlay: null });
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(d));
        } catch (e2) { /* 容量不足 */ }
      }
    }, 400);
  }

  // ------------------------------------------------------------ 通知・ダイアログ
  let toastTimer = null;
  function toast(msg, withUndo) {
    const t = $('toast');
    t.innerHTML = SS.esc(msg) + (withUndo ? ' <button class="toast-undo" id="toastUndo">元に戻す</button>' : '');
    t.classList.toggle('has-btn', !!withUndo);
    t.classList.add('show');
    if (withUndo) $('toastUndo').onclick = () => { undo(); t.classList.remove('show'); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), withUndo ? 4500 : 2600);
  }
  SS.toast = toast;

  function openModal(html) {
    $('modalBody').innerHTML = html;
    $('modal').classList.remove('hidden');
    document.body.classList.add('modal-open');
    $('modalBody').parentElement.scrollTop = 0;
  }
  function closeModal() { $('modal').classList.add('hidden'); document.body.classList.remove('modal-open'); }
  // 画面内で確認する（ブラウザの確認ダイアログが使えない環境でも動くように）
  function askConfirm(msg, yesLabel, onYes) {
    openModal(`<h2>確認</h2><p style="line-height:1.7">${SS.esc(msg).replace(/\n/g, '<br>')}</p>
      <div class="btn-row"><button class="btn primary" id="cfYes">${SS.esc(yesLabel)}</button><button class="btn" id="cfNo">やめる</button></div>`);
    $('cfYes').onclick = () => { closeModal(); onYes(); };
    $('cfNo').onclick = closeModal;
  }
  $('modalClose').onclick = closeModal;
  $('modal').addEventListener('pointerdown', e => { if (e.target === $('modal')) closeModal(); });

  // ------------------------------------------------------------ ポインター操作
  const pointers = new Map();
  let drag = null;
  let spaceDown = false;

  svg.addEventListener('pointerdown', e => {
    if (e.button === 2) return;
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    closePanels();

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      drag = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      renderOverlay();
      return;
    }
    if (pointers.size > 2) return;
    // 舞台の大きさの数字（前の幅・奥の幅・奥行）を押すと、長さを入力できる
    const dimEl = e.target.closest && e.target.closest('[data-dimedit]');
    // 舞台の外に置いた出入り口が数字に重なっているときは、出入り口をつかむ
    const doorEl = dimEl ? document.elementsFromPoint(e.clientX, e.clientY).map(el => el.closest && el.closest('.item')).find(el => el && (byId(el.getAttribute('data-id')) || {}).type === 'door') : null;
    if (dimEl && !doorEl) { drag = { kind: 'dimedit', start: { sx: e.clientX, sy: e.clientY } }; pendingDim = dimEl.getAttribute('data-dimedit'); return; } // 入力の画面は click で開く（同じタップで閉じないように）

    const w = toWorld(e.clientX, e.clientY);
    const handle = e.target.closest && e.target.closest('[data-handle]');
    const itemEl = doorEl || (e.target.closest && e.target.closest('.item'));
    const start = { sx: e.clientX, sy: e.clientY, w };

    if (S.pick) {
      // 舞台図の2点をタップ（ドラッグしたときは画面を動かす）
      drag = { kind: 'pick', start, last: { x: e.clientX, y: e.clientY } };
      return;
    }
    if (S.placing && !handle) {
      const type = S.placing;
      setPlacing(null);
      addItem(type, null, w);
      pointers.delete(e.pointerId);
      return;
    }
    if (e.button === 1 || S.mode === 'pan' || spaceDown) {
      drag = { kind: 'pan', start, last: { x: e.clientX, y: e.clientY } };
      return;
    }
    // パートのかたまり：かたまりをつかむ（空いている所は画面を動かす）
    if (S.blocks && !(handle && /^stage/.test(handle.getAttribute('data-handle')))) {
      const blk = blockAt(w);
      if (blk) { drag = { kind: 'block', start, blk, blocks: S.blockList, orig: new Map(blk.all.map(it => [it.id, { x: it.x, y: it.y }])) }; return; }
      drag = { kind: 'pan', start, last: { x: e.clientX, y: e.clientY } };
      return;
    }
    if (handle && /^stage/.test(handle.getAttribute('data-handle'))) {
      pushHistory();
      const st = doc().stage;
      drag = { kind: handle.getAttribute('data-handle'), start, w0: st.w, d0: st.d, auto: doc().items.some(it => it.auto) };
      return;
    }
    if (handle) {
      const it = selected()[0];
      if (!it) return;
      pushHistory();
      drag = { kind: handle.getAttribute('data-handle'), start, it, i: +handle.getAttribute('data-i'), rot0: it.rot || 0, gm: e.altKey ? [] : matesOf(it).map(m => ({ m, x: m.x, y: m.y, rot: m.rot || 0 })) };
      return;
    }
    if (S.underlayEdit && doc().underlay && !itemEl) {
      pushHistory();
      drag = { kind: 'underlay', start, ox: doc().underlay.x, oy: doc().underlay.y };
      return;
    }
    if (itemEl) {
      const id = itemEl.getAttribute('data-id');
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
      } else if (!S.sel.has(id)) {
        S.sel = new Set([id]);
      }
      const orig = new Map();
      selected().forEach(it => orig.set(it.id, { x: it.x, y: it.y }));
      // 打楽器と奏者のまとまりは、いっしょに動かす（Alt を押しながらだと、それだけ）
      if (!e.altKey) selected().forEach(it => matesOf(it).forEach(m => { if (!orig.has(m.id)) orig.set(m.id, { x: m.x, y: m.y }); }));
      drag = { kind: 'move', start, orig, primary: id, moved: false };
      renderOverlay();
      renderProps();
      return;
    }
    // 何もないところ
    if (S.mode === 'lasso') {
      if (!(e.shiftKey || e.ctrlKey || e.metaKey)) S.sel.clear();
      drag = { kind: 'lasso', start, base: new Set(S.sel), m: { pts: [w] } };
      renderOverlay(drag.m);
      renderProps();
      return;
    }
    if (e.pointerType === 'touch' && S.mode !== 'box') {
      drag = { kind: 'pan', start, last: { x: e.clientX, y: e.clientY }, tapClear: true };
      return;
    }
    if (!(e.shiftKey || e.ctrlKey || e.metaKey)) S.sel.clear();
    drag = { kind: 'marquee', start, base: new Set(S.sel), m: { x0: w.x, y0: w.y, x1: w.x, y1: w.y } };
    renderOverlay(drag.m);
    renderProps();
  });

  svg.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;

    if (drag.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = svg.getBoundingClientRect();
      S.view.tx += mid.x - drag.mid.x;
      S.view.ty += mid.y - drag.mid.y;
      zoomAt(dist / (drag.dist || dist), mid.x - r.left, mid.y - r.top);
      drag.dist = dist; drag.mid = mid;
      return;
    }

    const w = toWorld(e.clientX, e.clientY);
    const moved = Math.hypot(e.clientX - drag.start.sx, e.clientY - drag.start.sy) > 4;

    switch (drag.kind) {
      case 'pick':
      case 'pan': {
        if (drag.kind === 'pick' && !moved && !drag.didMove) break;
        S.view.tx += e.clientX - drag.last.x;
        S.view.ty += e.clientY - drag.last.y;
        drag.last = { x: e.clientX, y: e.clientY };
        if (moved) drag.didMove = true;
        applyView();
        break;
      }
      case 'block': {
        if (!drag.moved) { if (!moved) return; pushHistory(); drag.moved = true; }
        const dx = w.x - drag.start.w.x, dy = w.y - drag.start.w.y;
        drag.orig.forEach((o, id) => { const it = byId(id); if (it) { it.x = o.x + dx; it.y = o.y + dy; } });
        S.blockTarget = blockTarget(drag);
        renderSoon();
        break;
      }
      case 'move': {
        if (!drag.moved) {
          if (!moved) return;
          pushHistory();
          drag.moved = true;
        }
        let dx = w.x - drag.start.w.x, dy = w.y - drag.start.w.y;
        if (opts().snap) {
          const p = drag.orig.get(drag.primary);
          if (p) {
            const sn = snapSize();
            dx = Math.round((p.x + dx) / sn) * sn - p.x;
            dy = Math.round((p.y + dy) / sn) * sn - p.y;
          }
        }
        drag.guides = null;
        const primIt = byId(drag.primary);
        if (primIt && PLATFORMS.has(primIt.type) && !e.altKey) {
          // ひな壇・平台・上がり段は、ほかの段にマグネットのようにくっつく（Alt を押しながらだと、くっつかない）
          const g = magnetSnap(drag, dx, dy);
          dx = g.dx; dy = g.dy; drag.guides = g.guides;
        } else if (opts().guides && !opts().snap && !e.shiftKey) {
          const g = smartSnap(drag, dx, dy);
          dx = g.dx; dy = g.dy; drag.guides = g.guides;
        }
        drag.orig.forEach((o, oid) => { const it = byId(oid); if (it) { it.x = o.x + dx; it.y = o.y + dy; } });
        if (primIt && primIt.type === 'door' && drag.orig.size === 1 && !e.altKey) snapDoor(primIt);
        renderSoon();
        break;
      }
      case 'cpt': {
        // ケーブルの折れ点
        const it = drag.it, abs = cableAbs(it);
        abs[drag.i] = { x: Math.round(w.x), y: Math.round(w.y) };
        setCablePts(it, abs);
        render();
        break;
      }
      case 'rotate': {
        const it = drag.it;
        let a = Math.atan2(w.x - it.x, -(w.y - it.y)) * 180 / Math.PI;
        if (!e.shiftKey) a = Math.round(a / 15) * 15;
        it.rot = normAngle(a);
        if (drag.gm && drag.gm.length) turnMates(it, drag.gm, it.rot - drag.rot0);
        render();
        renderProps(true);
        break;
      }
      case 'resize': {
        const it = drag.it;
        const a = (it.rot || 0) * Math.PI / 180;
        const vx = w.x - it.x, vy = w.y - it.y;
        const lx = vx * Math.cos(a) + vy * Math.sin(a);
        const ly = -vx * Math.sin(a) + vy * Math.cos(a);
        it.w = Math.max(10, Math.round((Math.abs(lx) * 2 - 12) / 5) * 5);
        it.h = Math.max(10, Math.round((Math.abs(ly) * 2 - 12) / 5) * 5);
        if (it.type === 'hina') {
          // ひな壇は平台の枚数単位で大きさが変わる
          const pn = SS.panelSize(it);
          it.w = Math.max(1, Math.round(it.w / pn.w)) * pn.w;
          it.h = Math.max(1, Math.round(it.h / pn.d)) * pn.d;
        }
        render();
        renderProps(true);
        break;
      }
      case 'stageW':
      case 'stageBW':
      case 'stageD': {
        dragStage(drag, w);
        break;
      }
      case 'underlay': {
        const u = doc().underlay;
        u.x = drag.ox + (w.x - drag.start.w.x);
        u.y = drag.oy + (w.y - drag.start.w.y);
        render();
        break;
      }
      case 'marquee': {
        drag.m.x1 = w.x; drag.m.y1 = w.y;
        const x0 = Math.min(drag.m.x0, drag.m.x1), x1 = Math.max(drag.m.x0, drag.m.x1);
        const y0 = Math.min(drag.m.y0, drag.m.y1), y1 = Math.max(drag.m.y0, drag.m.y1);
        pickIn(drag.base, it => it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1);
        renderOverlay(drag.m);
        break;
      }
      case 'lasso': {
        const pts = drag.m.pts, last = pts[pts.length - 1];
        if (Math.hypot(w.x - last.x, w.y - last.y) < 6 / S.view.k) break;
        pts.push(w);
        if (pts.length > 2) pickIn(drag.base, it => G.inPolygon(it, pts));
        renderOverlay(drag.m);
        break;
      }
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (!drag) return;
    renderNow();
    // 寸法の数字を押しただけのときは、書き直さない（書き直すと click が届かない）。入力の画面は click で開く
    if (drag.kind === 'dimedit') { if (Math.hypot(e.clientX - drag.start.sx, e.clientY - drag.start.sy) > 8) pendingDim = null; drag = null; return; }
    if (drag.kind === 'pinch') {
      if (pointers.size < 2) drag = null;
      return;
    }
    if (drag.kind === 'block') {
      const dg = drag;
      drag = null; S.blockTarget = null;
      if (dg.moved) dropBlock(dg);
      else toast(`${dg.blk.label}（${dg.blk.members.length}人）${dg.blk.members.some(p => p.name) ? '：' + dg.blk.members.map(p => p.name || '—').join('・') : ''}。ドラッグで動かせます`);
      render();
      return;
    }
    if (drag.kind === 'pick' && !drag.didMove && S.pick) {
      S.pick.pts.push(drag.start.w);
      drag = null;
      pickStep();
      renderOverlay();
      return;
    }
    if (/^stage/.test(drag.kind)) {
      const st = doc().stage;
      if (drag.auto) applyAuto({ noHistory: true });
      fitView();
      toast(`舞台：前の幅 ${st.w / 100}m・奥の幅 ${Math.round(SS.render.backWidth(st)) / 100}m・奥行 ${st.d / 100}m`);
    }
    if (drag.kind === 'pan' && drag.tapClear && !drag.didMove) {
      S.sel.clear();
    }
    // 動かしたあと、段の縁にかかった人を自動で段の上か床へ（Alt を押しながらだと、そのまま）
    if (!e.altKey && ((drag.kind === 'move' && drag.moved) || (drag.it && drag.it.type === 'hina'))) {
      const movedIds = drag.orig ? [...drag.orig.keys()] : [drag.it.id];
      const movedItems = movedIds.map(byId).filter(Boolean);
      const tiersMoved = movedItems.filter(it => it.type === 'hina');
      const near = players().filter(p => movedItems.includes(p) || tiersMoved.some(t => SS.hinaContains(t, p.x, p.y, 30)));
      // 段を動かしたとき：動かす前に段の上にいなかった人（床の人）は、段から降ろすほうを先に
      const wasFloor = p => !movedItems.includes(p) && !tiersMoved.some(t => { const o = drag.orig ? drag.orig.get(t.id) : null; return SS.hinaContains(o ? Object.assign({}, t, { x: o.x, y: o.y }) : t, p.x, p.y, 0); });
      const n = settleOnTiers(near, wasFloor);
      if (n) { render(); toast(`段の縁にかかっていた${n}人を、段の上か床にきちんと置きました（Alt を押しながら動かすと、そのまま）`, true); }
    }
    if (drag.kind === 'move' && !drag.moved && !(e.shiftKey || e.ctrlKey || e.metaKey)) {
      // クリックだけ → その1つを選ぶ。すばやく2回タップ → その列をまとめて選ぶ
      const now = Date.now();
      if (lastTap && lastTap.id === drag.primary && now - lastTap.t < 400) {
        selectRowOf(drag.primary);
        lastTap = null;
      } else {
        S.sel = new Set([drag.primary]);
        lastTap = { id: drag.primary, t: now };
      }
    }
    drag = null;
    renderOverlay();
    renderProps();
    renderCounts();
  }
  svg.addEventListener('pointerup', endPointer);
  let pendingDim = null;
  svg.addEventListener('click', () => {
    if (pendingDim) { const k = pendingDim; pendingDim = null; editStageDim(k); }
  });
  svg.addEventListener('pointercancel', endPointer);

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    if (S.underlayEdit && doc().underlay) {
      const u = doc().underlay;
      const w = toWorld(e.clientX, e.clientY);
      u.x = w.x - (w.x - u.x) * f; u.y = w.y - (w.y - u.y) * f;
      u.w *= f; u.h *= f;
      render();
      return;
    }
    zoomAt(f, sx, sy);
  }, { passive: false });

  let lastTap = null;

  // 舞台のつまみをドラッグ：10cm単位。自動配置ならその場で並べ直す
  let stageRAF = 0;
  // 舞台の大きさを数字で決める（スマホで指で引っぱると、中の配置もいっしょに動いてブルブルするので）
  function editStageDim(kind) {
    const st = doc().stage, R = SS.render;
    const cur = kind === 'w' ? st.w : kind === 'bw' ? R.backWidth(st) : st.d;
    const name = kind === 'w' ? (R.isCurved(st) ? '最大の幅' : R.backWidth(st) < st.w - 1 ? '前の幅' : '幅') : kind === 'bw' ? '奥の幅' : (R.isCurved(st) ? '奥行（中央）' : '奥行');
    const [lo, hi] = kind === 'd' ? [2, 50] : [kind === 'bw' ? 2 : 4, 60];
    openModal(`<h2>📏 舞台の${name}</h2>
      <label class="field">${name}（m）<input id="dimVal" type="number" inputmode="decimal" step="0.1" min="${lo}" max="${hi}" value="${(Math.round(cur) / 100).toFixed(2).replace(/0$/, '')}"></label>
      <p class="hint small">${lo}〜${hi}m。かんたん編成で並べた配置は、この大きさで並べ直します。</p>
      <div class="btn-row"><button class="btn primary" id="dimOk">この長さにする</button><button class="btn" id="dimNo">やめる</button></div>`);
    setTimeout(() => { const el = $('dimVal'); if (el) { el.focus(); el.select(); } }, 50);
    $('dimNo').onclick = closeModal;
    const apply = () => {
      const v = +$('dimVal').value;
      if (!(v >= lo && v <= hi)) { toast(`${lo}〜${hi}m で入れてください`); return; }
      const cm = Math.round(v * 100);
      closeModal();
      pushHistory();
      const oldW = st.w, oldD = st.d;
      if (kind === 'w') { st.w = cm; if (st.bw) st.bw = Math.min(st.bw, st.w); }
      else if (kind === 'bw') { st.bw = Math.min(st.w, cm); }
      else { if (st.shape === 'arc') { const sg = R.arcSag(st); st.sag = Math.min(sg, cm); } st.d = cm; }
      doc().hall = '';
      const hadAuto = doc().items.some(it => it.auto);
      if (hadAuto) applyAuto({ noHistory: true, quiet: true });
      else { const dx = (st.w - oldW) / 2, dy = st.d - oldD; doc().items.forEach(it => { it.x += dx; it.y += dy; }); }
      updateHallNote();
      renderAll();
      fitView();
      toast(`舞台：${name} ${v}m にしました（「戻す」で元に戻せます）`, true);
    };
    $('dimOk').onclick = apply;
    $('dimVal').addEventListener('keydown', ev => { if (ev.key === 'Enter') apply(); });
  }

  function dragStage(dr, w) {
    const st = doc().stage;
    const oldW = st.w, oldD = st.d;
    const cx = oldW / 2;
    const r10 = v => Math.round(v / 10) * 10;
    if (dr.kind === 'stageW') {
      st.w = Math.max(400, Math.min(6000, r10(Math.abs(w.x - cx) * 2)));
      if (st.bw) st.bw = Math.min(st.bw, st.w);
    } else if (dr.kind === 'stageBW') {
      st.bw = Math.max(200, Math.min(st.w, r10(Math.abs(w.x - cx) * 2)));
    } else if (dr.kind === 'stageSag') {
      // 真ん中のふくらみ：角の位置はそのまま、中央の奥行だけ変える
      const yc = st.d - SS.render.arcSag(st);
      st.d = Math.max(yc, Math.min(yc + st.w * 0.3, r10(w.y)));
      st.sag = st.d - yc;
    } else if (st.shape === 'arc') {
      // 角の所の奥行を変える（ふくらみはそのまま）
      const sg = SS.render.arcSag(st);
      const off = SS.render.frontAt(st, st.w * 0.2) - (st.d - sg); // つまみは弧の上（角より少し前）にある
      st.d = Math.max(300, Math.min(5000, r10(w.y - off) + sg));
      st.sag = sg;
    } else {
      st.d = Math.max(300, Math.min(5000, r10(w.y)));
    }
    if (st.w === oldW && st.d === oldD && dr.kind !== 'stageBW' && dr.kind !== 'stageSag') return;
    doc().hall = '';
    const dx = (st.w - oldW) / 2, dy = st.d - oldD;
    if (dr.auto) {
      // 自動配置：いったん中心をずらして表示し、描画のタイミングで並べ直す
      doc().items.forEach(it => { it.x += dx; it.y += dy; });
      render();
      cancelAnimationFrame(stageRAF);
      stageRAF = requestAnimationFrame(() => applyAuto({ noHistory: true, quiet: true }));
    } else {
      // 手で置いた配置：真ん中と舞台際（指揮者）からの位置を保つ
      doc().items.forEach(it => { it.x += dx; it.y += dy; });
      render();
    }
    renderSettings();
    updateHallNote();
  }

  // 範囲・投げ縄で選ぶ。ひな壇（平台）は、ほかに何も入っていないときだけ選ぶ
  function pickIn(base, test) {
    const hit = doc().items.filter(test);
    const noHina = hit.filter(it => it.type !== 'hina');
    S.sel = new Set(base);
    (noHina.length ? noHina : hit).forEach(it => S.sel.add(it.id));
  }

  // 同じ列（指揮者からの距離が同じくらい）の奏者をまとめて選ぶ
  function selectRowOf(id) {
    const it = byId(id);
    if (!it || it.type !== 'player') { S.sel = new Set([id]); return; }
    const rows = G.arcRows(players(), conductor());
    const row = rows.find(r => r.includes(it)) || [it];
    S.sel = new Set(row.map(p => p.id));
    toast(`この列の${row.length}人を選びました`);
  }

  // ひな壇どうしのマグネット：動かしている段（選んだ段・平台・上がり段）の外枠を、ほかの段の外枠にくっつける／そろえる。
  // 横（x）と縦（y）を別々に、いちばん近いものへ。くっつく距離は画面の上で約16px（ただし最大40cm）
  const PLATFORMS = new Set(['hina', 'riser', 'riser46', 'stairs']);
  function magnetSnap(d, dx, dy) {
    const th = Math.min(40, 16 / S.view.k);
    const moving = selected().filter(it => PLATFORMS.has(it.type));
    if (!moving.length) return { dx, dy, guides: null };
    const box = (it, ox, oy) => { const o = d.orig.get(it.id) || it; const b = SS.itemAABB(Object.assign({}, it, { x: o.x + ox, y: o.y + oy }), {}); return b; };
    const mb = moving.map(it => box(it, dx, dy)).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) }));
    const others = doc().items.filter(it => PLATFORMS.has(it.type) && !S.sel.has(it.id)).map(it => SS.itemAABB(it, {}));
    let bx = null, by = null;
    const tryX = (from, to, why) => { const dd = to - from; if (Math.abs(dd) < th && (!bx || Math.abs(dd) < Math.abs(bx.d) - 0.01 || (why === 'touch' && bx.why !== 'touch' && Math.abs(dd) <= Math.abs(bx.d) + 2))) bx = { d: dd, v: to, why }; };
    const tryY = (from, to, why) => { const dd = to - from; if (Math.abs(dd) < th && (!by || Math.abs(dd) < Math.abs(by.d) - 0.01 || (why === 'touch' && by.why !== 'touch' && Math.abs(dd) <= Math.abs(by.d) + 2))) by = { d: dd, v: to, why }; };
    others.forEach(o => {
      const nearY = mb.y0 < o.y1 + th && mb.y1 > o.y0 - th; // 縦に重なる（横に並ぶ）ときだけ、左右でくっつける
      const nearX = mb.x0 < o.x1 + th && mb.x1 > o.x0 - th;
      if (nearY) { tryX(mb.x0, o.x1, 'touch'); tryX(mb.x1, o.x0, 'touch'); }
      if (nearX) { tryY(mb.y0, o.y1, 'touch'); tryY(mb.y1, o.y0, 'touch'); }
      // 端・真ん中をそろえる
      tryX(mb.x0, o.x0, 'align'); tryX(mb.x1, o.x1, 'align'); tryX((mb.x0 + mb.x1) / 2, (o.x0 + o.x1) / 2, 'align');
      tryY(mb.y0, o.y0, 'align'); tryY(mb.y1, o.y1, 'align');
    });
    const guides = [];
    if (bx) { dx += bx.d; guides.push({ kind: 'x', v: bx.v }); }
    if (by) { dy += by.d; guides.push({ kind: 'y', v: by.v }); }
    return { dx, dy, guides: guides.length ? guides : null };
  }

  // ドラッグ中に、ほかの部品と位置をそろえる（ガイド線）
  // ほかの人・物とそろう所に、ガイドの線を出す（線は出すだけで、引っぱらない＝マウスどおりに細かく動かせる）。
  // 画面で1px以内のときだけ、ぴったりそろえる。ガイドの線も要らないときは Shift を押しながら
  function smartSnap(d, dx, dy) {
    const th = 3 / S.view.k, pull = 1 / S.view.k;
    const p0 = d.orig.get(d.primary);
    const prim = byId(d.primary);
    if (!p0 || !prim) return { dx, dy, guides: null };
    const px = p0.x + dx, py = p0.y + dy;
    const others = doc().items.filter(it => !S.sel.has(it.id) && it.type !== 'riser' && it.type !== 'text');
    const guides = [];
    if (prim.type === 'player') {
      const c = conductor();
      const pol = G.polar({ x: px, y: py }, c);
      let best = null;
      others.forEach(o => {
        if (o.type !== 'player') return;
        const q = G.polar(o, c);
        if (Math.abs(q.t - pol.t) > 0.9) return;
        const diff = Math.abs(q.r - pol.r);
        if (diff < th && (!best || diff < best.diff)) best = { r: q.r, diff };
      });
      if (best) {
        guides.push({ kind: 'r', v: best.r, c });
        if (best.diff < pull) { const q = G.fromPolar(best.r, pol.t, c); return { dx: q.x - p0.x, dy: q.y - p0.y, guides }; }
        return { dx, dy, guides };
      }
    }
    let bx = null, by = null;
    others.forEach(o => {
      const ddx = Math.abs(o.x - px), ddy = Math.abs(o.y - py);
      if (ddx < th && (!bx || ddx < bx.d)) bx = { v: o.x, d: ddx };
      if (ddy < th && (!by || ddy < by.d)) by = { v: o.y, d: ddy };
    });
    if (bx) { if (bx.d < pull) dx = bx.v - p0.x; guides.push({ kind: 'x', v: bx.v }); }
    if (by) { if (by.d < pull) dy = by.v - p0.y; guides.push({ kind: 'y', v: by.v }); }
    return { dx, dy, guides: guides.length ? guides : null };
  }

  // ------------------------------------------------------------ 選んだものの近くに出る操作バー
  const ctxBar = $('ctxBar');
  const isVn1 = l => /^(vn|vl|vln|violin|バイオリン|ヴァイオリン)\s*(1|i)$|^1st\s*v/i.test(String(l || '').trim());
  function positionCtxBar() {
    const sel = selected();
    const tb = document.querySelector('.tidy-bar');
    if (!sel.length || (drag && drag.kind !== 'marquee') || S.placing) { ctxBar.hidden = true; if (tb) tb.hidden = false; return; }
    if (tb) tb.hidden = true;
    // 選んだ物のそばに出すと、指やポインタ・となりの人に重なって邪魔なので、画面の下にまとめて出す
    ctxBar.hidden = false;
    const one = sel.length === 1 ? sel[0] : null;
    $('ctxCount').textContent = sel.length > 1 ? sel.length + '個' : (one.type === 'player' ? (one.label || '奏者') : (SS.CATALOG[one.type] || {}).name || '');
    $('ctxRow').hidden = !(one && one.type === 'player');
    $('ctx3d').hidden = !(one && one.type === 'player');
    $('ctxLead').hidden = !sel.every(it => it.type === 'player');
    $('ctxLead').classList.toggle('on', sel.every(it => it.lead));
    $('ctxLead').querySelector('small').textContent = one && one.lead === 'cm' ? 'コンマス' : '首席';
    const ed = $('ctxEdit');
    if (!ed.hidden) {
      const allP = sel.every(it => it.type === 'player');
      $('ctxName').parentElement.hidden = !one || one.type !== 'player';
      $('ctxLabel').placeholder = allP ? 'パート名 (例 Fl1)' : '表示する文字';
      if (document.activeElement !== $('ctxLabel')) $('ctxLabel').value = sel.every(it => it.label === sel[0].label) ? (sel[0].label || '') : '';
      if (one && document.activeElement !== $('ctxName')) $('ctxName').value = one.name || '';
    }
  }
  ctxBar.addEventListener('pointerdown', e => e.stopPropagation());
  ctxBar.querySelectorAll('[data-ctx]').forEach(b => {
    b.onclick = () => {
      const a = b.getAttribute('data-ctx');
      const sel = selected();
      if (a === 'edit') { $('ctxEdit').hidden = !$('ctxEdit').hidden; positionCtxBar(); if (!$('ctxEdit').hidden) $('ctxLabel').focus(); return; }
      if (a === 'row') { selectRowOf(sel[0].id); renderOverlay(); renderProps(); return; }
      if (a === 'view3d') { SS.view3d.open(sel[0].id); return; }
      if (a === 'lead') {
        // 首席の★：1人なら なし → ★首席 → ★コンマス（ヴァイオリン1のとき）→ なし。何人かなら まとめて付ける／外す
        pushHistory();
        if (sel.length === 1) { const it = sel[0]; it.lead = !it.lead ? 'p' : it.lead === 'p' && isVn1(it.label) ? 'cm' : undefined; if (!it.lead) delete it.lead; }
        else { const on = !sel.every(it => it.lead); sel.forEach(it => { if (on) it.lead = it.lead || 'p'; else delete it.lead; }); }
        toast(sel.length === 1 ? (sel[0].lead === 'cm' ? '★CM（コンサートマスター）の印を付けました' : sel[0].lead ? '★（首席）の印を付けました' : '首席の印を外しました') : (sel[0].lead ? `${sel.length}人に★（首席）の印を付けました` : `${sel.length}人の首席の印を外しました`), true);
        render(); renderProps(); positionCtxBar(); return;
      }
      if (a === 'rotL' || a === 'rotR') {
        pushHistory();
        sel.forEach(it => { it.rot = normAngle((it.rot || 0) + (a === 'rotL' ? -15 : 15)); });
        render(); renderProps(); return;
      }
      act(a);
    };
  });
  ['ctxLabel', 'ctxName'].forEach(id => {
    const el = $(id);
    el.addEventListener('focus', () => pushHistory());
    el.addEventListener('input', () => {
      const sel = selected();
      if (id === 'ctxLabel') sel.forEach(it => { it.label = el.value; });
      else if (sel[0]) sel[0].name = el.value;
      render(); renderCounts();
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
  });

  // ------------------------------------------------------------ 置く場所をタップして追加
  function setPlacing(type) {
    S.placing = type;
    $('placeHint').hidden = !type;
    if (type) $('placeHintText').textContent = `「${SS.CATALOG[type].name}」を置きたい場所をタップ`;
    svg.classList.toggle('placing', !!type);
    positionCtxBar();
  }
  $('placeCancel').onclick = () => setPlacing(null);

  function normAngle(a) {
    a = ((a + 180) % 360 + 360) % 360 - 180;
    return Math.round(a * 10) / 10;
  }

  // ------------------------------------------------------------ キーボード
  let clipboard = null;
  document.addEventListener('keydown', e => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag);
    if (e.key === 'Escape') { setPlacing(null); if (S.pick) endPick(); closeModal(); if (!typing) { S.sel.clear(); renderOverlay(); renderProps(); } return; }
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.code === 'Space') { spaceDown = true; svg.classList.add('panning'); e.preventDefault(); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); act('selectAll'); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); act('duplicate'); return; }
    if (mod && e.key.toLowerCase() === 'c') { clipboard = JSON.stringify(selected()); return; }
    if (mod && e.key.toLowerCase() === 'v') {
      if (!clipboard) return;
      e.preventDefault();
      pasteItems(JSON.parse(clipboard));
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); act('delete'); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && S.sel.size) {
      e.preventDefault();
      if (!e.repeat) pushHistory();
      const st = e.altKey ? 1 : e.shiftKey ? 25 : 5; // 矢印キー：5cm、Shift で25cm、Alt で1cm
      selected().forEach(it => { it.x += arrows[e.key][0] * st; it.y += arrows[e.key][1] * st; });
      render();
      return;
    }
    if (e.key.toLowerCase() === 'r' && S.sel.size) {
      pushHistory();
      selected().forEach(it => { it.rot = normAngle((it.rot || 0) + (e.shiftKey ? -15 : 15)); });
      render(); renderProps();
    }
  });
  document.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; svg.classList.toggle('panning', S.mode === 'pan'); } });

  // ------------------------------------------------------------ 追加・複製
  // 出入り口の部品：いちばん近い壁（下手・上手・奥）にくっつけ、舞台の内側を向ける（壁から2.5m以上はなれていれば、そのまま）
  function snapDoor(it) {
    const st = doc().stage, R = SS.render, sz = SS.itemSize(it, {}), h = sz.h;
    const [xl, xr] = R.xRange(st, it.y);
    // 舞台の外（そで・奥の通路）に出したとき：壁の近く（扉の真ん中が壁から OUT_MAG 以内）なら、壁の外側にくっついて
    // そでの方へ開く形（空けておく所がそで側）。それより遠くなら、置いた所のまま舞台のほうを向くだけ（客席の側はそのまま）
    const OUT_MAG = 150;
    const outside = !R.insideStage(st, it, 0);
    const [bl, br] = R.xRange(st, 1);
    const cand = outside ? { k: it.y < 0 && it.x > bl && it.x < br ? 'B' : it.x < (bl + br) / 2 ? 'L' : 'R' }
      : [{ k: 'L', d: Math.abs(it.x - xl) }, { k: 'R', d: Math.abs(it.x - xr) }, { k: 'B', d: Math.abs(it.y) }].sort((a, b) => a.d - b.d)[0];
    if (outside && it.y > R.frontAt(st, Math.max(1, Math.min(st.w - 1, it.x)))) return;
    if (!outside && cand.d > 250 + h / 2) return;
    if (cand.k === 'B') {
      const clampX = () => { it.x = Math.max(bl + sz.w / 2, Math.min(br - sz.w / 2, it.x)); };
      if (!outside) { it.rot = 0; it.y = h / 2; clampX(); } else if (-it.y <= OUT_MAG) { it.rot = 180; it.y = -h / 2; clampX(); } else it.rot = 0;
      return;
    }
    const y = Math.max(20, Math.min(R.frontAt(st, it.x) - 20, it.y));
    const [a0, a1] = R.xRange(st, y - 20), [b0, b1] = R.xRange(st, y + 20);
    const tx = cand.k === 'L' ? b0 - a0 : b1 - a1, L = Math.hypot(tx, 40), t = { x: tx / L, y: 40 / L };
    const n = cand.k === 'L' ? { x: t.y, y: -t.x } : { x: -t.y, y: t.x }; // 壁から舞台の内側へ向く向き
    const wx = cand.k === 'L' ? R.xRange(st, y)[0] : R.xRange(st, y)[1];
    const deg = v => Math.round((Math.atan2(-v.x, v.y) * 180) / Math.PI);
    if (outside && Math.abs(it.x - wx) > OUT_MAG) { it.rot = deg(n); return; }
    const sg = outside ? -1 : 1; // 外にくっつくときは、壁の外側で、そでの方を向く
    it.x = Math.round(wx + sg * n.x * h / 2); it.y = Math.round(y + sg * n.y * h / 2);
    it.rot = deg({ x: sg * n.x, y: sg * n.y });
  }


  function addItem(type, extra, at) {
    const c = SS.CATALOG[type];
    const r = svg.getBoundingClientRect();
    const center = at || toWorld(r.left + r.width / 2, r.top + r.height / 2);
    // 既にあるものと重ならないよう少しずらす
    let p = { x: center.x, y: center.y };
    if (!at) for (let i = 0; i < 30 && doc().items.some(it => Math.hypot(it.x - p.x, it.y - p.y) < 40); i++) { p.x += 30; p.y += 20; }
    const it = Object.assign({ id: newId(), type, x: Math.round(p.x), y: Math.round(p.y), rot: 0 }, extra || {});
    if (type === 'player') {
      it.label = it.label || '';
      it.rot = G.faceAngle(it, conductor());
    } else {
      it.w = c.w; it.h = c.h;
      if (c.label !== undefined && it.label === undefined) it.label = c.label;
      if (type === 'text') it.fontSize = c.fontSize;
      if (type === 'hina') { it.hgt = 21.2; it.panel = '36'; it.orient = 'h'; }
    }
    if (type === 'door') snapDoor(it);
    pushHistory();
    doc().items.push(it);
    S.sel = new Set([it.id]);
    renderAll();
    return it;
  }

  // 打楽器と奏者のまとまり（grp が同じもの）。楽器か奏者を動かす・回すと、いっしょに動く
  const matesOf = it => (it && it.grp ? doc().items.filter(o => o !== it && o.grp === it.grp) : []);
  // it を中心に、まとまりの仲間を deg 度まわす（base：まわす前の位置と向き）
  function turnMates(it, base, deg) {
    const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    base.forEach(b => { const dx = b.x - it.x, dy = b.y - it.y; b.m.x = it.x + dx * ca - dy * sa; b.m.y = it.y + dx * sa + dy * ca; b.m.rot = normAngle(b.rot + deg); });
  }
  function pasteItems(list) {
    if (!list.length) return;
    pushHistory();
    const ids = [];
    const grpMap = new Map(); // 貼り付けた物どうしだけで、新しいまとまりに
    list.forEach(src => {
      const it = Object.assign({}, src, { id: newId(), x: src.x + 40, y: src.y + 40 });
      if (it.grp) { if (!grpMap.has(it.grp)) grpMap.set(it.grp, 'g' + newId()); it.grp = grpMap.get(it.grp); }
      doc().items.push(it);
      ids.push(it.id);
    });
    S.sel = new Set(ids);
    renderAll();
  }

  // ------------------------------------------------------------ 整える・操作
  // 何も選んでいないときは奏者全員が対象（打楽器・鍵盤など列に並ばない人は除く）
  function targetsPlayers() {
    const sel = selected().filter(it => it.type === 'player');
    if (sel.length) return sel;
    return players().filter(it => !/^(perc|kb)$/.test(SS.partGroup(it.label).id));
  }
  function tidyOpts() {
    return { symmetric: $('optSymmetric').checked, evenRows: $('optEvenRows').checked, minGap: opts().seatR * 2 + 14 };
  }

  /**
   * ↔ 間隔を広げる／→← つめる（f 倍）。
   * 床の人：指揮者からの距離を f 倍（向きはそのまま）→ となりとの間隔も列と列の間も広がる。
   * 段の上の人：段ごとに、段の真ん中から横の間隔を f 倍（段の幅に入る所まで）。
   * 舞台・段からはみ出す／段にかかる／重なりが増えるときは、f を 1 に近づけて、できる所まで。戻り値：使った f（できなければ 0）
   */
  function spreadPlayers(list, f) {
    const d = doc(), st = d.stage, c = conductor();
    const tiers = d.items.filter(it => it.type === 'hina');
    const tierOf = p => tiers.find(t => SS.hinaContains(t, p.x, p.y, 0)) || null;
    const orig = new Map(list.map(p => [p, { x: p.x, y: p.y, t: tierOf(p) }]));
    const ovCount = () => SS.checks(d).filter(w => w.kind === 'overlap' || w.kind === 'tieredge').reduce((a, w) => a + w.spots.length, 0);
    const base = ovCount();
    const apply = k => {
      const groups = new Map();
      list.forEach(p => { const o = orig.get(p); if (o.t) { if (!groups.has(o.t)) groups.set(o.t, []); groups.get(o.t).push(p); } else { p.x = c.x + (o.x - c.x) * k; p.y = c.y + (o.y - c.y) * k; } });
      groups.forEach((ps, t) => {
        const a = ((t.rot || 0) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
        ps.forEach(p => { const o = orig.get(p), lx = (o.x - t.x) * ca + (o.y - t.y) * sa, ly = -(o.x - t.x) * sa + (o.y - t.y) * ca, nx = lx * k; p.x = t.x + nx * ca - ly * sa; p.y = t.y + nx * sa + ly * ca; });
      });
    };
    const ok = k => {
      apply(k);
      return list.every(p => { const o = orig.get(p); return onExtension(p) || (SS.render.insideStage(st, p, 26) && (o.t ? SS.hinaContains(o.t, p.x, p.y, -28) || !SS.hinaContains(o.t, o.x, o.y, -28) : !tierOf(p) || !!tierOf(o))); }) && ovCount() <= base;
    };
    // f から 1 へ少しずつ近づけて、できるいちばん大きな（つめるときは小さな）ものを使う
    for (let i = 0; i <= 8; i++) {
      const k = f + ((1 - f) * i) / 8;
      if (Math.abs(k - 1) < 0.004) break;
      if (ok(k)) return k;
    }
    apply(1);
    return 0;
  }

  // ステージからはみ出したものを内側へ入れる。動かした数を返す
  function fitInStage(list) {
    let n = 0;
    const st = doc().stage;
    list.forEach(it => {
      if (it.type === 'text' || onExtension(it)) return; // 花道・ピットのふたの上はそのまま
      const sz = SS.itemSize(it, renderOpts());
      const m = it.type === 'player' ? 26 : Math.min(sz.w, sz.h) / 2;
      const q = SS.render.clampToStage(st, it, m);
      if (Math.abs(q.x - it.x) > 0.5 || Math.abs(q.y - it.y) > 0.5) { it.x = q.x; it.y = q.y; n++; }
    });
    return n;
  }

  /**
   * 段の縁にかかった人を、そっと整える（ドラッグを離したとき自動で）
   * - いすの真ん中が段の上なら、いすと譜面台が段にきちんと乗るまで段の内側へ（譜面台が前の段に落ちていれば少し後ろへ）
   * - いすの真ん中が段の外なら、段から降ろす（いちばん近い前・横のふちの外へ）
   * 打楽器と奏者のまとまりは、いっしょに動かす。動かした人の数を返す
   */
  // floorFirst(p)：その人は床にいた（段が動いてきた）ので、段から降ろすほうを先に試す
  function settleOnTiers(list, floorFirst) {
    const tiers = doc().items.filter(it => it.type === 'hina');
    if (!tiers.length) return 0;
    const fig = { figure: true };
    const NO_STAND = ['perc', 'drs', 'pf', 'hp', 'voice'];
    const top = (x, y, m) => tiers.filter(t => SS.hinaContains(t, x, y, m)).sort((a, b) => (b.hgt || 0) - (a.hgt || 0))[0] || null;
    const straddle = (x, y, r) => tiers.some(t => SS.hinaContains(t, x, y, r) && !SS.hinaContains(t, x, y, -r));
    const ok = p => {
      if (SS.tierStraddle(p, tiers)) return false;
      if (NO_STAND.includes(SS.instrumentKind(p.label))) return true;
      const sp = SS.standPoint(p, fig), t = top(p.x, p.y, 0);
      if (straddle(sp.x, sp.y, 8)) return false;
      return !t || top(sp.x, sp.y, 0) === t;
    };
    let moved = 0;
    const done = new Set();
    list.filter(it => it.type === 'player' && !onExtension(it)).forEach(p => {
      if (done.has(p) || ok(p)) return;
      const t = SS.tierStraddle(p, tiers) || top(p.x, p.y, 30);
      if (!t) return;
      const cands = [];
      const onto = () => {
        const q = { x: p.x, y: p.y, rot: p.rot, label: p.label };
        G.clampOnTier(q, t, 26);
        // いすの背もたれまで段に乗るよう、向きの前へ少しずつ（背もたれが後ろの縁からはみ出すとき）
        const a0 = ((p.rot || 0) * Math.PI) / 180;
        for (let k = 0; k < 8 && SS.tierStraddle(q, [t]); k++) { q.x -= Math.sin(a0) * 3; q.y += Math.cos(a0) * 3; }
        // 譜面台が段から落ちるときは、向きの反対（後ろ）へ少しずつ
        const a = ((p.rot || 0) * Math.PI) / 180;
        for (let k = 0; k < 16 && !ok(q) && SS.hinaContains(t, q.x, q.y, -26); k++) { q.x += Math.sin(a) * 6; q.y -= Math.cos(a) * 6; }
        return q;
      };
      const off = () => { const q = { x: p.x, y: p.y, rot: p.rot, label: p.label }; G.pushOffTier(q, t, 30); for (let k = 0; k < 6 && SS.tierStraddle(q, [t]); k++) G.pushOffTier(q, t, 30 + (k + 1) * 6); return q; };
      if (SS.hinaContains(t, p.x, p.y, 0) && !(floorFirst && floorFirst(p))) cands.push(onto(), off()); else cands.push(off(), onto());
      const best = cands.find(q => ok(q) && SS.render.insideStage(doc().stage, q, 20));
      if (!best) return;
      const dx = best.x - p.x, dy = best.y - p.y;
      [p, ...matesOf(p)].forEach(o => { o.x += dx; o.y += dy; done.add(o); });
      moved++;
    });
    return moved;
  }

  // 花道（設備・部品）・オーケストラピットのふたの上（舞台の外でも、そのままにしてよい所）。花道の部品そのものも舞台の外に置いてよい
  function onExtension(p) {
    const g = SS.fixtureGeom ? SS.fixtureGeom(doc().stage) : {};
    return [g.pit, g.hanamichi].some(r => r && p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1) || p.type === 'runway' || (SS.onRunway && SS.onRunway(doc().items, p));
  }

  /**
   * ✨きれいに整える
   * 1) 奏者ごとに、ひな壇の上か床かを決める（ふちから少しはみ出しているだけの人は段に乗せる）
   * 2) 全体を整えるときは、舞台からはみ出す・舞台奥の通路にかかるひな壇を、上の人・楽器ごと舞台の中へ
   * 3) 床の人は扇形か横一列に。舞台に入らなければ指揮者の方へ少しずつ詰める
   * 4) 床の人が段にかかっていたら、段から降ろす
   * 5) 段の上の人は、段ごとに段の上へきちんと並べる（まっすぐの段は列に、弧の段は弧に）
   */
  function tidyAuto(list, silent) {
    list = list || targetsPlayers();
    if (list.length < 2) { if (!silent) toast('整える奏者がいません'); return; }
    const d = doc(), st = d.stage, R = SS.render;
    const whole = !selected().length;
    const tiers = d.items.filter(it => it.type === 'hina');
    const tierOf = (p, m) => tiers.filter(t => SS.hinaContains(t, p.x, p.y, m)).sort((a, b) => (b.hgt || 0) - (a.hgt || 0))[0] || null;
    // 1) 段の上か床か
    const onT = new Map(), floor = [];
    let lifted = 0;
    list.forEach(p => {
      if (onExtension(p)) return; // 花道・ピットのふたの上の人（ソリストなど）はそのまま
      const t = tierOf(p, 0) || tierOf(p, 14);
      if (t) { if (!SS.hinaContains(t, p.x, p.y, 0)) lifted++; if (!onT.has(t)) onT.set(t, []); onT.get(t).push(p); } else floor.push(p);
    });
    // 0) 指揮台が舞台の外なら舞台の中へ。床の人も同じだけ動かして、形はそのまま
    let movedPodium = false;
    const pod = d.items.find(it => it.type === 'podium');
    if (whole && pod && !R.insideStage(st, pod, 45)) {
      const q = R.clampToStage(st, pod, 45), dx = q.x - pod.x, dy = q.y - pod.y;
      // 床にいる物（段の上の人・楽器は動かさない）
      d.items.filter(it => it === pod || floor.includes(it) || (it.type !== 'hina' && it.type !== 'player' && !onExtension(it) && !tiers.some(t => SS.hinaContains(t, it.x, it.y, 14)))).forEach(it => { it.x += dx; it.y += dy; });
      movedPodium = true;
    }
    const c = conductor();
    // 2) ひな壇を舞台の中へ（上の人・楽器もいっしょに）
    let movedTiers = false;
    if (whole && tiers.length) {
      const pts = [];
      tiers.forEach(t => { const b = SS.itemAABB(t, {}); pts.push({ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x0, y: b.y1 }, { x: b.x1, y: b.y1 }); });
      const fx = st.fixtures || {};
      const back = SS.auto.aisleOf(st) + (fx.shell != null && isFinite(+fx.shell) ? +fx.shell : 0);
      let dy = Math.max(0, back - Math.min(...pts.map(q => q.y)));
      dy = Math.min(dy, Math.max(0, R.frontY(st) - 40 - Math.max(...pts.map(q => q.y))));
      let lo = -Infinity, hi = Infinity;
      pts.forEach(q => { const [xl, xr] = R.xRange(st, Math.max(0, q.y + dy)); lo = Math.max(lo, xl + 5 - q.x); hi = Math.min(hi, xr - 5 - q.x); });
      const dx = lo <= hi ? (lo > 0 ? lo : hi < 0 ? hi : 0) : 0;
      if (Math.abs(dx) > 0.5 || dy > 0.5) {
        const riders = d.items.filter(it => it.type !== 'hina' && !floor.includes(it) && it.type !== 'podium' && tiers.some(t => SS.hinaContains(t, it.x, it.y, 14)));
        tiers.concat(riders).forEach(it => { it.x += dx; it.y += dy; });
        movedTiers = true;
      }
    }
    // 3) 床の人
    const shape = floor.length >= 2 ? G.guessShape(floor, c) : 'line';
    let n = 0;
    if (floor.length >= 2) n += shape === 'arc' ? G.tidyArc(floor, c, tidyOpts()) : G.tidyLine(floor, c, tidyOpts());
    if (shape === 'arc') { opts().arcCurve = 1; opts().arcBase = null; syncArcCurve(); }
    const minD = opts().seatR * 2 + 8;
    const inside = p => R.insideStage(st, p, 26) || onExtension(p);
    let squeezed = false;
    if (floor.length >= 2 && !floor.every(inside)) {
      // 舞台に入らないときは、指揮者の方へ少しずつ詰める（となりとの間隔が狭くなりすぎない所まで）
      const base = floor.map(p => ({ x: p.x, y: p.y }));
      const minPair = () => { let m = Infinity; for (let i = 0; i < floor.length; i++) for (let j = i + 1; j < floor.length; j++) m = Math.min(m, Math.hypot(floor[i].x - floor[j].x, floor[i].y - floor[j].y)); return m; };
      const setF = f => floor.forEach((p, i) => { p.x = c.x + (base[i].x - c.x) * f; p.y = c.y + (base[i].y - c.y) * f; });
      let ok = 1;
      for (let f = 0.98; f >= 0.8; f -= 0.02) {
        setF(f);
        if (minPair() < opts().seatR * 2 + 4) break;
        ok = f;
        if (floor.every(inside)) break;
      }
      setF(ok);
      squeezed = ok < 1;
    }
    // 4) 段から降ろす（重なりを直すと、また段にかかることがあるので数回）
    const lowered = new Set();
    for (let k = 0; k < 3; k++) {
      floor.forEach(p => tiers.forEach(t => { if (G.pushOffTier(p, t, 30)) lowered.add(p); }));
      G.fixOverlap(floor, minD);
    }
    // 5) 段の上の人（打楽器・鍵盤の人は列にせず、段の中へ入れるだけ）
    let tight = 0;
    onT.forEach((ps, t) => {
      const keep = ps.filter(p => ['perc', 'kb'].includes(SS.partGroup(p.label).id));
      const rowers = ps.filter(p => !keep.includes(p));
      if (rowers.length && G.tidyOnTier(rowers, t, c, tidyOpts())) tight++;
      keep.forEach(p => G.clampOnTier(p, t, 30));
      n++;
    });
    // 舞台の中へ入れる → 重なりを直す → 段から降ろす、を数回（ふちに寄せた人どうしが重ならないように）
    for (let k = 0; k < 6; k++) {
      fitInStage(floor);
      floor.forEach(p => tiers.forEach(t => { if (G.pushOffTier(p, t, 30)) lowered.add(p); }));
      G.fixOverlap(floor, minD);
    }
    fitInStage(floor);
    if (silent) return;
    const notes = [];
    const tooWide = whole && tiers.some(t => { const b = SS.itemAABB(t, {}); return [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].some(([x, y]) => !R.insideStage(st, { x, y }, 0)); });
    if (lifted) notes.push(`段から落ちかけていた${lifted}人を段に乗せました`);
    if (lowered.size) notes.push(`段にかかっていた${lowered.size}人を床に降ろしました`);
    if (movedPodium) notes.push('指揮台を舞台の中に動かしました');
    if (movedTiers) notes.push('ひな壇を舞台の中（奥の通路の前）に動かしました');
    if (squeezed) notes.push('舞台に入るよう、床の列を少し詰めました');
    if (tight) notes.push('人数が多い段は、間隔を詰めて段の上に並べました');
    if (tooWide) notes.push('⚠ 舞台より広い（または深い）ひな壇があります。段の幅・段数を減らしてください');
    const over = players().filter(q => !R.insideStage(st, q, 20) && !onExtension(q) && !tiers.some(t => SS.hinaContains(t, q.x, q.y, 0)));
    if (over.length) notes.push(`⚠ 舞台に入りきらない人が${over.length}人います`);
    toast(`${n}列を${shape === 'arc' ? '扇形' : '横一列'}にきれいにそろえました${notes.length ? '。' + notes.join('。') : ''}`, true);
  }

  // 弧のカーブ（スライダー）：床の奏者（ひな壇の上の人は除く）を、ゆるい弧〜扇形に
  function onRiser(it) {
    // まっすぐのひな壇の上の人（弧のひな壇の上の人は、弧のまま整える）
    return doc().items.some(h => h.type === 'hina' && !SS.hinaArc(h) && Math.abs(it.x - h.x) < h.w / 2 && Math.abs(it.y - h.y) < h.h / 2);
  }
  // スライダーを動かし始めたとき、扇形のときの位置（arcBase）を覚えておき、いつもそこから計算する
  function curveStart() {
    pushHistory();
    const o = opts();
    if (o.arcCurve == null || o.arcCurve >= 0.999 || !o.arcBase) o.arcBase = {};
    curveList().forEach(it => { if (!o.arcBase[it.id]) o.arcBase[it.id] = { x: it.x, y: it.y }; });
  }
  function curveList() {
    const sel = selected().filter(it => it.type === 'player');
    return sel.length >= 2 ? sel : players().filter(it => !onRiser(it) && !['perc', 'kb'].includes(SS.partGroup(it.label).id));
  }
  $('arcCurve').addEventListener('pointerdown', curveStart);
  $('arcCurve').addEventListener('keydown', curveStart);
  $('arcCurve').addEventListener('input', e => {
    const k = +e.target.value / 100;
    $('arcCurveVal').textContent = k >= 0.99 ? '扇形' : k <= 0.02 ? 'まっすぐ' : Math.round(k * 100) + '%';
    const o = opts();
    if (!o.arcBase) curveStart();
    const list = curveList();
    if (list.length < 2) return;
    list.forEach(it => { const b = o.arcBase[it.id]; if (b) { it.x = b.x; it.y = b.y; } });
    G.tidyArc(list, conductor(), Object.assign(tidyOpts(), { curve: k }));
    o.arcCurve = k;
    if (k >= 0.999) o.arcBase = null;
    render();
  });
  function syncArcCurve() {
    const k = opts().arcCurve == null ? 1 : opts().arcCurve;
    $('arcCurve').value = Math.round(k * 100);
    $('arcCurveVal').textContent = k >= 0.99 ? '扇形' : k <= 0.02 ? 'まっすぐ' : Math.round(k * 100) + '%';
  }

  function act(name) {
    const sel = selected();
    const c = conductor();
    const needSel = n => { if (sel.length < n) { toast(n === 1 ? '先に部品を選んでください' : `${n}つ以上選んでください`); return false; } return true; };
    switch (name) {
      case 'tidy': {
        pushHistory();
        tidyAuto();
        break;
      }
      case 'tidyArc': {
        // 何も選んでいないときは、ひな壇の上の人（まっすぐの列）は動かさない
        const list = sel.length ? targetsPlayers() : targetsPlayers().filter(it => !onRiser(it)); if (list.length < 2) return toast('奏者が2人以上必要です');
        pushHistory();
        const n = G.tidyArc(list, c, tidyOpts());
        opts().arcCurve = 1; opts().arcBase = null; syncArcCurve();
        G.fixOverlap(list, opts().seatR * 2 + 8);
        fitInStage(list);
        toast(`${n}列を扇形にそろえました`, true);
        break;
      }
      case 'tidyLine': {
        const list = targetsPlayers(); if (list.length < 2) return toast('奏者が2人以上必要です');
        pushHistory();
        const n = G.tidyLine(list, c, tidyOpts());
        fitInStage(list);
        toast(`${n}列を横一列にそろえました`, true);
        break;
      }
      case 'faceConductor': {
        const list = sel.length ? sel.filter(it => it.type !== 'podium') : players();
        pushHistory();
        list.forEach(it => { it.rot = normAngle(G.faceAngle(it, c)); });
        break;
      }
      case 'faceFront': {
        const list = sel.length ? sel : players();
        pushHistory();
        list.forEach(it => { it.rot = 0; });
        break;
      }
      case 'fixOverlap': {
        const list = targetsPlayers();
        pushHistory();
        G.fixOverlap(list, opts().seatR * 2 + 8);
        toast('重なりを直しました');
        break;
      }
      case 'mirror': {
        const list = sel.length ? sel : doc().items.filter(it => it.type !== 'podium');
        pushHistory();
        list.forEach(it => { it.x = 2 * c.x - it.x; it.rot = normAngle(-(it.rot || 0)); });
        toast('左右を入れ替えました', true);
        break;
      }
      case 'arrangePerc': {
        const has = doc().items.some(it => SS.auto.PERC_TYPES.has(it.type) || (it.type === 'player' && SS.partGroup(it.label).id === 'perc'));
        if (!has) return toast('打楽器（楽器かPercの奏者）がありません');
        pushHistory();
        const place = (doc().ensemble && doc().ensemble.percPlace) || 'back';
        SS.auto.arrangePercIn(doc().items, doc().stage, place, { side: !['orch', 'strings'].includes((doc().ensemble || {}).type) });
        toast({ back: '打楽器を舞台奥に並べました', top: '打楽器をひな壇の最上段に並べました', left: '打楽器を下手側（扇形の外側、前から）に並べました', both: 'ティンパニ・鍵盤を最上段、太鼓類を下手に並べました' }[place], true);
        break;
      }
      case 'spreadOut': case 'spreadIn': {
        const list = targetsPlayers(); if (list.length < 2) return toast('奏者が2人以上必要です');
        pushHistory();
        const r = spreadPlayers(list, name === 'spreadOut' ? 1.08 : 0.94);
        if (!r) toast(name === 'spreadOut' ? 'これ以上広げると、舞台やひな壇からはみ出します' : 'これ以上つめると、いすや譜面台が重なります');
        else toast(name === 'spreadOut' ? `間隔を${Math.round((r - 1) * 100)}%広げました` : `間隔を${Math.round((1 - r) * 100)}%つめました`, true);
        break;
      }
      case 'alignHina': {
        const hs = doc().items.filter(it => it.type === 'hina');
        if (hs.length < 2) return toast('ひな壇が2段以上ありません');
        pushHistory();
        const widest = hs.reduce((a, b) => (b.w > a.w ? b : a));
        hs.forEach(h => { h.w = widest.w; h.x = widest.x; });
        toast(`${hs.length}段の横幅を${(widest.w / 100).toFixed(2)}m（平台${SS.hinaMaterials(widest).across}枚分）にそろえました`, true);
        break;
      }
      case 'fitStage': {
        pushHistory();
        const n = fitInStage(doc().items);
        toast(n ? `${n}個をステージの内側に入れました` : 'はみ出しているものはありません', !!n);
        break;
      }
      case 'alignLeft': case 'alignRight': case 'alignCenterX':
      case 'alignTop': case 'alignBottom': case 'alignCenterY': {
        if (!needSel(2)) return;
        pushHistory();
        const xs = sel.map(it => it.x), ys = sel.map(it => it.y);
        const v = {
          alignLeft: Math.min(...xs), alignRight: Math.max(...xs), alignCenterX: G.mean(xs),
          alignTop: Math.min(...ys), alignBottom: Math.max(...ys), alignCenterY: G.mean(ys),
        }[name];
        sel.forEach(it => { if (/Left|Right|CenterX/.test(name)) it.x = v; else it.y = v; });
        break;
      }
      case 'distH': case 'distV': {
        if (!needSel(3)) return;
        pushHistory();
        const key = name === 'distH' ? 'x' : 'y';
        const s = sel.slice().sort((a, b) => a[key] - b[key]);
        const a = s[0][key], b = s[s.length - 1][key];
        s.forEach((it, i) => { it[key] = a + ((b - a) * i) / (s.length - 1); });
        break;
      }
      case 'duplicate': {
        if (!needSel(1)) return;
        pasteItems(JSON.parse(JSON.stringify(sel)));
        return;
      }
      case 'delete': {
        if (!needSel(1)) return;
        pushHistory();
        doc().items = doc().items.filter(it => !S.sel.has(it.id));
        toast(`${S.sel.size}個を削除しました`, true);
        S.sel.clear();
        break;
      }
      case 'selectAll':
        S.sel = new Set(doc().items.map(it => it.id));
        break;
      case 'selectSamePart': {
        if (!needSel(1)) return;
        const labels = new Set(sel.map(it => (it.type === 'player' ? 'p:' + (it.label || '') : 't:' + it.type)));
        S.sel = new Set(doc().items.filter(it => labels.has(it.type === 'player' ? 'p:' + (it.label || '') : 't:' + it.type)).map(it => it.id));
        toast(`${S.sel.size}個を選びました`);
        break;
      }
      default: return;
    }
    renderAll();
  }
  SS.act = act;

  document.querySelectorAll('[data-act]').forEach(b => { b.onclick = () => act(b.getAttribute('data-act')); });
  $('btnTidy').onclick = () => act('tidy');
  $('btnTidyMobile').onclick = () => { closePanels(); act('tidy'); };

  // ------------------------------------------------------------ 選択中の部品のプロパティ
  const COMMON_PARTS = ['Picc', 'Fl', 'Fl1', 'Fl2', 'Ob', 'Ob1', 'Ob2', 'E.H.', 'Fg', 'Fg1', 'Fg2', 'Es.Cl', 'Cl', 'Cl1', 'Cl2', 'Cl3', 'B.Cl', 'A.Sx', 'A.Sx1', 'A.Sx2', 'T.Sx', 'B.Sx', 'S.Sx',
    'Hr', 'Hr1', 'Hr2', 'Hr3', 'Hr4', 'Tp', 'Tp1', 'Tp2', 'Tp3', 'Tb', 'Tb1', 'Tb2', 'Tb3', 'B.Tb', 'Euph', 'Tuba', 'St.B', 'Perc', 'Timp', 'Pf', 'Hp',
    'Vn1', 'Vn2', 'Va', 'Vc', 'Cb'];

  // ------------------------------------------------------------ ケーブル（マイクから舞台袖までの通り道）
  // pts は (x, y) からの位置。x, y は折れ線の外枠の真ん中
  const cableAbs = c => (c.pts || []).map(q => ({ x: c.x + q[0], y: c.y + q[1] }));
  function setCablePts(c, abs) {
    const xs = abs.map(p => p.x), ys = abs.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    c.x = Math.round((x0 + x1) / 2); c.y = Math.round((y0 + y1) / 2);
    c.w = Math.max(10, Math.round(x1 - x0)); c.h = Math.max(10, Math.round(y1 - y0));
    c.pts = abs.map(p => [Math.round(p.x - c.x), Math.round(p.y - c.y)]);
  }
  // マイク・モニターから、下手（L）か上手（R）の袖までの道。客席側の物は舞台の前のふちに沿って、
  // 奥の物は舞台奥の通路を通す（奏者の列を横切らないように）。あとで折れ点をドラッグして直せる
  function addCable(it, side) {
    const st = doc().stage, R = SS.render;
    const fx = st.fixtures || {};
    const backY = (fx.shell != null && isFinite(+fx.shell) ? +fx.shell : 0) + Math.max(20, SS.auto.aisleOf(st) / 2);
    const front = it.y > st.d * 0.55;
    const yr = front ? R.frontAt(st, it.x) - 25 : backY;
    const [xl, xr] = R.xRange(st, Math.max(1, yr));
    const xe = side === 'L' ? xl - 120 : xr + 120;
    const c = { id: newId(), type: 'cable', rot: 0, label: side === 'L' ? '下手袖へ' : '上手袖へ', from: it.id };
    setCablePts(c, [{ x: it.x, y: it.y }, { x: it.x, y: yr }, { x: side === 'L' ? xl + 10 : xr - 10, y: yr }, { x: xe, y: yr }]);
    pushHistory();
    doc().items.push(c);
    S.sel = new Set([c.id]);
    renderAll();
    toast('ケーブルの通り道を引きました。白い丸をドラッグすると道を直せます', true);
  }

  function renderProps(valuesOnly) {
    const sel = selected();
    const info = $('selInfo'), box = $('selProps');
    if (valuesOnly && sel.length === 1) {
      const it = sel[0];
      const r = $('propRot'); if (r && document.activeElement !== r) { r.value = Math.round(it.rot || 0); $('propRotVal').textContent = Math.round(it.rot || 0) + '°'; }
      const w = $('propW'); if (w && document.activeElement !== w) w.value = it.w;
      const h = $('propH'); if (h && document.activeElement !== h) h.value = it.h;
      return;
    }
    // 選んだときだけ使うボタンは、選んだときだけ出す
    $('alignBox').hidden = sel.length < 2;
    document.querySelectorAll('#selTab .sel-only').forEach(b => { b.hidden = !sel.length; });
    $('selOps').hidden = !sel.length;
    if (!sel.length) { info.classList.remove('hidden'); box.innerHTML = ''; return; }
    info.classList.add('hidden');
    const allPlayers = sel.every(it => it.type === 'player');
    const one = sel.length === 1 ? sel[0] : null;
    const esc = SS.esc;
    let h = `<div class="hint"><b>${sel.length}個</b>選択中${one ? '：' + esc(one.type === 'player' ? '奏者' : (SS.CATALOG[one.type] || {}).name || '') : ''}</div>`;
    const same = key => { const v = sel[0][key]; return sel.every(it => it[key] === v) ? v : ''; };
    if (allPlayers || (one && one.type !== 'player')) {
      h += `<label class="field">${allPlayers ? 'パート名' : '表示する文字'}<input id="propLabel" list="partList" value="${esc(same('label') || '')}" placeholder="${sel.length > 1 && !same('label') ? '（いろいろ）' : ''}"></label>`;
    }
    if (one && one.type === 'player') {
      h += `<label class="field">名前<input id="propName" value="${esc(one.name || '')}" placeholder="例: 山田"></label>`;
      h += `<label class="field">首席の印<select id="propLead"><option value="">なし</option><option value="p"${one.lead === 'p' ? ' selected' : ''}>★ パートのトップ（首席）</option><option value="cm"${one.lead === 'cm' ? ' selected' : ''}>★CM コンサートマスター</option></select></label>`;
    }
    if (allPlayers) {
      const lit = sel.filter(it => it.light).length;
      h += `<label class="check"><input type="checkbox" id="propLight"${lit === sel.length ? ' checked' : ''}> 譜面灯をつける${sel.length > 1 && lit && lit < sel.length ? `（いま${lit}人）` : ''}</label>`;
    }
    if (allPlayers) {
      // 譜面台：弦楽器は2人で1本がふつう。ほかの組み方にもできる
      const pairs = SS.standPairs(doc().items);
      const paired = sel.filter(it => pairs.has(it)).length;
      h += `<p class="hint small" style="margin:8px 0 4px">譜面台：${one ? (pairs.has(one) ? `2人で1本（となりの ${esc(pairs.get(one).label || '')} と）` : '1人で1本') : `2人で1本の人 ${paired}人／${sel.length}人`}</p><div class="tool-grid">`;
      if (sel.length === 2) h += `<button class="btn" id="propDesk2">この2人で1本にする</button>`;
      if (paired) h += `<button class="btn" id="propSolo">1人1本にする</button>`;
      if (sel.some(it => it.desk)) h += `<button class="btn" id="propDeskAuto" title="弦楽器は、となりの同じパートの人と自動で2人1本にします">自動にもどす</button>`;
      h += '</div>';
    }
    if (one && ['mic', 'micTall', 'monitor'].includes(one.type)) {
      h += `<p class="hint small" style="margin:6px 0 4px">ケーブルの通り道を、舞台袖まで線で描きます。</p><div class="row2"><button class="btn" id="propCableL">← 下手の袖へ</button><button class="btn" id="propCableR">上手の袖へ →</button></div>`;
    }
    if (one && one.type === 'cable') {
      h += `<p class="hint small">白い丸（折れ点）をドラッグして通り道を直せます。</p><button class="btn" id="propCablePt">＋ 折れ点を足す</button>`;
    }
    if (one && one.type === 'text') {
      h += `<label class="field">文字の大きさ<input id="propFont" type="range" min="12" max="120" value="${one.fontSize || 36}"></label>`;
    }
    if (one && one.type === 'hina') {
      const m = SS.hinaMaterials(one);
      h += `<label class="field">高さ<select id="propHgt">${SS.RISER_HEIGHTS.map(x => `<option value="${x.v}"${Math.abs(x.v - (one.hgt || 21.2)) < 0.6 ? ' selected' : ''}>${x.name}：${x.how}</option>`).join('')}</select></label>`;
      const curT = SS.hinaTypeOf({ panel: one.panel, orient: one.orient, deep: m.deep });
      h += `<p class="hint small" style="margin:4px 0">平台の置き方（押すと奥行が変わります）</p><div class="hina-types" id="propHinaTypes">${SS.HINA_TYPES.map(t => `<button class="hina-type${curT && curT.id === t.id ? ' on' : ''}" data-ht="${t.id}" title="${SS.esc(t.hint)}">${SS.hinaTypeSVG(t)}<b>${SS.esc(t.name)}</b><small>奥行${Math.round(SS.hinaTypeDepth(t))}cm</small></button>`).join('')}</div>`;
      const arcH = SS.hinaArc(one);
      h += `<div class="row2"><label class="field">形<select id="propHinaShape"><option value="line"${arcH ? '' : ' selected'}>まっすぐ</option><option value="arc"${arcH ? ' selected' : ''}>弧（円形）</option></select></label>${arcH ? `<label class="field">弧の半径（前のふち, m）<input id="propCurve" type="number" step="0.1" min="2" max="40" value="${(arcH.R / 100).toFixed(1)}"></label>` : ''}</div>`;
      if (arcH) h += `<button class="btn" id="propCurveCenter" title="指揮台が弧の中心になるように、半径と向きを合わせます">🎯 指揮者を弧の中心にする</button>`;
      h += `<p class="hint small" style="margin:6px 0 0">平台 ${SS.esc(m.panelName)}：${arcH ? `扇に並べて${m.panels}枚（前の列${SS.hinaPanels(one).filter(q => q.row === 0).length}枚）` : `横${m.across}枚×奥${m.deep}枚＝${m.panels}枚`}</p>`;
      h += `<p class="hint small">必要な部材の目安：平台 ${m.panels}枚${m.legs ? `／${m.legName} ${m.legs}個` : ''}</p>`;
    }
    if (one && one.type !== 'player' && one.type !== 'text' && one.type !== 'cable') {
      h += `<div class="row2"><label class="field">${SS.hinaArc && SS.hinaArc(one) ? '前のふちの弧の長さ(cm)' : '幅(cm)'}<input id="propW" type="number" min="10" step="5" value="${one.w}"></label><label class="field">奥行(cm)<input id="propH" type="number" min="10" step="5" value="${one.h}"></label></div>`;
    }
    if (one && one.type !== 'cable') {
      h += `<label class="field">向き <span id="propRotVal">${Math.round(one.rot || 0)}°</span><input id="propRot" type="range" min="-180" max="180" step="5" value="${Math.round(one.rot || 0)}"></label>`;
    }
    const col = same('color') || (one ? SS.itemColor(one, renderOpts()) : '#ffffff');
    h += `<div class="row2"><label class="field">色<input id="propColor" type="color" value="${/^#[0-9a-f]{6}$/i.test(col) ? col : '#ffffff'}"></label>`;
    h += `<label class="field">&nbsp;<button class="btn" id="propColorReset">色を元に戻す</button></label></div>`;
    // 打楽器と奏者のまとまり：くっつける／はなす
    const grouped = sel.some(it => it.grp);
    const linkable = !grouped && sel.length >= 2 && sel.some(it => it.type === 'player') && sel.some(it => SS.auto.PERC_TYPES.has(it.type) || ['piano', 'pianoFull', 'upright', 'keyboard', 'harp', 'drums'].includes(it.type)) && sel.filter(it => it.type === 'player').length === 1;
    if (grouped) h += `<label class="check" title="楽器か奏者を動かす・回すと、いっしょに動きます（Alt を押しながらだと、それだけ動きます）"><input type="checkbox" id="propGrp" checked> 楽器と奏者をいっしょに動かす</label>`;
    else if (linkable) h += `<button class="btn wide" id="propLink" title="選んだ奏者を、選んだ楽器の演奏する位置にくっつけて、いっしょに動くようにします">🔗 楽器と奏者をくっつける（いっしょに動く）</button>`;
    h += `<datalist id="partList">${COMMON_PARTS.map(p => `<option value="${p}">`).join('')}</datalist>`;
    box.innerHTML = h;
    if ($('propGrp')) $('propGrp').onchange = () => { pushHistory(); const gs = new Set(sel.map(it => it.grp).filter(Boolean)); doc().items.forEach(it => { if (gs.has(it.grp)) delete it.grp; }); render(); renderProps(); toast('楽器と奏者を、べつべつに動かせるようにしました', true); };
    if ($('propLink')) $('propLink').onclick = () => {
      pushHistory();
      const g = 'g' + newId();
      sel.forEach(it => { it.grp = g; });
      // 奏者を、楽器を演奏する位置（楽器のすぐ後ろ、楽器の向き）へ
      const pl = sel.find(it => it.type === 'player'), ins = sel.filter(it => it !== pl);
      const timps = ins.filter(it => /^timp/.test(it.type));
      const main = timps.length ? null : ins.reduce((a, b) => (SS.itemSize(b, {}).w * SS.itemSize(b, {}).h > SS.itemSize(a, {}).w * SS.itemSize(a, {}).h ? b : a));
      const ref = main || timps[0], a = ((ref.rot || 0) * Math.PI) / 180;
      const cx = main ? main.x : timps.reduce((q, t) => q + t.x, 0) / timps.length, cy = main ? main.y : timps.reduce((q, t) => q + t.y, 0) / timps.length;
      const back = main ? 24 + SS.itemSize(main, {}).h / 2 : 70; // ティンパニは太鼓の弧の真ん中
      pl.x = cx + Math.sin(a) * back; pl.y = cy - Math.cos(a) * back; pl.rot = ref.rot || 0;
      render(); renderProps();
      toast('奏者を楽器を演奏する位置にくっつけました。どちらを動かしても、いっしょに動きます', true);
    };

    const bind = (id, ev, fn) => {
      const el = $(id); if (!el) return;
      el.addEventListener('focus', () => pushHistory());
      el.addEventListener(ev, () => { fn(el); render(); renderCounts(); });
    };
    bind('propLabel', 'input', el => sel.forEach(it => { it.label = el.value; }));
    bind('propName', 'input', el => { one.name = el.value; });
    bind('propLead', 'change', el => { if (el.value) one.lead = el.value; else delete one.lead; });
    bind('propFont', 'input', el => { one.fontSize = +el.value; });
    bind('propW', 'input', el => { if (+el.value >= 10) one.w = +el.value; });
    bind('propH', 'input', el => { if (+el.value >= 10) one.h = +el.value; });
    bind('propRot', 'input', el => { const d = +el.value - (one.rot || 0); const gm = matesOf(one).map(m => ({ m, x: m.x, y: m.y, rot: m.rot || 0 })); one.rot = +el.value; turnMates(one, gm, d); $('propRotVal').textContent = el.value + '°'; });
    bind('propHgt', 'change', el => { one.hgt = +el.value; renderProps(); });
    // 弧のひな壇：指揮台（なければ舞台の前の真ん中）を中心にする半径・向き
    const curveToConductor = it => {
      const c = conductor(), vx = c.x - it.x, vy = c.y - it.y;
      it.rot = normAngle((Math.atan2(-vx, vy) * 180) / Math.PI);
      it.curve = Math.max(200, Math.round(Math.hypot(vx, vy) - it.h / 2));
    };
    bind('propHinaShape', 'change', el => { if (el.value === 'arc') curveToConductor(one); else delete one.curve; renderProps(); });
    bind('propCurve', 'change', el => { const v = +el.value; if (v >= 2) one.curve = Math.round(v * 100); });
    if ($('propCurveCenter')) $('propCurveCenter').onclick = () => { pushHistory(); curveToConductor(one); render(); renderProps(); renderCounts(); };
    if ($('propLight')) $('propLight').onchange = e => { pushHistory(); sel.forEach(it => { if (e.target.checked) it.light = true; else delete it.light; }); render(); renderCounts(); renderProps(); };
    if ($('propDesk2')) $('propDesk2').onclick = () => {
      pushHistory();
      const id = 'd' + newId();
      // 前の相手は、決めた組みを外して自動にもどす
      sel.forEach(it => { if (it.desk && it.desk !== 'solo') doc().items.forEach(o => { if (o !== it && o.desk === it.desk) delete o.desk; }); it.desk = id; });
      render(); renderCounts(); renderProps();
    };
    if ($('propSolo')) $('propSolo').onclick = () => {
      pushHistory();
      const pairs = SS.standPairs(doc().items);
      sel.forEach(it => { const b = pairs.get(it); it.desk = 'solo'; if (b && b.desk && b.desk !== 'solo' && !sel.includes(b)) delete b.desk; });
      render(); renderCounts(); renderProps();
    };
    if ($('propDeskAuto')) $('propDeskAuto').onclick = () => { pushHistory(); sel.forEach(it => { delete it.desk; }); render(); renderCounts(); renderProps(); };
    if ($('propCableL')) $('propCableL').onclick = () => addCable(one, 'L');
    if ($('propCableR')) $('propCableR').onclick = () => addCable(one, 'R');
    if ($('propCablePt')) $('propCablePt').onclick = () => {
      // いちばん長い区間の真ん中に折れ点を足す
      pushHistory();
      const abs = cableAbs(one);
      let bi = 0, bl = -1;
      for (let i = 0; i < abs.length - 1; i++) { const l = Math.hypot(abs[i + 1].x - abs[i].x, abs[i + 1].y - abs[i].y); if (l > bl) { bl = l; bi = i; } }
      abs.splice(bi + 1, 0, { x: Math.round((abs[bi].x + abs[bi + 1].x) / 2), y: Math.round((abs[bi].y + abs[bi + 1].y) / 2) });
      setCablePts(one, abs);
      render();
    };
    box.querySelectorAll('#propHinaTypes [data-ht]').forEach(b => {
      b.onclick = () => {
        const t = SS.HINA_TYPES.find(x => x.id === b.getAttribute('data-ht'));
        pushHistory();
        one.panel = t.panel; one.orient = t.orient;
        // 幅は平台の枚数単位に、奥行はこの型の奥行に
        const P = SS.panelSize(one);
        one.w = Math.max(1, Math.round(one.w / P.w)) * P.w;
        one.h = P.d * t.deep;
        render(); renderCounts(); renderProps();
      };
    });
    bind('propColor', 'input', el => sel.forEach(it => { it.color = el.value; }));
    $('propColorReset').onclick = () => { pushHistory(); sel.forEach(it => { delete it.color; }); renderAll(); };
    ['propLabel', 'propName'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
    });
  }

  // ------------------------------------------------------------ 編成表
  // 「かんたん編成」の設定人数（▲▼）と、いま舞台にいる人数をくらべる
  function ensCompare() {
    const d = doc();
    if (!d.ensemble) return null;
    const st = d.ensemble;
    const keys = Object.keys(st.counts);
    const onStage = {};
    let other = 0;
    d.items.forEach(it => {
      if (it.type !== 'player') return;
      let k = (it.label || '').trim();
      if (!(k in st.counts) && /^tim/i.test(k) && 'Perc' in st.counts && !('Timp' in st.counts)) k = 'Perc'; // 吹奏楽ではティンパニ奏者も「Perc」の人数
      if (k in st.counts) onStage[k] = (onStage[k] || 0) + 1; else other++;
    });
    const setTotal = keys.reduce((a, k) => a + (st.counts[k] || 0), 0);
    const stageTotal = d.items.filter(it => it.type === 'player').length;
    const diffs = keys.filter(k => (onStage[k] || 0) !== (st.counts[k] || 0)).map(k => ({ k, set: st.counts[k] || 0, now: onStage[k] || 0 }));
    return { setTotal, stageTotal, diffs, other, onStage };
  }
  function renderEnsTotal() {
    const c = ensCompare();
    const stageTotal = players().length;
    if (!c || (!c.diffs.length && !c.other)) {
      $('ensTotal').innerHTML = `合計 ${stageTotal} 人`;
      return;
    }
    const list = c.diffs.slice(0, 6).map(x => `${SS.esc(x.k)} ${x.set}→<b>${x.now}</b>`).join('、') + (c.diffs.length > 6 ? ' ほか' : '') + (c.other ? `${c.diffs.length ? '、' : ''}その他のパート名 ${c.other}人` : '');
    $('ensTotal').innerHTML = `合計 ${stageTotal} 人 <span class="ens-sub">（▲▼の設定は ${c.setTotal} 人）</span>
      <div class="ens-diff">舞台の上の人数が、▲▼の設定と違います（手で消した・足した人がいます）：${list}
      <br><button class="btn" id="ensSync">▲▼の人数を、いまの舞台に合わせる</button>
      <span class="small">※そのまま▲▼を押すと、設定の人数で並べ直します</span></div>`;
    $('ensSync').onclick = () => {
      const st = ens();
      pushHistory();
      Object.keys(st.counts).forEach(k => { st.counts[k] = c.onStage[k] || 0; });
      renderSteppers();
      renderCounts();
      toast('▲▼の人数を、いまの舞台に合わせました（配置はそのまま）', true);
    };
  }

  function renderCounts() {
    renderEnsTotal();
    const c = SS.render.counts(doc());
    const cmp = ensCompare();
    let h = `<div class="total">合計 ${c.total} 人${cmp && cmp.setTotal !== c.total ? `<span class="ens-sub">（かんたん編成の▲▼の設定は ${cmp.setTotal} 人）</span>` : ''}</div>`;
    if (!c.total) h += '<p class="hint">奏者がまだいません。</p>';
    h += '<table class="count-table">';
    c.groups.forEach(x => {
      const sum = x.parts.reduce((a, p) => a + p.n, 0);
      h += `<tr class="grp"><td><span class="swatch" style="background:${x.g.color}"></span>${x.g.name}</td><td>${sum}</td></tr>`;
      x.parts.forEach(p => { h += `<tr><td data-part="${SS.esc(p.label)}" style="cursor:pointer" title="クリックで選択">　${SS.esc(p.label)}</td><td>${p.n}</td></tr>`; });
    });
    h += '</table><p class="hint small">パート名をクリックすると、そのパートの人をまとめて選べます。</p>';
    // 用意する物（備品）の数
    const eq = SS.equipmentSummary(doc().items);
    if (eq.length) {
      h += '<h3 style="margin-top:16px">用意する物（目安）</h3><table class="count-table eq-table">';
      eq.forEach(e => { h += `<tr><td>${SS.esc(e.name)}${e.note ? `<span class="small eq-note">${SS.esc(e.note)}</span>` : ''}</td><td>${e.n}</td></tr>`; });
      h += '</table><p class="hint small">図に置いた人・物から数えた目安です。ホールの備品の数と、予備も確かめてください。画像・PDF にも「用意する物の表を入れる」で入れられます。</p>';
    }
    const sm = SS.hinaSummary(doc().items);
    if (sm.rows.length) {
      const { pan, leg } = sm;
      h += '<h3 style="margin-top:16px">ひな壇の部材（目安）</h3><ul class="mat-list">';
      sm.rows.forEach(r => {
        h += `<li>${SS.esc(r.label)} 高さ${SS.heightName(r.hgt)}：幅${(r.w / 100).toFixed(1)}m×奥行${(r.h / 100).toFixed(1)}m → 平台${r.panels}枚<span class="small">（番号 ${SS.esc(r.first)}〜${SS.esc(r.last)}）</span>${r.legs ? '＋' + r.legName + r.legs + '個' : ''}</li>`;
      });
      h += '</ul><p class="hint small"><b>合計</b>：' + Object.keys(pan).map(k => `平台${k} ${pan[k]}枚`).concat(Object.keys(leg).map(k => `${k} ${leg[k]}個`)).concat(sm.stairs ? [`上がり段 ${sm.stairs}台`] : []).join('／') + '<br>※平台の番号は、図の平台に書いた番号と同じです（段の番号-前の列の下手から数えた番号）。<br>※足の数は「平台の前後の辺に、つなぎ目ごとに置く」ときの目安です。ホールの備品数を確認してください。<br>組み図だけを出すときは「📤 書き出す」の画像・PDF・印刷の画面の「中身」で「ひな壇の組み図」をえらびます。</p>';
    }
    // 譜面灯・電源
    const pw = SS.powerSummary(doc().items), sc = SS.standCount(doc().items);
    h += `<h3 style="margin-top:16px">譜面台・譜面灯・電源</h3>
      <p class="hint small" style="margin:0 0 4px">譜面台 <b>${sc.stands}本</b>${sc.shared ? `（弦楽器などは2人で1本：${sc.shared}組）` : ''}<br>2人で1本・1人で1本は、奏者を選んで「選択中」で変えられます。</p>
      <p class="hint small" style="margin:0 0 6px">譜面灯 <b>${pw.lights}台</b>${pw.devices ? `／電源が要る機材（アンプ・キーボード・モニター）${pw.devices}台` : ''}<br>
      必要な差し込み口：<b>${pw.need}口</b>${pw.need ? `（2口のコンセントなら <b>${pw.wall}か所</b>分）` : ''}
      ${pw.outlets || pw.taps ? `<br>図に置いたもの：コンセント${pw.outlets}か所・延長コード（4口）${pw.taps}本 → 使える口 ${pw.have}口 <b class="${pw.have >= pw.need ? 'q-ok' : 'q-est'}">${pw.have >= pw.need ? '足ります' : `あと${pw.need - pw.have}口足りません`}</b>` : ''}</p>
      <div class="row2"><button class="btn" id="lightsOn">💡 全員に譜面灯</button><button class="btn" id="lightsOff">全員はずす</button></div>
      <p class="hint small">1人ずつは、奏者を選んで「選択中」の「譜面灯をつける」で。</p>`;
    $('countTable').innerHTML = h;
    $('lightsOn').onclick = () => { pushHistory(); players().forEach(it => { it.light = true; }); render(); renderCounts(); toast(`${players().length}人に譜面灯をつけました`, true); };
    $('lightsOff').onclick = () => { pushHistory(); players().forEach(it => { delete it.light; }); render(); renderCounts(); toast('譜面灯をすべてはずしました', true); };
    $('countTable').querySelectorAll('[data-part]').forEach(td => {
      td.onclick = () => {
        const l = td.getAttribute('data-part');
        S.sel = new Set(players().filter(it => ((it.label || '').trim() || '（未設定）') === l).map(it => it.id));
        renderOverlay(); renderProps();
        openRightTab('selTab');
      };
    });
  }

  // ------------------------------------------------------------ 設定
  function renderSettings() {
    const d = doc(), o = d.options;
    // 図面の情報欄は「画像・PDFとして保存」の画面にある（開いているときだけ）
    INFO_FIELDS.forEach(([id, key]) => { if ($(id) && document.activeElement !== $(id)) $(id).value = d.info[key] == null ? '' : d.info[key]; });
    renderFoldSummaries();
    if (document.activeElement !== $('stageW')) $('stageW').value = d.stage.w / 100;
    if (document.activeElement !== $('stageD')) $('stageD').value = d.stage.d / 100;
    $('stageShape').value = d.stage.shape || 'rect';
    $('stageBWWrap').hidden = !['shell', 'arc', 'round'].includes(d.stage.shape);
    $('stageSagWrap').hidden = d.stage.shape !== 'arc';
    if (document.activeElement !== $('stageSag')) $('stageSag').value = Math.round(SS.render.arcSag(d.stage)) / 100;
    if (document.activeElement !== $('stageBW')) $('stageBW').value = Math.round(SS.render.backWidth(d.stage)) / 100;
    $('optNames').checked = o.showNames;
    $('optLeads').checked = o.showLeads !== false;
    $('optStands').checked = o.showStands;
    $('optStandLegs').checked = o.standLegs !== false;
    $('optNumbers').checked = o.showNumbers;
    $('optGrid').value = o.grid ? String(o.gridSize || 50) : '0';
    $('optStyle').value = o.mono || o.contest ? 'mono' : o.figure ? 'figure' : 'circle';
    $('optSnap').checked = o.snap;
    $('optColor').checked = o.colorBy;
    $('optSeatSize').value = o.seatR;
    $('optDims').checked = o.dims;
    $('optGuides').checked = o.guides;
    $('optHinaDetail').checked = o.hinaDetail !== false;
    if (document.activeElement !== $('stageAisle')) $('stageAisle').value = SS.auto.aisleOf(d.stage);
    if (document.activeElement !== $('stagePodiumGap')) $('stagePodiumGap').value = SS.auto.podiumGapOf(d.stage);
    renderFixtures();
    syncArcCurve();
  }
  function bindSetting(id, ev, fn) {
    const el = $(id);
    el.addEventListener('focus', () => pushHistory());
    el.addEventListener(ev, () => { if (ev === 'change' && el.type === 'checkbox') pushHistory(); fn(el); render(); renderCounts(); });
  }
  // 図面の情報欄（会場・日付・版・作った人・メモ・変更の内容）の入力欄。「画像・PDFとして保存」の画面に出す
  const INFO_FIELDS = [['infoVenue', 'venue'], ['infoDate', 'date'], ['infoVersion', 'version'], ['infoAuthor', 'author'], ['infoMemo', 'memo'], ['infoChange', 'changeNote']];
  const infoFieldsHTML = () => {
    const f = doc().info, v = k => SS.esc(f[k] == null ? '' : f[k]);
    const now = [`第${f.version || 1}版`, f.venue ? v('venue') : '', f.date ? v('date') : '', f.author ? v('author') : ''].filter(Boolean).join('・');
    return `<details class="fold info-fold">
      <summary>図面の情報欄（右下に出ます）<span class="fold-now">${now}</span></summary>
      <div class="row2"><label class="field">会場<input id="infoVenue" value="${v('venue')}" placeholder="空ならホール名"></label><label class="field">日付<input id="infoDate" type="date" value="${v('date')}"></label></div>
      <div class="row2"><label class="field">第何版<input id="infoVersion" type="number" min="1" step="1" value="${v('version')}"></label><label class="field">作った人<input id="infoAuthor" value="${v('author')}" placeholder="例: 舞台監督 山田"></label></div>
      <label class="field">メモ<input id="infoMemo" value="${v('memo')}" placeholder="例: 反射板設置・ひな壇2段"></label>
      <label class="field">変更の内容（情報欄の「変更」に出ます）<input id="infoChange" value="${v('changeNote')}" placeholder="例: 第2版：Tpを1名追加"></label>
    </details>`;
  };
  function bindInfoFields(onChange) {
    let pushed = false;
    INFO_FIELDS.forEach(([id, key]) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => {
        if (!pushed) { pushHistory(); pushed = true; }
        if (key === 'version') { const v = Math.round(+el.value); if (v >= 1) doc().info.version = v; } else doc().info[key] = el.value;
        scheduleSave();
        if (onChange) onChange();
      });
    });
  }
  // 開け閉めできる箱の見出しに、いまの設定を出す
  function renderFoldSummaries() {
    const st = doc().stage, R = SS.render;
    const shapeName = { rect: '四角', apron: '前が丸い', trapezoid: '台形', shell: '反射板', arc: '前が弧', round: '円形' }[st.shape || 'rect'] || '';
    if ($('stageBoxNow')) $('stageBoxNow').textContent = `${st.w / 100}×${st.d / 100}m・${shapeName}`;
    const fx = st.fixtures || {}, nFx = ['shell', 'curtain', 'proscenium', 'pit', 'hanamichi'].filter(k => fx[k] != null).length + (fx.lifts || []).length + (fx.doors || []).length;
    if ($('safetyBoxNow')) $('safetyBoxNow').textContent = `通路${SS.auto.aisleOf(st)}cm・指揮台の前${SS.auto.podiumGapOf(st)}cm${nFx ? `・設備${nFx}` : ''}`;
    void R;
  }
  bindSetting('stageW', 'change', el => { const v = +el.value; if (v >= 3 && v <= 60) { doc().stage.w = Math.round(v * 100); doc().hall = ''; updateHallNote(); } });
  bindSetting('stageD', 'change', el => { const v = +el.value; if (v >= 2 && v <= 50) { doc().stage.d = Math.round(v * 100); doc().hall = ''; updateHallNote(); } });
  bindSetting('stageShape', 'change', el => {
    const st = doc().stage;
    st.shape = el.value;
    if (['shell', 'arc', 'round'].includes(el.value) && !st.bw) st.bw = Math.round(st.w * 0.7);
    if (el.value === 'arc' && st.sag == null) st.sag = Math.round(st.w * 0.08);
    renderSettings();
  });
  bindSetting('stageSag', 'change', el => { const v = +el.value; if (v >= 0) { const st = doc().stage, yc = st.d - SS.render.arcSag(st); st.sag = Math.round(v * 100); st.d = Math.round(yc + st.sag); doc().hall = ''; updateHallNote(); } });
  bindSetting('stageBW', 'change', el => { const v = +el.value; if (v >= 2) { doc().stage.bw = Math.min(doc().stage.w, Math.round(v * 100)); doc().hall = ''; updateHallNote(); } });
  bindSetting('optNames', 'change', el => { opts().showNames = el.checked; });
  bindSetting('optLeads', 'change', el => { opts().showLeads = el.checked; });
  bindSetting('optStands', 'change', el => { opts().showStands = el.checked; });
  bindSetting('optStandLegs', 'change', el => { opts().standLegs = el.checked; });
  bindSetting('optNumbers', 'change', el => { opts().showNumbers = el.checked; });
  bindSetting('optGrid', 'change', el => { const v = +el.value; opts().grid = v > 0; if (v) opts().gridSize = v; });
  bindSetting('optStyle', 'change', el => { opts().mono = el.value === 'mono'; opts().contest = false; opts().figure = el.value === 'figure'; renderSettings(); });
  bindSetting('optSnap', 'change', el => { opts().snap = el.checked; });
  bindSetting('optColor', 'change', el => { opts().colorBy = el.checked; });
  bindSetting('optSeatSize', 'input', el => { opts().seatR = +el.value; });
  bindSetting('optDims', 'change', el => { opts().dims = el.checked; });
  bindSetting('optGuides', 'change', el => { opts().guides = el.checked; });
  bindSetting('optHinaDetail', 'change', el => { opts().hinaDetail = el.checked; });
  // 舞台奥の通路：かんたん編成で並べた配置なら、この幅を空けて並べ直す
  bindSetting('stageAisle', 'change', el => {
    const v = Math.round(+el.value);
    if (el.value === '' || !(v >= 0 && v <= 300)) { el.value = SS.auto.aisleOf(doc().stage); return; }
    doc().stage.backAisle = v;
    if (doc().items.some(it => it.auto)) applyAuto({ noHistory: true });
  });

  // 指揮台の前から舞台の縁まで：かんたん編成で並べた配置なら、この幅を空けて並べ直す
  bindSetting('stagePodiumGap', 'change', el => {
    const v = Math.round(+el.value);
    if (el.value === '' || !(v >= 0 && v <= 500)) { el.value = SS.auto.podiumGapOf(doc().stage); return; }
    doc().stage.podiumGap = v;
    if (doc().items.some(it => it.auto)) applyAuto({ noHistory: true });
  });

  // ホールの設備（m で入力 → cm で記録。空欄のものは記録しない）
  const FX_FIELDS = ['fxShell', 'fxCurtain', 'fxProY', 'fxProW', 'fxPitD', 'fxPitW', 'fxHanaX', 'fxHanaW', 'fxHanaL'];
  const mToCm = v => (v === '' || v == null || !isFinite(+v) ? null : Math.round(+v * 100));
  const cmToM = v => (v == null || v === '' ? '' : Math.round(+v) / 100);
  function renderFixtures() {
    const fx = doc().stage.fixtures || {};
    const vals = { fxShell: fx.shell, fxCurtain: fx.curtain, fxProY: fx.proscenium && fx.proscenium.y, fxProW: fx.proscenium && fx.proscenium.w, fxPitD: fx.pit && fx.pit.depth, fxPitW: fx.pit && fx.pit.w, fxHanaX: fx.hanamichi && fx.hanamichi.x, fxHanaW: fx.hanamichi && fx.hanamichi.w, fxHanaL: fx.hanamichi && fx.hanamichi.len };
    FX_FIELDS.forEach(id => { if (document.activeElement !== $(id)) $(id).value = cmToM(vals[id]); });
    const box = $('fxLifts');
    if (box.contains(document.activeElement)) return;
    box.innerHTML = (fx.lifts || []).map((l, i) => `<div class="fx-lift" data-lift="${i}">${['x', 'y', 'w', 'h'].map(k => `<input type="number" step="0.1" min="0" data-k="${k}" value="${cmToM(l[k])}" aria-label="${{ x: '下手の端から', y: '奥のふちから', w: '幅', h: '奥行' }[k]}">`).join('')}<button type="button" data-del="${i}" title="この迫りを消す">✕</button></div>`).join('');
    box.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('focus', () => pushHistory());
      inp.addEventListener('change', () => { readFixtures(); render(); });
    });
    box.querySelectorAll('[data-del]').forEach(b => { b.onclick = () => { pushHistory(); const f = doc().stage.fixtures; f.lifts.splice(+b.getAttribute('data-del'), 1); readFixtures(); render(); renderFixtures(); }; });
    renderDoors();
  }
  // 出入り口（上手・下手の扉）の入力欄
  function renderDoors() {
    const box = $('fxDoors');
    if (!box || box.contains(document.activeElement)) return;
    const doors = (doc().stage.fixtures || {}).doors || [];
    box.innerHTML = doors.map((d, i) => `<div class="fx-door" data-door="${i}"><select data-k="side" aria-label="どちら側"><option value="L"${d.side === 'L' ? ' selected' : ''}>下手</option><option value="R"${d.side === 'R' ? ' selected' : ''}>上手</option></select>` +
      ['y', 'w'].map(k => `<input type="number" step="0.1" min="0" data-k="${k}" value="${cmToM(d[k])}" aria-label="${{ y: '奥のふちから扉の真ん中まで', w: '扉の幅' }[k]}">`).join('') +
      `<button type="button" data-del="${i}" title="この出入り口を消す">✕</button></div>`).join('');
    box.querySelectorAll('input,select').forEach(inp => {
      inp.addEventListener('focus', () => pushHistory());
      inp.addEventListener('change', () => { readFixtures(); render(); renderFoldSummaries(); });
    });
    box.querySelectorAll('[data-del]').forEach(b => { b.onclick = () => { pushHistory(); doc().stage.fixtures.doors.splice(+b.getAttribute('data-del'), 1); readFixtures(); render(); renderDoors(); renderFoldSummaries(); }; });
  }
  // halls.js の設備（m）→ 図の設備（cm）
  function fixturesFromHall(f) {
    const c = v => (v == null || !isFinite(+v) ? null : Math.round(+v * 100));
    const o = {};
    if (c(f.shell) != null) o.shell = c(f.shell);
    if (c(f.curtain) != null) o.curtain = c(f.curtain);
    if (f.proscenium && c(f.proscenium.y) != null && c(f.proscenium.w) != null) o.proscenium = { y: c(f.proscenium.y), w: c(f.proscenium.w) };
    if (f.pit && c(f.pit.depth) != null) o.pit = Object.assign({ depth: c(f.pit.depth) }, c(f.pit.w) != null ? { w: c(f.pit.w) } : {});
    if (f.hanamichi && [f.hanamichi.x, f.hanamichi.w, f.hanamichi.len].every(v => c(v) != null)) o.hanamichi = { x: c(f.hanamichi.x), w: c(f.hanamichi.w), len: c(f.hanamichi.len) };
    if (Array.isArray(f.doors) && f.doors.length) o.doors = f.doors.map(d => ({ side: d.side, y: c(d.y), w: c(d.w) }));
    if (Array.isArray(f.lifts) && f.lifts.length) o.lifts = f.lifts.map(l => ({ x: c(l.x), y: c(l.y), w: c(l.w), h: c(l.h), name: l.name || '' }));
    return o;
  }
  function readFixtures() {
    const v = id => mToCm($(id).value);
    const fx = {};
    if (v('fxShell') != null) fx.shell = v('fxShell');
    if (v('fxCurtain') != null) fx.curtain = v('fxCurtain');
    if (v('fxProY') != null && v('fxProW') != null) fx.proscenium = { y: v('fxProY'), w: v('fxProW') };
    if (v('fxPitD') != null) fx.pit = Object.assign({ depth: v('fxPitD') }, v('fxPitW') != null ? { w: v('fxPitW') } : {});
    if (v('fxHanaX') != null && v('fxHanaW') != null && v('fxHanaL') != null) fx.hanamichi = { x: v('fxHanaX'), w: v('fxHanaW'), len: v('fxHanaL') };
    const old = (doc().stage.fixtures || {}).lifts || [];
    const lifts = [...$('fxLifts').querySelectorAll('.fx-lift')].map((row, i) => {
      const o = old[i] && old[i].name ? { name: old[i].name } : {};
      row.querySelectorAll('input').forEach(inp => { o[inp.getAttribute('data-k')] = mToCm(inp.value); });
      return o;
    });
    if (lifts.length) fx.lifts = lifts;
    const doors = [...$('fxDoors').querySelectorAll('.fx-door')].map(row => {
      const o = {};
      row.querySelectorAll('input,select').forEach(inp => { const k = inp.getAttribute('data-k'); o[k] = k === 'side' ? inp.value : mToCm(inp.value); });
      return o;
    });
    if (doors.length) fx.doors = doors;
    if (Object.keys(fx).length) doc().stage.fixtures = fx; else delete doc().stage.fixtures;
  }
  FX_FIELDS.forEach(id => bindSetting(id, 'change', () => {
    const shell0 = (doc().stage.fixtures || {}).shell;
    readFixtures();
    // 反射板の位置が変わったら、かんたん編成の配置は通路を空けて並べ直す
    if ((doc().stage.fixtures || {}).shell !== shell0 && doc().items.some(it => it.auto)) applyAuto({ noHistory: true, quiet: true });
  }));
  $('fxDoorAdd').onclick = () => {
    pushHistory();
    readFixtures();
    const st = doc().stage, f = st.fixtures = st.fixtures || {};
    // はじめは、まだ出入り口のない側の、舞台の奥から 1/3 のところに幅 1.8m
    const has = s2 => (f.doors || []).some(d => d.side === s2);
    (f.doors = f.doors || []).push({ side: has('L') && !has('R') ? 'R' : 'L', y: Math.round(st.d / 3), w: 180 });
    renderDoors(); render(); renderFoldSummaries();
  };
  $('fxLiftAdd').onclick = () => {
    pushHistory();
    readFixtures();
    const st = doc().stage, f = st.fixtures = st.fixtures || {};
    (f.lifts = f.lifts || []).push({ x: null, y: null, w: null, h: null });
    renderFixtures();
    const first = $('fxLifts').querySelector('.fx-lift:last-child input');
    if (first) first.focus();
  };

  // ------------------------------------------------------------ パネル・タブ
  document.querySelectorAll('.tabs').forEach(nav => {
    nav.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => openTab(nav.parentElement.id, tab.getAttribute('data-tab'));
    });
  });
  function openTab(panelId, tabId) {
    const panel = $(panelId);
    panel.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tabId));
    panel.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === tabId));
    syncTabMore();
  }
  // 「もっと…」：あまり使わないタブ（一括作成・トレース）をしまっておくメニュー
  function syncTabMore() {
    const on = $('tabMoreMenu').querySelector('.tab.active');
    $('tabMore').classList.toggle('active', !!on);
    $('tabMore').textContent = on ? on.firstChild.textContent.trim() + ' ▾' : 'もっと…';
    showTabMore(false);
  }
  function showTabMore(open) {
    $('tabMoreMenu').hidden = !open;
    $('tabMore').setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  $('tabMore').onclick = e => { e.stopPropagation(); showTabMore($('tabMoreMenu').hidden); };
  // スマホでは上の「🧊 3D」をしまったので、ここから3Dを開く
  $('moreParts').onclick = () => { showTabMore(false); closePanels(); openPartsModal(); };
  $('more3d').onclick = () => { showTabMore(false); closePanels(); $('btn3d').click(); };
  document.addEventListener('pointerdown', e => { if (!$('tabMoreMenu').hidden && !e.target.closest('#tabMoreMenu, #tabMore')) showTabMore(false); });
  const openRightTab = id => openTab('rightPanel', id);
  const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
  function openPanel(id) { if (isMobile()) { closePanels(); $(id).classList.add('open'); } }
  function closePanels() { document.querySelectorAll('.panel.open').forEach(p => p.classList.remove('open')); }
  // スマホでパネルを開け閉めしたら、見える部分に舞台図を合わせ直す
  let sheetOpen = false;
  new MutationObserver(() => {
    const open = !!document.querySelector('.panel.open');
    if (open !== sheetOpen && isMobile()) { sheetOpen = open; setTimeout(fitView, 30); }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  document.querySelectorAll('[data-open]').forEach(b => {
    b.onclick = () => {
      const p = $(b.getAttribute('data-open'));
      const was = p.classList.contains('open');
      closePanels();
      if (!was) p.classList.add('open');
    };
  });

  // モード
  function setMode(m) {
    S.mode = m;
    $('modeSelect').classList.toggle('active', m === 'select');
    $('modeBox').classList.toggle('active', m === 'box');
    $('modeLasso').classList.toggle('active', m === 'lasso');
    $('modePan').classList.toggle('active', m === 'pan');
    if (m === 'box') toast('ドラッグで四角く囲んだ人を選びます（ひな壇は選びません）');
    if (m === 'lasso') toast('指やマウスで自由に囲んだ人を選びます（ひな壇は選びません）');
    svg.classList.toggle('panning', m === 'pan');
  }
  $('modeSelect').onclick = () => setMode('select');
  $('modePan').onclick = () => setMode('pan');
  $('modeBox').onclick = () => setMode(S.mode === 'box' ? 'select' : 'box');
  $('modeLasso').onclick = () => setMode(S.mode === 'lasso' ? 'select' : 'lasso');
  $('zoomIn').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); };
  $('zoomOut').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2); };
  $('zoomFit').onclick = () => fitView();
  $('btnUndo').onclick = undo;
  $('btnRedo').onclick = redo;

  // ------------------------------------------------------------ ひな形・部品
  function thumbSVG(d) {
    const st = d.stage;
    const tmp = normalize(d);
    const c = tmp.items.find(it => it.type === 'podium') || { x: st.w / 2, y: st.d - 100 };
    return `<svg viewBox="-20 -20 ${st.w + 40} ${st.d + 40}" preserveAspectRatio="xMidYMid meet">${SS.render.stageSVG(tmp, false).replace(/<text[\s\S]*?<\/text>/g, '')}${SS.render.itemsSVG(tmp, { colorBy: true, showStands: false, showNames: false, seatR: 26 }, c, false).replace(/<g pointer-events="none">[\s\S]*<\/g>$/, '')}</svg>`;
  }

  function loadTemplate(t, force) {
    const hasWork = players().length > 0 && S.undo.length > 0;
    if ((hasWork || doc().parts) && !force) {
      const st0 = doc().stage, st1 = t.make().stage, other = doc().parts && (st0.w !== st1.w || st0.d !== st1.d);
      askConfirm((doc().parts ? `いまの部（${doc().parts[doc().partIdx].name}）の配置図を「` : 'いまの配置図を「') + t.name + '」に置き換えます。' + (other ? '\n舞台の大きさもひな形のものになります（ほかの部も同じ舞台です）。' : '') + '\n（あとで「戻す」で元に戻せます）', '置き換える', () => loadTemplate(t, true));
      return;
    }
    pushHistory();
    const made = t.make();
    const keep = doc();
    S.doc = normalize({ title: keep.title, subtitle: keep.subtitle, stage: Object.assign({ shape: made.stage.shape || keep.stage.shape }, made.stage), items: made.items, options: keep.options, underlay: keep.underlay, ensemble: made.ensemble || null, info: keep.info, parts: keep.parts, partIdx: keep.partIdx, roster: keep.roster });
    // 舞台奥の通路の幅は、設定した値のまま（ひな形は60cmで作ってあるので、違えば並べ直す）
    if (keep.stage.backAisle != null) {
      S.doc.stage.backAisle = keep.stage.backAisle;
      if (SS.auto.aisleOf(S.doc.stage) !== SS.auto.DEFAULT_AISLE && S.doc.ensemble) applyAuto({ noHistory: true, quiet: true });
    }
    renderSteppers();
    S.sel.clear();
    closePanels();
    renderAll();
    updateHallNote();
    fitView();
    toast('「' + t.name + '」を読み込みました', true);
  }

  function buildTemplates() {
    const list = $('templateList');
    list.innerHTML = '';
    SS.TEMPLATES.forEach(t => {
      const b = document.createElement('button');
      b.className = 'tpl-card';
      b.innerHTML = `${thumbSVG(t.make())}<div><b>${t.name}</b><span>${t.desc}</span></div>`;
      b.onclick = () => loadTemplate(t);
      list.appendChild(b);
    });
  }

  function buildPalette() {
    const pal = $('palette');
    const cats = {};
    Object.keys(SS.CATALOG).forEach(k => { const c = SS.CATALOG[k]; if (c.cat) (cats[c.cat] = cats[c.cat] || []).push(k); });
    let h = '';
    // よく使う人が少ない部品（花道・出入り口・司会）は「舞台の設備・その他」にまとめ、はじめは閉じておく
    const FOLD = '舞台の設備・その他';
    Object.keys(cats).sort((a, b) => (a === FOLD) - (b === FOLD)).forEach(cat => {
      if (cat === FOLD) { h += `<details class="fold pal-fold"><summary>${cat}（花道・出入り口・司会）</summary><div class="palette-grid">`; cats[cat].forEach(k => { const c = SS.CATALOG[k]; const size = c.w ? `${c.w}×${c.h}cm` : ''; h += `<button class="pal-item" draggable="true" data-type="${k}" title="${SS.esc(c.note || size)}">${SS.iconFor(k)}<span>${c.name}${size ? `<small>${size}</small>` : ''}</span></button>`; }); h += '</div></details>'; return; }
      h += `<h4>${cat}</h4><div class="palette-grid">`;
      cats[cat].forEach(k => {
        const c = SS.CATALOG[k];
        const size = c.w ? `${c.w}×${c.h}cm` : '';
        h += `<button class="pal-item" draggable="true" data-type="${k}" title="${SS.esc(c.note || size)}">${SS.iconFor(k)}<span>${c.name}${size ? `<small>${size}</small>` : ''}</span></button>`;
      });
      h += '</div>';
    });
    pal.innerHTML = h;
    pal.querySelectorAll('[data-type]').forEach(b => {
      b.onclick = () => {
        setPlacing(b.getAttribute('data-type'));
        closePanels();
      };
      b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-stage-item', b.getAttribute('data-type')); e.dataTransfer.effectAllowed = 'copy'; });
    });
  }

  // ------------------------------------------------------------ 一括作成
  $('btnGenerate').onclick = () => {
    const rows = $('genRows').value.split(/[,、，\s]+/).map(s => parseInt(s, 10)).filter(n => n > 0 && n < 100);
    if (!rows.length) return toast('各列の人数を「8,10,12」のように入れてください');
    pushHistory();
    const c = conductor();
    if (!doc().items.some(it => it.type === 'podium')) doc().items.push({ id: newId(), type: 'podium', x: c.x, y: c.y, rot: 0 });
    if ($('genReplace').checked) doc().items = doc().items.filter(it => it.type !== 'player');
    const pts = G.generate(rows, {
      shape: $('genShape').value,
      spacing: +$('genSpacing').value || 75,
      r0: +$('genR0').value || 180,
      gap: +$('genGap').value || 110,
    }, c);
    const labels = G.parseSpec($('genParts').value);
    const ids = [];
    pts.forEach((p, i) => {
      const it = { id: newId(), type: 'player', x: p.x, y: p.y, rot: p.rot, label: labels[i] || '' };
      doc().items.push(it);
      ids.push(it.id);
    });
    S.sel = new Set(ids);
    closePanels();
    renderAll();
    toast(`${pts.length}人分の席を作りました`);
  };

  $('btnAssign').onclick = () => {
    const labels = G.parseSpec($('assignSpec').value);
    if (!labels.length) return toast('パート名を入れてください（例: Fl×4, Ob×2）');
    const list = targetsPlayers();
    if (!list.length) return toast('奏者がいません');
    pushHistory();
    const order = G.seatOrder(list, conductor());
    order.forEach((it, i) => { if (i < labels.length) it.label = labels[i]; });
    renderAll();
    const diff = labels.length - order.length;
    toast(diff === 0 ? `${order.length}席に割り当てました` : diff > 0 ? `席が${diff}つ足りません（${order.length}席に割り当て）` : `${labels.length}席に割り当てました（残り${-diff}席はそのまま）`);
  };

  $('btnNames').onclick = () => {
    const lines = $('namesSpec').value.split(/\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return toast('名前を入れてください');
    const list = targetsPlayers();
    if (!list.length) return toast('奏者がいません');
    pushHistory();
    const order = G.seatOrder(list, conductor());
    if ($('namesClear').checked) order.forEach(it => { it.name = ''; });
    const labelsLower = new Set(order.map(it => (it.label || '').toLowerCase()));
    let placed = 0, missing = 0;
    lines.forEach(line => {
      const m = /^(\S+)[\s\t　:：]+(.+)$/.exec(line);
      if (m && labelsLower.has(m[1].toLowerCase())) {
        const seat = order.find(it => (it.label || '').toLowerCase() === m[1].toLowerCase() && !it.name);
        if (seat) { seat.name = m[2].trim(); placed++; } else missing++;
        return;
      }
      const seat = order.find(it => !it.name);
      if (seat) { seat.name = line; placed++; } else missing++;
    });
    opts().showNames = true;
    renderAll();
    toast(missing ? `${placed}人を入れました（${missing}人は空いている席がありません）` : `${placed}人の名前を入れました`);
  };

  // ------------------------------------------------------------ 舞台図（画像・PDF）の読み込みと重ね合わせ
  async function handleImageFile(file, pageNo) {
    if (!file) return;
    const pdf = SS.trace.isPdf(file);
    if (!pdf && !/^image\//.test(file.type)) return toast('画像かPDFを選んでください');
    try {
      toast(pdf ? 'PDFを読み込んでいます…' : '画像を読み込んでいます…');
      let canvas, cmPerPx = 0;
      if (pdf) {
        const r = await SS.trace.loadPdf(S.pdfData && pageNo ? S.pdfData.slice(0) : file, pageNo || 1, 3000);
        if (!pageNo) S.pdfData = r.data;
        canvas = r.canvas; cmPerPx = r.cmPerPx;
        $('pdfPage').value = r.page; $('pdfPage').max = r.pages;
        $('pdfPages').textContent = `／ ${r.pages} ページ`;
        $('pdfPageRow').classList.toggle('hidden', r.pages < 2);
      } else {
        const { img } = await SS.trace.loadImageFromFile(file);
        canvas = SS.trace.toCanvas(img, 3000, 0);
        S.pdfData = null;
        $('pdfPageRow').classList.add('hidden');
      }
      $('pdfScaleRow').classList.toggle('hidden', !cmPerPx);
      S.traceSrc = { img: canvas, rot: 0 };
      S.trace = null;
      placeDrawing(canvas, cmPerPx);
      $('overlayControls').classList.remove('hidden');
      $('traceControls').classList.add('hidden');
      openTab('leftPanel', 'traceTab');
      openPanel('leftPanel');
      toast('舞台図を重ねました。「📏 長さのわかる2点で縮尺を合わせる」で、長さのわかる2点（平台の端から端＝1.82m など）をタップすると縮尺が合います。「⤢ 舞台の前の角に合わせる」なら位置もいっしょに合います', true);
    } catch (err) {
      toast(err.message || '読み込めませんでした');
    }
  }

  // 読み込んだ図を下絵にする（白い余白は自動で切り取り、ステージに入る大きさで置く）
  function placeDrawing(canvas, cmPerPx) {
    pushHistory();
    const crop = SS.trace.autoTrim(canvas);
    const u = { src: canvas.toDataURL('image/jpeg', 0.9), opacity: +$('underlayOpacity').value / 100, rot: 0, crop, pxW: canvas.width, pxH: canvas.height, cmPerPx: cmPerPx || 0, x: 0, y: 0, w: canvas.width, h: canvas.height };
    doc().underlay = u;
    fitDrawingInStage();
    syncOverlayUI();
    render();
    fitView(SS.render.underlayBounds(u));
  }

  // 使う範囲がステージにちょうど入るように、大きさと位置を変える
  function fitDrawingInStage() {
    const u = doc().underlay; if (!u) return;
    const st = doc().stage;
    let b = SS.render.underlayBounds(u);
    scaleDrawing(Math.min(st.w / (b.x1 - b.x0), st.d / (b.y1 - b.y0)), { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
    b = SS.render.underlayBounds(u);
    u.x += st.w / 2 - (b.x0 + b.x1) / 2; u.y += st.d / 2 - (b.y0 + b.y1) / 2;
  }
  // 点 P を中心に f 倍
  function scaleDrawing(f, P) {
    const u = doc().underlay;
    u.x = P.x + (u.x - P.x) * f; u.y = P.y + (u.y - P.y) * f; u.w *= f; u.h *= f;
  }
  // 使う範囲の真ん中（舞台の座標）
  function drawingCenter() {
    const u = doc().underlay, c = SS.render.underlayCrop(u);
    return SS.render.underlayToWorld(u, (c.l + c.r) / 2, (c.t + c.b) / 2);
  }
  function rotateDrawing(deg) {
    const u = doc().underlay; if (!u) return;
    const C = drawingCenter();
    u.rot = Math.round(deg * 10) / 10;
    const C2 = drawingCenter();
    u.x += C.x - C2.x; u.y += C.y - C2.y;
  }
  function syncOverlayUI() {
    const u = doc().underlay; if (!u) return;
    $('underlayOpacity').value = Math.round((u.opacity == null ? 0.45 : u.opacity) * 100);
    $('ovRot').value = u.rot || 0;
    $('ovRotVal').textContent = `${Math.round((u.rot || 0) * 10) / 10}°`;
    $('ovOnTop').checked = !!u.onTop;
    $('pdfScaleRow').classList.toggle('hidden', !u.cmPerPx);
  }

  // 2点を選んで合わせる
  function pickTargets(kind) {
    const st = doc().stage, poly = SS.render.stagePoly(st);
    if (kind === 'front') return [{ x: poly[3][0], y: poly[3][1] }, { x: poly[2][0], y: poly[2][1] }];
    if (kind === 'back') return [{ x: poly[0][0], y: poly[0][1] }, { x: poly[1][0], y: poly[1][1] }];
    return null;
  }
  const PICK_TEXT = {
    front: ['図の舞台の<b>前の左の角</b>をタップ', '図の舞台の<b>前の右の角</b>をタップ'],
    back: ['図の舞台の<b>奥の左の角</b>をタップ', '図の舞台の<b>奥の右の角</b>をタップ'],
    len: ['長さのわかる<b>1つ目の点</b>をタップ', '<b>2つ目の点</b>をタップ'],
  };
  function startPick(kind) {
    if (!doc().underlay) return toast('先に舞台図を読み込んでください');
    S.pick = { kind, pts: [] };
    S.underlayEdit = false; $('underlayEdit').checked = false;
    closePanels();
    pickStep();
    render();
  }
  function endPick() {
    S.pick = null;
    $('pickHint').hidden = true;
    renderOverlay();
  }
  function pickStep() {
    const P = S.pick; if (!P) return;
    if (P.pts.length < 2) {
      $('pickHint').hidden = false;
      $('pickHintText').innerHTML = `${P.pts.length + 1}/2：${PICK_TEXT[P.kind][P.pts.length]}（ドラッグで画面を動かせます）`;
      return;
    }
    const [p1, p2] = P.pts;
    const kind = P.kind;
    endPick();
    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 5) return toast('2つの点が近すぎます。もう一度どうぞ');
    if (kind === 'len') {
      const cur = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 100;
      const PRESETS = [['0.91', '3尺（平台の短い辺）'], ['1', '1m'], ['1.21', '4尺'], ['1.82', '6尺・1間（平台の長い辺）'], ['2', '2m'], ['3.64', '2間'], ['5', '5m'], ['10', '10m']];
      openModal(`<h2>📏 2点の間の実際の長さ</h2><p class="hint">タップした2点の間が、実際に何mかを入れてください（図に書かれている寸法や、平台の大きさなど）。</p>
        <div class="len-presets">${PRESETS.map(([v, t]) => `<button class="btn" type="button" data-len="${v}" title="${t}">${v}m<small>${t.replace(/^[0-9.]+m$/, '')}</small></button>`).join('')}</div>
        <label class="field">長さ（m）<input id="pickLen" type="number" step="0.01" min="0.1" value="${cur.toFixed(2)}"></label>
        <div class="btn-row"><button class="btn primary" id="pickLenOk">この長さで合わせる</button><button class="btn" id="pickLenNo">やめる</button></div>`);
      setTimeout(() => { const el = $('pickLen'); if (el) { el.focus(); el.select(); } }, 50);
      $('pickLenNo').onclick = closeModal;
      document.querySelectorAll('[data-len]').forEach(b => { b.onclick = () => { $('pickLen').value = b.getAttribute('data-len'); $('pickLenOk').click(); }; });
      $('pickLenOk').onclick = () => {
        const L = +$('pickLen').value * 100;
        if (!(L > 0)) return;
        closeModal();
        pushHistory();
        scaleDrawing(L / Math.hypot(p2.x - p1.x, p2.y - p1.y), p1);
        doc().underlay.aligned = true;
        render();
        fitView(SS.render.underlayBounds(doc().underlay));
        toast(`2点の間を ${(L / 100).toFixed(2)}m にしました。位置は「↑↓←→」かドラッグで合わせられます`, true);
      };
      return;
    }
    // 2点を舞台の角に重ねる（大きさ・回転・位置を一度に）
    const [q1, q2] = pickTargets(kind);
    const u = doc().underlay;
    pushHistory();
    const f = Math.hypot(q2.x - q1.x, q2.y - q1.y) / Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const th = Math.atan2(q2.y - q1.y, q2.x - q1.x) - Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const M = p => {
      const dx = (p.x - p1.x) * f, dy = (p.y - p1.y) * f;
      return { x: q1.x + dx * Math.cos(th) - dy * Math.sin(th), y: q1.y + dx * Math.sin(th) + dy * Math.cos(th) };
    };
    const tl = M({ x: u.x, y: u.y });
    u.x = tl.x; u.y = tl.y; u.w *= f; u.h *= f;
    let rot = (u.rot || 0) + (th * 180) / Math.PI;
    rot = ((rot + 540) % 360) - 180;
    u.rot = Math.round(rot * 100) / 100;
    u.aligned = true;
    syncOverlayUI();
    render();
    fitView(SS.render.underlayBounds(u));
    toast('舞台図を、この配置図の舞台に重ねました。ずれていたら「②微調整」で直せます', true);
  }
  document.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => startPick(b.getAttribute('data-pick')); });
  $('pickCancel').onclick = endPick;
  $('btnOvFit').onclick = () => { if (!doc().underlay) return; pushHistory(); fitDrawingInStage(); render(); };
  $('btnPdfScale').onclick = () => {
    const u = doc().underlay; if (!u || !u.cmPerPx) return;
    const ratio = +$('pdfScale').value;
    if (!(ratio > 0)) return;
    pushHistory();
    const C = drawingCenter();
    scaleDrawing((u.pxW * u.cmPerPx * ratio) / u.w, C);
    u.aligned = true;
    render();
    fitView(SS.render.underlayBounds(u));
    toast(`縮尺 1/${ratio} で実寸にしました。位置はドラッグや「⤢ 舞台の前の角に合わせる」で合わせてください`, true);
  };
  $('pdfPage').addEventListener('change', e => { if (S.pdfData) handleImageFile(new Blob([S.pdfData], { type: 'application/pdf' }), +e.target.value); });
  let rotHist = 0;
  $('ovRot').addEventListener('input', e => {
    if (!doc().underlay) return;
    if (Date.now() - rotHist > 1500) pushHistory();
    rotHist = Date.now();
    rotateDrawing(+e.target.value);
    $('ovRotVal').textContent = `${e.target.value}°`;
    render();
  });
  document.querySelectorAll('[data-ovmove]').forEach(b => {
    b.onclick = e => {
      const u = doc().underlay; if (!u) return;
      const [dx, dy] = b.getAttribute('data-ovmove').split(',').map(Number);
      const step = e.shiftKey ? 50 : 10;
      pushHistory(); u.x += dx * step; u.y += dy * step; render();
    };
  });
  document.querySelectorAll('[data-ovzoom]').forEach(b => {
    b.onclick = () => { if (!doc().underlay) return; pushHistory(); scaleDrawing(+b.getAttribute('data-ovzoom'), drawingCenter()); render(); };
  });
  $('btnOvShowAll').onclick = () => { const u = doc().underlay; if (u) fitView(SS.render.underlayBounds(u)); };
  $('ovOnTop').addEventListener('change', e => { const u = doc().underlay; if (!u) return; u.onTop = e.target.checked; render(); });
  $('btnOvCrop').onclick = openRectCrop;
  $('btnTraceOpen').onclick = () => {
    if (!S.traceSrc) return toast('もう一度、舞台図（配置図）の画像を選んでください');
    const prep = SS.trace.prepare(S.traceSrc.img);
    S.trace = { prep, result: null, canvas: S.traceSrc.img, framed: false };
    $('traceScale').checked = !(doc().underlay && doc().underlay.aligned);
    $('traceControls').classList.remove('hidden');
    runDetect();
    $('traceControls').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 使う範囲を四角く切り取る（外側の客席・袖などを隠す）
  function openRectCrop() {
    const u = doc().underlay; if (!u) return;
    const img = new Image();
    img.onload = () => {
      let c = SS.render.underlayCrop(u);
      openModal(`<h2>✂ 使う範囲を切り取る</h2>
        <p class="hint">四隅の点をドラッグして、残したい範囲を決めてください（はみ出す部分はあとで「図の全体を表示」でも見られます）。</p>
        <div class="crop-wrap" id="rcWrap"><canvas id="rcCanvas"></canvas><svg id="rcSvg"></svg></div>
        <div class="btn-row"><button class="btn" id="rcAuto">白い余白を自動で切る</button><button class="btn" id="rcAll">全体を使う</button></div>
        <div class="btn-row"><button class="btn primary" id="rcOk">この範囲にする</button><button class="btn" id="rcNo">やめる</button></div>`);
      const W = img.naturalWidth, H = img.naturalHeight;
      const cv = $('rcCanvas'), sv = $('rcSvg');
      const k = Math.min(1, 1600 / Math.max(W, H));
      cv.width = Math.round(W * k); cv.height = Math.round(H * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      sv.setAttribute('viewBox', `0 0 ${cv.width} ${cv.height}`);
      const draw = () => {
        const x0 = c.l * cv.width, y0 = c.t * cv.height, x1 = c.r * cv.width, y1 = c.b * cv.height;
        const hr = Math.max(cv.width, cv.height) / 45;
        sv.innerHTML = `<path d="M0 0H${cv.width}V${cv.height}H0Z M${x0} ${y0}H${x1}V${y1}H${x0}Z" fill="rgba(0,0,0,.45)" fill-rule="evenodd"/>
          <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="#4d8dff" stroke-width="${hr / 4}"/>` +
          [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${hr}" fill="rgba(77,141,255,.35)" stroke="#fff" stroke-width="${hr / 5}"/>`).join('');
      };
      draw();
      let grab = -1;
      const toF = e => { const r = sv.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
      sv.addEventListener('pointerdown', e => {
        const p = toF(e);
        const cs = [[c.l, c.t], [c.r, c.t], [c.r, c.b], [c.l, c.b]];
        let bi = 0, bd = Infinity;
        cs.forEach((q, i) => { const d = Math.hypot((q[0] - p.x) * W, (q[1] - p.y) * H); if (d < bd) { bd = d; bi = i; } });
        grab = bi; sv.setPointerCapture(e.pointerId);
      });
      sv.addEventListener('pointermove', e => {
        if (grab < 0) return;
        const p = toF(e);
        if (grab === 0 || grab === 3) c.l = Math.min(p.x, c.r - 0.02); else c.r = Math.max(p.x, c.l + 0.02);
        if (grab === 0 || grab === 1) c.t = Math.min(p.y, c.b - 0.02); else c.b = Math.max(p.y, c.t + 0.02);
        draw();
      });
      sv.addEventListener('pointerup', () => { grab = -1; });
      $('rcAuto').onclick = () => { c = SS.trace.autoTrim(img); draw(); };
      $('rcAll').onclick = () => { c = { l: 0, t: 0, r: 1, b: 1 }; draw(); };
      $('rcNo').onclick = closeModal;
      $('rcOk').onclick = () => { pushHistory(); u.crop = c; closeModal(); render(); toast('使う範囲を切り取りました', true); };
    };
    img.src = u.src;
  }

  // 解析する画像（キャンバス）を決めて、下絵として置く
  function setTraceImage(canvas, framed) {
    const prep = SS.trace.prepare(canvas);
    S.trace = { prep, result: null, canvas, framed };
    const st = doc().stage;
    const u = { src: canvas.toDataURL('image/jpeg', 0.85), opacity: +$('underlayOpacity').value / 100, rot: 0, pxW: canvas.width, pxH: canvas.height, cmPerPx: 0 };
    if (framed) { u.x = 0; u.y = 0; u.w = st.w; u.h = st.d; u.aligned = true; }
    else {
      const k = Math.min(st.w / prep.w, st.d / prep.h);
      u.w = prep.w * k; u.h = prep.h * k; u.x = (st.w - u.w) / 2; u.y = (st.d - u.h) / 2;
    }
    doc().underlay = u;
    $('traceScale').checked = !framed;
    $('overlayControls').classList.remove('hidden');
    $('traceControls').classList.remove('hidden');
    syncOverlayUI();
    runDetect();
    render();
  }

  // ------------------------------------------------------------ トリミング・四隅合わせ
  function openCropEditor(corners, auto) {
    if (!S.traceSrc) return toast('先に画像を選んでください');
    let src = SS.trace.toCanvas(S.traceSrc.img, 2400, S.traceSrc.rot);
    const prepScale = () => {
      // findFrame は解析用（縮小）画像の座標なので、元画像の座標に直す
      const pw = S.trace && S.trace.prep ? S.trace.prep.w : src.width;
      return src.width / pw;
    };
    let pts;
    if (corners) { const k = prepScale(); pts = corners.map(p => ({ x: p.x * k, y: p.y * k })); }
    else pts = [{ x: 0, y: 0 }, { x: src.width, y: 0 }, { x: src.width, y: src.height }, { x: 0, y: src.height }];
    const st = doc().stage;
    openModal(`
      <h2>✂ トリミング・四隅合わせ</h2>
      <p class="hint">${auto ? '<b>ステージの枠を自動で見つけました。</b>' : ''}青い4つの点を、ステージの<b>四隅</b>に合わせてください（ドラッグで動かせます）。斜めから撮った写真も、まっすぐに直します。</p>
      <div class="crop-wrap" id="cropWrap"><canvas id="cropCanvas"></canvas><svg id="cropSvg"></svg></div>
      <div class="btn-row">
        <button class="btn" id="cropAuto">🔍 枠を自動で探す</button>
        <button class="btn" id="cropAll">画像全体</button>
        <button class="btn" id="cropRot">⟳ 90°回転</button>
      </div>
      <div class="row2">
        <label class="field">この枠の実際の幅(m)<input id="cropW" type="number" step="0.5" min="3" max="60" value="${st.w / 100}"></label>
        <label class="field">奥行(m)<input id="cropD" type="number" step="0.5" min="2" max="50" value="${st.d / 100}"></label>
      </div>
      <p class="hint small">枠の中がステージ全体になり、ステージの大きさも上の数字に変わります。</p>
      <div class="btn-row"><button class="btn primary" id="cropOk">この範囲で決定</button><button class="btn" id="cropCancel">やめる</button></div>
    `);
    const cv = $('cropCanvas'), svgEl = $('cropSvg');
    const draw = () => {
      cv.width = src.width; cv.height = src.height;
      cv.getContext('2d').drawImage(src, 0, 0);
      svgEl.setAttribute('viewBox', `0 0 ${src.width} ${src.height}`);
      const hr = Math.max(src.width, src.height) / 45;
      const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
      svgEl.innerHTML = `<path d="M0 0H${src.width}V${src.height}H0Z M${pts.map(p => `${p.x} ${p.y}`).join(' L')}Z" fill="rgba(0,0,0,.45)" fill-rule="evenodd"/>
        <polygon points="${poly}" fill="none" stroke="#4d8dff" stroke-width="${hr / 4}"/>` +
        pts.map((p, i) => `<circle class="crop-handle" data-i="${i}" cx="${p.x}" cy="${p.y}" r="${hr}" fill="rgba(77,141,255,.35)" stroke="#fff" stroke-width="${hr / 5}"/>`).join('');
    };
    draw();
    let dragI = -1;
    const toImg = e => {
      const r = svgEl.getBoundingClientRect();
      return { x: Math.max(0, Math.min(src.width, (e.clientX - r.left) / r.width * src.width)), y: Math.max(0, Math.min(src.height, (e.clientY - r.top) / r.height * src.height)) };
    };
    svgEl.addEventListener('pointerdown', e => {
      const p = toImg(e);
      // いちばん近い点をつかむ（点を正確に押さなくてもよい）
      let bi = 0, bd = Infinity;
      pts.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; bi = i; } });
      dragI = bi;
      svgEl.setPointerCapture(e.pointerId);
      pts[dragI] = p; draw();
    });
    svgEl.addEventListener('pointermove', e => { if (dragI >= 0) { pts[dragI] = toImg(e); draw(); } });
    svgEl.addEventListener('pointerup', () => { dragI = -1; });
    $('cropAuto').onclick = () => {
      const tmp = SS.trace.prepare(src);
      const f = SS.trace.findFrame(tmp);
      if (!f) return toast('枠が見つかりませんでした。点を手で動かしてください');
      const k = src.width / tmp.w;
      pts = f.map(p => ({ x: p.x * k, y: p.y * k })); draw();
    };
    $('cropAll').onclick = () => { pts = [{ x: 0, y: 0 }, { x: src.width, y: 0 }, { x: src.width, y: src.height }, { x: 0, y: src.height }]; draw(); };
    $('cropRot').onclick = () => {
      S.traceSrc.rot = (S.traceSrc.rot + 1) % 4;
      src = SS.trace.toCanvas(S.traceSrc.img, 2400, S.traceSrc.rot);
      pts = [{ x: 0, y: 0 }, { x: src.width, y: 0 }, { x: src.width, y: src.height }, { x: 0, y: src.height }];
      draw();
    };
    $('cropCancel').onclick = () => { closeModal(); openPanel('leftPanel'); };
    $('cropOk').onclick = () => {
      const W = +$('cropW').value, D = +$('cropD').value;
      if (!(W >= 3 && D >= 2)) return toast('幅と奥行を入れてください');
      pushHistory();
      doc().stage.w = Math.round(W * 100); doc().stage.d = Math.round(D * 100);
      // 出力の大きさ：実際の縦横比に合わせる
      const outW = Math.min(2000, Math.round(Math.max(dist(pts[0], pts[1]), dist(pts[3], pts[2]))));
      const outH = Math.max(50, Math.round(outW * D / W));
      const warped = SS.trace.warp(src, pts, outW, outH);
      closeModal();
      setTraceImage(warped, true);
      renderAll();
      fitView();
      openPanel('leftPanel');
      toast('ステージの枠に合わせました。赤い丸（見つかった椅子）を確認して「取り込む」を押してください');
    };
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  $('btnCrop').onclick = () => openCropEditor(null, false);

  function runDetect() {
    if (!S.trace) return;
    const sens = +$('traceSens').value;
    const size = +$('traceSize').value;
    $('sensVal').textContent = sens === 0 ? '標準' : sens > 0 ? '+' + sens : sens;
    $('sizeVal').textContent = size ? size + 'px' : '自動';
    const res = SS.trace.detect(S.trace.prep, { sens, size, split: $('traceSplit').checked, boxes: $('traceBoxes').checked });
    S.trace.result = res;
    SS.trace.drawPreview($('tracePreview'), S.trace.prep, res);
    $('traceStatus').textContent = `椅子を ${res.seats.length} 個見つけました` + (res.boxes.length ? `／大きな図形 ${res.boxes.length} 個` : '') + (res.seats.length ? '（赤い丸）' : '');
    if (!size) $('traceSize').value = 0;
  }
  let detectTimer = null;
  ['traceSens', 'traceSize'].forEach(id => $(id).addEventListener('input', () => { clearTimeout(detectTimer); detectTimer = setTimeout(runDetect, 120); }));
  ['traceSplit', 'traceBoxes'].forEach(id => $(id).addEventListener('change', runDetect));

  $('btnTraceApply').onclick = async () => {
    if (!S.trace || !S.trace.result) return;
    const res = S.trace.result;
    if (!res.seats.length && !res.boxes.length) return toast('椅子が見つかっていません。感度や大きさを調整してください');
    const btn = $('btnTraceApply');
    btn.disabled = true;
    const seats = res.seats.map(p => Object.assign({}, p));
    const boxes = res.boxes.map(b => Object.assign({}, b));
    try {
      if ($('traceOcr').checked) {
        $('traceStatus').textContent = '文字を読み取っています… 0%';
        try {
          const words = await SS.trace.ocr(S.trace.prep, p => { $('traceStatus').textContent = `文字を読み取っています… ${Math.round(p * 100)}%`; });
          SS.trace.assignWords(seats, boxes, words, res.s0);
        } catch (err) {
          toast(err.message || '文字を読み取れませんでした');
        }
      }
      pushHistory();
      applyTrace(seats, boxes, res);
      $('traceStatus').textContent = `${seats.length}人分の席を取り込みました`;
    } finally {
      btn.disabled = false;
    }
  };

  function applyTrace(seats, boxes, res) {
    const d = doc();
    const prep = S.trace.prep;
    const u = d.underlay;
    let toW;
    let center = null;
    if (S.trace.framed) {
      // 枠＝ステージなので、そのまま当てはめる
      const kx = d.stage.w / prep.w, ky = d.stage.d / prep.h;
      toW = p => ({ x: p.x * kx, y: p.y * ky });
      const spacing = SS.trace.typicalSpacing(seats) || res.s0 * 1.5;
      const cImg = SS.trace.estimateCenter(seats, spacing);
      if (cImg) {
        for (let i = seats.length - 1; i >= 0; i--) if (Math.hypot(seats[i].x - cImg.x, seats[i].y - cImg.y) < spacing * 0.8) seats.splice(i, 1);
        center = toW(cImg);
        center.y = Math.min(center.y, d.stage.d - 50);
      }
      u.x = 0; u.y = 0; u.w = d.stage.w; u.h = d.stage.d;
    } else if (u.aligned || !$('traceScale').checked) {
      // 舞台図を重ねて合わせてあるときは、その位置のまま取り込む（切り取った外側の椅子は使わない）
      const cr = SS.render.underlayCrop(u);
      const inCrop = p => p.x / prep.w >= cr.l && p.x / prep.w <= cr.r && p.y / prep.h >= cr.t && p.y / prep.h <= cr.b;
      for (let i = seats.length - 1; i >= 0; i--) if (!inCrop(seats[i])) seats.splice(i, 1);
      for (let i = boxes.length - 1; i >= 0; i--) if (!inCrop(boxes[i])) boxes.splice(i, 1);
      toW = p => SS.render.underlayToWorld(u, p.x / prep.w, p.y / prep.h);
    } else if ($('traceScale').checked && seats.length >= 3) {
      const spacing = SS.trace.typicalSpacing(seats) || res.s0 * 1.5;
      const cm = 75 / spacing; // となりの席との間隔を約75cmとみなす
      const all = seats.concat(boxes);
      const xs = all.map(p => p.x), ys = all.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      let cImg = SS.trace.estimateCenter(seats, spacing);
      if (!cImg || cImg.y - maxY > spacing * 8 || cImg.y < minY) cImg = { x: (minX + maxX) / 2, y: maxY + spacing * 2 };
      else {
        // 指揮台の四角を椅子と見まちがえたものは消す
        for (let i = seats.length - 1; i >= 0; i--) if (Math.hypot(seats[i].x - cImg.x, seats[i].y - cImg.y) < spacing * 0.8) seats.splice(i, 1);
      }
      const bw = (maxX - minX) * cm, bh = (Math.max(maxY, cImg.y) - minY) * cm;
      const W = Math.max(800, Math.ceil((bw + 300) / 100) * 100);
      const D = Math.max(600, Math.ceil((bh + 280) / 100) * 100);
      d.stage.w = W; d.stage.d = D;
      if (d.stage.bw) d.stage.bw = Math.min(d.stage.bw, Math.round(W * 0.7));
      const ox = W / 2 - ((minX + maxX) / 2) * cm;
      const oy = 150 - minY * cm;
      toW = p => ({ x: ox + p.x * cm, y: oy + p.y * cm });
      center = toW(cImg);
      center.y = Math.min(center.y, D - 60);
      u.x = ox; u.y = oy; u.w = prep.w * cm; u.h = prep.h * cm; u.rot = 0;
    } else {
      toW = p => SS.render.underlayToWorld(u, p.x / prep.w, p.y / prep.h);
    }
    const scale = u.w / prep.w;
    if ($('traceReplace').checked) d.items = d.items.filter(it => it.type === 'podium');
    let podium = d.items.find(it => it.type === 'podium');
    if (center) {
      if (podium) { podium.x = center.x; podium.y = center.y; } else { podium = { id: newId(), type: 'podium', x: center.x, y: center.y, rot: 0 }; d.items.push(podium); }
    }
    const c = conductor();
    const newPlayers = [];
    seats.forEach(p => {
      const q = toW(p);
      const it = { id: newId(), type: 'player', x: q.x, y: q.y, rot: 0, label: (p.label || '').slice(0, 12), name: (p.name || '').slice(0, 20) };
      it.rot = normAngle(G.faceAngle(it, c));
      d.items.push(it);
      newPlayers.push(it);
    });
    boxes.forEach(b => {
      const q = toW(b);
      d.items.push({ id: newId(), type: 'box', x: q.x, y: q.y, rot: 0, w: Math.round(b.w * scale), h: Math.round(b.h * scale), label: (b.label || '').slice(0, 12) });
    });
    if ($('traceTidy').checked && newPlayers.length >= 3) {
      // となり同士でつながる「列」ごとに、きれいに並んでいる列だけを整える（位置は下絵からずらさない）
      const sp = SS.trace.typicalSpacing(newPlayers) || 75;
      let n = 0;
      SS.trace.chainRows(newPlayers, sp).forEach(row => {
        if (row.length < 4) return;
        const rs = row.map(p => G.polar(p, c).r), ys = row.map(p => p.y);
        const sd = a => { const m = G.mean(a); return Math.sqrt(G.mean(a.map(v => (v - m) ** 2))); };
        const o = { symmetric: false, evenRows: false, minGap: opts().seatR * 2 + 14 };
        if (sd(rs) < 22 && sd(rs) <= sd(ys)) { G.tidyArc(row, c, o); n++; }
        else if (sd(ys) < 18) { G.tidyLine(row, c, o); n++; }
      });
      G.fixOverlap(newPlayers, opts().seatR * 2 + 8);
    }
    S.sel = new Set(newPlayers.map(it => it.id));
    closePanels();
    renderAll();
    fitView();
    toast(`${newPlayers.length}人分の席を取り込みました。パート名は右の「選択中」やまとめて割り当てで入れられます`);
  }

  $('traceFile').addEventListener('change', e => { handleImageFile(e.target.files[0]); e.target.value = ''; });
  $('underlayOpacity').addEventListener('input', e => { if (doc().underlay) { doc().underlay.opacity = +e.target.value / 100; render(); } });
  $('underlayEdit').addEventListener('change', e => { S.underlayEdit = e.target.checked; if (S.underlayEdit) pushHistory(); render(); if (S.underlayEdit) { closePanels(); toast('図をドラッグで移動、ホイール（2本指）で拡大縮小できます。終わったらチェックを外してください'); } });
  $('btnUnderlayRemove').onclick = () => {
    pushHistory();
    doc().underlay = null;
    S.trace = null; S.traceSrc = null; S.pdfData = null;
    S.underlayEdit = false;
    $('underlayEdit').checked = false;
    $('traceControls').classList.add('hidden');
    $('overlayControls').classList.add('hidden');
    if (S.pick) endPick();
    render();
  };

  // ドラッグ＆ドロップ・貼り付け
  const wrap = $('stageWrap');
  let dragDepth = 0;
  document.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; $('dropHint').classList.add('show'); } });
  document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dropHint').classList.remove('show'); });
  document.addEventListener('dragover', e => { e.preventDefault(); });
  document.addEventListener('drop', e => {
    e.preventDefault();
    const itemType = e.dataTransfer && e.dataTransfer.getData('text/x-stage-item');
    if (itemType) { setPlacing(null); addItem(itemType, null, toWorld(e.clientX, e.clientY)); return; }
    dragDepth = 0;
    $('dropHint').classList.remove('show');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    if (/json$/i.test(f.name) || f.type === 'application/json') loadJSONFile(f);
    else handleImageFile(f);
  });
  document.addEventListener('paste', e => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/INPUT|TEXTAREA/.test(tag)) return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) { e.preventDefault(); handleImageFile(it.getAsFile()); return; }
    }
  });
  void wrap;

  // ------------------------------------------------------------ 保存・開く
  function loadDoc(d, msg) {
    pushHistory();
    S.doc = normalize(d);
    S.sel.clear();
    renderAll();
    renderSteppers();
    updateHallNote();
    fitView();
    if (msg) toast(msg);
  }

  function loadJSONFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || !Array.isArray(d.items)) throw new Error();
        loadDoc(d, '読み込みました');
        closeModal();
      } catch (e) { toast('このファイルは読み込めませんでした'); }
    };
    r.readAsText(file);
  }

  // 配置図をファイル（.stage.json）に保存する
  function saveToFile() {
    const blob = new Blob([JSON.stringify(doc(), null, 1)], { type: 'application/json' });
    SS.render.download(blob, SS.render.safeName(doc().title || '配置図') + '.stage.json');
  }
  // 書き出した（PDF・PNG・印刷）あとに1回だけ、「ファイルにも保存しておきますか？」と案内する（「今後表示しない」を選べる）
  let nudged = false;
  function afterExport() {
    if (nudged) return;
    nudged = true;
    try { if (localStorage.getItem('stagesetting.noFileNudge')) return; } catch (e) { /* ignore */ }
    const el = document.createElement('div');
    el.className = 'file-nudge';
    el.id = 'fileNudge';
    el.innerHTML = `<p><b>💾 ファイルにも保存しておきますか？</b><br>配置図はこのブラウザの中にだけ保存されています。ファイルにしておくと、ブラウザのデータを消したり機種を変えたりしても、あとで開いて直せます。</p>
      <div class="btn-row"><button class="btn primary" id="fnSave">⬇ ファイルに保存</button><button class="btn" id="fnLater">今はしない</button><button class="btn" id="fnNever">今後表示しない</button></div>`;
    // 書き出す画面を開いているときは、その画面の中（作った結果の下）に出す（ボタンの上に重ねない）
    const box = !$('modal').classList.contains('hidden') && ($('ctResult') || $('exResult'));
    if (box) { el.classList.add('inline'); box.after(el); el.scrollIntoView({ block: 'nearest' }); } else document.body.appendChild(el);
    const close = () => el.remove();
    $('fnSave').onclick = () => { saveToFile(); close(); toast('ファイルに保存しました。「💾 保存/開く」の「⬆ ファイルを開く」で開けます', true); };
    $('fnLater').onclick = close;
    $('fnNever').onclick = () => { try { localStorage.setItem('stagesetting.noFileNudge', '1'); } catch (e) { /* ignore */ } close(); };
  }

  $('btnFile').onclick = () => {
    const list = SS.render.savedList();
    const fmt = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
    openModal(`
      <h2>保存・開く</h2>
      <div class="safe-note">⚠ 配置図は<b>このブラウザの中にだけ</b>保存されています。ブラウザのデータを消したり、機種を変えたりすると消えてしまいます。<b>大事な図は「ファイルに保存」もしておくと安心です。</b>
        <button class="btn" id="saveFileTop">⬇ ファイルに保存</button></div>
      <p class="hint">作業中の内容は自動でこのブラウザに保存されています。名前を付けて保存しておくと、いくつもの配置図を切り替えられます。</p>
      <div class="btn-row">
        <input id="saveName" style="flex:1;min-width:160px;padding:7px;border:1px solid #dde2ea;border-radius:7px;font:inherit" value="${SS.esc(doc().title || '配置図')}">
        <button class="btn primary" id="saveHere">名前を付けて保存</button>
      </div>
      <h3 style="font-size:14px">保存した配置図</h3>
      ${list.length ? `<ul class="saved-list">${list.map(x => `<li><span>${SS.esc(x.name)}<br><small>${fmt(x.date)}・${x.doc.items.filter(i => i.type === 'player').length}人${x.doc.info && x.doc.info.version ? `・第${x.doc.info.version}版` : ''}</small>${(x.versions || []).length ? `<span class="ver">前の版：${x.versions.map(v2 => `<button class="btn" data-cmpv="${x.id}|${v2.version}" title="${fmt(v2.date)}">第${v2.version}版とくらべる</button>`).join('')}</span>` : ''}</span><button class="btn" data-load="${x.id}">開く</button><button class="btn" data-cmp="${x.id}">くらべる</button><button class="btn danger" data-del="${x.id}">削除</button></li>`).join('')}</ul>
      <p class="hint small">「くらべる」を押すと、いまの配置図との違い（○＋ 増えた・□− 減った・→ 動いた）を図に出します。版を上げて保存すると、前の版もここに残ります。</p>` : '<p class="hint">まだありません。</p>'}
      <h3 style="font-size:14px">ファイル</h3>
      <p class="hint">ファイルにしておくと、ほかのパソコンやスマホでも開けます。</p>
      <div class="btn-row">
        <button class="btn" id="saveFile">⬇ ファイルに保存</button>
        <label class="btn filebtn">⬆ ファイルを開く<input type="file" id="openFile" accept=".json,application/json" hidden></label>
        <label class="btn filebtn">🔍 ファイルとくらべる<input type="file" id="cmpFile" accept=".json,application/json" hidden></label>
      </div>
      <hr>
      <button class="btn danger" id="newDoc">新しく白紙から作る</button>
    `);
    $('saveHere').onclick = () => {
      const name = $('saveName').value.trim() || '配置図';
      const v = doc().info.version || 1;
      const save = bump => {
        const prev = bump ? JSON.parse(JSON.stringify(doc())) : null;
        if (bump) { pushHistory(); doc().info.version = v + 1; renderSettings(); scheduleSave(); }
        try { SS.render.saveToList(name, doc(), prev); toast(`「${name}」を保存しました（第${doc().info.version}版）`); closeModal(); } catch (e) { toast('保存できませんでした（容量がいっぱいです）'); }
      };
      // 名前を付けて保存するときは、版を1つ上げるか聞く
      openModal(`<h2>版を上げますか？</h2>
        <p style="line-height:1.7">いまは <b>第${v}版</b> です。直したものを配るときは、版を1つ上げておくと、古い図面と見分けられます。</p>
        <div class="btn-row"><button class="btn primary" id="svUp">第${v + 1}版にして保存</button><button class="btn" id="svKeep">第${v}版のまま保存</button></div>`);
      $('svUp').onclick = () => save(true);
      $('svKeep').onclick = () => save(false);
    };
    document.querySelectorAll('[data-load]').forEach(b => {
      b.onclick = () => { const x = SS.render.savedList().find(s => s.id === b.getAttribute('data-load')); if (x) { loadDoc(x.doc, '「' + x.name + '」を開きました'); closeModal(); } };
    });
    document.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        const id = b.getAttribute('data-del');
        askConfirm('この配置図を削除しますか？', '削除する', () => { try { SS.render.deleteFromList(id); } catch (e) { /* ignore */ } $('btnFile').onclick(); });
      };
    });
    $('saveFile').onclick = $('saveFileTop').onclick = saveToFile;
    $('openFile').onchange = e => { if (e.target.files[0]) loadJSONFile(e.target.files[0]); };
    document.querySelectorAll('[data-cmp]').forEach(b => {
      b.onclick = () => { const x = SS.render.savedList().find(s2 => s2.id === b.getAttribute('data-cmp')); if (x) startCompare(x.name + (x.doc.info && x.doc.info.version ? `（第${x.doc.info.version}版）` : ''), x.doc); };
    });
    document.querySelectorAll('[data-cmpv]').forEach(b => {
      b.onclick = () => {
        const [id, v] = b.getAttribute('data-cmpv').split('|');
        const x = SS.render.savedList().find(s2 => s2.id === id), ver = x && (x.versions || []).find(q => String(q.version) === v);
        if (ver) startCompare(`${x.name}（第${ver.version}版）`, ver.doc);
      };
    });
    $('cmpFile').onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const d = JSON.parse(r.result); if (!d || !Array.isArray(d.items)) throw new Error(); startCompare(f.name.replace(/\.stage\.json$|\.json$/, ''), d); } catch (err) { toast('このファイルとはくらべられませんでした'); } };
      r.readAsText(f);
    };
    $('newDoc').onclick = () => { closeModal(); loadTemplate(SS.TEMPLATES.find(t => t.id === 'blank')); };
  };

  // ------------------------------------------------------------ 画像・印刷・共有
  // タイトル・サブタイトルの入力欄（画像・印刷の画面。入力した内容は配置図と一緒に保存・共有される）
  const titleFieldsHTML = () => `
      <div class="title-fields">
        <label class="field">タイトル（図のいちばん上に大きく出ます）<input id="mTitle" value="${SS.esc(doc().title)}" placeholder="例: 第30回 定期演奏会"></label>
        <label class="field">サブタイトル<input id="mSubtitle" value="${SS.esc(doc().subtitle)}" placeholder="例: 第1部 / ○○ホール"></label>
      </div>`;
  function bindTitleFields(onChange) {
    let pushed = false;
    [['mTitle', 'title'], ['mSubtitle', 'subtitle']].forEach(([id, key]) => {
      const el = $(id);
      el.addEventListener('input', () => {
        if (!pushed) { pushHistory(); pushed = true; }
        doc()[key] = el.value;
        renderSettings();
        scheduleSave();
        if (onChange) onChange();
      });
    });
  }

  // 用紙・縮尺・表示のえらび（画像・PDF・印刷で共通。えらんだものは覚えておく）
  const paperPref = () => Object.assign({ size: 'A4', orient: 'landscape', scale: 0, style: 'screen' }, opts().paper || {});
  const paperFieldsHTML = () => {
    const p = paperPref();
    const opt = (v, t, cur) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${t}</option>`;
    return `<div class="paper-fields">
      <div class="row2">
        <label class="field">用紙<select id="ppSize">${opt('A4', 'A4', p.size)}${opt('A3', 'A3', p.size)}</select></label>
        <label class="field">向き<select id="ppOrient">${opt('landscape', '横', p.orient)}${opt('portrait', '縦', p.orient)}</select></label>
      </div>
      <div class="row2">
        <label class="field">縮尺<select id="ppScale">${opt(0, '用紙に合わせる', p.scale)}${opt(50, '1/50', p.scale)}${opt(100, '1/100', p.scale)}${opt(200, '1/200', p.scale)}</select></label>
        <label class="field">表示<select id="ppStyle">${opt('screen', '画面と同じ', p.style)}${opt('mono', '白黒◯×（椅子○・譜面台×）', p.style)}</select></label>
      </div>
      ${S.compare ? `<label class="check"><input type="checkbox" id="ppCompare" checked> 「${SS.esc(S.compare.name)}」との違いの印（○＋ □− →）を入れる</label>` : ''}
      ${S.trans ? `<label class="check"><input type="checkbox" id="ppTrans" checked> 転換の印（× はける・○ 出す・→ 動かす）を入れる</label>` : ''}
      ${doc().items.some(SS.isAudio) ? `<label class="check"><input type="checkbox" id="ppAudio"${p.audio === false ? '' : ' checked'}> 音響の機材（マイク・モニター・ケーブル）を入れる</label>` : ''}
      ${hasHina() ? `<label class="field">中身<select id="ppContent">${opt('plan', '配置図', p.content)}${opt('assembly', 'ひな壇の組み図（番号・足・部材表）', p.content)}</select></label>` : ''}
      <p id="ppWarn" class="pp-warn" hidden></p>
    </div>`;
  };
  const hasHina = () => doc().items.some(it => it.type === 'hina');
  function readPaper() {
    const p = { size: $('ppSize').value, orient: $('ppOrient').value, scale: +$('ppScale').value, style: $('ppStyle').value, content: $('ppContent') ? $('ppContent').value : 'plan', audio: $('ppAudio') ? $('ppAudio').checked : paperPref().audio !== false };
    opts().paper = p;
    scheduleSave();
    return p;
  }
  // 書き出し用の表示の設定（「白黒◯×」をえらんだときは白黒の線だけ）
  function sheetOpts(p) {
    const o = renderOpts();
    if (p.style === 'mono') Object.assign(o, { mono: true, contest: true, figure: false, colorBy: false });
    return o;
  }
  function buildSheet(extra) {
    const p = readPaper();
    const cmp = S.compare && $('ppCompare') && $('ppCompare').checked ? S.compare : null;
    // 1部・2部…があるときは、図面のサブタイトルに部の名前（転換の印を入れるときは「転換：第1部 → 第2部」も）
    const d0 = doc(), tr = !!(S.trans && $('ppTrans') && $('ppTrans').checked);
    const dd = d0.parts ? Object.assign({}, d0, { subtitle: [d0.subtitle, partName(d0.partIdx), tr ? `転換：${partName(S.trans.a)} → ${partName(S.trans.b)}（×はける・○出す・→動かす）` : ''].filter(Boolean).join('　') }) : d0;
    return SS.render.sheet(dd, sheetOpts(p), conductor(), Object.assign({ paper: p, legend: true, audio: p.audio !== false, compare: cmp, extraSVG: tr ? (k => SS.changeoverSVG(transResult(), k, d0.stage)) : null, content: p.content === 'assembly' && hasHina() ? 'assembly' : 'plan' }, extra));
  }
  // 縮尺どおりだと用紙に入らないとき、警告と入る縮尺の案内
  function paperCheck(extra) {
    const r = buildSheet(extra);
    const w = $('ppWarn');
    const p = paperPref();
    if (p.scale && !r.info.fits) {
      w.hidden = false;
      w.innerHTML = `⚠ 1/${p.scale} では舞台が${p.size}${p.orient === 'portrait' ? '縦' : '横'}の用紙に入りません。` +
        (r.info.suggest ? ` <b>1/${r.info.suggest}</b> なら入ります。<button class="btn" id="ppUse">1/${r.info.suggest}にする</button>` : ' 大きい用紙か「用紙に合わせる」をえらんでください。');
      if ($('ppUse')) $('ppUse').onclick = () => { const sel = $('ppScale'); if (![...sel.options].some(o => +o.value === r.info.suggest)) sel.insertAdjacentHTML('beforeend', `<option value="${r.info.suggest}">1/${r.info.suggest}</option>`); sel.value = r.info.suggest; paperCheck(extra); };
    } else {
      w.hidden = !p.scale;
      w.className = 'pp-warn ok';
      w.textContent = p.scale ? `✓ 1/${p.scale}（紙の上の1cm＝実際の${p.scale / 100}m）で用紙に入ります。` : '';
    }
    if (p.scale && !r.info.fits) w.className = 'pp-warn';
    return r;
  }
  const bindPaper = extra => ['ppSize', 'ppOrient', 'ppScale', 'ppStyle', 'ppContent', 'ppAudio', 'ppCompare', 'ppTrans'].forEach(id => { if ($(id)) $(id).addEventListener('change', () => paperCheck(extra())); });

  // 「📤 書き出す」：画像・PDF・印刷をえらぶ
  $('btnOut').onclick = () => {
    openModal(`
      <h2>書き出す</h2>
      <button class="btn primary out-contest" id="outContest"><span>🎺</span><b>コンクール提出用（白黒◯×）</b><small>A4・紙いっぱい。団体名とメモを入れて、PDFかPNGをすぐ作れます</small></button>
      <p class="hint" style="margin:14px 0 6px">ほかの形で出す</p>
      <div class="out-choices">
        <button class="btn out-choice" id="outImage"><span>🖼</span><b>画像</b><small>PNG・SVG。LINEやメールで送る・資料に貼る</small></button>
        <button class="btn out-choice" id="outPdf"><span>📄</span><b>PDF</b><small>用紙（A4・A3）と縮尺どおりの図面</small></button>
        <button class="btn out-choice" id="outPrint"><span>🖨</span><b>印刷</b><small>プリンターで紙に出す</small></button>
      </div>
    `);
    $('outContest').onclick = openContest;
    $('outImage').onclick = () => openExport('image');
    $('outPdf').onclick = () => openExport('pdf');
    $('outPrint').onclick = openPrint;
  };

  // 🎺 コンクール提出用：白黒◯×・A4・紙いっぱい。入れるのは団体名とメモだけ（どちらも空でも作れる）
  function openContest() {
    const c = doc().contest;
    const sel = (v, t) => `<option value="${v}"${c.orient === v ? ' selected' : ''}>${t}</option>`;
    openModal(`
      <h2>🎺 コンクール提出用（白黒◯×）</h2>
      <label class="field">団体名（学校名）<input id="ctOrg" value="${SS.esc(c.org)}" placeholder="例: ○○市立○○中学校 吹奏楽部"></label>
      <label class="field">メモ（部門・出演順など自由に）<input id="ctMemo" value="${SS.esc(c.memo)}" placeholder="例: A部門・出演順12番"></label>
      <div class="modal-actions contest-actions">
        <button class="btn primary big" id="ctPdf">📄 PDFを作る</button>
        <button class="btn big" id="ctPng">🖼 PNG画像を作る</button>
      </div>
      <div class="row2 contest-opts">
        <label class="field">用紙の向き（A4）<select id="ctOrient">${sel('landscape', '横')}${sel('portrait', '縦')}</select></label>
        <label class="check" style="align-self:end"><input type="checkbox" id="ctLegend"${c.legend ? ' checked' : ''}> 編成表（人数）を入れる</label>
      </div>
      <label class="check"><input type="checkbox" id="ctKey"${c.key !== false ? ' checked' : ''}> 記号の見方（◯＝いす・×＝譜面台 など）を図の下に入れる</label>
      <label class="check"><input type="checkbox" id="ctLeads"${c.leads ? ' checked' : ''}> ★（パートのトップ・首席）を入れる</label>
      <p class="hint small">椅子は○、譜面台は×、パート名は◯の中の白黒の図です（★ パートのトップは、選んだときだけ入ります）。寸法・センター線・情報欄は入りません。提出の書式は大会や支部の要項で違うことがあるので、要項を確かめてください。</p>
      <div id="ctResult"></div>
    `);
    let pushed = false;
    const save = () => {
      if (!pushed) { pushHistory(); pushed = true; }
      Object.assign(doc().contest, { org: $('ctOrg').value, memo: $('ctMemo').value, orient: $('ctOrient').value, legend: $('ctLegend').checked, key: $('ctKey').checked, leads: $('ctLeads').checked });
      scheduleSave();
      $('ctResult').innerHTML = '';
    };
    ['ctOrg', 'ctMemo'].forEach(id => $(id).addEventListener('input', save));
    ['ctOrient', 'ctLegend', 'ctKey', 'ctLeads'].forEach(id => $(id).addEventListener('change', save));
    const sheet = pxPerMm => {
      save();
      const cc = doc().contest;
      // ★（パートのトップ）は、選んだときだけ入れる（はじめは入れない）
      const o = Object.assign(renderOpts(), { mono: true, contest: true, figure: false, colorBy: false, showLeads: !!cc.leads });
      return SS.render.sheet(doc(), o, conductor(), { content: 'contest', org: cc.org, memo: cc.memo, legend: cc.legend, keyLegend: cc.key !== false, paper: { size: 'A4', orient: cc.orient, scale: 0 }, pxPerMm });
    };
    const name = () => SS.render.safeName((doc().contest.org || doc().title || '配置図') + '_コンクール提出用');
    $('ctPdf').onclick = async () => {
      try {
        const r = sheet(8);
        const blob = await SS.render.svgToPdf(r.svg, r.info.paperW, r.info.paperH);
        SS.render.download(blob, name() + '.pdf');
        const url = URL.createObjectURL(blob);
        $('ctResult').innerHTML = `<p class="hint">✅ PDFを作りました。保存されない場合は <a href="${url}" target="_blank" rel="noopener">ここを開いて</a> 保存してください。</p>`;
        toast('PDFを作りました');
        afterExport();
      } catch (e) { toast((e && e.message) || 'PDFを作れませんでした。PNG画像で作ってください'); }
    };
    $('ctPng').onclick = async () => {
      try {
        const r = sheet(8);
        const blob = await SS.render.svgToPng(r.svg);
        SS.render.download(blob, name() + '.png');
        const url = URL.createObjectURL(blob);
        $('ctResult').innerHTML = `<p class="hint">✅ 画像を作りました。保存されない場合は、下の画像を<b>長押し</b>（パソコンは右クリック）して保存してください。</p><img src="${url}" alt="コンクール提出用の配置図" style="width:100%;border:1px solid #dde2ea;border-radius:8px">`;
        toast('画像を作りました');
        afterExport();
      } catch (e) { toast(e.message); }
    };
  }

  function openExport(mode) {
    const pdf = mode === 'pdf';
    openModal(`
      <h2>${pdf ? 'PDFとして保存' : '画像として保存'}</h2>
      ${titleFieldsHTML()}
      ${infoFieldsHTML()}
      ${paperFieldsHTML()}
      <label class="check"><input type="checkbox" id="exLegend" checked> 編成表（人数）を入れる</label>
      <label class="check"><input type="checkbox" id="exEquip"> 用意する物の表（いす・譜面台・平台・箱馬など）を入れる</label>
      <label class="check"><input type="checkbox" id="exGrid"> 方眼を入れる</label>
      ${doc().underlay ? '<label class="check"><input type="checkbox" id="exUnderlay"> 舞台図（下絵）を重ねて入れる</label><label class="check"><input type="checkbox" id="exUnderlayAll" checked> 舞台図がはみ出す部分まで入れる</label>' : ''}
      <label class="field" style="margin-top:10px">画質（PNG・PDF）
        <select id="exScale"><option value="4">ふつう</option><option value="8" selected>きれい</option><option value="12">とてもきれい（印刷向け）</option></select>
      </label>
      <p class="hint small">PDF は用紙の大きさ・縮尺どおりに作ります（ネットにつながっていなくても作れます）。うまく保存できないときは、「📤 書き出す」の「🖨 印刷」から <b>「PDFに保存」</b> をえらんでも作れます。<br>スマホでは保存したファイルが「ファイル」アプリや「ダウンロード」に入ります。</p>
      <div id="exResult"></div>
      <div class="modal-actions">
        ${pdf ? '<button class="btn primary" id="exPdf">📄 PDFを作る</button><button class="btn" id="exPng">🖼 PNG画像</button>'
    : '<button class="btn primary" id="exPng">🖼 PNG画像</button><button class="btn" id="exPdf">📄 PDF</button>'}
        <button class="btn" id="exSvg" title="拡大しても荒れない形式">SVG</button>
      </div>
    `);
    const extra = () => ({ legend: $('exLegend').checked, equip: $('exEquip').checked, grid: $('exGrid').checked, underlay: !!($('exUnderlay') && $('exUnderlay').checked), underlayAll: !!($('exUnderlayAll') && $('exUnderlayAll').checked) });
    bindTitleFields(() => { $('exResult').innerHTML = ''; });
    bindInfoFields(() => { $('exResult').innerHTML = ''; });
    bindPaper(extra);
    paperCheck(extra());
    const name = () => SS.render.safeName(doc().title || '配置図') + (paperPref().content === 'assembly' && hasHina() ? '_ひな壇の組み図' : '');
    $('exPng').onclick = async () => {
      try {
        const r = buildSheet(Object.assign(extra(), { pxPerMm: +$('exScale').value }));
        const blob = await SS.render.svgToPng(r.svg);
        SS.render.download(blob, name() + '.png');
        // ダウンロードできない環境（アプリ内ブラウザなど）でも保存できるよう画像を表示する
        const url = URL.createObjectURL(blob);
        $('exResult').innerHTML = `<p class="hint">保存されない場合は、下の画像を<b>長押し</b>（パソコンは右クリック）して保存してください。</p><img src="${url}" alt="配置図" style="width:100%;border:1px solid #dde2ea;border-radius:8px">`;
        $('exResult').scrollIntoView({ block: 'nearest' });
        toast('画像を作りました');
        afterExport();
      } catch (e) { toast(e.message); }
    };
    $('exPdf').onclick = async () => {
      try {
        const r = buildSheet(Object.assign(extra(), { pxPerMm: +$('exScale').value }));
        const blob = await SS.render.svgToPdf(r.svg, r.info.paperW, r.info.paperH);
        SS.render.download(blob, name() + '.pdf');
        const url = URL.createObjectURL(blob);
        $('exResult').innerHTML = `<p class="hint">PDFを作りました。保存されない場合は <a href="${url}" target="_blank" rel="noopener">ここを開いて</a> 保存するか、「📤 書き出す」の「🖨 印刷」から「PDFに保存」をえらんでください。</p>`;
        toast('PDFを作りました');
        afterExport();
      } catch (e) { toast((e && e.message) || 'PDFを作れませんでした。「📤 書き出す」の「🖨 印刷」から「PDFに保存」をえらんでください'); }
    };
    $('exSvg').onclick = () => {
      const r = buildSheet(extra());
      SS.render.download(new Blob([r.svg], { type: 'image/svg+xml' }), name() + '.svg');
      afterExport();
    };
  }

  function openPrint() {
    openModal(`
      <h2>印刷</h2>
      ${titleFieldsHTML()}
      ${infoFieldsHTML()}
      ${paperFieldsHTML()}
      <p class="hint small">編成表（人数）と情報欄も入ります。縮尺どおりに印刷するには、印刷の画面で <b>倍率を「100%」（実際のサイズ）</b> にしてください。PDFにしたいときは、印刷の画面で <b>「PDFに保存」</b> をえらびます。</p>
      <div class="modal-actions"><button class="btn primary" id="prGo">🖨 印刷する</button><button class="btn" id="prNo">やめる</button></div>
    `);
    const extra = () => ({ legend: true, grid: false, underlay: false });
    bindTitleFields();
    bindInfoFields();
    bindPaper(extra);
    paperCheck(extra());
    $('prNo').onclick = closeModal;
    $('prGo').onclick = () => {
      const r = buildSheet(extra());
      const p = paperPref();
      closeModal();
      // 用紙の大きさ・向きを印刷に伝える（余白は図面の中にあるので 0）
      let st = document.getElementById('pageStyle');
      if (!st) { st = document.createElement('style'); st.id = 'pageStyle'; document.head.appendChild(st); }
      st.textContent = `@media print { @page { size: ${p.size} ${p.orient}; margin: 0; } #printArea svg { width: ${r.info.paperW}mm !important; height: ${r.info.paperH}mm !important; max-height: none !important; } }`;
      $('printArea').innerHTML = r.svg;
      setTimeout(() => { window.print(); afterExport(); }, 50);
    };
  }

  $('btnShare').onclick = async () => {
    try {
      const code = await SS.render.encodeShare(doc());
      const url = location.origin + location.pathname + '#d=' + code;
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch (e) { /* ignore */ }
      openModal(`
        <h2>共有リンク</h2>
        <p class="hint">${copied ? '✅ リンクをコピーしました。' : ''}このリンクを開くと、同じ配置図が表示されます（下絵の画像は含まれません）。LINEやメールで送れます。</p>
        <textarea readonly rows="4" style="width:100%;font-size:12px" onclick="this.select()">${SS.esc(url)}</textarea>
        <p class="hint small">長さ: ${url.length}文字</p>
      `);
    } catch (e) {
      toast('リンクを作れませんでした');
    }
  };

  $('btnHelp').onclick = showHelp;
  // 初めて開いたときの短い案内（くわしい説明は「？」ボタン）
  function showWelcome() {
    openModal(`
      <h2>🎼 ようこそ</h2>
      <p style="margin:0 0 10px">3つの手順で配置図ができます。</p>
      <ol class="welcome-steps">
        <li><b>ひな形を選ぶ</b><span>近い編成の型を選ぶと、すぐに配置図ができます。</span><button class="btn" id="wStep1">ひな形を見る</button></li>
        <li><b>人数を ▲▼ で変える</b><span>「かんたん編成」でパートの人数を変えると、自動で並べ直します。</span><button class="btn" id="wStep2">かんたん編成を開く</button></li>
        <li><b>画像で保存</b><span>上の「📤 書き出す」から画像・PDFで保存できます。印刷もできます。</span></li>
      </ol>
      <p class="hint small">くわしい使い方は、右上の <b>？</b> ボタンでいつでも見られます。</p>
      <button class="btn primary wide" id="wStart">はじめる</button>
    `);
    $('wStart').onclick = closeModal;
    $('wStep1').onclick = () => { closeModal(); openTab('leftPanel', 'tplTab'); openPanel('leftPanel'); };
    $('wStep2').onclick = () => { closeModal(); openTab('leftPanel', 'autoTab'); openPanel('leftPanel'); };
  }
  function showHelp() {
    openModal(`
      <h2>🎼 使い方</h2>
      <ol>
        <li><b>✍️ 文章で指示する</b>：「フルート6人、打楽器は下手、ひな壇2段、ミューザで」のように書いて押すと、その通りに並べ直します。「コンクールA」「小編成」「55人くらい」のような言い方もわかります。「クラ10人」は Cl1・Cl2・Cl3 に分けて10人（どう分けたかも出ます）。人数が5人以上減るときは、確認してから並べ直します。読み取れなかったときは、書き方の例が出ます。「かんたん編成」の下の<b>「✍️ 文章で指示する」の箱</b>を開いて使います。</li>
        <li><b>弧・円形の舞台</b>：「かんたん編成」の「ステージの大きさ・形」で「前が弧」「円形・楕円形」を選べます。◠ のつまみで弧のふくらみを変えられます。サントリーホール・ミューザ・みなとみらいもホール一覧にあります（寸法は目安なので図面で確認を）。</li>
        <li><b>ホールの寸法</b>：ホールの寸法は公開されている資料からの<b>目安</b>です（△のホールは推定値）。<b>本番前に必ずホールの舞台図面で確認してください。</b>違っていたら「ステージの大きさ・形」で直せます。</li>
        <li><b>編成の種類</b>：「かんたん編成」で <b>吹奏楽・オーケストラ・弦楽・ブラスバンド・ビッグバンド・合唱</b> を選べます。<b>ブラスバンド</b>（ブリティッシュ・スタイル）は<b>台形のコの字</b>に並べます。前の列は下手の腕にソロ・コルネット、奥にフリューゲル→テナーホルン→バリトン、上手の腕にユーフォ。後ろの列は下手の腕にソプラノ・レピアノ・2nd・3rdコルネット、奥にベース、上手の腕にトロンボーン（「並び方」で扇形も選べます）。<b>ビッグバンド</b>はサックス（前・リードのA1が真ん中）→トロンボーン（1段目）→トランペット（2段目）、リズム隊は下手にまとめます（ドラムはトロンボーンの台の下手どなりで、奏者はセットの後ろに座る。ベースはドラマーの右手側、ギターはサックスの下手どなり、ピアノはいちばん前）。<b>合唱</b>は立って歌う人の形で、S・A・T・B を下手から／女声が前・男声が後ろ／S・T・B・A から選べ、前の列は床、うしろの列はひな壇（半人分ずらす）、ピアノは下手に置きます。</li>
        <li><b>打楽器の楽器</b>：「打楽器」の箱の「楽器（台数）」で、ティンパニ・大太鼓・小太鼓・シンバル・鍵盤などを1つずつ増やしたり減らしたりできます（「人数に合わせて自動に戻す」で元どおり）。オーケストラでは、ティンパニを最上段の真ん中に、ほかの打楽器を奥から大太鼓→小太鼓→シンバル→小物→鍵盤の順に、弦の外側を下手の前へまわりこむように並べます。</li>
        <li><b>かんたん編成</b>：ホールを選んで、パートの人数を▲▼で変えるだけ。<b>すぐに自動で並べ直します</b>。ステージは<b>音響反射板を置いたときの形</b>（前が広く奥がせまい台形）になり、はみ出さないように詰めて並べます。人数が0人のパート（Es.Cl・ハープなど）は隠れているので、「＋パートを追加」で出します。最初に見えるのは<b>ホール・編成の種類・パートの人数</b>だけです。文章で指示する・並び方・打楽器・ひな壇・ステージの大きさ・安全とホールの設備は、下の<b>開け閉めできる箱</b>の中にあります（閉じていても見出しに今の設定が出ます）。</li>
        <li><b>ひな壇</b>：「かんたん編成」の「ひな壇」の箱を開いて、段数と<b>平台の置き方</b>（よく使う 3×6の横置き・縦置き、4×6 の3つ。6×6 などは「ほかの置き方」）を決めると、後ろの列が<b>ひな壇の上にまっすぐ</b>並びます。置いた平台を選んでも、図から置き方を変えられます。高さは7寸・1尺4寸・2尺1寸…から選べ、必要な平台・箱馬の数は「編成表」に出ます。</li>
        <li><b>打楽器</b>：「かんたん編成」の「打楽器」の箱の「打楽器の場所」で<b>舞台奥・ひな壇の最上段・下手側・最上段＋下手</b>を選べます。吹奏楽の<b>「下手側」</b>は、<b>ティンパニをひな壇1段目の横に正面向き</b>で、鍵盤を床の扇形のすぐ外側の<b>前の列</b>（指揮者を向き、客席へ少しひらく）、太鼓類を<b>そのすぐ後ろの列</b>（奥から大太鼓・シンバル・小太鼓）に並べます。<b>楽器と奏者はくっついて</b>いて、楽器か奏者を動かす・回すと、いっしょに動きます（Alt を押しながらだと別々。右のパネルで「はなす／くっつける」もできます）。「🥁 打楽器を整列」でその場所に並べ直せます。</li>
        <li><b>舞台の大きさ</b>：舞台の角と前の縁にある <b>↔ ↕ の丸いつまみ</b>をドラッグすると、前の幅・奥の幅・奥行をその場で変えられます（10cm単位）。自動配置なら、すぐに並べ直します。</li>
        <li><b>並び方</b>：かんたん編成の「並び方」で、<b>標準・トランペットをホルンの真後ろからずらす・低音をトロンボーンの近くに・Cl下手/Sax上手・昔ながら・ドイツ式</b>を選べます。ブラスバンドは前の列の端が首席ソロ・コルネット（これまでの「ソプラノを後ろの列の端に」も選べます）。「ひな形」にも、コンクールA（55人）や小編成などの型があります。</li>
        <li><b>ひな壇のマグネット</b>：ひな壇・平台・上がり段をドラッグすると、近くの段のふちに<b>ぴったりくっつき</b>、端や真ん中にもそろいます（ピンクの線）。くっつけたくないときは Alt を押しながら動かします。</li>
        <li><b>間隔を広げる・つめる</b>：右の「整える」の<b>「↔ 間隔を広げる」「→← 間隔をつめる」</b>で、奏者どうしの間隔を少しずつ変えられます（舞台・ひな壇からはみ出さず、重ならない所まで）。かんたん編成の「並び方」の<b>「となりとの間隔（つめる・ふつう・ゆったり）」</b>でも決められます。</li>
        <li><b>選び方</b>：右上の <b>⬚</b> で四角く囲んで、<b>➰</b> で自由に囲んで、まとめて選べます。<b>ひな壇（平台）は選ばれません</b>（平台だけを囲んだときは平台を選びます）。</li>
        <li><b>弧のカーブ</b>：「整える」のスライダーで、床の扇形を<b>ゆるい弧〜まっすぐ</b>に変えられます。右端に戻すと元の扇形です。</li>
        <li><b>舞台図を重ねる</b>：左のタブの「もっと…」→「トレース」で、ホールの<b>舞台図（PDF・画像）</b>を読み込むと配置図に重なります。「⤢ 舞台の前の角に合わせる」で図の前の左右の角をタップすると、<b>大きさ・向き・位置が一度に</b>合います。PDFなら縮尺（1/100など）で実寸にもできます。図が大きくはみ出しても大丈夫。「✂ 使う範囲を切り取る」「🔭 図の全体を表示」で調整できます。</li>
        <li><b>右の「選択中」</b>：何も選んでいないときは「✨ きれいに整える」だけ。扇形・横一列・向き・重なり・左右反転・間隔などの細かいボタンは <b>「くわしく整える」</b> の箱の中です。</li>
        <li><b>安全の確認</b>：人や楽器が <b>舞台の前の縁から1m以内</b> にあるとき、高さ40cm以上の段の <b>いちばん後ろに立つ人</b> がいるとき（後ろに柵や壁がない）も「⚠ 確認」に出ます。縁に近いものは「🔧 自動で直す」で奥へ動かせます。</li>
        <li><b>上級機能</b>：花道・出入り口（扉）・司会（マイクスタンド）は「部品」の <b>「舞台の設備・その他」</b>、3D の「💡 照明」は 3D の下の <b>「⋯ くわしく」</b> の中です。</li>
        <li><b>オーケストラ</b>：弦はプルト（2人で1本）ごとに指揮者を中心とした弧に沿って同じ間隔・同じ向きで並べ、Vn1・Vn2・Va・Vc の境目に少しすき間を空けます。ティンパニは最上段の真ん中、大太鼓・小太鼓などはそのとなりにまとめ、弦のすぐ横の床には置きません。</li>
        <li><b>舞台の大きさを数字で</b>：図の「前の幅」「奥の幅」「奥行」の数字（✎）を押すと、長さを入力できます。</li>
        <li><b>ひな壇の段ごとの置き方</b>：「ひな壇」の箱で、段ごとに平台の置き方を選べます（例：1段目は横・2段目は縦）。</li>
        <li><b>細かく動かす</b>：ドラッグはマウスどおりに動きます（そろう所に線が出るだけ）。矢印キーは5cm、Shift で25cm、Alt で1cm ずつ動きます。</li>
        <li><b>段の縁の自動の手直し</b>：人や段をドラッグして離すと、ひな壇の縁にかかった人を、段の上か床に自動できちんと置き直します（打楽器は楽器ごと）。そのままにしたいときは Alt を押しながら動かします。</li>
        <li><b>用意する物</b>：右の「編成表」に、奏者のいす・バス椅子・ティンパニ椅子・ピアノ椅子・譜面台・指揮台・平台・箱馬・上がり段・譜面灯の数（目安）が出ます。画像・PDF にも「用意する物の表を入れる」で入れられます。</li>
        <li><b>★ パートのトップ（首席）</b>：奏者を選んで下の操作バーの <b>「★ 首席」</b> を押すと、★首席 → ★コンマス（ヴァイオリン1）→ なし と変わります。かんたん編成では、各パートで指揮者にいちばん近い席（コントラバスは前の方、ブラスバンドのソロ・コルネットは最前列の端）に自動で付きます。「設定」の「首席の★印を表示」で消せます。コンクール提出用の図には、「★を入れる」を選んだときだけ入ります。</li>
        <li><b>🎺 コンクール提出用</b>：上の「📤 書き出す」→ いちばん上の <b>「🎺 コンクール提出用（白黒◯×）」</b> → 「PDFを作る」の3回で、A4・紙いっぱいの白黒の図ができます。入れるのは団体名とメモ（部門・出演順など）だけ。パート名は◯の中に書き、図の下に記号の見方（◯＝いす・×＝譜面台・点線の◯＝立って演奏する人・★＝首席）を入れます。用紙の向き（横・縦）・編成表・記号の見方を入れるかは選べます。提出の書式は大会や支部の要項で違うことがあるので、要項を確かめてください。</li>
        <li><b>方眼</b>：「設定」で方眼を <b>1.82m（1間）</b> にできます。</li>
        <li><b>📏 寸法の表示</b>：舞台の<b>前の幅・奥の幅・奥行</b>、指揮台〜舞台際が常に出ます。平台などを選んだり動かしたりすると、<b>指揮台まで・舞台際まで・奥まで・下手／上手まで</b>の距離がその場で出ます（「設定」で消せます）。</li>
        <li><b>低音を上手の外側に・ホルンのボックス</b>：左のタブの「もっと…」→「一括作成」の「配置のくふう」のチェックで、B.Cl・ユーフォ・チューバ・弦バスを<b>上手側の外側の弧</b>にまとめて置きます（弦バスがいちばん外）。ホルンを2人ずつ前後に並べるボックス型もここで選べます。</li>
        <li><b>ひな壇の幅</b>：自動ではすべての段が同じ横幅になります。手で置いたときは「▤ ひな壇の幅をそろえる」。</li>
        <li><b>🧊 3D</b>：客席から・指揮者から・<b>奏者の席に座った目線</b>で、立体で見られます（奏者をタップするとその席に座れます）。3Dの表示には<b>インターネット接続が必要</b>です。スマホでは、左のパネルの「もっと…」→「🧊 3Dで見る」から開きます。</li>
        <li><b>ひな形</b>：左の「ひな形」から近い編成を選ぶこともできます。</li>
        <li><b>動かす</b>：奏者や楽器をドラッグ。ほかの人と位置がそろうと<b>ピンクのガイド線</b>が出て、ぴったり合います。何もないところをドラッグすると<b>範囲でまとめて選択</b>できます。</li>
        <li><b>選ぶと操作バーが出ます</b>：✏️名前・パート入力／回転／指揮者の方を向く／複製／削除。<b>2回タップ</b>でその列をまとめて選択。右の「選択中」タブの「複製・削除・同じパートを選ぶ」は1つ以上、「位置合わせ」は2つ以上選んだときに出ます。</li>
        <li><b>部品を足す</b>：「部品」で押してから、置きたい場所をタップ。楽器は実寸（cm）です。</li>
        <li><b>✨ きれいに整える</b>：ざっくり置いたあと押すと、列を自動で見つけて<b>扇形（または横一列）・等間隔・指揮者向き</b>にそろえます。</li>
        <li><b>まとめて作る</b>：「もっと…」→「一括作成」で「8,10,12」のように人数を入れると扇形の席が一気にできます。パート名や名前もまとめて入れられます。</li>
        <li><b>トレース</b>：「もっと…」→「トレース」で、いま使っている配置図の画像（写真・スクショ）を読み込むと、<b>ステージの枠を自動で見つけて</b>四隅合わせ（トリミング・ゆがみ補正）をし、椅子の位置を自動で読み取ります。</li>
        <li><b>舞台図面として配る</b>：上の「📤 書き出す」で <b>画像（PNG・SVG）・PDF・印刷</b> をえらべます。<b>用紙（A4・A3、縦・横）と縮尺（1/50・1/100・1/200・用紙に合わせる）</b>をえらぶと、紙の上の長さが実際の寸法どおりになります（1/100 なら 1m が 1cm）。図には<b>上手・下手・客席・センター</b>、スケールバー、右下に<b>情報欄</b>（公演名・会場・日付・版・作った人・縮尺・メモ）が入ります。情報欄の中身は、この画面の「図面の情報欄」で入れます。舞台が用紙に入らないときは、入る縮尺を教えてくれます。印刷は倍率「100%」で。</li>
        <li><b>白黒◯×</b>：「設定」の奏者の表し方、または「📤 書き出す」の画像・PDF・印刷の画面の「表示」で <b>白黒◯×（椅子○・譜面台×）</b> をえらぶと、コピーやFAXでも読める白黒の線の図になります（前の「コンクール用」「図面用」は、これ1つにまとめました）。</li>
        <li><b>⚠ 確認</b>：舞台奥の通路が狭い・<b>指揮台の前が1mより狭い</b>・<b>椅子・譜面台・楽器が重なっている</b>・<b>ひな壇の縁にかかっている</b>・高い段に上がり段がない・重い楽器を段に上げる通路（幅1.2m）がない・緞帳線や迫りの上に物がある、などを見つけると、舞台図の左上に <b>「⚠ 確認 ○件」</b> が出ます。押すと一覧が開き、1つ押すとその場所を<b>赤い点線の枠</b>で示します。一覧のいちばん上の<b>「🔧 自動で直す」</b>を押すと、指揮台の前・舞台奥の通路・ひな壇の縁・重なり・上がり段を、形をくずさずに直します。舞台に物理的に入りきらないときは、一覧のいちばん上に<b>「この舞台では◯人がゆったり入りません」</b>と出し、おすすめ（ひな壇を1段減らす・弦を1プルトずつ減らす・舞台の大きさを確認する）をボタンで選べます（押したあと何人になり、入るかどうかも書いてあります）。打楽器は、入りきらないときでも弦楽器のすぐ横の床には置きません。いくつかの直し方を試して ⚠ がいちばん少ないものを使い、残った所は、枠にかかっている物を楽器と奏者のまとまりごと少しずつ動かして探します（出入り口・緞帳線・迫りなども）。⚠ が増える手直しは残しません（「戻す」で元に戻せます）。直せなかった所は一覧に残ります。</li>
        <li><b>舞台奥の通路</b>：反射板とひな壇・楽器のあいだを空けます（はじめは60cm）。幅は「かんたん編成」の「安全・ホールの設備」の「舞台奥の通路」で変えられ、かんたん編成・ひな形はこの幅を空けて並べます。</li>
        <li><b>ひな壇の組み図</b>：ひな壇には平台1枚ずつの<b>番号</b>（1-3 ＝ 1段目の、前の列の下手から3枚目）と<b>足（箱馬）の位置</b>が出ます。番号は「編成表」の部材の表と同じです。「📤 書き出す」の画面の<b>「中身」で「ひな壇の組み図」</b>をえらぶと、組み図と部材の表だけを1枚にして出せます。</li>
        <li><b>上がり段</b>：「部品」の「上がり段」を、段の横か前にくっつけて置きます（矢印の向きに上がる）。高さ40cm以上の段に人や楽器がいるのに上がる道がないと「⚠ 確認」に出ます。</li>
        <li><b>ホールの設備</b>：「かんたん編成」の「安全・ホールの設備」→「ホールの設備」に、反射板の位置・プロセニアム・緞帳線・迫り・オーケストラピットのふた・花道・<b>上手／下手の出入り口（扉）</b>を<b>分かるものだけ</b>入れると、図に描き、重なった物を「⚠ 確認」で知らせます。出入り口は扉の前 1.2m を空けておく所として描き、かんたん編成はそこを空けて並べます。</li>
        <li><b>📏 舞台図の縮尺</b>：「もっと…」→「トレース」で舞台図を読み込んだら、いちばん上の青いボタン <b>「📏 長さのわかる2点で縮尺を合わせる」</b> を押し、図の上で長さのわかる2点（平台の端から端など）をタップして、<b>1.82m（6尺）・0.91m（3尺）・1m</b> などのボタンを押すと縮尺が合います。</li>
        <li><b>出入り口（扉）</b>：「部品」の <b>出入り口（扉）</b> を壁の近くに置くと、壁にくっついて内側を向きます。<b>舞台の外（そで・奥の通路）</b>にも置けます。舞台のすぐ外（壁から1.5m以内）に置くと、<b>壁の外側にくっついて、そでの方へ開く形</b>になります（空けておく所もそで側）。それより遠くに出すと、置いた所のまま舞台のほうを向きます（Alt を押しながらだと、くっつかず向きも変えません）。「全体を表示」で外の出入り口まで入ります。扉の前 1.2m に人や物があると「⚠ 確認」に出て、かんたん編成はそこを空けて並べます。</li>
        <li><b>司会・照明のテスト</b>：「部品」の「舞台の設備・その他」の <b>司会（マイクスタンド）</b> で司会の位置を決め、3D の「⋯ くわしく」→ <b>「💡 照明」</b> で、地明かりの明るさ・反射板を下から色で照らす・上から色の明かり・<b>ピンスポット</b>（当てる人・どこから・大きさ・色）をためせます。照明の設定は配置図といっしょに保存されます。</li>
        <li><b>花道（張り出し）</b>：「部品」の <b>花道（張り出し）</b> は舞台と同じ高さの床です。客席の方や舞台の横へ出して置け、長さ・幅・向きは自由です。上に置いた人は舞台の外でも「整える」で動かしません。3D にも出ます。</li>
        <li><b>✨ きれいに整える</b>：ひな壇から落ちかけている人は段に乗せ、段にかかっている床の人は降ろし、段の上の人を段の上にきちんと並べます。舞台からはみ出すひな壇・指揮台は舞台の中へ、舞台に入らない床の列は少し詰めます。花道・ピットのふたの上の人はそのままです。</li>
        <li><b>🎻 弦は2人で1本の譜面台</b>：ヴァイオリン・ヴィオラ・チェロ・コントラバスは、となりの人と2人で1本の譜面台になります。奏者を選んで「1人1本にする」「この2人で1本にする」で変えられます。</li>
        <li><b>◠ 弧のひな壇</b>：かんたん編成の「ひな壇の形」で「弧（指揮者を中心に）」。置いたひな壇は、選んで「形」を「弧（円形）」に。平台は扇に並べて描きます。</li>
        <li><b>3Dのパート名</b>：3Dの下の「文字 小・中・大」で大きさを変えられます。</li>
        <li><b>💡 譜面灯・電源</b>：奏者を選んで「譜面灯をつける」、または「編成表」の「全員に譜面灯」。「部品」の「電気・音響」にコンセント・延長コード（タップ）があります。「編成表」に譜面灯の数と必要な差し込み口の数が出ます。</li>
        <li><b>🎙 録音・音響</b>：「部品」の「電気・音響」に録音用マイク（高いスタンド）・モニタースピーカー。マイクを選んで「下手の袖へ」「上手の袖へ」を押すと、ケーブルの通り道を線で描きます（白い丸をドラッグで直せます）。「📤 書き出す」の画面では「音響の機材を入れる」のチェックで出す／出さないを切り替えられます。</li>
        <li><b>👥 名簿・乗り番表（個人名）</b>：「編成表」の <b>「👥 名簿・乗り番表」</b>（スマホは「もっと…」から）で、<b>取り込み様式</b>（CSV。Excel・Googleスプレッドシートで開けます）をダウンロード → パートごとに名前と、曲ごとの乗り番（○＝乗り・空欄＝降り・「Picc持ち替え」などのメモ）を書く → <b>「取り込む」</b>で、舞台図の席に名前が入ります（<b>席の数・編成は変えません</b>。入れられなかった名前と、読めなかった行は理由つきで名簿の画面に出て、その場で直せます）。「小林（Ob）」「Ob 小林」「サックス 伊藤」「パーカス 渡辺」のような書き方も読めます。Excelで選んでコピーして「Excelから貼り付け」でもOK。人数も名簿に合わせたいときは「人数も名簿に合わせる」をオンに（減るときは、どのパートが何人になるかを見せて確認します）。表の中でも名前・○を直せます。「舞台図に入れる人」で曲をえらぶと、その曲に乗る人数・名前の舞台図に。<b>「🎼 曲ごとに部を作る」</b>で曲ごとの部ができ、曲の間の「🔁 転換」も見られます。乗り番表は印刷・Excel用で保存もできます。1人ずつの名前は、奏者を選んで ✏️ でも入れられます。</li>
        <li><b>🧩 パートのかたまり</b>：舞台図の右の <b>🧩</b> で、パートごとのかたまりの表示になります。かたまりをドラッグするとパートごと動き、<b>ほかのパートの上で離すと並び順を入れかえ</b>ます（吹奏楽・ブラスバンドのかんたん編成では、ひな壇・間隔をそろえたまま並べ直し、並び方は「自分で並べかえた順」になります）。</li>
        <li><b>📑 1部・2部・3部と🔁 転換</b>：舞台図の左下の <b>「＋ 2部を作る」</b>（スマホは「もっと…」→「1部・2部・3部」）で、部ごとの配置図を作れます（「いまの部をコピーして次の部を作る」がおすすめ）。部のタブで切りかえ、開いている部のタブか「＋」で名前・順番・消す。<b>「🔁 転換」</b>を押すと、前の部から次の部へ変えるとき、<b>いすを何脚はけるか・何を出すか・何を動かすか</b>の表と、おすすめの手順（①はける ②ひな壇の組み替え ③動かす ④出す、出入り口・そでごと）が出ます。「図で見る」で次の部の上に × はける・○ 出す・→ 動かす の印を出し、直すとすぐ変わります。「文字でコピー」で係の人に送れます。</li>
        <li><b>🔍 前の版とくらべる</b>：「保存/開く」の「くらべる」「第○版とくらべる」「ファイルとくらべる」で、違いを図に出します（<b>○＋ 増えた・□− 減った・→ 動いた</b>。白黒でも分かります）。「変更の内容に入れる」で変更メモを作ると、図面の情報欄の「変更」の行に出ます。</li>
        <li><b>版</b>：「名前を付けて保存」のとき、<b>第何版かを1つ上げるか</b>聞きます。「📤 書き出す」の画面の「図面の情報欄」で手で直すこともできます。</li>
        <li><b>保存・共有</b>：上のボタンから画像保存・印刷・共有リンクが作れます。作業中の内容は自動で保存されます。ただし保存先は<b>このブラウザの中だけ</b>なので、ブラウザのデータを消したり機種を変えたりすると消えます。大事な図は「💾 保存/開く」の<b>「⬇ ファイルに保存」</b>もしておくと安心です（初めて書き出したあとにも1回だけ案内します）。</li>
      </ol>
      <h3 style="font-size:14px">便利なキー（パソコン）</h3>
      <ul class="hint">
        <li>Ctrl+Z 元に戻す／Ctrl+Y やり直す／Delete 削除</li>
        <li>Ctrl+C / Ctrl+V コピー・貼り付け／Ctrl+D 複製</li>
        <li>矢印キーで少しずつ移動（Shiftで大きく）／R で15°回転</li>
        <li>スペースを押しながらドラッグで画面移動、ホイールで拡大縮小</li>
      </ul>
      <button class="btn primary wide" onclick="document.getElementById('modalClose').click()">はじめる</button>
    `);
  }

  // ------------------------------------------------------------ かんたん編成（人数を変えると自動で並べる）
  let lastAutoPush = 0;
  function ens() {
    if (!doc().ensemble) doc().ensemble = SS.auto.defaultState('band');
    const e = doc().ensemble;
    if (!e.hina) e.hina = SS.auto.defaultState(e.type).hina;
    return e;
  }
  function applyAuto(opts2) {
    opts2 = opts2 || {};
    const st = ens();
    if (!opts2.noHistory && Date.now() - lastAutoPush > 1500) pushHistory();
    lastAutoPush = Date.now();
    const d = doc();
    // 今の名前を、パートごとに覚えておく
    const names = {};
    d.items.filter(it => it.type === 'player' && it.name).forEach(it => { (names[it.label] = names[it.label] || []).push(it.name); });
    // 譜面灯も、パートごとの数を覚えておく
    const lights = {};
    d.items.filter(it => it.type === 'player' && it.light).forEach(it => { lights[it.label] = (lights[it.label] || 0) + 1; });
    const hadAuto = d.items.some(it => it.auto);
    const keepTypes = new Set(['text', 'box', 'circle', 'mic', 'amp', 'micTall', 'monitor', 'cable', 'outlet', 'tap', 'stairs', 'door', 'runway', 'mc']);
    d.items = d.items.filter(it => (hadAuto ? !it.auto : keepTypes.has(it.type)));
    // ビッグバンドは指揮者なし（指揮台は置かない）
    if (st.type === 'bigband') d.items = d.items.filter(it => it.type !== 'podium');
    SS.auto.ctxItems = d.items; // 出入り口の部品を避けて並べる
    const r = SS.auto.build(st, d.stage);
    SS.auto.ctxItems = null;
    opts().arcCurve = 1; opts().arcBase = null; syncArcCurve();
    r.items.forEach(it => {
      it.id = newId();
      if (it.type === 'player' && names[it.label] && names[it.label].length) it.name = names[it.label].shift();
      if (it.type === 'player' && lights[it.label]) { it.light = true; lights[it.label]--; }
      d.items.push(it);
    });
    S.sel.clear();
    renderAll();
    renderEnsNow();
    // 入りきらないとき：⚠ 確認の一覧のいちばん上に「入りきりません」とおすすめを出す（無理に詰めたことを隠さない）
    S.fit = { fits: !!r.fits && !r.offstage, offstage: r.offstage || 0, key: fitKey() };
    S.fixFail = null;
    if (!S.fit.fits) { $('warnList').hidden = false; renderWarnList(); }
    if (opts2.fit) fitView();
    if (opts2.quiet) return;
    if (!S.fit.fits) return;
    if (r.percMoved) toast('打楽器が入りきらないので、打楽器の場所を「' + $('percPlace').querySelector(`option[value="${r.percMoved}"]`).textContent + '」にして並べました');
    else if (r.slim) toast('奥行が足りないので、ひな壇を 4×6尺1枚分（121cm）に詰めました');
    else if (r.lowFallback) toast('上手の外側に場所がないので、低音はそれぞれの列に入れました');
    else if (r.curveFallback) toast('舞台からはみ出す・床の人とぶつかる段は、弧にせず、まっすぐのままにしました');
    else if (st.space === 'wide' && r.tune && !r.tune.scaled) toast('舞台がせまいので、「ゆったり」にはできませんでした（ふつうの間隔で並べました）', true);
    else if (r.tune && r.tune.spacing <= 74 && st.space !== 'tight') toast('舞台がせまいので、となりとの間隔をつめて並べました。窮屈なときは、人数・段数を見直すか、右の「整える」の「↔ 間隔を広げる」を試してください', true);
  }

  const HOLD_DELAY = 380, HOLD_REPEAT = 110;
  const HINA_MAIN = ['36h2', '36v1', '46h1']; // よく使う平台の置き方
  const PERC_SHORT = { back: '舞台の奥', top: 'ひな壇の最上段', left: '下手', both: '最上段＋下手', timpTop: 'ティンパニ最上段＋下手' };
  // 人数0のパートは、ふだんは隠して「＋パートを追加」で出す
  let showZeroParts = false;
  function renderPartMore() {
    const box = $('partSteppers'), btn = $('partMore');
    box.classList.toggle('show-zero', showZeroParts);
    const zero = [...box.querySelectorAll('.stepper.zero')].map(el => el.getAttribute('data-part'));
    btn.hidden = !zero.length && !showZeroParts;
    btn.textContent = showZeroParts ? '人数0のパートをしまう'
      : `＋パートを追加（${zero.slice(0, 4).join('・')}${zero.length > 4 ? ' など' : ''} ${zero.length}パート）`;
  }
  $('partMore').onclick = () => {
    showZeroParts = !showZeroParts;
    $('partSteppers').querySelectorAll('.keep').forEach(el => el.classList.remove('keep'));
    renderPartMore();
  };
  // 打楽器の楽器を1つずつ増やす・減らす（決めていないときは、人数から自動）
  function renderPercKit() {
    const st = ens();
    const show = st.percInst !== false && ['band', 'orch', 'brass'].includes(st.type);
    $('percKitWrap').hidden = !show;
    if (!show) return;
    const kit = SS.auto.percKitOf(st);
    $('percKitAuto').hidden = !st.percKit;
    $('percKit').innerHTML = SS.auto.PERC_KIT.map(([k, name]) => `<div class="kit-row${kit[k] ? '' : ' zero'}" data-kit="${k}"><span>${SS.esc(name)}</span><button data-d="-1" aria-label="${SS.esc(name)}を減らす">−</button><b>${kit[k] || 0}</b><button data-d="1" aria-label="${SS.esc(name)}を増やす">＋</button></div>`).join('');
    $('percKit').querySelectorAll('.kit-row button').forEach(b => {
      b.onclick = () => {
        const k = b.parentElement.getAttribute('data-kit'), d = +b.getAttribute('data-d');
        const s2 = ens(), cur = SS.auto.percKitOf(s2);
        const max = k === 'timp' ? 1 : 3;
        const v = Math.max(0, Math.min(max, (cur[k] || 0) + d));
        if (v === (cur[k] || 0)) return;
        cur[k] = v;
        s2.percKit = cur;
        // 楽器の数（持ち場）に合わせて、打楽器の人数が足りなければ増やす
        const stations = Object.keys(cur).reduce((a, q) => a + (cur[q] || 0), 0);
        const players = (s2.counts.Perc || 0) + (s2.type === 'orch' ? (s2.counts.Timp || 0) : 0);
        if (d > 0 && stations > players) { if (s2.type === 'orch' && k === 'timp' && !s2.counts.Timp) s2.counts.Timp = 1; else s2.counts.Perc = (s2.counts.Perc || 0) + 1; }
        renderSteppers();
        applyAuto();
      };
    });
  }
  $('percKitAuto').onclick = () => { delete ens().percKit; renderSteppers(); applyAuto(); };

  // 「打楽器」「ひな壇」の箱の見出しに、いまの設定を出す
  function renderEnsNow() {
    const st = ens(), H = st.hina, cur = SS.hinaTypeOf(H);
    const kitN = st.percInst === false || !['band', 'orch', 'brass'].includes(st.type) ? 0 : Object.values(SS.auto.percKitOf(st)).reduce((a, v) => a + (v || 0), 0);
    $('percBoxNow').textContent = (PERC_SHORT[st.percPlace || 'back'] || '') + (st.percInst === false ? '・楽器は置かない' : kitN ? `・楽器${kitN}${st.percKit ? '（手動）' : ''}` : '');
    const SPACE = { tight: '・間隔つめる', wide: '・間隔ゆったり' };
    const lays = SS.auto.layoutsOf(st.type), lay2 = st.layout === 'custom' && st.customRows ? { name: SS.auto.CUSTOM_NAME } : lays[st.layout] || lays[Object.keys(lays)[0]];
    $('layoutBoxNow').textContent = (['band', 'brass', 'choir'].includes(st.type) ? (lay2 ? lay2.name.split('（')[0] : '') : st.type === 'bigband' ? '標準（サックス前・Tb・Tp）' : st.antiphonal ? '対向配置' : '通常配置') + (SPACE[st.space] || '');
    document.querySelectorAll('#ensSpace [data-space]').forEach(b => b.classList.toggle('on', b.getAttribute('data-space') === (st.space || 'normal')));
    $('hinaBoxNow').textContent = H.steps ? `${H.steps}段・${cur ? cur.name.replace(/ /g, '') : ''}${H.types && H.types.some(Boolean) ? '・段ごと' : ''}${H.curve ? '・弧' : ''}` : 'なし';
  }
  function renderSteppers() {
    const st = ens();
    const e = SS.auto.ENSEMBLES[st.type];
    document.querySelectorAll('#ensType [data-ens]').forEach(b => b.classList.toggle('on', b.getAttribute('data-ens') === st.type));

    $('ensAnti').checked = !!st.antiphonal;
    $('ensPerc').checked = st.percInst !== false;
    $('ensPerc').parentElement.hidden = st.type === 'strings';

    let total = 0;
    $('partSteppers').innerHTML = e.parts.map(([k]) => {
      const n = st.counts[k] || 0; total += n;
      return `<div class="stepper${n ? '' : ' zero'}" data-part="${k}"><span class="nm"><i style="background:${SS.partGroup(k).color}"></i>${SS.esc(k)}</span>
        <button data-d="-1" aria-label="${SS.esc(k)}を1人減らす">▼</button><b>${n}</b><button data-d="1" aria-label="${SS.esc(k)}を1人増やす">▲</button></div>`;
    }).join('');
    void total;
    renderPartMore();
    renderEnsTotal();
    // ひな壇
    $('ensHornBox').checked = !!st.hornBox;
    $('ensLowOuter').checked = !!st.lowOuter;
    $('lowOuterWrap').hidden = st.type !== 'band';
    // 並び方：吹奏楽・ブラスバンド・合唱はえらぶ（ビッグバンド・オーケストラ・弦楽はなし）
    const LAYS = SS.auto.layoutsOf(st.type), hasLay = ['band', 'brass', 'choir'].includes(st.type);
    $('bandLayoutWrap').hidden = !hasLay;
    $('bandLayoutLbl').textContent = `並び方（${SS.auto.ENSEMBLES[st.type].name}）`;
    const hasCustom = st.layout === 'custom' && !!st.customRows;
    if ($('bandLayout').getAttribute('data-type') !== st.type + (hasCustom ? '+c' : '')) {
      $('bandLayout').innerHTML = (hasCustom ? `<option value="custom">${SS.auto.CUSTOM_NAME}（パートのかたまりで動かした順）</option>` : '') + Object.keys(LAYS).map(k => `<option value="${k}">${SS.esc(LAYS[k].name)}</option>`).join('');
      $('bandLayout').setAttribute('data-type', st.type + (hasCustom ? '+c' : ''));
    }
    $('bandLayout').value = hasCustom ? 'custom' : LAYS[st.layout] ? st.layout : Object.keys(LAYS)[0];
    $('percPlace').value = st.percPlace || 'back';
    renderPercKit();
    // 打楽器の箱：打楽器のある編成だけ
    $('percBox').hidden = !['band', 'orch', 'brass'].includes(st.type);
    $('ensAntiWrap').hidden = !['orch', 'strings'].includes(st.type);
    $('percPlaceWrap').hidden = st.type === 'strings';
    const H = st.hina;
    document.querySelectorAll('#hinaSteps [data-steps]').forEach(b => b.classList.toggle('on', +b.getAttribute('data-steps') === (H.steps || 0)));
    document.querySelectorAll('#hinaShape [data-shape]').forEach(b => b.classList.toggle('on', b.getAttribute('data-shape') === (H.curve ? 'arc' : 'line')));
    const cur = SS.hinaTypeOf(H);
    renderEnsNow();
    // 平台の置き方：よく使う3つだけ見せて、ほかは「ほかの置き方」にしまう
    const typeBtn = t => `<button class="hina-type${cur && cur.id === t.id ? ' on' : ''}" data-ht="${t.id}" title="${SS.esc(t.hint)}">${SS.hinaTypeSVG(t)}<b>${SS.esc(t.name)}</b><small>奥行${Math.round(SS.hinaTypeDepth(t))}cm</small></button>`;
    const oldMore = $('hinaTypes').querySelector('details');
    const others = SS.HINA_TYPES.filter(t => !HINA_MAIN.includes(t.id));
    const moreOpen = (oldMore && oldMore.open) || (cur && !HINA_MAIN.includes(cur.id));
    $('hinaTypes').innerHTML = `<div class="hina-types">${SS.HINA_TYPES.filter(t => HINA_MAIN.includes(t.id)).map(typeBtn).join('')}</div>
      <details class="fold-more"${moreOpen ? ' open' : ''}><summary>ほかの置き方（${others.map(t => SS.esc(t.name.replace(/ /g, ''))).join('・')}）</summary><div class="hina-types">${others.map(typeBtn).join('')}</div></details>`;
    $('hinaTypes').querySelectorAll('[data-ht]').forEach(b => {
      b.onclick = () => {
        const t = SS.HINA_TYPES.find(x => x.id === b.getAttribute('data-ht'));
        Object.assign(ens().hina, { panel: t.panel, orient: t.orient, deep: t.deep });
        renderSteppers();
        applyAuto();
      };
    });
    const std = [21.2, 42.4, 63.6, 84.8];
    // 高さは名前だけを選び、組み方（足・箱馬）は下に折り返して出す（せまい画面でも文字が切れない）
    const howOf = v => { const r = SS.RISER_HEIGHTS.find(h => Math.abs(h.v - v) < 0.6); return r ? r.how : ''; };
    $('hinaHeightsLbl').hidden = !H.steps;
    $('hinaHeights').innerHTML = Array.from({ length: H.steps || 0 }, (_, i) => {
      const v = (H.heights && H.heights[i]) || std[i];
      // 段ごとの平台の置き方（決めていなければ、上の「1段の平台の置き方」と同じ）
      const ti = (H.types && H.types[i]) || '';
      const typeSel = `<select data-tstep="${i}" title="この段の平台の置き方"><option value="">置き方：上と同じ${cur ? '（' + SS.esc(cur.name) + '）' : ''}</option>${SS.HINA_TYPES.map(t => `<option value="${t.id}"${ti === t.id ? ' selected' : ''}>置き方：${SS.esc(t.name)}（奥行${Math.round(SS.hinaTypeDepth(t))}cm）</option>`).join('')}</select>`;
      return `<label><b>${i + 1}段</b><select data-hstep="${i}" title="${SS.esc(howOf(v))}">${SS.RISER_HEIGHTS.map(h => `<option value="${h.v}"${Math.abs(h.v - v) < 0.6 ? ' selected' : ''}>${h.name}</option>`).join('')}</select><small class="how">${SS.esc(howOf(v))}</small>${typeSel}</label>`;
    }).join('');
    $('hinaHeights').querySelectorAll('[data-tstep]').forEach(sel => {
      sel.onchange = () => {
        const i = +sel.getAttribute('data-tstep'), hh = ens().hina;
        hh.types = (hh.types || []).slice();
        hh.types[i] = sel.value || null;
        if (!hh.types.some(Boolean)) delete hh.types;
        applyAuto();
      };
    });
    $('hinaHeights').querySelectorAll('[data-hstep]').forEach(sel => {
      sel.onchange = () => {
        const i = +sel.getAttribute('data-hstep');
        const hh = ens().hina;
        hh.heights = (hh.heights || std.slice()).slice();
        hh.heights[i] = +sel.value;
        sel.parentElement.querySelector('.how').textContent = sel.title = howOf(+sel.value);
        applyAuto();
      };
    });
    $('partSteppers').querySelectorAll('.stepper button').forEach(b => {
      const k = b.parentElement.getAttribute('data-part');
      const d = +b.getAttribute('data-d');
      let timer = null;
      const step = () => {
        const st2 = ens();
        const v = Math.max(0, Math.min(40, (st2.counts[k] || 0) + d));
        if (v === (st2.counts[k] || 0)) return;
        st2.counts[k] = v;
        const box = b.parentElement;
        box.querySelector('b').textContent = v;
        box.classList.toggle('zero', !v);
        box.classList.add('keep'); // いま押しているパートは、0人にしても指の下から消さない
        renderPartMore();
        applyAuto();
      };
      // 押しっぱなしで連続して増減
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        step();
        timer = setTimeout(function rpt() { step(); timer = setTimeout(rpt, HOLD_REPEAT); }, HOLD_DELAY);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(timer)));
    });
  }
  document.querySelectorAll('#ensType [data-ens]').forEach(b => {
    b.onclick = () => {
      const t = b.getAttribute('data-ens');
      const prev = ens();
      doc().ensemble = Object.assign(SS.auto.defaultState(t), { percInst: prev.percInst });
      renderSteppers();
      applyAuto({ fit: true });
    };
  });
  $('ensAnti').onchange = e => { ens().antiphonal = e.target.checked; applyAuto(); };
  document.querySelectorAll('#ensSpace [data-space]').forEach(b => { b.onclick = () => { ens().space = b.getAttribute('data-space'); renderEnsNow(); applyAuto(); }; });
  // 配置のくふう（一括作成タブ）：自動配置のときだけ並べ直す。手で置いた配置は消さない
  const optAuto = () => {
    if (doc().items.some(it => it.auto)) applyAuto();
    else toast('「かんたん編成」で並べるときに使われます');
  };
  $('ensHornBox').onchange = e => { ens().hornBox = e.target.checked; optAuto(); };
  $('ensLowOuter').onchange = e => { ens().lowOuter = e.target.checked; optAuto(); };
  $('bandLayout').onchange = e => { ens().layout = e.target.value; applyAuto(); };
  $('percPlace').onchange = e => { ens().percPlace = e.target.value; applyAuto(); };
  document.querySelectorAll('#hinaShape [data-shape]').forEach(b => {
    b.onclick = () => { ens().hina.curve = b.getAttribute('data-shape') === 'arc'; renderSteppers(); applyAuto(); };
  });
  document.querySelectorAll('#hinaSteps [data-steps]').forEach(b => {
    b.onclick = () => { ens().hina.steps = +b.getAttribute('data-steps'); renderSteppers(); applyAuto(); };
  });
  $('ensPerc').onchange = e => { ens().percInst = e.target.checked; applyAuto(); };

  // ------------------------------------------------------------ ホール（ステージ寸法）
  function buildHallSelect() {
    const sel = $('hallSelect');
    const groups = {};
    SS.HALLS.forEach((h, i) => { (groups[h.pref] = groups[h.pref] || []).push(`<option value="${i}">${h.q === 'est' || h.q === 'approx' ? '△ ' : '◎ '}${SS.esc(h.name)}（${h.fw}×${h.d}m${h.shape === 'arc' ? '・前が弧' : ''}）</option>`); });
    sel.innerHTML = '<option value="">いまの大きさのまま／手動で設定</option>' +
      Object.keys(groups).map(g => `<optgroup label="${g === '東京' ? '東京都' : g + '県'}">${groups[g].join('')}</optgroup>`).join('');
    sel.onchange = () => {
      const h = SS.HALLS[+sel.value];
      if (!h) { doc().hall = ''; updateHallNote(); return; }
      pushHistory();
      setHall(h);
    };
  }
  function setHall(h, quiet) {
    {
      doc().stage.w = Math.round(h.fw * 100);
      doc().stage.bw = Math.round(h.bw * 100);
      doc().stage.d = Math.round(h.d * 100);
      doc().stage.shape = h.shape || 'shell';
      if (h.sag != null) doc().stage.sag = Math.round(h.sag * 100); else delete doc().stage.sag;
      // ホールの設備：データがあるホールだけ入れる（分からない値は作らない）。前のホールの設備は消す
      if (h.fixtures) doc().stage.fixtures = fixturesFromHall(h.fixtures); else delete doc().stage.fixtures;
      doc().hall = h.name;
      updateHallNote();
      if (doc().items.some(it => it.auto)) applyAuto({ fit: true });
      else { renderAll(); fitView(); }
      if (!quiet) toast(h.shape === 'arc' ? `${h.name}：幅${h.fw}m・奥行${h.d}m（前が弧）にしました。弧は ◠ のつまみで調整できます` : `${h.name}：反射板設置時 前幅${h.fw}m・奥幅${h.bw}m・奥行${h.d}m にしました`, true);
    }
  }
  function updateHallNote() {
    const h = SS.HALLS.find(x => x.name === doc().hall);
    const sel = $('hallSelect');
    sel.value = h ? String(SS.HALLS.indexOf(h)) : '';
    const st = doc().stage;
    // ホールを選んだときは、選ぶ欄のすぐ下に寸法の注意（△＝推定値のホールは、より目立つように）
    const est = h && (h.q === 'est' || h.q === 'approx');
    $('hallWarn').hidden = !h;
    $('hallWarn').classList.toggle('est', !!est);
    $('hallWarn').innerHTML = h ? `${est ? '⚠ <b>このホールの寸法は推定値です。</b>' : '⚠ '}寸法は目安です。<b>本番前に必ずホールの舞台図面で確認してください。</b>` : '';
    $('hallNote').innerHTML = h
      ? `<b class="${h.q === 'est' || h.q === 'approx' ? 'q-est' : 'q-ok'}">${SS.HALL_Q[h.q]}</b><br>${h.shape === 'arc' ? `幅${h.fw}m／奥の幅${h.bw}m／奥行（中央）${h.d}m、前のふちは弧` : `反射板設置時：前の幅${h.fw}m／奥の幅${h.bw}m／奥行${h.d}m`}。${h.note ? SS.esc(h.note) + '。' : ''}<a href="${h.src}" target="_blank" rel="noopener">出典</a>。<br>本番前にホールの「反射板設置時の舞台図面」で確認し、違っていたら下の「ステージの大きさ・形」で直してください。`
      : `いまのステージ：前の幅${st.w / 100}m／奥の幅${Math.round(SS.render.backWidth(st)) / 100}m／奥行${st.d / 100}m`;
  }
  $('btn3d').onclick = () => SS.view3d.open(null);
  SS.app = { doc, conductor, players, toast, selected, touch: () => scheduleSave() };

  // ------------------------------------------------------------ 起動
  async function init() {
    buildTemplates();
    buildPalette();
    buildHallSelect();
    setMode('select');
    let loaded = false;
    const m = /#d=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (m) {
      try {
        S.doc = normalize(await SS.render.decodeShare(m[1]));
        loaded = true;
        history.replaceState(null, '', location.pathname + location.search);
        setTimeout(() => toast('共有された配置図を開きました'), 300);
      } catch (e) { toast('共有リンクを読み込めませんでした'); }
    }
    if (!loaded) {
      try {
        const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null');
        if (saved && Array.isArray(saved.items)) { S.doc = normalize(saved); loaded = true; }
      } catch (e) { /* ignore */ }
    }
    if (!loaded) {
      const t = SS.TEMPLATES[0].make();
      S.doc = normalize({ stage: t.stage, items: t.items, ensemble: t.ensemble || null });
      try { if (!localStorage.getItem('stagesetting.helped')) { localStorage.setItem('stagesetting.helped', '1'); setTimeout(showWelcome, 400); } } catch (e) { /* ignore */ }
    }
    if (S.doc.underlay) {
      $('overlayControls').classList.remove('hidden');
      syncOverlayUI();
    }
    renderAll();
    renderSteppers();
    updateHallNote();
    fitView();
    let resizeTimer = null;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitView, 150); });
  }
  // ------------------------------------------------------------ 文章で指示する（claude.ai で開いたときは AI が読む）
  let aiSample = null, aiCtl = null;
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('sample').then(fn => { aiSample = fn || null; }).catch(() => { aiSample = null; });
  }
  document.querySelectorAll('#aiExamples [data-ex]').forEach(b => { b.onclick = () => { $('aiText').value = b.getAttribute('data-ex'); $('aiText').focus(); }; });
  function aiShow(msg, err) {
    const o = $('aiOut');
    o.hidden = !msg; o.textContent = msg || ''; o.classList.toggle('err', !!err);
    // 閉じているときも、見出しに最後の結果を短く出す
    const last = (msg || '').split('\n').pop();
    $('aiBoxNow').textContent = !msg ? '例：フルート6人、打楽器は下手' : err ? '読み取れませんでした' : last.length > 22 ? last.slice(0, 22) + '…' : last;
  }
  // AI・読み取りの結果（changes）を、かんたん編成の設定に反映して並べ直す
  function applyAIChanges(ch) {
    pushHistory();
    lastAutoPush = Date.now();
    if (ch.type && ch.type !== ens().type) doc().ensemble = Object.assign(SS.auto.defaultState(ch.type), { percInst: ens().percInst });
    const st = ens();
    if (ch.counts) Object.entries(ch.counts).forEach(([k, v]) => { if (k in st.counts) st.counts[k] = v; });
    ['layout', 'percPlace', 'percInst', 'hornBox', 'lowOuter', 'antiphonal'].forEach(k => { if (ch[k] !== undefined) st[k] = ch[k]; });
    if (ch.hina) {
      st.hina = Object.assign({}, st.hina, ch.hina);
      if (ch.hina.panel && !ch.hina.deep) {
        const t = SS.HINA_TYPES.find(x => x.panel === st.hina.panel && x.orient === (st.hina.orient || 'h'));
        if (t) st.hina.deep = t.deep;
      }
    }
    if (ch.stage) {
      const sg = doc().stage;
      const h = ch.stage.hall && SS.HALLS.find(x => x.name === ch.stage.hall);
      if (h) setHall(h, true);
      if (ch.stage.shape) { sg.shape = ch.stage.shape; if (['shell', 'arc', 'round'].includes(sg.shape) && !sg.bw) sg.bw = Math.round(sg.w * 0.7); }
      if (ch.stage.w) sg.w = Math.round(ch.stage.w * 100);
      if (ch.stage.d) sg.d = Math.round(ch.stage.d * 100);
      if (ch.stage.bw) sg.bw = Math.min(sg.w, Math.round(ch.stage.bw * 100));
      if (ch.stage.sag != null) sg.sag = Math.round(ch.stage.sag * 100);
      if (!h && (ch.stage.w || ch.stage.d || ch.stage.shape)) doc().hall = '';
    }
    renderSteppers();
    applyAuto({ fit: true, noHistory: true });
    updateHallNote();
    renderSettings();
  }
  // 読み取った結果で人数が大きく（5人以上）減るときは、先に確かめる
  function confirmDrop(ch, go, cancel) {
    const st = ens(), sum = o => Object.values(o).reduce((a, v) => a + (+v || 0), 0);
    const type = ch.type || st.type, keys = SS.auto.ENSEMBLES[type].parts.map(([k]) => k);
    const from = type === st.type ? st.counts : SS.auto.defaultState(type).counts;
    const next = {};
    keys.forEach(k => { next[k] = ch.counts && ch.counts[k] != null ? ch.counts[k] : from[k] || 0; });
    const before = sum(st.counts), after = sum(next);
    if (before - after < 5) { go(); return; }
    const down = type === st.type ? keys.filter(k => next[k] < (from[k] || 0)).map(k => `${k} ${from[k]}人→${next[k]}人`) : [];
    askConfirm(`${down.length ? down.slice(0, 5).join('、') + (down.length > 5 ? ' など、' : '、') : ''}合わせて${before - after}人減ります（${before}人 → ${after}人）。\nよいですか？（あとで「戻す」で元に戻せます）`, `${before - after}人減らして並べ直す`, go);
    // 「やめる」を押したとき
    const no = $('cfNo');
    if (no && cancel) no.addEventListener('click', cancel);
  }
  function aiLocal(text, note) {
    const r = SS.assistant.parseLocal(text, ens());
    if (r.unknown) {
      aiShow((note ? note + '\n' : '') + '読み取れませんでした。「フルート6人」「打楽器は下手」「ひな壇2段」「ホルンをボックス型に」「ミューザで」のように書いてみてください。', true);
      return;
    }
    confirmDrop(r.changes, () => {
      applyAIChanges(r.changes);
      aiShow((note ? note + '\n' : '') + '✔ ' + r.said.join('／'));
    }, () => aiShow('やめました（配置は変えていません）。読み取った内容：' + r.said.join('／')));
  }
  $('aiGo').onclick = async () => {
    const text = $('aiText').value.trim();
    if (!text) { $('aiText').focus(); return; }
    if (!aiSample) { aiLocal(text); return; }
    aiCtl = new AbortController();
    $('aiGo').disabled = true; $('aiStop').hidden = false;
    aiShow('AIが考えています…（10〜60秒ほどかかることがあります）');
    try {
      const raw = await aiSample.json(SS.assistant.buildPrompt(text, ens(), doc().stage, doc().hall), { signal: aiCtl.signal, cache: false });
      const ch = SS.assistant.sanitize(raw);
      const keys = Object.keys(ch).filter(k => k !== 'message');
      if (!keys.length) { aiShow('🤖 ' + (ch.message || '変えるところが見つかりませんでした。もう少し具体的に書いてみてください。')); return; }
      confirmDrop(ch, () => {
        applyAIChanges(ch);
        aiShow('🤖 ' + (ch.message || '要望に合わせて並べ直しました。') + '\n（気に入らなければ「戻す」で元に戻せます）');
      }, () => aiShow('やめました（配置は変えていません）。'));
    } catch (e) {
      const code = e && e.code;
      if (code === 'cancelled') aiShow('止めました。');
      else if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) { aiSample = null; aiLocal(text, 'AIが使えないので、かんたん読み取りで並べました'); }
      else if (code === 'rate_limited') aiShow('AIへのお願いが多すぎるようです。少し待ってからもう一度どうぞ。', true);
      else aiLocal(text, 'AIの答えを受け取れなかったので、かんたん読み取りで並べました');
    } finally {
      $('aiGo').disabled = false; $('aiStop').hidden = true; aiCtl = null;
    }
  };
  $('aiStop').onclick = () => { if (aiCtl) aiCtl.abort(); };

  // 白黒◯×の表示を画面にも使う
  (() => { const st = document.createElement('style'); st.textContent = SS.render.MONO_CSS; document.head.appendChild(st); })();
  init();
})(window.SS);
