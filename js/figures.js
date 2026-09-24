/* 人が楽器を演奏している姿（真上から見た図）
 * 座標は cm。奏者は +y 方向（指揮者の方）を向いている。
 * 奏者から見て右手側が -x、左手側が +x。
 */
window.SS = window.SS || {};

(function (SS) {
  const BRASS = '#dcb64e', BRASS_D = '#9a7a22';
  const SILVER = '#d5dae0', SILVER_D = '#838a93';
  const BLACK = '#2a2a2e';
  const WOOD = '#9a6135', WOOD_D = '#5e3a1c';
  const HAIR = '#3b2f28', SKIN = '#f0c8a2';

  // パート名 → 楽器の種類
  const KINDS = [
    ['picc', /^(picc|pic|ピッコロ)/i],
    ['fl', /^(fl|フルート)/i],
    ['eh', /^(e\.?h|c\.?a|イングリッシュ)/i],
    ['ob', /^(ob|オーボエ)/i],
    ['fg', /^(fg|bsn|fag|c\.?fg|ファゴット|バスーン)/i],
    ['bcl', /^(b\.?\s?cl|a\.?cl|c\.?a\.?cl|バスクラ)/i],
    ['cl', /^(e?s?\.?\s?cl|クラ)/i],
    ['bsx', /^(b\.?\s?sx|b\.?\s?sax|bs\d?$|バリトン)/i],
    ['tsx', /^(t\.?\s?sx|t\.?\s?sax|ts\d?$|テナー)/i],
    ['ssx', /^(s\.?\s?sx|s\.?\s?sax|ソプラノ)/i],
    ['asx', /^(a\.?\s?sx|a\.?\s?sax|sax|as\d?$|アルト|サックス)/i],
    ['hr', /^(hr|hn|horn|ホルン)/i],
    ['btb', /^(b\.?\s?tb|バストロ)/i],
    ['tb', /^(tb|trb|トロンボーン)/i],
    ['tp', /^(tp|trp|tpt|cor|cnt|flh|トランペット|コルネット)/i],
    ['euph', /^(euph|eup|eu|bar|ユーフォ)/i],
    ['tuba', /^(tu|tuba|チューバ)/i],
    ['vn', /^(vn|vl|vln|vi\d|violin|ヴァイオリン|バイオリン|1st|2nd)/i],
    ['va', /^(va|vla|viola|ヴィオラ|ビオラ)/i],
    ['vc', /^(vc|vcl|cello|チェロ)/i],
    ['cb', /^(cb|kb|db|str\.?\s?b|st\.?\s?b|s\.?b|contra|コンバス|コントラバス|弦バス|ストリングベース)/i],
    ['pf', /^(pf|piano|pno|cel|org|key|ピアノ|チェレスタ|オルガン)/i],
    ['hp', /^(hp|harp|ハープ)/i],
    ['drs', /^(drs|drum|ドラム)/i],
    ['gt', /^(gt|guitar|ギター)/i],
    ['bass', /^(bass|e\.?b|ベース)/i],
    ['perc', /^(perc|per|pc|timp|tim|sd|s\.d|bd|b\.d|cym|mar|xyl|vib|glk|glock|chime|tri|tamb|打|パーカッション|ティンパニ)/i],
  ];
  SS.instrumentKind = function (label) {
    const l = String(label || '').trim();
    for (const [k, re] of KINDS) if (re.test(l)) return k;
    return 'none';
  };

  const f = n => +n.toFixed(1);
  const line = (x1, y1, x2, y2, c, w) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const circ = (x, y, r, fill, stroke, sw) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw || 1.5}"` : ''}/>`;
  const ell = (x, y, rx, ry, rot, fill, stroke, sw) => `<ellipse cx="0" cy="0" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw || 1.5}" transform="translate(${f(x)} ${f(y)}) rotate(${rot})"/>`;
  const bell = (x, y, r, c, d) => circ(x, y, r, c, d, 1.6) + circ(x, y, r * 0.55, 'none', d, 1.2);

  const poly = (pts, fill, stroke, sw) => `<path d="M${pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L')}Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw || 1.2}" stroke-linejoin="round"/>`;
  // 前を向いたベル（真上から見ると、先が広がった台形に見える）。(x, y0)→(x, y1)、口の直径 d
  const flare = (x, y0, y1, d, c, dk) => poly([[x - 1.8, y0], [x + 1.8, y0], [x + d / 2, y1], [x - d / 2, y1]], c, dk, 1.3) + line(x - d / 2, y1, x + d / 2, y1, dk, 2);
  // 楽器の胴（横から見た木の胴：丸みのあるひょうたん形）
  const fiddle = (cx, cy, len, wid, rot, fill, dk) => {
    const L = len / 2, W = wid / 2;
    return `<path transform="translate(${f(cx)} ${f(cy)}) rotate(${f(rot)})" d="M0 ${-L}C${W * 0.9} ${-L} ${W * 0.85} ${-L * 0.35} ${W * 0.62} ${-L * 0.12}C${W * 0.55} 0 ${W * 0.55} ${L * 0.1} ${W * 0.7} ${L * 0.2}C${W * 1.05} ${L * 0.5} ${W * 0.9} ${L} 0 ${L}C${-W * 0.9} ${L} ${-W * 1.05} ${L * 0.5} ${-W * 0.7} ${L * 0.2}C${-W * 0.55} ${L * 0.1} ${-W * 0.55} 0 ${-W * 0.62} ${-L * 0.12}C${-W * 0.85} ${-L * 0.35} ${-W * 0.9} ${-L} 0 ${-L}Z" fill="${fill}" stroke="${dk}" stroke-width="1.4"/>`;
  };
  // 点 a から角度 deg の方向へ len 進んだ点
  const toward = (a, deg, len) => [a[0] + Math.sin(deg * Math.PI / 180) * len, a[1] + Math.cos(deg * Math.PI / 180) * len];

  /**
   * 楽器ごとの形と手の位置（真上から見た図・単位 cm）。実物の大きさ：
   * ピッコロ 32／フルート 67／オーボエ 65／クラ 66／イングリッシュホルン 81／バスクラ 高さ約97・ベル約16
   * ファゴット 134（斜めに持つ）／アルトサックス 高さ70・ベル12.5／テナー 83・ベル14.6／バリトン 120・ベル17
   * トランペット 全長48・ベル12.3／ホルン ベル31・巻き約30／トロンボーン スライド約70・ベル22（バス24）
   * ユーフォニアム 高さ66・ベル30（YEP-642）／チューバ 高さ102・ベル44（YBB-321）
   * バイオリン 全長59（胴35.5×20）／ビオラ 全長67（胴40×23）／弓 約75
   * チェロ 胴76×44／コントラバス 胴112×68
   * knees：ひざの位置（左右に開く量）。wide が大きいほど楽器を脚の間にはさむ
   */
  function instrument(kind) {
    switch (kind) {
      case 'picc': return { draw: line(6, 11, -26, 13, SILVER_D, 3.4) + line(6, 11, -26, 13, SILVER, 2), hands: [[-5, 12], [-19, 13]] };
      case 'fl': return {
        draw: line(8, 11, -59, 16, SILVER_D, 4) + line(8, 11, -59, 16, SILVER, 2.6) + circ(-22, 13.7, 1.3, SILVER_D) + circ(-30, 14.3, 1.3, SILVER_D) + circ(-44, 15, 1.3, SILVER_D),
        hands: [[-9, 12.5], [-40, 15]],
      };
      case 'ob': return { draw: line(0, 10, 0, 50, BLACK, 3.6) + poly([[-1.8, 48], [1.8, 48], [3, 53], [-3, 53]], BLACK, BLACK), hands: [[0, 26], [0, 40]] };
      case 'eh': return { draw: line(0, 9, 1, 14, SILVER_D, 1.2) + line(1, 14, 0, 58, '#4b3526', 4) + circ(0, 60, 3.8, '#4b3526', '#2e2017'), hands: [[0, 30], [0, 44]] };
      case 'cl': return { draw: line(0, 10, 0, 49, BLACK, 3.8) + circ(0, 17, 2.2, BLACK) + poly([[-2, 47], [2, 47], [3.4, 53], [-3.4, 53]], BLACK, '#111'), hands: [[0, 26], [0, 41]] };
      case 'bcl': return {
        draw: `<path d="M0 10 Q0 18 -2 22" fill="none" stroke="${SILVER_D}" stroke-width="2.2"/>` + circ(-2, 26, 4.2, BLACK, '#111') + circ(-2, 38, 8, SILVER, SILVER_D) + circ(-2, 38, 4.5, 'none', SILVER_D, 1.2),
        hands: [[-5, 24], [3, 29]], knees: 15,
      };
      case 'fg': return {
        draw: line(0, 10, -6, 19, SILVER_D, 1.6) + line(-15, 32, 13, -8, WOOD_D, 8.5) + line(-15, 32, 13, -8, WOOD, 6) + circ(13, -8, 4.4, WOOD, WOOD_D),
        hands: [[-9, 23], [8, 2]],
      };
      case 'ssx': return { draw: line(0, 10, 0, 44, BRASS_D, 4.2) + line(0, 10, 0, 44, BRASS, 2.8) + flare(0, 38, 48, 7, BRASS, BRASS_D), hands: [[0, 24], [0, 36]] };
      case 'asx': return {
        draw: `<path d="M0 10 Q-4 13 -7 18" fill="none" stroke="${BRASS_D}" stroke-width="2.4"/>` + line(-7, 18, -12, 40, BRASS_D, 8) + line(-7, 18, -12, 40, BRASS, 5.8) + ell(-10, 43, 6.3, 5, -10, BRASS, BRASS_D) + ell(-10, 43, 3.6, 2.8, -10, 'none', BRASS_D),
        hands: [[-8, 24], [-11, 35]],
      };
      case 'tsx': return {
        draw: `<path d="M0 10 Q-5 12 -9 19" fill="none" stroke="${BRASS_D}" stroke-width="2.6"/>` + line(-9, 19, -16, 46, BRASS_D, 9.5) + line(-9, 19, -16, 46, BRASS, 7.2) + ell(-13, 49, 7.3, 5.6, -10, BRASS, BRASS_D) + ell(-13, 49, 4.2, 3.2, -10, 'none', BRASS_D),
        hands: [[-10, 27], [-14, 40]], knees: 13,
      };
      case 'bsx': return {
        draw: `<path d="M0 10 C-6 8 -12 4 -16 -2" fill="none" stroke="${BRASS_D}" stroke-width="3"/>` + circ(-18, -4, 5.5, BRASS, BRASS_D) + line(-18, -2, -22, 30, BRASS_D, 12) + line(-18, -2, -22, 30, BRASS, 9.5) + ell(-14, 36, 8.5, 6.5, 20, BRASS, BRASS_D) + ell(-14, 36, 5, 3.8, 20, 'none', BRASS_D),
        hands: [[-16, 14], [-20, 26]], knees: 14,
      };
      case 'hr': return {
        // 巻いた管は縦向き（上から見ると細長い楕円）、ベルは右後ろ向きで右ももの上に
        draw: `<path d="M0 10 Q-4 14 -6 18" fill="none" stroke="${BRASS_D}" stroke-width="2"/>` +
          ell(-9, 24, 6.5, 15, 8, 'none', BRASS_D, 5) + ell(-9, 24, 6.5, 15, 8, 'none', BRASS, 3) + circ(-4, 21, 2.2, SILVER, SILVER_D, 1) + circ(-4, 26, 2.2, SILVER, SILVER_D, 1) +
          ell(-22, 16, 15.5, 9, 55, BRASS, BRASS_D) + ell(-22, 16, 9, 5, 55, 'none', BRASS_D),
        hands: [[-20, 16], [-4, 23]],
      };
      case 'tp': return {
        draw: line(0, 10, 0, 18, SILVER_D, 1.6) + `<rect x="-3.6" y="18" width="7.2" height="26" rx="2.5" fill="${BRASS}" stroke="${BRASS_D}" stroke-width="1.4"/>` +
          circ(0, 25, 1.5, SILVER, SILVER_D, 0.8) + circ(0, 28.5, 1.5, SILVER, SILVER_D, 0.8) + circ(0, 32, 1.5, SILVER, SILVER_D, 0.8) + flare(0, 44, 58, 12.3, BRASS, BRASS_D),
        hands: [[1, 29], [-2, 22]],
      };
      case 'tb':
      case 'btb': {
        const bd = kind === 'btb' ? 24 : 22;
        // スライドは縦の面にあるので、上から見ると1本の線。ベル側の管は左肩の上を通って後ろへ
        return {
          draw: line(11, -22, 11, 32, BRASS_D, 3.2) + line(11, -22, 11, 32, BRASS, 2) + `<path d="M11 -22 Q11 -29 14.5 -29 Q18 -29 18 -22 L18 -8" fill="none" stroke="${BRASS_D}" stroke-width="2.4"/>` +
            (kind === 'btb' ? circ(15, -12, 7.5, 'none', BRASS_D, 3.6) + circ(15, -12, 7.5, 'none', BRASS, 2.2) : '') +
            flare(11, 32, 58, bd, BRASS, BRASS_D) +
            line(0, 10, 0, 82, BRASS_D, 3.2) + line(0, 10, 0, 82, SILVER, 1.8) + line(-2.5, 82, 2.5, 82, BRASS_D, 3) + line(0, 16, 11, 16, BRASS_D, 2.2),
          hands: [[0, 44], [7, 17]], stand: [-32, 60],
        };
      }
      case 'euph': return {
        draw: line(0, 10, 4, 18, SILVER_D, 1.8) + `<ellipse cx="3" cy="24" rx="9" ry="11" fill="${BRASS}" stroke="${BRASS_D}" stroke-width="1.5"/>` +
          circ(-1, 20, 1.6, SILVER, SILVER_D, 0.8) + circ(-1, 24, 1.6, SILVER, SILVER_D, 0.8) + circ(-1, 28, 1.6, SILVER, SILVER_D, 0.8) + bell(15, 8, 15, BRASS, BRASS_D),
        hands: [[-2, 24], [12, 26]], knees: 13,
      };
      case 'tuba': return {
        draw: line(0, 10, 4, 16, SILVER_D, 2) + `<ellipse cx="4" cy="26" rx="18" ry="13" fill="${BRASS}" stroke="${BRASS_D}" stroke-width="1.6"/>` +
          circ(-4, 21, 2, SILVER, SILVER_D, 0.9) + circ(-4, 25.5, 2, SILVER, SILVER_D, 0.9) + circ(-4, 30, 2, SILVER, SILVER_D, 0.9) + circ(-4, 34.5, 2, SILVER, SILVER_D, 0.9) + bell(16, 4, 22, BRASS, BRASS_D),
        hands: [[-6, 26], [16, 28]], knees: 20,
      };
      case 'vn':
      case 'va': {
        const s = kind === 'va' ? 1.13 : 1;
        // 左肩にのせ、左前へ向ける。胴 35.5×20（ビオラ 40×23）、ネックと渦巻き、弓 75cm
        const c = [8 + 9 * s, 13 + 9 * s], ang = 42;
        const nk0 = toward(c, ang, 17 * s), nk1 = toward(c, ang, 30 * s);
        return {
          draw: fiddle(c[0], c[1], 35.5 * s, 20.5 * s, -ang, WOOD, WOOD_D) + line(nk0[0], nk0[1], nk1[0], nk1[1], '#2b1d12', 2.6) + circ(nk1[0], nk1[1], 2, WOOD_D) +
            line(-30, 22, 44, 8, '#7a6a4a', 1.3),
          hands: [[-16, 19], [nk1[0] - 3, nk1[1] - 3]],
        };
      }
      case 'vc': return {
        // 脚の間に立て、少し手前に傾ける。上から見ると胴の幅44、奥行きは傾きで短く見える
        draw: line(0, 46, 0, 60, '#888', 1.6) + fiddle(0, 32, 34, 44, 0, WOOD, WOOD_D) + line(3, 16, 9, 2, '#2b1d12', 3.4) + circ(9, 1, 2.6, WOOD_D) + line(-38, 34, 34, 30, '#7a6a4a', 1.4),
        hands: [[-28, 34], [7, 6]], stand: [0, 72], knees: 26,
      };
      case 'cb': return {
        draw: line(2, 56, 2, 66, '#888', 1.8) + fiddle(2, 34, 44, 68, -4, WOOD, WOOD_D) + line(6, 12, 14, -6, '#2b1d12', 4) + circ(14, -7, 3.2, WOOD_D) + line(-40, 38, 36, 34, '#7a6a4a', 1.5),
        hands: [[-30, 38], [12, -2]], stand: [-14, 78], stool: true, knees: 22,
      };
      case 'gt': return { draw: fiddle(-12, 20, 26, 36, 80, WOOD, WOOD_D) + line(4, 18, 36, 14, WOOD_D, 3), hands: [[-12, 20], [28, 15]] };
      case 'bass': return { draw: fiddle(-12, 20, 26, 34, 80, '#6b2a2a', '#3a1515') + line(4, 18, 46, 12, WOOD_D, 3), hands: [[-12, 20], [34, 13]], standing: true };
      case 'perc': return { draw: line(-9, 16, -12, 38, WOOD_D, 1.8) + line(9, 16, 12, 38, WOOD_D, 1.8) + circ(-12, 39, 2.6, '#c8c8d0', '#555') + circ(12, 39, 2.6, '#c8c8d0', '#555'), hands: [[-9, 16], [9, 16]], standing: true, noStand: true };
      case 'drs': return { draw: line(-9, 16, -14, 36, WOOD_D, 1.8) + line(9, 16, 14, 36, WOOD_D, 1.8), hands: [[-9, 16], [9, 16]], stool: true, noStand: true };
      case 'pf': return { draw: '', hands: [[-12, 22], [12, 22]], bench: true, noStand: true };
      case 'hp': return { draw: '', hands: [[-4, 24], [14, 22]], noStand: true, knees: 14 };
      default: return { draw: '', hands: [[-12, 16], [12, 16]] };
    }
  }

  // ---------------------------------------------------------------- 譜面台を2人で1本（弦楽器のプルト）
  // 弦楽器（Vn・Va・Vc・Cb）は、となりどうし2人で1本の譜面台を見るのがふつう。
  // it.desk：同じ文字の2人で1本／'solo'：1人1本／なし：弦楽器なら、となりの同じパートの人と自動で組にする
  const DESK_KINDS = new Set(['vn', 'va', 'vc', 'cb']);
  SS.isDeskPart = it => it.type === 'player' && DESK_KINDS.has(SS.instrumentKind(it.label));
  // 奏者から見た譜面台の位置（奏者の向きの座標、cm）
  SS.standOffset = function (it, opts) {
    opts = opts || {};
    if (opts.contest) return [0, 52];
    if (opts.figure !== false) { const ins = instrument(SS.instrumentKind(it.label)) || {}; return ins.stand || [0, 64]; }
    return [0, (opts.seatR || SS.PLAYER_R) + 12.5];
  };
  SS.standPoint = function (it, opts) {
    const [sx, sy] = SS.standOffset(it, opts), a = ((it.rot || 0) * Math.PI) / 180;
    return { x: it.x + sx * Math.cos(a) - sy * Math.sin(a), y: it.y + sx * Math.sin(a) + sy * Math.cos(a) };
  };
  const angDiff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
  // 2人で1本の組（Map：奏者 → 相手）
  SS.standPairs = function (items) {
    const map = new Map();
    const ps = items.filter(it => it.type === 'player');
    // 1) 決めてある組（desk が同じ2人）
    const byDesk = new Map();
    ps.forEach(it => { if (it.desk && it.desk !== 'solo') { if (!byDesk.has(it.desk)) byDesk.set(it.desk, []); byDesk.get(it.desk).push(it); } });
    byDesk.forEach(g => { if (g.length === 2) { map.set(g[0], g[1]); map.set(g[1], g[0]); } });
    // 2) 弦楽器で決めていない人は、となり（1m以内・同じ向き・横に並ぶ）の同じパートの人と組にする
    // （複製などで同じ desk が3人以上・1人だけになったときも、自動にまかせる）
    const free = ps.filter(it => it.desk !== 'solo' && !map.has(it) && SS.isDeskPart(it));
    const cand = [];
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const a = free[i], b = free[j];
      if ((a.label || '').trim() !== (b.label || '').trim()) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 110 || angDiff(a.rot || 0, b.rot || 0) > 35) continue;
      const t = ((a.rot || 0) * Math.PI) / 180, along = Math.abs(-(b.x - a.x) * Math.sin(t) + (b.y - a.y) * Math.cos(t));
      if (along > 40) continue;
      cand.push([d, a, b]);
    }
    cand.sort((p, q) => p[0] - q[0]);
    cand.forEach(([, a, b]) => { if (!map.has(a) && !map.has(b)) { map.set(a, b); map.set(b, a); } });
    return map;
  };
  // 譜面台の本数（打楽器・鍵盤・ハープ・ドラムは数えない。2人で1本の組は1本）
  SS.standCount = function (items) {
    const pairs = SS.standPairs(items);
    const need = items.filter(it => it.type === 'player' && !['perc', 'drs', 'pf', 'hp'].includes(SS.instrumentKind(it.label)));
    return { stands: need.length - pairs.size / 2, shared: pairs.size / 2 };
  };
  // 2人で見る譜面台（2人の譜面台の位置の真ん中、2人の向きの平均）
  SS.sharedStandSVG = function (a, b, opts) {
    const p = SS.standPoint(a, opts), q = SS.standPoint(b, opts);
    const ra = ((a.rot || 0) * Math.PI) / 180, rb = ((b.rot || 0) * Math.PI) / 180;
    const rot = (Math.atan2(Math.sin(ra) + Math.sin(rb), Math.cos(ra) + Math.cos(rb)) * 180) / Math.PI;
    const x = ((p.x + q.x) / 2).toFixed(1), y = ((p.y + q.y) / 2).toFixed(1);
    let s = '';
    if (opts.contest) s = '<path d="M-12 -12L12 12M12 -12L-12 12" stroke="#111" stroke-width="3.4" stroke-linecap="round"/>';
    else {
      const legs = opts.standLegs !== false ? `<g transform="translate(0 4)" opacity=".75">${SS.standLegsSVG()}</g>` : '';
      s = `${legs}<rect x="-25" y="-3" width="50" height="6" rx="1.5" fill="#5b6472"/><rect x="-24" y="-3" width="48" height="2" fill="#f4f1e8"/>`;
    }
    if ((a.light || b.light) && opts.lights !== false && SS.lightSVG) s += SS.lightSVG(27, 0);
    return `<g class="shared-stand" transform="translate(${x} ${y}) rotate(${rot.toFixed(1)})">${s}</g>`;
  };

  // 譜面台の3本脚（開いたときの直径 約54cm＝オーケストラ用譜面台の台座 約21インチ）。
  // (0,0) が支柱。1本は奏者の方（-y）、残り2本は向こう側へ120°ずつ
  SS.standLegsSVG = function (color) {
    const c = color || '#5b6472';
    let s = '';
    [180, 60, -60].forEach(a => {
      const t = a * Math.PI / 180, x = Math.sin(t) * 27, y = Math.cos(t) * 27;
      s += line(0, 0, x, y, c, 1.6) + circ(x, y, 1.6, c);
    });
    return s + circ(0, 0, 2.2, c);
  };

  // 奏者（人の形）。大人の目安：肩幅 約44cm、胸の厚み 約24cm、頭 幅16×奥行20cm、
  // 座ると ひざは体の中心から約45cm前。椅子の座面 45×44cm、譜面台（机）幅50cm
  const TROUSERS = '#4a5160', TROUSERS_D = '#2f3540', SHOE = '#1d1d22';
  SS.drawFigure = function (it, fill, opts) {
    const kind = SS.instrumentKind(it.label);
    const ins = instrument(kind);
    // タップしやすいよう、見えない当たり判定
    let s = '<circle r="34" fill="transparent"/>';
    // 椅子（座面の後ろに背もたれ）
    if (ins.bench) s += `<rect x="-40" y="-22" width="80" height="34" rx="4" fill="#4a4a50" stroke="#2a2a2e" stroke-width="1.5"/>`;
    else if (ins.stool) s += circ(0, -4, 17, '#d9dde2', '#8a929c', 1.5);
    else if (!ins.standing) s += `<rect x="-22.5" y="-24" width="45" height="44" rx="6" fill="#e1e5ea" stroke="#8a929c" stroke-width="1.5"/><rect x="-21" y="-28" width="42" height="6" rx="3" fill="#b9c0c9" stroke="#8a929c" stroke-width="1"/>`;
    // 譜面台（机 50cm、支柱）
    if (opts.showStands !== false && !ins.noStand && !opts.sharedStand) {
      const st = ins.stand || [0, 64];
      // 机（幅50cm）と、その下の支柱・3本脚（直径 約54cm）
      const legs = opts.standLegs !== false ? `<g transform="translate(0 4)" opacity=".75">${SS.standLegsSVG()}</g>` : line(0, 3, 0, 12, '#5b6472', 2) + circ(0, 13, 2, '#5b6472');
      s += `<g transform="translate(${st[0]} ${st[1]})">${legs}<rect x="-25" y="-3" width="50" height="6" rx="1.5" fill="#5b6472"/><rect x="-24" y="-3" width="48" height="2" fill="#f4f1e8"/></g>`;
    }
    // 脚：座っている人は太もも〜ひざ、立っている人は靴だけ見える
    if (ins.standing) {
      s += ell(-9, 6, 5, 12, 4, SHOE, '#000', 1) + ell(9, 6, 5, 12, -4, SHOE, '#000', 1);
    } else {
      const kx = ins.knees || 11;
      [-1, 1].forEach(sx => {
        const hip = [sx * 10, 0], knee = [sx * kx, 42];
        s += ell(knee[0] + sx * 1, 50, 4.5, 7, 0, SHOE, '#000', 1); // 靴先（ひざの少し先）
        s += line(hip[0], hip[1], knee[0], knee[1], TROUSERS_D, 15.5) + line(hip[0], hip[1], knee[0], knee[1], TROUSERS, 13);
        s += circ(knee[0], knee[1], 6.8, TROUSERS, TROUSERS_D, 1.2);
      });
    }
    // 楽器（体より下に来る部分は先に：チェロ・コントラバスなど）
    const low = ['vc', 'cb', 'tuba', 'bcl', 'hp'].includes(kind);
    if (low) s += ins.draw;
    // 腕（ひじで曲がる。上着の袖）
    const arm = '#3f4854', armD = '#262c35';
    [-1, 1].forEach((sx, i) => {
      const sh = [sx * 18, 2], h = ins.hands[i];
      const mx = (sh[0] + h[0]) / 2, my = (sh[1] + h[1]) / 2;
      const d = Math.hypot(h[0] - sh[0], h[1] - sh[1]);
      const bend = Math.max(0, 32 - d) * 0.45 + 4; // 手が近いほどひじが外へ張り出す
      const el = [mx + sx * bend, my - 2];
      s += line(sh[0], sh[1], el[0], el[1], armD, 9) + line(sh[0], sh[1], el[0], el[1], arm, 7.5);
      s += line(el[0], el[1], h[0], h[1], armD, 7.5) + line(el[0], el[1], h[0], h[1], arm, 6);
    });
    // 体（肩幅44・胸の厚み24。上着の色＝パートの色）
    s += `<path d="M-22 -1 C-22 -9 -14 -12 0 -12 C14 -12 22 -9 22 -1 C22 7 14 12 0 12 C-14 12 -22 7 -22 -1Z" fill="${fill}" stroke="#39414d" stroke-width="1.8"/>`;
    // 楽器
    if (!low) s += ins.draw;
    // 手
    ins.hands.forEach(h => { s += ell(h[0], h[1], 3.4, 4, 0, SKIN, '#b98a66', 1); });
    // 頭（幅16×奥行20）と、顔の向きがわかる鼻
    s += ell(0, 2, 8, 10, 0, HAIR, '#241c17', 1.2);
    s += ell(0, 12.4, 1.7, 1.4, 0, SKIN, '#b98a66', 0.7);
    return { body: s, standing: !!ins.standing };
  };
})(window.SS);
