# 高度な機能とテクニック

## 複雑なドキュメントの作成

この章では、Vivliostyle CLIを使って洗練された出版物を作成するための高度な機能を解説します。

## マルチファイル出版物

### 大規模プロジェクトの構成

書籍や長いドキュメントでは、コンテンツを複数のファイルに分けて管理します：

```
my-book/
├── vivliostyle.config.js
├── custom.css
├── chapters/
│   ├── 01-introduction.md
│   ├── 02-getting-started.md
│   ├── 03-advanced-topics.md
│   └── 04-conclusion.md
├── front-matter/
│   ├── cover.md
│   ├── preface.md
│   └── acknowledgments.md
└── back-matter/
    ├── appendix.md
    ├── glossary.md
    └── references.md
```

### 設定ファイルのセットアップ

マルチファイルプロジェクトを `vivliostyle.config.js` で設定します：

```js
export default {
  title: '完全な書籍',
  author: '著者名',
  language: 'ja',
  size: 'A5',
  theme: '@vivliostyle/theme-techbook',
  entry: [
    // 前付
    { path: 'front-matter/cover.md', theme: 'cover.css' },
    'front-matter/preface.md',
    'front-matter/acknowledgments.md',
    // 本文
    { rel: 'contents' }, // 自動生成の目次
    'chapters/01-introduction.md',
    'chapters/02-getting-started.md',
    'chapters/03-advanced-topics.md',
    'chapters/04-conclusion.md',
    // 後付
    'back-matter/appendix.md',
    'back-matter/glossary.md',
    'back-matter/references.md',
  ],
  toc: {
    title: '目次',
  },
  output: [
    'book.pdf',
    {
      path: './webpub',
      format: 'webpub',
    },
  ],
};
```

## 高度な目次

### 目次の深さをカスタマイズ

目次に表示する見出しレベルを制御します：

```js
export default {
  toc: {
    title: '目次',
    htmlPath: 'toc.html',
    sectionDepth: 2, // h1 と h2 のみを含める
  },
};
```

### 目次のスタイリング

`custom.css` で外観をカスタマイズします：

```css
/* 目次コンテナのスタイル */
nav[role='doc-toc'] {
  line-height: 1.8;
}

nav[role='doc-toc'] > ol {
  padding-left: 0;
}

nav[role='doc-toc'] li[data-section-level='1'] {
  font-weight: 600;
  font-size: 1.1em;
}

nav[role='doc-toc'] li[data-section-level='2'] {
  font-weight: initial;
  font-size: 0.8em;
}
```

## 表紙ページのカスタマイズ

### 自動生成の表紙

メタデータから表紙を作成します：

```js
export default {
  title: 'プロフェッショナル出版物',
  author: '山田花子',

  cover: {
    htmlPath: 'cover.html',
  },
};
```

### カスタム表紙デザイン

完全にコントロールするには、フロントマター付きのカスタム表紙を作成します：

```md
---
class: cover-page
---

<div class="cover-container">

# 書籍タイトル

## 包括的ガイド

### 著者名

**2024年版**

</div>
```

`custom.css` でスタイリングします：

```css
.cover-page {
  text-align: center;
  padding-top: 30%;
  page-break-after: always;
}

.cover-page h1 {
  font-size: 3.5rem;
  font-weight: 700;
  margin-bottom: 2rem;
  color: #2c3e50;
}

.cover-page h2 {
  font-size: 2rem;
  font-weight: 300;
  margin-bottom: 3rem;
  color: #7f8c8d;
}

.cover-page h3 {
  font-size: 1.5rem;
  font-style: italic;
  margin-bottom: 1rem;
}
```

## 相互参照と引用

### 図の参照

図を自動的に参照できます：

```md
詳細は [](#chart-sales){data-ref="fig"} を参照してください。

![2020-2024年 年間売上成長](./images/sales-chart.png){#chart-sales}
```

### テーブルの参照

同様に、テーブルも参照できます：

```md
[](#results-summary){data-ref="tbl"} のデータが示すように…

<figure id="results-summary">

| 年度 | 売上    | 成長率 |
| ---- | ------- | ------ |
| 2022 | 120万円 | 15%    |
| 2023 | 150万円 | 25%    |
| 2024 | 210万円 | 40%    |

</figure>
```

### セクションの相互参照

他のセクションを参照できます：

```md
詳しくは [](#advanced-techniques){data-ref="sec"} をご覧ください。

## 高度なテクニック {#advanced-techniques}
```

## 画像の扱い

### レスポンシブ画像

