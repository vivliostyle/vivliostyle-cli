# 出力形式と配布

## はじめに

Vivliostyle CLIは、さまざまな配布チャネルに対応する複数の出力形式をサポートしています。この章では、各形式でのビルド方法と配布の準備について解説します。

## 出力形式の概要

Vivliostyle CLIは主に3つの出力形式をサポートしています：

| 形式       | 拡張子       | 用途                               |
| ---------- | ------------ | ---------------------------------- |
| **PDF**    | `.pdf`       | 印刷、デジタル配布、アーカイブ     |
| **EPUB**   | `.epub`      | 電子書籍リーダー、モバイルデバイス |
| **WebPub** | ディレクトリ | Webブラウザ、オンライン閲覧        |

## PDF出力のビルド

### 基本的なPDF出力

標準的なPDFを生成します：

```bash
vivliostyle build manuscript.md -o output.pdf
```

または設定ファイルを使います：

```bash
npm run build
```

### ページサイズ指定のPDF

PDFのページサイズを指定します：

```bash
vivliostyle build manuscript.md -s A5 -o book.pdf
vivliostyle build manuscript.md -s letter -o document.pdf
```

### トンボ付き印刷用PDF

商業印刷には、トンボと裁ち落としを追加します：

```bash
vivliostyle build manuscript.md \
  -s A5 \
  -m \
  --bleed 3mm \
  --crop-offset 10mm \
  -o print-ready.pdf
```

**オプションの説明：**

- `-m` または `--crop-marks`: トンボを追加
- `--bleed 3mm`: コンテンツを仕上がり線から3mm伸ばす
- `--crop-offset 10mm`: トンボ周辺の余白

### 商業印刷向けPDF/X-1a形式

PDF/X-1a形式が必要な場合は、preflightオプションを使います：

```bash
vivliostyle build manuscript.md --preflight press-ready -o print.pdf
```

**前提条件**: Dockerがシステムにインストールされている必要があります。

設定ファイルの例：

```js
export default defineConfig({
  title: 'My Book',
  entry: ['manuscript.md'],
  output: 'book.pdf',
  pdfPostprocess: {
    preflight: 'press-ready',
  },
});
```

#### Preflightオプション

press-readyに処理オプションを追加します：

```bash
# グレースケールに変換
vivliostyle build manuscript.md \
  --preflight press-ready \
  --preflight-option gray-scale

# フォントをアウトライン化（フォントをアウトラインとして埋め込み）
vivliostyle build manuscript.md \
  --preflight press-ready \
  --preflight-option enforce-outline

# 複数のオプションを組み合わせ
vivliostyle build manuscript.md \
  --preflight press-ready \
  --preflight-option gray-scale \
  --preflight-option enforce-outline
```

**注意**: Dockerを使わないローカル処理には `--preflight press-ready-local` を使用できますが、一貫性のためにDockerの使用を推奨します。

### PDFブックマーク（目次）

Vivliostyleは目次から自動的にPDFブックマークを生成し、Adobe AcrobatなどのPDFリーダーでのナビゲーションを可能にします。

ブックマークを有効にするには：

1. `vivliostyle.config.js` で目次を設定します：

```js
export default {
  title: 'My Book',
  entry: ['chapter1.md', 'chapter2.md', 'chapter3.md'],
  toc: {
    title: '目次',
  },
  output: 'book.pdf',
};
```

2. PDFをビルドします：

```bash
vivliostyle build
```

生成されたPDFには、目次構造に基づいたブックマークが含まれます。

### Dockerを使った一貫したビルド

異なる環境間で一貫した結果を得るには、Dockerレンダーモードを使います：

```bash
vivliostyle build manuscript.md --render-mode docker -o output.pdf
```

設定ファイルの例：

```js
export default {
  title: 'My Book',
  entry: ['manuscript.md'],
  output: 'book.pdf',
  image: 'ghcr.io/vivliostyle/cli:latest',
};
```

**Docker使用時の重要な注意点：**

1. **フォント**: ホストのフォントはDocker内では利用できません。以下のいずれかの方法を使ってください：

