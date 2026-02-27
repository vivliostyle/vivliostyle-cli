````markdown
# Vivliostyleの機能

## テーマとスタイリング

Vivliostyle CLI は柔軟なテーマシステムを提供しており、CSS をゼロから書かなくてもプロフェッショナルなスタイルを出版物に適用できます。

### 公式テーマの利用

[Vivliostyle テーマ](https://vivliostyle.github.io/themes/) コレクションには、さまざまな出版物タイプ向けのデザイン済みスタイルが用意されています：

```sh
vivliostyle build manuscript.md --theme @vivliostyle/theme-techbook
```

主なテーマ：

- **@vivliostyle/theme-techbook**: 技術文書・プログラミング書籍向け
- **@vivliostyle/theme-academic**: 学術論文・研究文書向け
- **@vivliostyle/theme-bunko**: 日本語縦書き小説向け

### カスタムスタイルシート

追加の CSS スタイルを適用して出版物をカスタマイズできます：

```sh
vivliostyle build document.md --style custom.css
```

コマンドラインから直接 CSS を注入することもできます：

```sh
vivliostyle build document.md --css "body { font-family: 'Georgia'; }"
```

### ページサイズの設定

標準の用紙サイズやカスタムサイズを指定できます：

```sh
vivliostyle build paper.md -s A4
vivliostyle build letter.md -s letter
vivliostyle build slide.md -s 10in,7.5in
```

### 印刷機能

商業印刷用のトンボと裁ち落としを追加できます：

```sh
vivliostyle build book.md -m --bleed 5mm --crop-offset 20mm
```

## 複数の出力形式

Vivliostyle CLI は同じソースからさまざまな形式の出版物を生成できます。

### PDF 出力

デフォルトの出力形式で、商業印刷にも適した高品質な PDF を提供します：

```sh
vivliostyle build manuscript.md -o output.pdf
```

### EPUB 出力

電子書籍リーダー向けのリフロー型 EPUB ファイルを生成します：

```js
// vivliostyle.config.js
export default {
  entry: ['chapter1.md', 'chapter2.md'],
  output: {
    path: './book.epub',
    format: 'epub',
  },
};
```

### WebPub 出力

ブラウザで閲覧可能な Web 出版物を作成します：

```js
// vivliostyle.config.js
export default defineConfig({
  entry: ['index.md'],
  output: {
    path: './webpub',
    format: 'webpub',
  },
});
```

## 設定ファイルの活用

複数の章やセクションを持つ複雑な出版物には、設定ファイルを使用します。

### 設定ファイルの作成

新しい設定ファイルを初期化します：

```sh
vivliostyle init
```

`vivliostyle.config.js` ファイルが生成されます：

```js
export default defineConfig({
  title: 'My Book Title',
  author: '山田太郎',
  language: 'ja',
  entry: ['manuscript.md'],
});
```

### 複数エントリ

複数のソースファイルを結合できます：

```js
export default defineConfig({
  title: '完全ガイド',
  entry: [
    {
      path: 'preface.md',
      title: 'まえがき',
      theme: 'preface.css',
    },
    'chapter1.md',
    'chapter2.md',
    'chapter3.md',
    'appendix.html',
  ],
});
```

### 目次

自動的に目次を生成できます：

```js
export default defineConfig({
  title: 'My Book',
  entry: ['chapter1.md', 'chapter2.md'],
  toc: {
    title: '目次',
    htmlPath: 'toc.html',
  },
});
```

### 表紙ページ

メタデータから表紙ページを生成できます：

```js
export default defineConfig({
  title: '出版物タイトル',
  author: '著者名',
  cover: {
    htmlPath: 'cover.html',
  },
});
```

## プレビューと開発

### ライブプレビュー

自動リロード付きのブラウザプレビューを起動します：

```sh
vivliostyle preview manuscript.md
```

Vivliostyle Viewer がブラウザで開き、組版結果をリアルタイムで表示します。

### クイックプレビューモード

大きな出版物には、より高速に読み込めるクイックプレビューモードが使えます：

```sh
vivliostyle preview --quick
```

このモードでは概算のページカウントを使って性能を向上させますが、ページ番号の精度は下がる場合があります。

## 高度な入力形式

### EPUB ファイル

既存の EPUB ファイルを PDF に変換できます：

```sh
vivliostyle build book.epub -o book.pdf
```

### Web URL

リモートの HTML ドキュメントを処理できます：

```sh
vivliostyle build https://example.com/article.html -s A4 -o article.pdf
```

### 出版物マニフェスト

W3C Web Publication マニフェストファイルを使用できます：

```sh
vivliostyle build publication.json -o output.pdf
```

### Webbook

目次やマニフェストにリンクした HTML ファイルを処理できます：

```sh
vivliostyle build index.html -o book.pdf
```

## Docker サポート

コンテナ化された環境で Vivliostyle CLI を実行できます：

```sh
vivliostyle build -o output.pdf --render-mode docker
```

これは以下のような場面で便利です：

- 異なる環境間での一貫したビルド
- CI/CD パイプライン
- ローカルの依存関係インストールを避けたい場合

## コマンドラインショートカット

`vs` コマンドは `vivliostyle` の短縮エイリアスです：

```sh
vs build manuscript.md
vs preview document.md
vs create
```

頻繁に使う場合にキー入力を節約できます。

## ヘルプの参照

各コマンドの組み込みヘルプを参照できます：

```sh
vivliostyle help
vivliostyle help build
vivliostyle help preview
vivliostyle help create
```

各コマンドの利用可能なオプションと使用パターンの詳細情報が表示されます。

````
