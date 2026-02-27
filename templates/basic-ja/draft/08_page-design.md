# ページデザインとレイアウト

## ページメディアの理解

無限にスクロールするWebページとは異なり、印刷物はコンテンツを個別のページに分割します。VivliostyleはPDF出力や商業印刷に適した美しいページレイアウトの作成に優れています。

## ページサイズと方向

### 標準ページサイズ

標準の用紙サイズから選択します：

```bash
# よく使うサイズ
vivliostyle build document.md -s A4      # 210mm × 297mm
vivliostyle build document.md -s A5      # 148mm × 210mm
vivliostyle build document.md -s letter  # 8.5in × 11in
vivliostyle build document.md -s B5      # 176mm × 250mm
```

または `vivliostyle.config.js` で設定します：

```js
export default {
  size: 'A5',
  entry: ['book.md'],
};
```

### カスタムサイズ

正確な寸法を指定します：

```bash
vivliostyle build slide.md -s 16cm,9cm
```

ワイドスクリーンプレゼンテーション用：

```bash
vivliostyle build presentation.md -s 10in,7.5in
```

### 横向き

横向きのドキュメントを作成します：

```css
@page {
  size: A4 landscape;
}
```

方向を混在させることもできます：

```css
/* デフォルトは縦向き */
@page {
  size: A4 portrait;
}

/* 特定のページは横向き */
@page landscape-page {
  size: A4 landscape;
}

.wide-chart {
  page: landscape-page;
}
```

## ページマージン

### 基本的なマージン

均一なマージンを設定します：

```css
@page {
  margin: 25mm;
}
```

各辺を個別に指定することもできます：

```css
@page {
  margin-top: 20mm;
  margin-bottom: 20mm;
  margin-left: 25mm;
  margin-right: 25mm;
}
```

CSS変数を使う場合：

```css
:root {
  --vs-page--margin-top: 20mm;
  --vs-page--margin-bottom: 20mm;
  --vs-page--margin-left: 25mm;
  --vs-page--margin-right: 25mm;
}
```

### 綴じ代を考慮した非対称マージン

書籍では、綴じ代に合わせて左右のページで異なるマージンを使うことがよくあります：

```css
@page :left {
  margin-left: 30mm; /* 小口（外側）マージン */
  margin-right: 20mm; /* ノド（綴じ側）マージン */
}

@page :right {
  margin-left: 20mm; /* ノド（綴じ側）マージン */
  margin-right: 30mm; /* 小口（外側）マージン */
}
```

これにより外側のマージンが広くなり、読みやすくなります。

## ヘッダーとフッター

### ページ番号

ドキュメントにページ番号を追加します：

```css
@page {
  @bottom-center {
    content: counter(page);
  }
}
```

装飾付きのフォーマット：

```css
@page {
  @bottom-center {
    content: '— ' counter(page) ' —';
    font-size: 10pt;
    color: #666;
  }
}
```

### 柱（ランニングヘッダー）

ヘッダーにドキュメントタイトルを表示します：

```css
@page {
  @top-left {
    content: env(doc-title);
    font-size: 9pt;
    font-style: italic;
  }

  @top-right {
    content: env(pub-title);
    font-size: 9pt;
  }
}
```

`custom.css` のCSS変数を使う場合：

```css
:root {
  --vs-page--mbox-content-top-left: env(doc-title);
  --vs-page--mbox-content-top-right: env(pub-title);
  --vs-page--mbox-content-bottom-center: counter(page);
}
```

### 左右ページで異なるヘッダー

伝統的な書籍レイアウトを作成します：

```css
@page :left {
  @top-left {
    content: counter(page);
  }
  @top-right {
    content: env(doc-title);
  }
}

@page :right {
  @top-left {
    content: env(pub-title);
  }
  @top-right {
    content: counter(page);
  }
}
```

### 最初のページのヘッダーを削除

ヘッダーのないきれいな最初のページを作成します：

```css
@page :first {
  @top-left {
    content: none;
  }
  @top-right {
    content: none;
  }
  @bottom-center {
    content: none;
  }
}
```

## ページ番号のスキーム

### 前付にローマ数字

異なる番号スタイルを使います：

```css
/* 前付は小文字ローマ数字 */
@page front-matter {
  @bottom-center {
    content: counter(page, lower-roman);
  }
}

/* 本文はアラビア数字 */
@page main-content {
  @bottom-center {
    content: counter(page);
  }
}
```

コンテンツに適用します：

```md
<div style="page: front-matter;">

# まえがき

前付の内容…

</div>

<div style="page: main-content; counter-reset: page 1;">

# 第1章

本文はここから始まります…

</div>
```

フロントマターでページスタイルを追加することもできます：

```md
---
class: front-matter
---

# まえがき

前付の内容…
```

### ページ番号の開始

ページ番号をリセットします：

```css
.new-chapter {
  counter-reset: page 1;
}
```

または特定の番号から続けます：

```css
.volume-two {
  counter-set: page 201;
}
```

## 改ページの制御

### 強制改ページ

特定の位置で改ページします：

```css
.chapter {
  break-before: page;
}
```

