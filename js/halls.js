/* 神奈川県・東京都のホールのステージ寸法（単位 m）
 *
 * 音響反射板（反響板）を置いたときの「演奏に使える広さ」を使います。
 * 反射板を置くと、舞台は「前が広く奥がせまい台形」になるのがふつうです。
 *   fw: 前の幅（客席側） bw: 奥の幅（正面反射板の幅） d: 奥行
 *   stage: 舞台全体の寸法（参考）
 *   q: 'shell'   = 反射板設置時の寸法が公開されていたもの
 *      'concert' = コンサート専用ホール・コンサート形式の寸法が公開されていたもの
 *      'est'     = 反射板時の寸法が見つからず、舞台寸法から推定したもの（要確認）
 * 推定のしかた：武蔵野市民文化会館の反射板寸法（前幅20m／後幅13.5m／奥行12.6m）の比率を参考に、
 *   前の幅＝プロセニアム間口、奥の幅＝前の幅×0.68、奥行＝最大12.5m（舞台がそれより浅ければ舞台奥行）
 * ※本番前に、必ずホールの「反射板設置時の舞台図面」で確認してください。
 */
window.SS = window.SS || {};

(function (SS) {
  const raw = [
    // ---------------- 神奈川県 ----------------
    { pref: '神奈川', name: 'ミューザ川崎シンフォニーホール', fw: 22, bw: 17, d: 14, shape: 'arc', sag: 1.5, q: 'concert', note: 'ヴィンヤード型のオープンステージ（間口22m×奥行14m）。前のふちの弧・奥の幅は図面を見て調整してください', src: 'https://www.kawasaki-sym-hall.jp/about/muza/' },
    { pref: '神奈川', name: '横浜みなとみらいホール 大ホール', fw: 19, bw: 15, d: 13, shape: 'arc', sag: 1.2, q: 'approx', note: 'オープンステージ。公開の寸法が見つからないため目安です（ホールの「大ホール寸法図」で確認を）', src: 'https://yokohama-minatomiraihall.jp/guide/download.html' },
    { pref: '神奈川', name: '神奈川県立音楽堂', fw: 19.4, bw: 19.4, d: 8.6, q: 'concert', note: 'コンサート専用。奥行7.4m（張り出し舞台使用時8.6m）', src: 'https://www.kanagawa-ongakudo.com/about' },
    { pref: '神奈川', name: 'やまと芸術文化ホール メインホール', fw: 18, d: 11, q: 'shell', note: '音響反射板使用時 最大間口18m・奥行11m（奥の幅は推定）', src: 'https://yamato-bunka.jp/hall/' },
    { pref: '神奈川', name: '港南区民文化センター ひまわりの郷', fw: 12.8, bw: 12.8, d: 8.8, q: 'concert', note: 'シューボックス型', src: 'https://himawari-sato.com/facility/hall' },
    { pref: '神奈川', name: '神奈川県民ホール 大ホール', stage: [20, 18], q: 'est', src: 'https://www.kanagawa-kenminhall.com/about/mainhall' },
    { pref: '神奈川', name: 'カルッツかわさき ホール', stage: [19.8, 17.5], q: 'est', src: 'https://culttz.city.kawasaki.jp/info_hall/' },
    { pref: '神奈川', name: '相模女子大学グリーンホール 大ホール', stage: [20, 18], q: 'est', src: 'https://hall-net.or.jp/01greenhall/info/equipment01/' },
    { pref: '神奈川', name: '杜のホールはしもと', stage: [17, 14], q: 'est', src: 'https://hall-net.or.jp/02hashimoto/info/equipment01/' },
    { pref: '神奈川', name: 'ひらしん平塚文化芸術ホール 大ホール', stage: [20, 16], q: 'est', src: 'https://hiratsuka.hall-info.jp/facilities/daihall.html' },
    { pref: '神奈川', name: '鎌倉芸術館 大ホール', stage: [18, 14], q: 'est', src: 'https://kamakura-kpac.jp/facilities/hall/' },
    { pref: '神奈川', name: '藤沢市民会館 大ホール', stage: [18, 16], q: 'est', src: 'https://www.city.fujisawa.kanagawa.jp/c-hall/kyoiku/bunka/shisetsu/kaikan-gaiyo.html' },
    { pref: '神奈川', name: '茅ヶ崎市民文化会館 大ホール', stage: [18, 16], q: 'est', src: 'https://www.chigasaki-hall.jp/facility_data/largehall.html' },
    { pref: '神奈川', name: 'よこすか芸術劇場', stage: [18, 19], q: 'est', src: 'https://www.yokosuka-arts.or.jp/facility/hall/' },
    { pref: '神奈川', name: 'ハーモニーホール座間 大ホール', stage: [18.8, 14.4], q: 'est', src: 'https://harmony.zamashi.jp/facilities/index.html' },
    { pref: '神奈川', name: '厚木市文化会館 大ホール', stage: [17.9, 14.1], q: 'est', src: 'https://atsugi-bunka.jp/shisetsu/dai_hall/' },
    { pref: '神奈川', name: '秦野市文化会館 大ホール', stage: [20, 16], q: 'est', src: 'https://www.townnews.co.jp/pr/hadanoculture/facilities.html' },
    { pref: '神奈川', name: '横浜関内ホール 大ホール', stage: [12, 13], q: 'est', src: 'https://www.kannaihall.jp/user/facilities/mainhall.php' },
    // ---------------- 東京都 ----------------
    { pref: '東京', name: '武蔵野市民文化会館 大ホール', fw: 20, bw: 13.5, d: 12.6, q: 'shell', note: '反響板寸法 前幅20m／後幅13.5m／奥行12.6m', src: 'https://www.musashino.or.jp/bunka/1002094/1002099.html' },
    { pref: '東京', name: '杉並公会堂 大ホール', fw: 19.7, bw: 17, d: 10, q: 'concert', note: 'コンサート形式：幅19.7m（バルコニー部17m）・奥行9.98m', src: 'https://www.suginamikoukaidou.com/rental/lghall-1/' },
    { pref: '東京', name: 'すみだトリフォニーホール 大ホール', fw: 20, bw: 20, d: 13.5, q: 'concert', note: 'コンサート専用のオープンステージ', src: 'https://www.triphony.com/hallguide/hall_b.php' },
    { pref: '東京', name: '三鷹市芸術文化センター 風のホール', fw: 14.6, bw: 14.6, d: 9.6, q: 'concert', note: 'コンサートホール。奥行7.6〜9.6m（昇降床）', src: 'https://mitaka-sportsandculture.or.jp/geibun/info/wind.html' },
    { pref: '東京', name: '東京文化会館 大ホール', stage: [18, 24], q: 'est', src: 'https://www.t-bunka.jp/hall/large.html' },
    { pref: '東京', name: '文京シビックホール 大ホール', stage: [20, 20], q: 'est', src: 'https://www.b-academy.jp/rental/bc/mainhall.html' },
    { pref: '東京', name: '新宿文化センター 大ホール', stage: [20, 16.5], q: 'est', src: 'https://www.regasu-shinjuku.or.jp/bunka-center/facilities/main-hall/' },
    { pref: '東京', name: '大田区民ホール アプリコ 大ホール', stage: [18, 14.6], q: 'est', src: 'https://www.ota-bunka.or.jp/facilities/aprico/halls/main_hall/main_hall01' },
    { pref: '東京', name: '板橋区立文化会館 大ホール', stage: [18, 13.5], q: 'est', src: 'https://www.itabashi-ci.org/culturehall/institution/bunka-h1.html' },
    { pref: '東京', name: 'きゅりあん 大ホール（品川）', stage: [15, 18.5], q: 'est', src: 'https://www.shinagawa-culture.or.jp/curian/facility/guide/index.html' },
    { pref: '東京', name: 'シアター1010（足立）', stage: [13, 15], q: 'est', src: 'https://www.t1010.jp/html/guide/theatre.html' },
    { pref: '東京', name: '府中の森芸術劇場 どりーむホール', stage: [20, 19], q: 'est', src: 'https://www.fuchu-cpf.or.jp/theater/1000160/1000175.html' },
    { pref: '東京', name: 'J:COMホール八王子', stage: [18, 21.6], q: 'est', src: 'https://jcom.hall-info.jp/about/big_hall.html' },
    { pref: '東京', name: '調布市グリーンホール 大ホール', stage: [18, 14], q: 'est', src: 'https://www.chofu-culture-community.org/halls/green-hall-large' },
    { pref: '東京', name: '町田市民ホール 大ホール', stage: [16, 13.4], q: 'est', src: 'https://www.m-shimin-hall.jp/' },
    { pref: '東京', name: 'たましんRISURUホール 大ホール（立川）', stage: [18, 13], q: 'est', src: 'https://risuru.hall-info.jp/service/bighall.html' },
    { pref: '東京', name: '狛江エコルマホール', stage: [15, 12.8], q: 'est', src: 'https://ecorma-hall.jp/?p=109' },
    { pref: '東京', name: 'サントリーホール 大ホール', fw: 20, bw: 14, d: 12.5, shape: 'arc', sag: 1.8, q: 'approx', note: 'ヴィンヤード型。ステージの前は弧、うしろ（P席側）もせまくなる形。公開の寸法が見つからないため目安です（貸しホール資料の平面図で確認を）', src: 'https://www.suntory.co.jp/suntoryhall/rental/' },
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
