# 構成ファイル

複数の記事や章ごとのファイルをまとめて１つの出版物を構成するには、構成ファイルを利用します。`vivliostyle build` または `vivliostyle preview` コマンドを実行するとき、カレントディレクトリに構成ファイル `vivliostyle.config.js` があるとそれが使われます。また、`vivliostyle.config.json` というファイル名で [JSONC](https://code.visualstudio.com/docs/languages/json#_json-with-comments)（コメント付きJSON）形式で構成ファイルを作成することもできます。

## 構成ファイルの作成

次のコマンドで構成ファイル `vivliostyle.config.js` を作成することができます。

```
vivliostyle init
```

これでカレントディレクトリに `vivliostyle.config.js` が生成されます。作成される `vivliostyle.config.js` ファイルは以下のようなものです。

```js
// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: 'My Book Title',
  author: 'John Doe',
  language: 'en',
  image: 'ghcr.io/vivliostyle/cli:latest',
  entry: ['manuscript.md'],
});
```

## 構成ファイルの設定内容

構成ファイルの設定内容についてはファイル内のコメント（`//` ではじまる）に説明があります。それぞれの項目について主要な設定内容を紹介します。すべての設定内容については [Config Reference](../config.md) を参照してください。

- **title**: 出版物のタイトル（例: `title: 'Principia'`）
- **author**: 著者名（例: `author: 'Isaac Newton'`）
- **language**: 言語（例: `language: 'en'`）。この指定があると HTML の `lang` 属性に反映されます。
- **size**: ページサイズ（例: `size: 'A4'`）。指定方法は [ページサイズの指定](./themes-and-css.md#ページサイズの指定) を参照してください。
- **theme**: ドキュメント全体に適用する [Vivliostyle Themes](./themes-and-css.md#vivliostyle-themes-について) のパッケージ名、または CSS ファイルのパスを指定します。以下の値を指定することができ、複数のテーマを配列形式で指定することもできます。
  - npm スタイルのパッケージ名（例: `@vivliostyle/theme-techbook`, `./local-pkg`）
  - 単一の CSS を指定する URL やローカルファイルのパス（例: `./style.css`, `https://example.com/style.css`）
- **entry**: 入力の Markdown または HTML ファイルの配列を指定します。
  ```js
  entry: [
    {
      path: 'about.md',
      title: 'About This Book',
      theme: 'about.css'
    },
    'chapter1.md',
    'chapter2.md',
    'glossary.html'
  ],
  ```
  entry には文字列またはオブジェクト形式で入力の指定ができます。オブジェクト形式の場合、以下のプロパティを追加できます。
  - `path`: エントリーのパスを指定します。このプロパティは必須ですが、`rel: 'contents'` または `rel: 'cover'` を指定するときのみ不要です。この指定については、以下の項目を参照してください
    - [目次を出版物の先頭以外の場所に出力するには](./toc-page.md#目次を出版物の先頭以外の場所に出力するには)
    - [表紙ページを出版物の先頭以外の場所に出力するには](./cover-page.md#表紙ページを出版物の先頭以外の場所に出力するには)
  - `title`: エントリーのタイトルを指定します。このプロパティを設定しない場合、エントリーの内容からタイトルが取得されます。
  - `theme`: エントリーに適用する Vivliostyle Themes のパッケージ名、または CSS ファイルのパスを指定します。
- **output**: 出力先を指定。例: `output: 'output.pdf'`。デフォルトは `{title}.pdf`。次のように複数の出力を配列形式で指定することも可能です:
  ```js
  output: [
    './output.pdf',
    {
      path: './book',
      format: 'webpub',
    },
  ],
  ```
  output には文字列またはオブジェクト形式で出力の指定ができます。オブジェクト形式の場合、以下のプロパティを追加できます。
  - `path`: 出力先のパスを指定します。このプロパティは必須です。
  - `format`: 出力するフォーマットを指定します（指定可能なオプション: `pdf`, `epub`, `webpub`）EPUB出力については [EPUB 形式の出力](./special-output-settings.md#epub-形式の出力) を、WebPub 出力については [Web 出版物（WebPub）の出力](./special-output-settings.md#web-出版物webpubの出力) を参照してください。
- **workspaceDir**: 中間ファイルを保存するディレクトリを指定。この指定がない場合のデフォルトはカレントディレクトリであり、Markdown から変換された HTML ファイルは Markdown ファイルと同じ場所に保存されます。例: `workspaceDir: '.vivliostyle'`
- **toc**: このプロパティを指定すると、目次を含む HTML ファイル `index.html` が出力されます。詳しくは [目次の作成](./toc-page.md) を参照してください。
- **cover**: このプロパティを指定すると、表紙ページ用の HTML ファイル `cover.html` が出力されます。詳しくは [表紙ページの作成](./cover-page.md) を参照してください。
- **image**: 使用する Docker のイメージを変更します。詳細は [Dockerを利用した生成](./special-output-settings#docker-を利用した生成) を参照してください。

## 複数の入出力を一度に対応する

- [Example: multiple-input-and-output](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/multiple-input-and-output)

以上の構成ファイルのオプションは、配列で複数指定することができます。配列として設定すると、複数の入力・出力を一度に扱うことができて便利です。
以下の例は、`src` ディレクトリにある Markdown ファイルから同名の PDF ファイルに変換する構成ファイルです。

```js
const fs = require('fs');
const path = require('path');

const inputDir = path.join(__dirname, 'src');
const outputDir = path.join(__dirname, 'output');
const files = fs.readdirSync(inputDir);

const vivliostyleConfig = files
  .filter((name) => name.endsWith('.md'))
  .map((name) => ({
    title: `Article ${path.basename(name, '.md')}`,
    entry: name,
    entryContext: inputDir,
    output: path.join(outputDir, `${path.basename(name, '.md')}.pdf`),
  }));
module.exports = vivliostyleConfig;
```
