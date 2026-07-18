const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const siteUrl = "https://xenoah.github.io";
const siteName = "Xenoah";

// 公開ページの検索表示文言を一元管理する。
// titleは「日本語 | English | Xenoah」、descriptionは「日本語 / English」を基本とする。
const pages = {
  "index.html": {
    title: "Xenoahのホームページ | Xenoah's Homepage",
    description: "Webツール、ゲーム、数学教材、データベース、VRChat、電子工作などの制作物を公開するXenoahの個人サイトです。 / Xenoah's personal website featuring web tools, games, interactive math lessons, databases, VRChat and electronics projects.",
    canonical: "/",
  },
  "top.htm": {
    title: "トップページ | Home | Xenoah",
    description: "Xenoahの制作物、便利なWebツール、ゲーム、学習コンテンツ、ブログへの入口です。 / Home page for Xenoah's projects, browser tools, games, learning content and blog.",
    canonical: "/top.htm",
  },
  "menu.htm": {
    title: "サイトメニュー | Site Menu | Xenoah",
    description: "Xenoahのホームページ内にあるツール、ゲーム、ブログ、データベースへのナビゲーションです。 / Navigation to the tools, games, blog and databases on Xenoah's website.",
    canonical: "/menu.htm",
    robots: "noindex,follow",
  },
  "sitemap.htm": {
    title: "サイトマップ・ガイド | Sitemap and Guide | Xenoah",
    description: "Xenoahのホームページで公開しているWebツール、ゲーム、学習教材、記事、データベースをカテゴリ別に案内します。 / A categorized guide to Xenoah's web tools, games, learning resources, articles and databases.",
    canonical: "/sitemap.htm",
  },
  "links.htm": {
    title: "リンク集 | Links and Resources | Xenoah",
    description: "Xenoahが利用・参照しているWebサービス、技術資料、制作関連サイトをまとめたリンク集です。 / A curated collection of web services, technical resources and creative websites used or referenced by Xenoah.",
    canonical: "/links.htm",
  },
  "portfolio.htm": {
    title: "制作実績・ポートフォリオ | Projects and Portfolio | Xenoah",
    description: "FA・制御、Web開発、PDF、CAD、音声処理、データベース、VRChatなどの制作実績と技術領域を紹介します。 / Portfolio of projects in industrial control, web development, PDF, CAD, audio processing, databases and VRChat.",
    canonical: "/portfolio.htm",
  },
  "changelog.htm": {
    title: "更新履歴 | Website Changelog | Xenoah",
    description: "Xenoahのホームページに追加・更新したWebツール、ゲーム、記事、機能の履歴を新しい順に掲載します。 / Chronological updates to the tools, games, articles and features published on Xenoah's website.",
    canonical: "/changelog.htm",
  },
  "environment.htm": {
    title: "使用ソフト・制作環境 | Software and Creative Setup | Xenoah",
    description: "Visual Studio Code、Fusion 360、Blender、KiCad、GIMPなど、Xenoahが制作で使用するソフトと用途を紹介します。 / Software and creative tools used by Xenoah, including VS Code, Fusion 360, Blender, KiCad and GIMP.",
    canonical: "/environment.htm",
  },
  "vrchat.htm": {
    title: "VRChatは私をどう変えたか | How VRChat Changed Me | Xenoah",
    description: "VRChatでの出会い、創作、学び、居場所、注意点を振り返り、現実の活動や考え方への影響をまとめた体験記です。 / A personal reflection on how VRChat influenced creativity, learning, relationships and life outside virtual reality.",
    canonical: "/vrchat.htm",
    type: "article",
  },
  "blog/index.html": {
    title: "ブログ・制作記録 | Blog and Build Notes | Xenoah",
    description: "Web開発、VRChat、電子工作、制作過程、学び直しについて記録するXenoahのブログです。 / Xenoah's blog about web development, VRChat, electronics, creative processes and continuous learning.",
    canonical: "/blog/",
  },
  "blog/2026/05/05/vrchat/index.html": {
    title: "VRChatは私をどう変えたか | How VRChat Changed Me | Xenoah",
    description: "VRChatでの出会い、創作、学び、居場所、危うさを振り返り、人生や現実の活動への影響を考える記事です。 / A personal essay about how VRChat shaped creativity, learning, belonging and real-world life.",
    canonical: "/blog/2026/05/05/vrchat/",
    type: "article",
  },
  "blog/2026/05/08/blog-start/index.html": {
    title: "ブログ機能を追加しました | Launching the Blog | Xenoah",
    description: "Xenoahのホームページへ追加したブログ機能、記事の管理方法、静的HTMLとして公開する仕組みを紹介します。 / An introduction to the site's blog system, article workflow and static HTML publishing process.",
    canonical: "/blog/2026/05/08/blog-start/",
    type: "article",
  },
  "database/SpaceCraft/DB_spacecraft_index.html": {
    title: "日本の人工衛星・探査機データベース | Japanese Spacecraft Database | Xenoah",
    description: "日本の人工衛星、宇宙探査機、ミッション情報を検索・比較し、統計やグラフで確認できるデータベースです。 / Search, compare and visualize information about Japanese satellites, space probes and missions.",
    canonical: "/database/SpaceCraft/DB_spacecraft_index.html",
  },
  "database/ScienceInstitue/DB_institutes_index.html": {
    title: "日本の科学研究機関データベース | Japanese Research Institutes Database | Xenoah",
    description: "日本の大学、研究所、科学技術機関を分野・カテゴリ・地域から検索し、研究領域や統計を確認できます。 / Search Japanese universities, laboratories and research institutes by field, category and location.",
    canonical: "/database/ScienceInstitue/DB_institutes_index.html",
  },
  "games/chord-breaker/chord-breaker.html": {
    title: "コードブレイカー・和音進行ゲーム | Chord Breaker | Xenoah",
    description: "コード進行を選びながらブロックを崩し、和音の機能、ボイスリーディング、心地よい進行を体験できる音楽ゲームです。 / A music game for learning chord functions, voice leading and harmonic progressions.",
    canonical: "/games/chord-breaker/chord-breaker.html",
  },
  "games/font-sense/font-sense.html": {
    title: "絶対フォント感・書体判別ゲーム | Absolute Font Sense | Xenoah",
    description: "表示された文字のフォントを見分け、書体の特徴や苦手フォントを学習できるブラウザゲームです。 / A browser game for identifying typefaces, learning font characteristics and reviewing difficult fonts.",
    canonical: "/games/font-sense/font-sense.html",
  },
  "games/haiku-generator/haiku-generator.html": {
    title: "ランダム俳句ジェネレーター | Haiku Generator | Xenoah",
    description: "俳句データから上五・中七・下五を組み合わせ、時代や作者を選んでランダムな俳句を生成するWebアプリです。 / Generate random haiku combinations filtered by era and author in this browser-based app.",
    canonical: "/games/haiku-generator/haiku-generator.html",
  },
  "games/perfect-pitch-quiz/perfect-pitch-quiz.html": {
    title: "絶対音感・音名当てゲーム | Perfect Pitch Quiz | Xenoah",
    description: "単音や和音を聴いて音名とコードを回答し、レベル別に耳を鍛えられる無料の音感トレーニングゲームです。 / A free ear-training game for identifying notes and chords across multiple difficulty levels.",
    canonical: "/games/perfect-pitch-quiz/perfect-pitch-quiz.html",
  },
  "games/skyracers-fpv/skyracers-fpv.html": {
    title: "FPVドローン・レーシングシミュレーター | SkyRacers FPV | Xenoah",
    description: "ブラウザでFPVドローンの操縦、タイムアタック、フリーフライト、機体チューニングを体験できる3Dゲームです。 / A browser-based 3D FPV drone simulator with racing, free flight and drone tuning.",
    canonical: "/games/skyracers-fpv/skyracers-fpv.html",
  },
  "games/synth-wave-match/synth-wave-match.html": {
    title: "シンセ音作り・波形一致ゲーム | Synth Wave Match Spectra | Xenoah",
    description: "オシレーター、フィルター、エフェクトを調整して目標音へ近づけ、スペクトル比較でシンセ音作りを学ぶゲームです。 / Learn synthesizer sound design by matching target sounds with oscillators, filters and effects.",
    canonical: "/games/synth-wave-match/synth-wave-match.html",
  },
  "study/intmath/index.html": {
    title: "インタラクティブ数学 | Interactive Mathematics | Xenoah",
    description: "四則演算、微積分、線形代数、確率、素数などを操作と可視化で学べる数学コンテンツへ移動します。 / Redirects to interactive mathematics lessons covering arithmetic, calculus, algebra, probability and primes.",
    canonical: "/study/intmath/intmath.html",
    robots: "noindex,follow",
  },
  "study/intmath/intmath.html": {
    title: "数学スコアアタック | Math Raid | Xenoah",
    description: "四則演算、因数分解、三角関数、微分、確率の問題を解きながら敵を倒す、ブラウザ数学ゲームです。 / A browser math game combining arithmetic, factorization, trigonometry, calculus and probability challenges.",
    canonical: "/study/intmath/intmath.html",
  },
  "study/intmath/lessons/arithmetic/index.html": {
    title: "四則演算の可視化 | Interactive Arithmetic | Xenoah",
    description: "数、足し算、引き算、掛け算の関係をパラメーター操作とCanvas表示で確認できる数学教材です。 / Explore numbers and arithmetic operations through interactive controls and Canvas visualization.",
    canonical: "/study/intmath/lessons/arithmetic/",
  },
  "study/intmath/lessons/calculus/index.html": {
    title: "微分・積分の可視化 | Interactive Calculus | Xenoah",
    description: "関数、接線、変化率、面積の関係を動かしながら確認し、微分と積分を直感的に学べる教材です。 / Learn derivatives, tangent slopes and integrals through interactive function visualization.",
    canonical: "/study/intmath/lessons/calculus/",
  },
  "study/intmath/lessons/chaos/index.html": {
    title: "カオス理論の可視化 | Interactive Chaos Theory | Xenoah",
    description: "ローレンツアトラクターと二重振り子を操作し、初期値鋭敏性とカオス的な軌跡を観察できます。 / Explore sensitivity to initial conditions using the Lorenz attractor and double pendulum simulations.",
    canonical: "/study/intmath/lessons/chaos/",
  },
  "study/intmath/lessons/collatz/index.html": {
    title: "コラッツ予想の可視化 | Interactive Collatz Conjecture | Xenoah",
    description: "開始整数を変えてコラッツ列の増減、到達回数、数列の軌跡をインタラクティブに確認できます。 / Explore Collatz sequences, stopping times and numerical trajectories from different starting values.",
    canonical: "/study/intmath/lessons/collatz/",
  },
  "study/intmath/lessons/complex_analysis/index.html": {
    title: "複素解析の可視化 | Interactive Complex Analysis | Xenoah",
    description: "複素関数による平面の変形を操作し、入力平面と出力平面の対応を視覚的に学べる教材です。 / Visualize how complex functions transform the plane and connect input and output coordinates.",
    canonical: "/study/intmath/lessons/complex_analysis/",
  },
  "study/intmath/lessons/factorization/index.html": {
    title: "因数分解の可視化 | Interactive Factorization | Xenoah",
    description: "多項式の因数分解を式と面積モデルで表し、係数や解の関係を操作しながら学べる教材です。 / Learn polynomial factorization through equations, area models and interactive coefficients.",
    canonical: "/study/intmath/lessons/factorization/",
  },
  "study/intmath/lessons/fourier/index.html": {
    title: "フーリエ変換の可視化 | Interactive Fourier Transform | Xenoah",
    description: "複数の正弦波を合成し、周波数成分と時間波形の関係を操作しながら学べる数学教材です。 / Explore Fourier series by combining sine waves and comparing frequency components with waveforms.",
    canonical: "/study/intmath/lessons/fourier/",
  },
  "study/intmath/lessons/linear_algebra/index.html": {
    title: "線形代数・行列変換の可視化 | Interactive Linear Algebra | Xenoah",
    description: "2×2行列による格子、基底ベクトル、面積、行列式、固有ベクトルの変化を可視化します。 / Visualize 2D matrix transformations, basis vectors, determinants, area and eigenvectors.",
    canonical: "/study/intmath/lessons/linear_algebra/",
  },
  "study/intmath/lessons/nd_coords/index.html": {
    title: "高次元座標の可視化 | Interactive Higher Dimensions | Xenoah",
    description: "高次元の座標や点を低次元へ投影し、次元、軸、回転、距離の関係を視覚的に学べます。 / Explore higher-dimensional coordinates through projection, axes, rotation and distance visualization.",
    canonical: "/study/intmath/lessons/nd_coords/",
  },
  "study/intmath/lessons/primes/index.html": {
    title: "素数とウラム螺旋の可視化 | Interactive Prime Numbers | Xenoah",
    description: "エラトステネスの篩による素数表とウラム螺旋を切り替え、素数の分布や模様を観察できます。 / Explore prime distribution using the Sieve of Eratosthenes grid and Ulam spiral.",
    canonical: "/study/intmath/lessons/primes/",
  },
  "study/intmath/lessons/probability/index.html": {
    title: "確率・統計のシミュレーション | Interactive Probability | Xenoah",
    description: "モンテカルロ法による円周率推定とサイコロ和の分布から、確率と中心極限定理を学べます。 / Learn probability with Monte Carlo estimation of pi and dice-sum distributions.",
    canonical: "/study/intmath/lessons/probability/",
  },
  "study/intmath/lessons/trig_unit_circle/index.html": {
    title: "単位円と三角関数の可視化 | Interactive Unit Circle | Xenoah",
    description: "単位円上の角度を動かし、sin、cos、tanと座標・波形の対応を視覚的に確認できます。 / Explore the relationship between angles, coordinates, sine, cosine and tangent on the unit circle.",
    canonical: "/study/intmath/lessons/trig_unit_circle/",
  },
  "study/sanrikutoku/index.html": {
    title: "第二級・第三級陸上特殊無線技士・過去問単語帳 | Radio Operator Exam Study | Xenoah",
    description: "第二級・第三級陸上特殊無線技士の法規・無線工学を、過去問形式、採点、復習、ブックマークで学習できる教材です。 / Study Japanese second- and third-class land radio operator law and engineering with quizzes and review tools.",
    canonical: "/study/sanrikutoku/",
    robots: "noindex,nofollow,noarchive,nosnippet,noimageindex",
  },
  "tools/audio-converter/audio-converter.htm": {
    title: "音声ファイル変換・速度・音量調整 | Audio Converter | Xenoah",
    description: "音声・動画ファイルをブラウザ内で読み込み、再生速度、音程、音量を調整してWAVやMP3へ変換します。 / Convert audio locally in your browser with speed, pitch and volume controls for WAV and MP3 output.",
    canonical: "/tools/audio-converter/audio-converter.htm",
  },
  "tools/audio-to-arduino-tone/audio-to-arduino-tone.htm": {
    title: "音声からArduino tone変換 | Audio to Arduino Tone | Xenoah",
    description: "MP3やWAVからメロディーと音程を解析し、Arduinoのtone関数で再生できるコードへ変換します。 / Analyze MP3 or WAV melodies and generate Arduino tone function code.",
    canonical: "/tools/audio-to-arduino-tone/audio-to-arduino-tone.htm",
  },
  "tools/dtmf-toolkit/dtmf-toolkit.htm": {
    title: "DTMF信号の生成・解析ツール | DTMF Toolkit | Xenoah",
    description: "電話のプッシュ信号DTMFをキーパッドから生成し、音声ファイルの周波数解析、検出、ログ保存ができるWebツールです。 / Generate, analyze and detect telephone DTMF tones directly in your browser.",
    canonical: "/tools/dtmf-toolkit/dtmf-toolkit.htm",
  },
  "tools/gif-converter/gif-converter.htm": {
    title: "GIF・動画・連番画像変換 | GIF Converter | Xenoah",
    description: "GIF、動画、連番画像をフレーム編集し、速度、サイズ、色数を調整してGIFや動画形式へ変換します。 / Edit frames and convert GIFs, videos and image sequences with timing, size and color controls.",
    canonical: "/tools/gif-converter/gif-converter.htm",
  },
  "tools/qr-code-tool/qr-code-tool.htm": {
    title: "QRコード読取・生成・保存 | QR Code Reader and Generator | Xenoah",
    description: "画像やカメラからQRコードを読み取り、テキスト、URL、Wi-Fi情報のQRコードをデザインして保存できます。 / Scan QR codes and create downloadable codes for text, URLs and Wi-Fi details.",
    canonical: "/tools/qr-code-tool/qr-code-tool.htm",
  },
  "tools/qr-painting/qr-painting.htm": {
    title: "QRコード手描き編集・検証 | QR Painting Tool | Xenoah",
    description: "QRコードの機能パターンを保護しながらデータ領域を手描き編集し、読み取り可能性をリアルタイムで検証します。 / Paint QR data modules while protecting functional patterns and testing readability in real time.",
    canonical: "/tools/qr-painting/qr-painting.htm",
  },
  "tools/scientific-calculator/scientific-calculator.htm": {
    title: "科学計算・グラフ・統計・数式OCR | Scientific Calculator | Xenoah",
    description: "関数電卓、数式グラフ、CSV統計、画像からの数式OCRを一つにまとめたブラウザ科学計算ツールです。 / A browser scientific calculator with graphing, CSV statistics and equation OCR.",
    canonical: "/tools/scientific-calculator/scientific-calculator.htm",
  },
  "tools/svg-converter/svg-converter.htm": {
    title: "画像からSVGベクター変換 | SVG Converter | Xenoah",
    description: "PNGやJPEGを輪郭、中心線、エッジ、カラー別にトレースし、SVG、PNG、PDFなどへ書き出せる変換ツールです。 / Trace raster images into outline, centerline, edge or color SVG and export multiple formats.",
    canonical: "/tools/svg-converter/svg-converter.htm",
  },
  "tools/vj-fx-maker/vj-fx-maker.htm": {
    title: "VJ映像エフェクト作成ツール | VJ FX Maker | Xenoah",
    description: "画像や動画へWebGLエフェクトを重ね、BPM、音声、MIDI、キーフレーム、シーン切替を使ってVJ映像を作成できます。 / Create VJ visuals with WebGL effects, BPM, audio reaction, MIDI, keyframes and scene mixing.",
    canonical: "/tools/vj-fx-maker/vj-fx-maker.htm",
  },
};

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function removeTag(source, pattern) {
  return source.replace(pattern, "");
}