画像は利用可能なスペースに適応します：

```md
![風景写真](./images/landscape.jpg)
```

### 画像サイズの制御

インラインスタイルやクラスを使います：

```md
![小さなロゴ](./logo.png){width="100px"}

![半幅の画像](./diagram.png){style="width: 50%;"}
```

### キャプション付き図

```md
![サービス間の通信とデータフローパターンを示す
マイクロサービスアーキテクチャ](./architecture.png)
```

## 高度なタイポグラフィ

### ドロップキャップ

装飾的な頭文字を作成します：

```css
.chapter-start::first-letter {
  float: left;
  font-size: 3.5em;
  line-height: 0.9;
  margin-right: 0.1em;
  font-weight: bold;
}
```

使い方：

```md
<p class="chapter-start">
物語は暗く嵐の夜に始まる…
</p>
```

### スモールキャップス

強調にスモールキャップスを使います：

```css
.smallcaps {
  font-variant: small-caps;
  letter-spacing: 0.05em;
}
```

例：<span class="smallcaps">Chapter One</span>

### カスタムフォントの読み込み

CSSでWebフォントを読み込みます：

```css
@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700&display=swap');

:root {
  --vs-font-family: 'Merriweather', Georgia, serif;
}
```

## コードドキュメント機能

### 多言語コードブロック

### シンタックスハイライトテーマ

`custom.css` でシンタックスハイライトテーマを変更します：

```css
/* コードブロックに Okaidia テーマを使用 */
@import url('./node_modules/@vivliostyle/theme-base/css/prism/theme-okaidia.css');
```

## 数式の組版

### 複雑な数式

複雑な数式を表示します：

**行列演算：**

$$
\begin{bmatrix}
a_{11} & a_{12} & a_{13} \\
a_{21} & a_{22} & a_{23} \\
a_{31} & a_{32} & a_{33}
\end{bmatrix}
\times
\begin{bmatrix}
x \\
y \\
z
\end{bmatrix}
=
\begin{bmatrix}
b_1 \\
b_2 \\
b_3
\end{bmatrix}
$$

**微積分：**

$$
\frac{d}{dx}\int_{a}^{x} f(t)\,dt = f(x)
$$

**統計学：**

正規分布の確率密度関数：

$$
f(x \mid \mu, \sigma^2) = \frac{1}{\sqrt{2\pi\sigma^2}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}
$$

### 整列された数式

ステップバイステップの導出を示します：

$$
\begin{aligned}
(a + b)^2 &= (a + b)(a + b) \\
&= a^2 + ab + ba + b^2 \\
&= a^2 + 2ab + b^2
\end{aligned}
$$

## 国際化

### 多言語対応

さまざまな書記体系をサポートします：

**日本語（横書き）：**

Vivliostyle CLIは、{日本語|にほんご}を含む{多言語|たげんご}に{対応|たいおう}しています。

**日本語（縦書き）：**

縦書きの設定：

```js
export default {
  language: 'ja',
  theme: '@vivliostyle/theme-bunko',
};
```

**右から左の言語：**

アラビア語、ヘブライ語などの方向を設定します：

```css
:root {
  direction: rtl;
}
```

### 言語別のスタイリング

言語に基づいてスタイルを適用します：

```css
:lang(ja) {
  --vs-font-family: 'Noto Serif JP', 'Yu Mincho', serif;
  line-height: 1.9;
}

:lang(en) {
  --vs-font-family: 'Georgia', 'Times New Roman', serif;
  line-height: 1.6;
}
```

## 印刷製作機能

### トンボと裁ち落とし

商業印刷用にトンボを追加します：

```bash
vivliostyle build book.md -m --bleed 3mm --crop-offset 10mm
```

またはCSSで設定します：

```css
@page {
  marks: crop cross;
  bleed: 3mm;
  crop-offset: 10mm;
}
```

## パフォーマンスの最適化

### クイックプレビューモード

大きなドキュメントにはクイックモードを使います：

```bash
vivliostyle preview large-book.md --quick
```

このモードはページ数を概算することでレンダリングを高速化します。

## 次のステップ

これらの高度な機能により、従来の組版による書籍にも匹敵するプロフェッショナルな出版物を作成できます。さまざまな組み合わせを試して、自分のニーズに最適なワークフローを見つけてください。

その他の例やコミュニティの貢献については、以下をご覧ください：

- [Vivliostyleサンプル](https://vivliostyle.org/samples/)
- [Awesome Vivliostyle](https://github.com/vivliostyle/awesome-vivliostyle)