またはユーティリティクラスを使います：

```css
.page-break {
  break-after: page;
}
```

Markdownでの使い方：

```md
# 第1章

内容…

<div class="page-break"></div>

# 第2章

新しいページで新しい章が始まります…
```

### 改ページの回避

コンテンツをまとめて保持します：

```css
/* 見出しを後続のコンテンツから切り離さない */
h1,
h2,
h3,
h4,
h5,
h6 {
  break-after: avoid;
}

/* テーブルをまとめて保持 */
table {
  break-inside: avoid;
}

/* 図をまとめて保持 */
figure {
  break-inside: avoid;
}

/* コードブロックをまとめて保持 */
pre {
  break-inside: avoid;
}
```

### オーファンとウィドウ

孤立した行を防ぎます：

```css
p {
  orphans: 3; /* ページ下部の最小行数 */
  widows: 3; /* ページ上部の最小行数 */
}
```

## 段組みレイアウト

### 2段組みテキスト

新聞スタイルの段組みを作成します：

```css
.two-column {
  column-count: 2;
  column-gap: 2em;
  column-rule: 1px solid #ddd;
}
```

使い方：

```md
<div class="two-column">

# はじめに

このテキストは2段組みで流れ、雑誌スタイルのレイアウトを作成します。コンテンツは段の間で自動的にバランスされます。

column-rule で段の間に視覚的な区切りを追加します。

</div>
```

### 段組みの改段

段の折り返しを制御します：

```css
.column-break-before {
  break-before: column;
}

.avoid-column-break {
  break-inside: avoid;
}
```

### 段をまたぐ要素

要素をすべての段にまたがせます：

```css
.two-column h2 {
  column-span: all;
  margin-top: 1em;
  margin-bottom: 0.5em;
}
```

## 名前付きページ

### ページテンプレートの作成

異なるページスタイルを定義します：

```css
@page chapter-opening {
  margin-top: 50mm;
  @top-left {
    content: none;
  }
  @top-right {
    content: none;
  }
}

@page standard {
  margin-top: 20mm;
  @top-left {
    content: env(doc-title);
  }
  @top-right {
    content: counter(page);
  }
}

@page appendix {
  @bottom-center {
    content: '付録 ' counter(page, upper-alpha);
  }
}
```

### 名前付きページの適用

```md
<div style="page: chapter-opening;">

# 第1章：始まり

</div>

<div style="page: standard;">

通常の章の内容…

</div>
```

## 見開きデザイン

### 対向ページ

見開き2ページ用のデザイン：

```css
@page :left {
  margin-left: 30mm;
  margin-right: 15mm;
  background: linear-gradient(to left, #fff 95%, #f8f8f8 100%);
}

@page :right {
  margin-left: 15mm;
  margin-right: 30mm;
  background: linear-gradient(to right, #fff 95%, #f8f8f8 100%);
}
```

### 空白ページ

章の始まりに空白ページを挿入します：

```css
.chapter {
  break-before: right; /* 常に右ページから開始 */
}
```

これにより、必要に応じて空白の左ページが自動的に挿入されます。

## ページの背景

### 背景画像の追加

```css
@page {
  background-image: url('./images/watermark.png');
  background-position: center;
  background-size: 80%;
  background-repeat: no-repeat;
  opacity: 0.1;
}
```

### 装飾的な罫線

```css
@page {
  border: 2pt double #333;
  padding: 10mm;
}
```

### ページ固有の背景

```css
@page cover {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  margin: 0;
}

@page :first {
  background-color: #f9f9f9;
}
```

## レスポンシブなページデザイン

### スクリーンvs. 印刷スタイル

異なる出力向けに最適化します：

```css
/* 印刷スタイル */
@media print {
  @page {
    size: A5;
    margin: 20mm;
  }

  body {
    font-size: 10pt;
  }
}

/* スクリーンスタイル */
@media screen {
  body {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    font-size: 16px;
  }
}
```

## ベストプラクティス

### 1. 早期かつ頻繁にテストする

開発中は頻繁にページデザインをプレビューしましょう。改ページは予期しない形でレイアウトに影響を与えることがあります。

### 2. 媒体を考慮する

スクリーン用PDFと印刷用ファイルではデザインが異なります。スクリーンPDFでは色を自由に使えますが、印刷ではグレースケールや特定のカラープロファイルが必要になる場合があります。

### 3. 綴じ方を計画する

マージンを設定する際は、綴じ方（無線綴じ、中綴じ、スパイラル綴じ）を考慮しましょう。

### 4. 一貫した間隔を使う

プロフェッショナルな外観のために、ドキュメント全体で一貫したマージンと間隔を維持しましょう。

### 5. 印刷基準を守る

商業印刷の準備をする際は、業界標準の裁ち落とし（3mm）とセーフゾーンに従いましょう。

## まとめ

考え抜かれたページデザインは、コンテンツをプロフェッショナルな出版物に変えます。これらのテクニックを試して、読みやすさと視覚的な魅力を高めるレイアウトを作成してください。

忘れないでください：良いデザインは目に見えないものです。読者はフォーマットではなく、コンテンツに集中すべきなのです。

