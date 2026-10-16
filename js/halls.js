/* 神奈川県・東京都のホールのステージ寸法（単位 m）
 *
 * 音響反射板（反響板）を置いたときの「演奏に使える広さ」を使います。
 * 反射板を置くと、舞台は「前が広く奥がせまい台形」になるのがふつうです。
 *   fw: 前の幅（客席側） bw: 奥の幅（正面反射板の幅） d: 奥行
 *   stage: 舞台全体の寸法（参考）
 *   q: 'shell'   = 反射板設置時の寸法が公開されていたもの
 *      'concert' = コンサート専用ホール・コンサート形式の寸法が公開されていたもの
 * 反射板設置時（またはコンサート形式）の寸法が公開されていて、確かめられたホールだけを載せます。
 * 舞台全体の寸法から推定したホール（前は 'est'・'approx'）は、まちがった広さで並べてしまうので外しました。
 * 奥の幅（bw）が公開されていないときは、前の幅×0.72 で推定します（note にそう書きます）。
 * ※本番前に、必ずホールの「反射板設置時の舞台図面」で確認してください。
 *
 * ホールの設備（任意・単位 m）。図面などで確かめた値だけを書きます。分からないものは書かない
 * （書かなかったものは図に描かず、確認もしません。今はどのホールにも入っていません）。
 *   fixtures: {
 *     shell: 0.5,                         反射板の位置（舞台の奥のふちから前へ）
 *     curtain: 1.2,                       緞帳線（舞台の前のふちから奥へ）
 *     proscenium: { y: 0.8, w: 18 },      プロセニアム（前のふちから奥へ・間口）
 *     lifts: [{ x: 4, y: 6, w: 3, h: 2, name: '1番' }],  迫り（下手の端から・奥のふちから・幅・奥行・名前）
 *     pit: { depth: 3, w: 16 },           オーケストラピットのふた（前へ出る長さ・幅。幅を書かなければ舞台の幅）
 *     hanamichi: { x: 2, w: 1.8, len: 15 }, 花道（中心の位置＝下手の端から・幅・長さ）
 *     doors: [{ side: 'L', y: 3, w: 1.8 }], 出入り口（L＝下手・R＝上手、奥のふちから扉の真ん中まで・扉の幅）
 *   }
 */
window.SS = window.SS || {};

(function (SS) {
  const raw = [
    // ---------------- 神奈川県 ----------------
    { pref: '神奈川', name: 'ミューザ川崎シンフォニーホール', fw: 22, bw: 17, d: 14, shape: 'arc', sag: 1.5, q: 'concert', note: 'ヴィンヤード型のオープンステージ（間口22m×奥行14m）。前のふちの弧・奥の幅は図面を見て調整してください', src: 'https://www.kawasaki-sym-hall.jp/about/muza/' },
    { pref: '神奈川', name: '神奈川県立音楽堂', fw: 19.4, bw: 19.4, d: 8.6, q: 'concert', note: 'コンサート専用。奥行7.4m（張り出し舞台使用時8.6m）', src: 'https://www.kanagawa-ongakudo.com/about' },
    { pref: '神奈川', name: 'やまと芸術文化ホール メインホール', fw: 18, d: 11, q: 'shell', note: '音響反射板使用時 最大間口18m・奥行11m（奥の幅は推定）', src: 'https://yamato-bunka.jp/hall/' },
    { pref: '神奈川', name: '鎌倉芸術館 大ホール', fw: 18, d: 13.5, q: 'shell', note: '音響反射板設置時 開口18m・奥行13.5m（鎌倉市の資料。奥の幅は推定）', src: 'https://www.city.kamakura.kanagawa.jp/b-shisetsu/documents/kamagei-gaibuhyoukakekka.pdf' },
    { pref: '神奈川', name: '港南区民文化センター ひまわりの郷', fw: 12.8, bw: 12.8, d: 8.8, q: 'concert', note: 'シューボックス型', src: 'https://himawari-sato.com/facility/hall' },
    // ---------------- 東京都 ----------------
    { pref: '東京', name: '武蔵野市民文化会館 大ホール', fw: 20, bw: 13.5, d: 12.6, q: 'shell', note: '反響板寸法 前幅20m／後幅13.5m／奥行12.6m', src: 'https://www.musashino.or.jp/bunka/1002094/1002099.html' },
    { pref: '東京', name: '調布市グリーンホール 大ホール', fw: 15.8, d: 11, q: 'shell', note: '反響板使用時 間口15.8m・奥行11m（調布市の資料。奥の幅は推定）', src: 'https://www.city.chofu.lg.jp/documents/15913/sankou4.pdf' },
    { pref: '東京', name: '杉並公会堂 大ホール', fw: 19.7, bw: 17, d: 10, q: 'concert', note: 'コンサート形式：幅19.7m（バルコニー部17m）・奥行9.98m', src: 'https://www.suginamikoukaidou.com/rental/lghall-1/' },
    { pref: '東京', name: 'すみだトリフォニーホール 大ホール', fw: 20, bw: 20, d: 13.5, q: 'concert', note: 'コンサート専用のオープンステージ', src: 'https://www.triphony.com/hallguide/hall_b.php' },
    { pref: '東京', name: '三鷹市芸術文化センター 風のホール', fw: 14.6, bw: 14.6, d: 9.6, q: 'concert', note: 'コンサートホール。奥行7.6〜9.6m（昇降床）', src: 'https://mitaka-sportsandculture.or.jp/geibun/info/wind.html' },
  ];

  const r1 = v => Math.round(v * 10) / 10;
  SS.HALLS = raw.map(h => {
    const o = Object.assign({}, h);
    if (o.q === 'est') {
      const [sw, sd] = o.stage;
      o.fw = sw;
      o.bw = r1(sw * 0.68);
      o.d = r1(Math.min(sd, 12.5));
      o.note = `舞台寸法 間口${sw}m×奥行${sd}m から、反射板設置時を推定（要確認）`;
    }
    if (!o.bw) o.bw = r1(o.fw * 0.72);
    return o;
  });
  SS.HALL_Q = { shell: '反射板寸法（公開値）', concert: 'コンサート形式（公開値）', est: '推定値・要確認', approx: '目安（公開寸法なし）・要確認' };
})(window.SS);