- プロジェクトにフォントファイルを配置してCSSで参照する
- Webフォント（Google Fonts等）を使う
- Dockerコンテナで利用可能なフォントを使う

2. **ファイルアクセス**: ワークスペースディレクトリ（`vivliostyle.config.js` がある場所）内のファイルのみアクセスできます。すべての画像やリソースがこのディレクトリ内にあることを確認してください。

カスタムフォントのCSS例：

```css
@font-face {
  font-family: 'CustomFont';
  src: url('./fonts/CustomFont.woff2') format('woff2');
}

:root {
  --vs-font-family: 'CustomFont', sans-serif;
}
```

## EPUB出力のビルド

### 基本的なEPUB出力

`.epub` 拡張子を指定してEPUBファイルを生成します：

```bash
vivliostyle build manuscript.md -o output.epub
```

フォーマットオプションを使うこともできます：

```bash
vivliostyle build manuscript.md -f epub -o book.epub
```

### 目次付きEPUB

EPUBの互換性を高めるには、目次を設定します：

```js
export default {
  title: 'My Book',
  author: '著者名',
  language: 'ja',
  entry: ['chapter1.md', 'chapter2.md', 'chapter3.md'],
  toc: {
    title: '目次',
  },
  output: 'book.epub',
};
```

ビルドします：

```bash
vivliostyle build
```

### 日本語コンテンツのEPUB

日本語EPUBには、EBPAJ EPUB 3ガイドラインに準拠した専用テーマを使います：

```bash
npm install @vivliostyle/theme-epub3j
```

設定：

```js
export default {
  title: '日本語の本',
  author: '著者名',
  language: 'ja',
  theme: '@vivliostyle/theme-epub3j',
  entry: ['chapter1.md', 'chapter2.md'],
  output: 'book.epub',
};
```

### 複数の出力形式

1つのコマンドでPDFとEPUBの両方を生成します：

```bash
vivliostyle build -o book.pdf -o book.epub
```

または複数の出力を設定します：

```js
export default {
  title: 'My Book',
  entry: ['manuscript.md'],
  output: ['book.pdf', 'book.epub'],
};
```

### EPUBの互換性に関する注意

**重要**: Vivliostyle CLIはEPUB 3準拠のファイルを生成しますが、CSSスタイルはそのまま出力されます。EPUBリーダーによってスタイルのレンダリングが異なる場合があります。

EPUBリーダーの互換性を広げるには：

- 複数のリーダーでテスト（Apple Books、Kindle、Kobo、Adobe Digital Editions）
- リーダー互換のテーマを使用
- CSSをシンプルに標準準拠に保つ
- すべてのリーダーで動作しない可能性がある複雑なレイアウトを避ける

## WebPub出力のビルド

### 基本的なWebPub出力

Web出版物を生成します：

```bash
vivliostyle build manuscript.md -f webpub -o ./webpub
```

以下を含むディレクトリが作成されます：

- 各エントリのHTMLファイル
- `publication.json` - 出版物マニフェスト（W3C標準）
- アセット（画像、CSS等）

### WebPubの構造

生成されるディレクトリ構造：

```
webpub/
├── publication.json
├── index.html
├── chapter1.html
└── chapter2.html
```

### 出版物マニフェスト

`publication.json` ファイルは出版物の構造を記述します：

```json
{
  "@context": "https://www.w3.org/ns/pub-context",
  "name": "My Book",
  "author": "著者名",
  "readingOrder": [
    { "url": "chapter1.html", "title": "第1章" },
    { "url": "chapter2.html", "title": "第2章" }
  ],
  "resources": [{ "url": "styles/style.css" }, { "url": "images/figure1.png" }]
}
```

