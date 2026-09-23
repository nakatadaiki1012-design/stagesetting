/* 画像からの自動トレース（丸や四角を見つけて座席にする） */
window.SS = window.SS || {};

(function (SS) {
  const T = {};
  const MAX_DIM = 1400;

  T.loadImageFromFile = function (file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve({ img, dataURL: reader.result });
        img.onerror = () => reject(new Error('画像を読み込めませんでした'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('ファイルを読み込めませんでした'));
      reader.readAsDataURL(file);
    });
  };

  // 画像を解析用のキャンバスに描く（大きすぎる画像は縮小）
  T.prepare = function (img) {
    const k = Math.min(1, MAX_DIM / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * k));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    // 明るさ・彩度
    const lum = new Float32Array(w * h), sat = new Float32Array(w * h);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2];
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
    }
    // 背景の明るさ（ムラ対策に広い範囲の平均）
    const rad = Math.max(12, Math.round(Math.min(w, h) / 12));
    const bgL = boxBlur(lum, w, h, rad), bgS = boxBlur(sat, w, h, rad);
    const ink = new Float32Array(w * h);
    let bgMax = 0;
    for (let i = 0; i < w * h; i++) {
      const bl = Math.max(bgL[i], 200); // 紙はだいたい白いので下限をつける
      ink[i] = Math.max(bl - lum[i], (sat[i] - Math.min(bgS[i], 40)) * 1.2);
      if (bl > bgMax) bgMax = bl;
    }
    return { canvas, w, h, ink };
  };

  function boxBlur(src, w, h, r) {
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += src[y * w + x];
        I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
      }
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        out[y * w + x] = s / ((x1 - x0) * (y1 - y0));
      }
    }
    return out;
  }

  function otsu(ink) {
    const hist = new Float64Array(256);
    for (let i = 0; i < ink.length; i++) hist[Math.max(0, Math.min(255, ink[i] | 0))]++;
    const total = ink.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, th = 60;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = total - wB; if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; th = t; }
    }
    return th;
  }

  // 連結成分（くっついている黒いかたまり）を探す
  function components(mask, w, h, four) {
    const labels = new Int32Array(w * h).fill(-1);
    const comps = [];
    const stack = new Int32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (!mask[i] || labels[i] !== -1) continue;
      const id = comps.length;
      let sp = 0; stack[sp++] = i; labels[i] = id;
      let minx = w, miny = h, maxx = 0, maxy = 0, area = 0, sx = 0, sy = 0;
      while (sp) {
        const p = stack[--sp];
        const x = p % w, y = (p / w) | 0;
        area++; sx += x; sy += y;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (four && dx && dy) continue;
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const q = yy * w + xx;
            if (mask[q] && labels[q] === -1) { labels[q] = id; stack[sp++] = q; }
          }
        }
      }
      const bw = maxx - minx + 1, bh = maxy - miny + 1;
      comps.push({ id, minx, miny, maxx, maxy, w: bw, h: bh, area, cx: sx / area, cy: sy / area, s: (bw + bh) / 2, fill: area / (bw * bh) });
    }
    return { labels, comps };
  }

  function kmeans(pts, k) {
    // 遠い点から順に初期値をとる（毎回同じ結果になるように）
    const cent = [pts[0].slice()];
    while (cent.length < k) {
      let best = null, bd = -1;
      for (const p of pts) {
        let d = Infinity;
        for (const c of cent) d = Math.min(d, (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2);
        if (d > bd) { bd = d; best = p; }
      }
      cent.push(best.slice());
    }
    for (let it = 0; it < 20; it++) {
      const acc = cent.map(() => [0, 0, 0]);
      for (const p of pts) {
        let bi = 0, bd = Infinity;
        cent.forEach((c, i) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2; if (d < bd) { bd = d; bi = i; } });
        acc[bi][0] += p[0]; acc[bi][1] += p[1]; acc[bi][2]++;
      }
      cent.forEach((c, i) => { if (acc[i][2]) { c[0] = acc[i][0] / acc[i][2]; c[1] = acc[i][1] / acc[i][2]; } });
    }
    return cent;
  }

  /**
   * 検出
   * opts.sens: -60〜60（大きいほど薄い線も拾う）
   * opts.size: 0なら自動、それ以外は椅子の直径(px)
   */
  T.detect = function (prep, opts) {
    opts = Object.assign({ sens: 0, size: 0, split: true, boxes: false }, opts);
    const { w, h, ink } = prep;
    let th = otsu(ink);
    th = Math.max(35, Math.min(170, th)) - opts.sens;
    th = Math.max(8, th);
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = ink[i] > th ? 1 : 0;
    const { labels, comps } = components(mask, w, h);
    comps.forEach(c => { c.hole = 0; });
    // 輪っかの内側（穴）を見つけて、その図形の「中身」として数える
    const inv = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) inv[i] = mask[i] ? 0 : 1;
    const bg = components(inv, w, h, true);
    bg.comps.forEach(b => {
      if (b.minx === 0 || b.miny === 0 || b.maxx === w - 1 || b.maxy === h - 1) return;
      // 穴のいちばん左の点のすぐ左にある図形が、穴を囲んでいる図形
      const y = b.miny;
      let x = b.minx;
      while (x <= b.maxx && bg.labels[y * w + x] !== b.id) x++;
      const owner = x > 0 ? labels[y * w + x - 1] : -1;
      if (owner >= 0) comps[owner].hole += b.area;
    });
    comps.forEach(c => { c.solid = Math.min(1, (c.area + c.hole) / (c.w * c.h)); });

    const minDim = Math.min(w, h);
    let cands = comps.filter(c => c.area >= 10 && c.w >= 4 && c.h >= 4);
    const huge = c => c.w > w * 0.45 || c.h > h * 0.45;
    // 文字など、ほかの図形の内側にあるものを外す（ステージの外枠のような大きな図形は除く）
    const containers = cands.filter(c => !huge(c) && c.s > 8).sort((a, b) => b.w * b.h - a.w * a.h);
    cands.forEach(c => {
      for (const o of containers) {
        // 丸の中の文字のように「少しだけ大きい図形」の内側にあるものだけ（ひな壇の上の椅子は残す）
        if (o === c || o.w * o.h <= c.w * c.h * 1.8 || o.s > c.s * 6) continue;
        if (c.minx >= o.minx - 1 && c.maxx <= o.maxx + 1 && c.miny >= o.miny - 1 && c.maxy <= o.maxy + 1) { c.inner = o; break; }
      }
    });
    const outer = cands.filter(c => !c.inner && !huge(c));

    // 椅子の大きさを推定（いちばん多い大きさ）
    let s0 = opts.size;
    if (!s0) {
      const round = outer.filter(c => c.w / c.h > 0.6 && c.w / c.h < 1.65 && c.s >= Math.max(8, minDim / 150) && c.s < minDim / 5);
      const bins = new Float64Array(400);
      round.forEach(c => {
        const b = Math.min(399, Math.round(c.s / 2));
        // 中が空いている(文字を含む)丸は椅子らしいので重みを大きく
        const hasInner = cands.some(o => o.inner === c) ? 2 : 1;
        bins[b] += Math.sqrt(c.s) * hasInner;
      });
      let best = -1, bi = 0;
      for (let i = 1; i < 399; i++) {
        const v = bins[i - 1] * 0.5 + bins[i] + bins[i + 1] * 0.5;
        if (v > best) { best = v; bi = i; }
      }
      s0 = best > 0 ? bi * 2 : 20;
    }
    const lo = s0 * 0.68, hi = s0 * 1.45;
    const seats = [];
    const boxes = [];
    const seatComps = outer.filter(c => c.s >= lo && c.s <= hi && c.w / c.h > 0.5 && c.w / c.h < 2 && seatShape(c, labels, w));
    const seatArea = median(seatComps.map(c => c.area)) || (s0 * s0 * 0.5);
    const seatFill = median(seatComps.map(c => c.fill)) || 0.5;
    seatComps.forEach(c => seats.push({ x: c.cx, y: (c.miny + c.maxy) / 2 * 0.5 + c.cy * 0.5, s: c.s }));

    outer.filter(c => c.s > hi).forEach(c => {
      const k = Math.round(c.area / seatArea);
      const boxLike = c.fill > 0.86 || (c.fill < 0.3 && seatFill > 0.5) || c.w / c.h > 3.5 || c.h / c.w > 3.5;
      if (opts.boxes && boxLike && c.s < s0 * 10) {
        boxes.push({ x: (c.minx + c.maxx) / 2, y: (c.miny + c.maxy) / 2, w: c.w, h: c.h });
        return;
      }
      if (opts.split && k >= 2 && k <= 30 && c.s < s0 * 12 && !boxLike) {
        const pts = [];
        const step = Math.max(1, Math.floor(Math.sqrt(c.area / 2500)));
        for (let y = c.miny; y <= c.maxy; y += step) for (let x = c.minx; x <= c.maxx; x += step) if (labels[y * w + x] === c.id) pts.push([x, y]);
        kmeans(pts, k).forEach(p => seats.push({ x: p[0], y: p[1], s: s0, split: true }));
      } else if (opts.boxes && c.s < s0 * 10) {
        boxes.push({ x: (c.minx + c.maxx) / 2, y: (c.miny + c.maxy) / 2, w: c.w, h: c.h });
      }
    });

    // 近すぎる重複を消す
    let out = [];
    seats.forEach(p => { if (!out.some(q => Math.hypot(p.x - q.x, p.y - q.y) < s0 * 0.5)) out.push(p); });
    // ほかの席から遠く離れたもの（タイトルの文字など）を消す
    if (out.length >= 6) {
      const nn = T.typicalSpacing(out);
      const groups = T.chainRows(out, nn);
      const far = Math.max(nn * 2.5, s0 * 2.5);
      const drop = new Set();
      groups.forEach(g => {
        if (g.length > 3) return;
        const near = g.some(p => out.some(q => !g.includes(q) && Math.hypot(p.x - q.x, p.y - q.y) < far));
        if (!near) g.forEach(p => drop.add(p));
      });
      out = out.filter(p => !drop.has(p));
    }
    return { seats: out, boxes, s0, threshold: th };
  };

  // 椅子らしい形か：塗りつぶした丸・輪っか・四角（枠 or 塗り）のどれか
  // （斜めの譜面台や「客席」などの文字を除くため）
  function seatShape(c, labels, w) {
    const bins = new Uint8Array(16);
    const cx = (c.minx + c.maxx) / 2, cy = (c.miny + c.maxy) / 2;
    const R = c.s / 2;
    const edge = Math.max(2, c.s * 0.16);
    let n = 0, ring = 0, border = 0;
    for (let y = c.miny; y <= c.maxy; y++) {
      for (let x = c.minx; x <= c.maxx; x++) {
        if (labels[y * w + x] !== c.id) continue;
        n++;
        const dx = x - cx, dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= R * 0.62 && d <= R * 1.25) ring++;
        if (x - c.minx < edge || c.maxx - x < edge || y - c.miny < edge || c.maxy - y < edge) border++;
        if (d >= R * 0.6) bins[((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * 16 | 0) & 15] = 1;
      }
    }
    let round = 0;
    for (let i = 0; i < 16; i++) round += bins[i];
    if (round < 14 || !n) return false;
    const ringFrac = ring / n, borderFrac = border / n;
    if (c.solid > 0.6) return true;              // 丸・四角（中身が空いていても外形が閉じていればOK）
    if (ringFrac > 0.8) return true;             // 輪っか（丸い枠）
    if (borderFrac > 0.85) return true;          // 四角い枠
    return false;
  }

  function median(a) {
    if (!a.length) return 0;
    const b = a.slice().sort((x, y) => x - y);
    return b[b.length >> 1];
  }
  T.median = median;

  // となりの席までのふつうの距離（縮尺を決めるのに使う）
  T.typicalSpacing = function (pts) {
    if (pts.length < 2) return 0;
    const nn = pts.map(p => {
      let d = Infinity;
      pts.forEach(q => { if (q !== p) d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y)); });
      return d;
    });
    return median(nn);
  };

  // 円の当てはめ（Kasa法）
  function fitCircle(pts) {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
    const n = pts.length;
    pts.forEach(p => {
      const z = p.x * p.x + p.y * p.y;
      sx += p.x; sy += p.y; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y; sxz += p.x * z; syz += p.y * z; sz += z;
    });
    // 連立方程式 [sxx sxy sx; sxy syy sy; sx sy n] [a b c] = [sxz syz sz]
    const M = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]];
    for (let i = 0; i < 3; i++) {
      let piv = i;
      for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
      [M[i], M[piv]] = [M[piv], M[i]];
      if (Math.abs(M[i][i]) < 1e-9) return null;
      for (let r = 0; r < 3; r++) {
        if (r === i) continue;
        const f = M[r][i] / M[i][i];
        for (let k = i; k < 4; k++) M[r][k] -= f * M[i][k];
      }
    }
    const a = M[0][3] / M[0][0], b = M[1][3] / M[1][1], c = M[2][3] / M[2][2];
    const cx = a / 2, cy = b / 2;
    const r = Math.sqrt(c + cx * cx + cy * cy);
    return isFinite(r) ? { x: cx, y: cy, r } : null;
  }

  // 席を「列」ごとに分ける：となりの席とのきょりが近いものどうしをつなぐ
  T.chainRows = function (pts, spacing) {
    const lim = spacing * 1.4;
    const parent = pts.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < lim) parent[find(i)] = find(j);
      }
    }
    const groups = new Map();
    pts.forEach((p, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });
    return [...groups.values()];
  };

  // 扇形の中心（＝指揮者の位置）を推定
  T.estimateCenter = function (pts, spacing) {
    if (pts.length < 5) return null;
    const xs = pts.map(p => p.x);
    const width = Math.max(...xs) - Math.min(...xs);
    const cands = [];
    T.chainRows(pts, spacing).forEach(row => {
      if (row.length < 4) return;
      const f = fitCircle(row);
      if (!f) return;
      const rowMaxY = Math.max(...row.map(p => p.y));
      const meanY = row.reduce((a, p) => a + p.y, 0) / row.length;
      // 中心が列の手前（客席側）にあり、半径が大きすぎない＝扇形
      if (f.y > meanY && f.y > rowMaxY - f.r * 0.5 && f.r < width * 2.5) {
        for (let i = 0; i < row.length; i++) cands.push(f);
      }
    });
    if (!cands.length) return null;
    return { x: median(cands.map(f => f.x)), y: median(cands.map(f => f.y)) };
  };

  // 文字認識（Tesseract.js を必要なときだけ読み込む）
  let tessPromise = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!tessPromise) {
      tessPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = () => resolve(window.Tesseract);
        s.onerror = () => { tessPromise = null; reject(new Error('文字認識の部品を読み込めませんでした（ネット接続を確認してください）')); };
        document.head.appendChild(s);
      });
    }
    return tessPromise;
  }

  T.ocr = async function (prep, onProgress) {
    const Tesseract = await loadTesseract();
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => { if (onProgress && m.status === 'recognizing text') onProgress(m.progress); },
    });
    try {
      // 解像度を上げると小さな文字も読みやすい
      const k = Math.min(2, 2400 / Math.max(prep.w, prep.h));
      const c = document.createElement('canvas');
      c.width = Math.round(prep.w * k); c.height = Math.round(prep.h * k);
      c.getContext('2d').drawImage(prep.canvas, 0, 0, c.width, c.height);
      const { data } = await worker.recognize(c);
      let words = data.words;
      if (!words && data.blocks) {
        words = [];
        data.blocks.forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => (l.words || []).forEach(wd => words.push(wd)))));
      }
      return (words || [])
        .filter(wd => wd.text && wd.text.trim() && wd.confidence > 35)
        .map(wd => ({
          text: wd.text.trim().replace(/[|_~`'"]/g, ''),
          x: (wd.bbox.x0 + wd.bbox.x1) / 2 / k,
          y: (wd.bbox.y0 + wd.bbox.y1) / 2 / k,
        }))
        .filter(wd => wd.text);
    } finally {
      await worker.terminate();
    }
  };

  // 読み取った文字を近くの席に割り当てる
  T.assignWords = function (seats, boxes, words, s0) {
    words.forEach(wd => {
      let best = null, bd = Infinity;
      seats.forEach(p => { const d = Math.hypot(p.x - wd.x, p.y - wd.y); if (d < bd) { bd = d; best = p; } });
      if (best && bd < s0 * 0.75) {
        best.label = best.label ? best.label + wd.text : wd.text;
        return;
      }
      if (best && bd < s0 * 1.6 && !/^[A-Za-z.]{1,6}\d?$/.test(wd.text)) {
        best.name = best.name ? best.name + wd.text : wd.text;
        return;
      }
      const bx = boxes.find(b => Math.abs(b.x - wd.x) < b.w / 2 && Math.abs(b.y - wd.y) < b.h / 2);
      if (bx) bx.label = bx.label ? bx.label + ' ' + wd.text : wd.text;
    });
  };

  // プレビュー描画
  T.drawPreview = function (canvas, prep, result) {
    const W = canvas.parentElement.clientWidth || 260;
    const k = W / prep.w;
    canvas.width = Math.round(prep.w * k * 2);
    canvas.height = Math.round(prep.h * k * 2);
    const ctx = canvas.getContext('2d');
    ctx.scale(k * 2, k * 2);
    ctx.drawImage(prep.canvas, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillRect(0, 0, prep.w, prep.h);
    if (!result) return;
    ctx.lineWidth = Math.max(1.5, 2 / k);
    result.boxes.forEach(b => {
      ctx.strokeStyle = '#2f6fde';
      ctx.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    });
    result.seats.forEach(p => {
      ctx.strokeStyle = p.split ? '#e67e22' : '#d63031';
      ctx.beginPath();
      ctx.arc(p.x, p.y, result.s0 / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, result.s0 / 10), 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    });
  };

  SS.trace = T;
})(window.SS);