function updateHtml(file, config) {
  const absolutePath = path.join(root, file);
  let source = fs.readFileSync(absolutePath, "utf8");
  if (!/<head[\s>]/i.test(source)) {
    throw new Error(`head not found: ${file}`);
  }

  const htmlTagMatch = source.match(/<html\b[^>]*>/i);
  if (htmlTagMatch) {
    const htmlTag = htmlTagMatch[0];
    const localizedHtmlTag = /\blang=/i.test(htmlTag)
      ? htmlTag.replace(/\blang=(["'])[^"']*\1/i, 'lang="ja"')
      : htmlTag.replace(/>$/, ' lang="ja">');
    source =
      source.slice(0, htmlTagMatch.index) +
      localizedHtmlTag +
      source.slice(htmlTagMatch.index + htmlTag.length);
  }

  const completeHeadMatch = source.match(/<head\b[^>]*>[\s\S]*?<\/head>/i);
  const headStart = source.search(/<head\b/i);
  const bodyStart = source.search(/<body\b|<frameset\b/i);
  const headEnd = completeHeadMatch
    ? completeHeadMatch.index + completeHeadMatch[0].length
    : bodyStart >= 0
      ? bodyStart
      : source.length;
  let headSource = source.slice(headStart, headEnd);

  headSource = removeTag(headSource, /\s*<title[^>]*>[\s\S]*?<\/title>\s*/i);
  headSource = removeTag(headSource, /\s*<meta[^>]*\bname=(["'])description\1[^>]*>\s*/gi);
  headSource = removeTag(headSource, /\s*<meta[^>]*\bname=(["'])robots\1[^>]*>\s*/gi);
  headSource = removeTag(headSource, /\s*<meta[^>]*\bname=(["'])author\1[^>]*>\s*/gi);
  headSource = removeTag(headSource, /\s*<link[^>]*\brel=(["'])canonical\1[^>]*>\s*/gi);
  headSource = removeTag(headSource, /\s*<meta[^>]*\bproperty=(["'])og:(?:site_name|type|title|description|url|locale)\1[^>]*>\s*/gi);
  headSource = removeTag(headSource, /\s*<meta[^>]*\bname=(["'])twitter:(?:card|title|description)\1[^>]*>\s*/gi);

  const canonical = `${siteUrl}${config.canonical}`;
  const robots = config.robots || "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  const seo = [
    `  <title>${escapeAttr(config.title)}</title>`,
    `  <meta name="description" content="${escapeAttr(config.description)}">`,
    `  <meta name="robots" content="${escapeAttr(robots)}">`,
    `  <meta name="author" content="${siteName}">`,
    `  <link rel="canonical" href="${escapeAttr(canonical)}">`,
    `  <meta property="og:site_name" content="${siteName}">`,
    `  <meta property="og:type" content="${config.type || "website"}">`,
    `  <meta property="og:title" content="${escapeAttr(config.title)}">`,
    `  <meta property="og:description" content="${escapeAttr(config.description)}">`,
    `  <meta property="og:url" content="${escapeAttr(canonical)}">`,
    `  <meta property="og:locale" content="ja_JP">`,
    `  <meta name="twitter:card" content="summary">`,
    `  <meta name="twitter:title" content="${escapeAttr(config.title)}">`,
    `  <meta name="twitter:description" content="${escapeAttr(config.description)}">`,
  ].join("\n");

  const charsetPattern =
    /<meta\b[^>]*(?:charset\s*=|http-equiv\s*=\s*["']?content-type["']?)[^>]*>/i;

  if (charsetPattern.test(headSource)) {
    headSource = headSource.replace(charsetPattern, (charsetTag) => `${charsetTag}\n${seo}\n`);
  } else {
    headSource = headSource.replace(
      /(<head[^>]*>)/i,
      `$1\n  <meta charset="UTF-8">\n${seo}\n`,
    );
  }

  source = source.slice(0, headStart) + headSource + source.slice(headEnd);
  fs.writeFileSync(absolutePath, source, "utf8");
}

for (const [file, config] of Object.entries(pages)) {
  updateHtml(file, config);
}

console.log(`Updated SEO metadata for ${Object.keys(pages).length} pages.`);