これはW3C [Publication Manifest](https://www.w3.org/TR/pub-manifest/) 仕様に準拠しています。

### WebPubの利用

**Web出版物として：**

1. Webサーバーにデプロイ：

   ```bash
   # Web サーバーにコピー
   rsync -av webpub/ user@server:/var/www/book/
   ```

2. またはローカルでテスト用にサーブ：
   ```bash
   cd webpub
   python -m http.server 8000
   # http://localhost:8000 を開く
   ```

**WebPubをPDFに変換：**

WebPubからPDFを生成します：

```bash
vivliostyle build webpub/publication.json -o book.pdf
```

これは以下のような場面で便利です：

- 単一のソース（WebPub）をWebと印刷の両方で使用
- 最終PDFを生成する前にオンラインでプレビュー
- 1つのWebPubから複数のPDFバージョンを作成

### WebPubの設定

設定ファイルの例：

```js
export default {
  title: 'My Book',
  author: '著者名',
  entry: ['chapter1.md', 'chapter2.md', 'chapter3.md'],
  output: [
    './webpub', // WebPub ディレクトリ
    'book.pdf', // 同じソースからの PDF
  ],
};
```

## 配布戦略

### PDFの配布

デジタル配布にはPDFが適しています：

- ウェブサイトからのダウンロード
- メール配布
- 学術リポジトリ
- ドキュメントアーカイブ

### EPUBの配布

EPUBファイルは以下に最適です：

- 電子書籍リーダー（Kindle、Kobo、Nook）
- モバイルデバイス
- リーディングアプリ（Apple Books、Google Playブックス）

**配布前のバリデーション：**

```bash
# epubcheck のインストール
npm install -g epubcheck

# EPUB のバリデーション
epubcheck book.epub
```

**配布プラットフォーム：**

- Amazon Kindle Direct Publishing (KDP) - MOBI/KF8への変換が必要
- Apple Books - EPUBを直接受け付け
- Google Playブックス - EPUBを受け付け
- Kobo Writing Life - EPUBを受け付け
- セルフホスティングでのダウンロード

### WebPubの配布

Web出版物は以下に最適です：

- オンラインドキュメント
- インタラクティブな出版物
- 頻繁に更新される生きたドキュメント
- Web検索インデックスが必要なコンテンツ

**デプロイオプション：**

**1. 静的ホスティング（Netlify、Vercel、GitHub Pages）：**

```bash
# WebPub のビルド
vivliostyle build manuscript.md -f webpub -o ./dist

# GitHub Pages にデプロイ
cd dist
git init
git add .
git commit -m "Initial publication"
git branch -M gh-pages
git remote add origin https://github.com/username/repo.git
git push -u origin gh-pages
```

**2. 従来のWebサーバー：**

```bash
# SSH 経由で Web サーバーにコピー
rsync -av webpub/ user@server:/var/www/html/book/

# または FTP/SFTP クライアントを使用
```

**3. CDNデプロイ：**

Cloudflare Pages、AWS S3 + CloudFront、Azure Static Web Appsなどのサービスを利用します。

デプロイ後、読者がアクセスできるようURLを共有します。もちろん、Vivliostyle Viewerを使ってローカルまたはオンラインでWebPubを閲覧することもできます。

```bash
vivliostyle preview webpub/publication.json
vivliostyle preview https://example.com/book/publication.json
```

## まとめ

Vivliostyle CLIの柔軟な出力オプションにより、複数のプラットフォームで読者に届けることができます：

- **PDF**: 印刷およびデジタル配布用
- **EPUB**: 電子書籍リーダーおよびモバイルデバイス用
- **WebPub**: オンラインアクセス用

コンテンツと読者に最適な形式を選択してください。多くの出版者は3つすべてを提供し、アクセシビリティとリーチを最大化しています。

**重要なポイント：**

- 商業印刷には `--preflight press-ready` を使用
- EPUBはepubcheckと複数のリーダーでテスト
- WebPubは静的ホスティングにデプロイして簡単にWeb配布
- 単一のソースから複数の形式を生成
- 配布前に十分にバリデーションとテストを行う

詳しくは以下をご覧ください：

- [Vivliostyle CLIドキュメント](https://github.com/vivliostyle/vivliostyle-cli#readme)
- [EPUB仕様](https://www.w3.org/publishing/epub3/)
- [W3C Publication Manifest](https://www.w3.org/TR/pub-manifest/)
