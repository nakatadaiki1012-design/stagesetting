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

  // 楽器ごとの形と手の位置
  function instrument(kind) {
    switch (kind) {
      case 'picc': return { draw: line(-30, 12, 3, 11, SILVER_D, 4.5) + line(-30, 12, 3, 11, SILVER, 2.8), hands: [[-6, 12], [-22, 12]] };
      case 'fl': return { draw: line(-52, 13, 4, 11, SILVER_D, 4.5) + line(-52, 13, 4, 11, SILVER, 2.8), hands: [[-8, 12], [-34, 13]] };
      case 'ob': return { draw: line(0, 10, 0, 44, BLACK, 4) + circ(0, 45, 3, BLACK), hands: [[0, 22], [0, 34]] };
      case 'eh': return { draw: line(0, 10, 0, 50, '#4b3526', 4.5) + circ(0, 51, 4.5, '#4b3526'), hands: [[0, 24], [0, 38]] };
      case 'cl': return { draw: line(0, 10, 0, 46, BLACK, 4.5) + circ(0, 47, 4.5, BLACK), hands: [[0, 22], [0, 36]] };
      case 'bcl': return { draw: line(0, 10, 0, 48, BLACK, 6) + circ(-1, 52, 7, SILVER, SILVER_D) , hands: [[0, 26], [0, 40]] };
      case 'fg': return { draw: line(-14, 26, 16, -40, WOOD_D, 8) + line(-14, 26, 16, -40, WOOD, 5.5) + line(0, 10, -8, 20, SILVER_D, 1.8), hands: [[-8, 16], [8, -10]] };
      case 'ssx': return { draw: line(0, 10, 0, 44, BRASS_D, 5.5) + line(0, 10, 0, 44, BRASS, 3.5) + bell(0, 46, 5, BRASS, BRASS_D), hands: [[0, 22], [0, 34]] };
      case 'asx': return { draw: line(0, 10, -7, 17, BRASS_D, 2.5) + line(-7, 17, -13, 40, BRASS_D, 8) + line(-7, 17, -13, 40, BRASS, 5.5) + bell(-11, 43, 6.5, BRASS, BRASS_D), hands: [[-9, 24], [-12, 35]] };
      case 'tsx': return { draw: line(0, 10, -8, 18, BRASS_D, 2.8) + line(-8, 18, -16, 46, BRASS_D, 9.5) + line(-8, 18, -16, 46, BRASS, 7) + bell(-13, 49, 8, BRASS, BRASS_D), hands: [[-10, 26], [-15, 40]] };
      case 'bsx': return { draw: line(0, 10, -10, 14, BRASS_D, 3) + line(-16, 2, -20, 40, BRASS_D, 14) + line(-16, 2, -20, 40, BRASS, 11) + bell(-9, 38, 9.5, BRASS, BRASS_D), hands: [[-14, 18], [-18, 32]] };
      case 'hr': return { draw: line(0, 10, -6, 15, BRASS_D, 2.5) + circ(-11, 16, 10, 'none', BRASS_D, 5) + circ(-11, 16, 10, 'none', BRASS, 3) + bell(-24, 4, 15, BRASS, BRASS_D), hands: [[-22, 10], [-4, 18]] };
      case 'tp': return { draw: line(0, 10, 0, 42, BRASS_D, 9) + line(0, 10, 0, 42, BRASS, 6.5) + bell(0, 46, 6.5, BRASS, BRASS_D), hands: [[0, 20], [0, 28]] };
      case 'tb':
      case 'btb': {
        const br = kind === 'btb' ? 13 : 11;
        return {
          draw: line(4, 12, 11, 44, BRASS_D, 3) +
            line(-2, 12, -2, 92, BRASS_D, 2.6) + line(3, 12, 3, 92, BRASS_D, 2.6) +
            `<path d="M-2 92 Q0.5 97 3 92" fill="none" stroke="${BRASS_D}" stroke-width="2.6"/>` +
            line(-3, 40, 4, 40, BRASS_D, 2.5) + bell(13, 58, br, BRASS, BRASS_D),
          hands: [[0, 40], [8, 20]], stand: [-26, 58],
        };
      }
      case 'euph': return { draw: line(0, 10, 7, 22, BRASS_D, 3) + `<ellipse cx="6" cy="20" rx="8" ry="10" fill="${BRASS}" stroke="${BRASS_D}" stroke-width="1.5"/>` + bell(14, 3, 13, BRASS, BRASS_D), hands: [[0, 20], [10, 24]] };
      case 'tuba': return { draw: line(0, 10, 4, 16, BRASS_D, 3) + `<ellipse cx="6" cy="22" rx="15" ry="12" fill="${BRASS}" stroke="${BRASS_D}" stroke-width="1.6"/>` + bell(15, 0, 22, BRASS, BRASS_D), hands: [[-6, 20], [14, 26]] };
      case 'vn':
      case 'va': {
        const s = kind === 'va' ? 1.15 : 1;
        return {
          draw: ell(15, 14, 6.5 * s, 15 * s, -35, WOOD, WOOD_D) + line(20, 22, 27 * s, 34 * s, WOOD_D, 2.5) + line(-28, 22, 20, 5, '#7a6a4a', 1.4),
          hands: [[-14, 16], [26 * s, 32 * s]],
        };
      }
      case 'vc': return { draw: ell(0, 28, 20, 10, 0, WOOD, WOOD_D) + line(3, 20, 13, 4, WOOD_D, 3) + line(-28, 28, 20, 25, '#7a6a4a', 1.4), hands: [[-16, 26], [12, 8]], stand: [0, 64] };
      case 'cb': return { draw: ell(6, 28, 27, 12, -8, WOOD, WOOD_D) + line(10, 18, 20, 2, WOOD_D, 3.5) + line(-32, 30, 24, 26, '#7a6a4a', 1.5), hands: [[-18, 28], [18, 6]], stand: [-12, 66], stool: true };
      case 'gt': return { draw: ell(-10, 18, 13, 8, 0, WOOD, WOOD_D) + line(2, 16, 30, 12, WOOD_D, 3), hands: [[-10, 18], [22, 13]] };
      case 'bass': return { draw: ell(-10, 18, 14, 8, 0, '#6b2a2a', '#3a1515') + line(3, 16, 38, 11, WOOD_D, 3), hands: [[-10, 18], [28, 12]], standing: true };
      case 'perc': return { draw: line(-9, 14, -12, 34, WOOD_D, 1.8) + line(9, 14, 12, 34, WOOD_D, 1.8) + circ(-12, 35, 3, '#c8c8d0', '#555') + circ(12, 35, 3, '#c8c8d0', '#555'), hands: [[-9, 14], [9, 14]], standing: true, noStand: true };
      case 'drs': return { draw: line(-9, 14, -14, 32, WOOD_D, 1.8) + line(9, 14, 14, 32, WOOD_D, 1.8), hands: [[-9, 14], [9, 14]], stool: true, noStand: true };
      case 'pf': return { draw: '', hands: [[-10, 20], [10, 20]], bench: true, noStand: true };
      case 'hp': return { draw: '', hands: [[-4, 22], [14, 20]], noStand: true };
      default: return { draw: '', hands: [[-12, 14], [12, 14]] };
    }
  }

  // 奏者（人の形）
  SS.drawFigure = function (it, fill, opts) {
    const kind = SS.instrumentKind(it.label);
    const ins = instrument(kind);
    // タップしやすいよう、見えない当たり判定
    let s = '<circle r="32" fill="transparent"/>';
    // 椅子
    if (ins.bench) s += `<rect x="-38" y="-26" width="76" height="30" rx="4" fill="#4a4a50" stroke="#2a2a2e" stroke-width="1.5"/>`;
    else if (ins.stool) s += circ(0, -6, 17, '#d9dde2', '#8a929c', 1.5);
    else if (!ins.standing) s += `<rect x="-23" y="-30" width="46" height="42" rx="7" fill="#e1e5ea" stroke="#8a929c" stroke-width="1.5"/>`;
    // 譜面台
    if (opts.showStands !== false && !ins.noStand) {
      const st = ins.stand || [0, 56];
      s += `<g transform="translate(${st[0]} ${st[1]})"><rect x="-25" y="-3" width="50" height="7" rx="2" fill="#5b6472"/>${line(0, 4, 0, 14, '#5b6472', 2)}</g>`;
    }
    // 腕
    const arm = '#3f4854';
    s += line(-17, 3, ins.hands[0][0], ins.hands[0][1], arm, 6.5);
    s += line(17, 3, ins.hands[1][0], ins.hands[1][1], arm, 6.5);
    // 体（肩）
    s += `<ellipse cx="0" cy="0" rx="21" ry="11.5" fill="${fill}" stroke="#39414d" stroke-width="1.8"/>`;
    // 楽器
    s += ins.draw;
    // 手
    ins.hands.forEach(h => { s += circ(h[0], h[1], 3.2, SKIN, '#b98a66', 1); });
    // 頭
    s += circ(0, 2, 9.5, HAIR, '#241c17', 1.2);
    return { body: s, standing: !!ins.standing };
  };
})(window.SS);
