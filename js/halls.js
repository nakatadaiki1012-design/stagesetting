/* 神奈川県・東京都のホールのステージ寸法（公式サイト等の公開情報を調べたもの。単位 m）
 * w: 間口（幅） d: 奥行
 * ※プロセニアム型のホールは、音響反射板を置くと演奏に使える奥行が短くなることが多いです。
 *   本番前には必ずホールの舞台図面で確認してください。
 */
window.SS = window.SS || {};

(function (SS) {
  SS.HALLS = [
    // ---------------- 神奈川県 ----------------
    { pref: '神奈川', name: 'ミューザ川崎シンフォニーホール', w: 22, d: 14, note: 'オープンステージ', src: 'https://www.kawasaki-sym-hall.jp/about/muza/' },
    { pref: '神奈川', name: '神奈川県立音楽堂', w: 19.4, d: 8.6, note: '奥行7.4m（張り出し舞台使用時8.6m）', src: 'https://www.kanagawa-ongakudo.com/about' },
    { pref: '神奈川', name: '神奈川県民ホール 大ホール', w: 20, d: 18, note: 'プロセニアム間口約20m・舞台奥行約18m', src: 'https://www.kanagawa-kenminhall.com/about/mainhall' },
    { pref: '神奈川', name: 'カルッツかわさき ホール', w: 19.8, d: 17.5, src: 'https://culttz.city.kawasaki.jp/info_hall/' },
    { pref: '神奈川', name: '相模女子大学グリーンホール 大ホール', w: 20, d: 18, note: '間口14〜20m可変', src: 'https://hall-net.or.jp/01greenhall/info/equipment01/' },
    { pref: '神奈川', name: '杜のホールはしもと', w: 17, d: 14, note: '間口14〜17m可変', src: 'https://hall-net.or.jp/02hashimoto/info/equipment01/' },
    { pref: '神奈川', name: 'ひらしん平塚文化芸術ホール 大ホール', w: 20, d: 16, note: '間口18〜20m可変', src: 'https://hiratsuka.hall-info.jp/facilities/daihall.html' },
    { pref: '神奈川', name: '鎌倉芸術館 大ホール', w: 18, d: 14, src: 'https://kamakura-kpac.jp/facilities/hall/' },
    { pref: '神奈川', name: '藤沢市民会館 大ホール', w: 18, d: 16, src: 'https://www.city.fujisawa.kanagawa.jp/c-hall/kyoiku/bunka/shisetsu/kaikan-gaiyo.html' },
    { pref: '神奈川', name: '茅ヶ崎市民文化会館 大ホール', w: 18, d: 16, src: 'https://www.chigasaki-hall.jp/facility_data/largehall.html' },
    { pref: '神奈川', name: 'よこすか芸術劇場', w: 18, d: 19, note: 'プロセニアム', src: 'https://www.yokosuka-arts.or.jp/facility/hall/' },
    { pref: '神奈川', name: 'やまと芸術文化ホール メインホール', w: 18, d: 11, note: '音響反射板使用時', src: 'https://yamato-bunka.jp/hall/' },
    { pref: '神奈川', name: 'ハーモニーホール座間 大ホール', w: 18.8, d: 14.4, src: 'https://harmony.zamashi.jp/facilities/index.html' },
    { pref: '神奈川', name: '厚木市文化会館 大ホール', w: 17.9, d: 14.1, src: 'https://atsugi-bunka.jp/shisetsu/dai_hall/' },
    { pref: '神奈川', name: '秦野市文化会館 大ホール', w: 20, d: 16, src: 'https://www.townnews.co.jp/pr/hadanoculture/facilities.html' },
    { pref: '神奈川', name: '横浜関内ホール 大ホール', w: 12, d: 13, src: 'https://www.kannaihall.jp/user/facilities/mainhall.php' },
    { pref: '神奈川', name: '港南区民文化センター ひまわりの郷', w: 12.8, d: 8.8, src: 'https://himawari-sato.com/facility/hall' },
    // ---------------- 東京都 ----------------
    { pref: '東京', name: '東京文化会館 大ホール', w: 18, d: 24, note: 'プロセニアム（舞台全体の奥行）', src: 'https://www.t-bunka.jp/hall/large.html' },
    { pref: '東京', name: 'すみだトリフォニーホール 大ホール', w: 20, d: 13.5, note: 'オープンステージ', src: 'https://www.triphony.com/hallguide/hall_b.php' },
    { pref: '東京', name: '杉並公会堂 大ホール', w: 19.7, d: 10, note: 'コンサート形式（奥行9.98m）', src: 'https://www.suginamikoukaidou.com/rental/lghall-1/' },
    { pref: '東京', name: '文京シビックホール 大ホール', w: 20, d: 20, note: 'プロセニアム間口20m', src: 'https://www.b-academy.jp/rental/bc/mainhall.html' },
    { pref: '東京', name: '新宿文化センター 大ホール', w: 20, d: 16.5, src: 'https://www.regasu-shinjuku.or.jp/bunka-center/facilities/main-hall/' },
    { pref: '東京', name: '大田区民ホール アプリコ 大ホール', w: 18, d: 14.6, src: 'https://www.ota-bunka.or.jp/facilities/aprico/halls/main_hall/main_hall01' },
    { pref: '東京', name: '板橋区立文化会館 大ホール', w: 18, d: 13.5, src: 'https://www.itabashi-ci.org/culturehall/institution/bunka-h1.html' },
    { pref: '東京', name: 'きゅりあん 大ホール（品川）', w: 15, d: 18.5, src: 'https://www.shinagawa-culture.or.jp/curian/facility/guide/index.html' },
    { pref: '東京', name: 'シアター1010（足立）', w: 13, d: 15, note: 'プロセニアム', src: 'https://www.t1010.jp/html/guide/theatre.html' },
    { pref: '東京', name: '府中の森芸術劇場 どりーむホール', w: 20, d: 19, src: 'https://www.fuchu-cpf.or.jp/theater/1000160/1000175.html' },
    { pref: '東京', name: 'J:COMホール八王子', w: 18, d: 21.6, note: 'プロセニアム', src: 'https://jcom.hall-info.jp/about/big_hall.html' },
    { pref: '東京', name: '調布市グリーンホール 大ホール', w: 18, d: 14, src: 'https://www.chofu-culture-community.org/halls/green-hall-large' },
    { pref: '東京', name: '町田市民ホール 大ホール', w: 16, d: 13.4, src: 'https://www.m-shimin-hall.jp/' },
    { pref: '東京', name: 'たましんRISURUホール 大ホール（立川）', w: 18, d: 13, src: 'https://risuru.hall-info.jp/service/bighall.html' },
    { pref: '東京', name: '武蔵野市民文化会館 大ホール', w: 20, d: 18.6, src: 'https://www.musashino.or.jp/bunka/1002094/1002099.html' },
    { pref: '東京', name: '三鷹市芸術文化センター 風のホール', w: 14.6, d: 9.6, note: '奥行7.6〜9.6m（昇降床）', src: 'https://mitaka-sportsandculture.or.jp/geibun/info/wind.html' },
    { pref: '東京', name: '狛江エコルマホール', w: 15, d: 12.8, src: 'https://ecorma-hall.jp/?p=109' },
  ];
})(window.SS);
