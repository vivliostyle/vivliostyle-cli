# はじめに

Vivliostyle CLI は、HTML やマークダウン文書を組版するためのコマンドラインインターフェイスです。[Vivliostyle Viewer](https://docs.vivliostyle.org/#/ja/vivliostyle-viewer) を内蔵し、出版物に適した高品質な PDF を生成します。

## Vivliostyle プロジェクトを作成する

次のいずれかのコマンドを実行してください。質問される内容に答えると、プロジェクトが自動的に作成されます。

```sh
npm create book
yarn create book # For yarn users
pnpm create book # For pnpm users
```

> [!NOTE]
> 事前に [Node.js](https://nodejs.org/) （v20以上）のインストールが必要です。BunやDenoなどNode.js以外のランタイムを使用する場合は、それぞれのランタイムの使用手順にしたがってください。

プロジェクトを作成すると、自動的に `vivliostyle.config.js` という名前の構成ファイルが作成されます。詳しい使用方法は [構成ファイル](./using-config-file.md) を参照してください。

## コミュニティーテンプレート

Vivliostyle CLIはデフォルトでMinimal、Basic、Documentation、Novel、Academic、Magazineのテンプレートを用意しています。もし使いたいVivliostyle Themeが独自のテンプレートを提供している場合、プロジェクト作成ステップで `Use templates from the community theme` を選ぶことでそのテンプレートからプロジェクトを作り始めることができます。

また、自分で用意したテンプレートを使用することもできます。`--template` オプションで指定したテンプレートをもとにプロジェクトを作成します。

```sh
npm create book -- --template gh:org/repo/templates/awesome-template
```

テンプレートの参照方法は [giget](https://github.com/unjs/giget#readme) のドキュメントを参照してください。

## マニュアルインストール

次のコマンドで Vivliostyle CLI をインストールできます。

```sh
npm install -g @vivliostyle/cli
```

上記のコマンドは、システム全体でVivliostyleを利用できるようにするものです。そうではなく、現在のディレクトリのみで Vivliostyle CLI を利用する場合、以下のようにします。

```sh
npm install @vivliostyle/cli
```

## PDF の生成

### HTML や Markdown から PDF を生成

`vivliostyle build` コマンドで HTML ファイルを指定すると、HTML から組版した結果の PDF ファイルが出力されます。デフォルトで出力される PDF ファイル名は "output.pdf" です。

```
vivliostyle build index.html
```

同様に、Markdown ファイルを指定すると Markdownから組版した結果の PDF ファイルが出力されます。

```
vivliostyle build manuscript.md -s A4 -o paper.pdf
```

Vivliostyle CLI で利用可能な Markdown 記法については、[VFM: Vivliostyle Flavored Markdown](https://vivliostyle.github.io/vfm/#/) を参照してください。

### 出力 PDF ファイルの指定

`-o` (`--output`) オプションで PDF ファイル名を指定できます。

```
vivliostyle build book.html -o book.pdf
```

### Web の URL の指定

ローカルの HTML ファイルのほか、Web の URL を指定することもできます。

```
vivliostyle build https://vivliostyle.github.io/vivliostyle_doc/samples/gutenberg/Alice.html -s A4 -o Alice.pdf
```

### 他の形式から PDF を生成

EPUB や 解凍された EPUB の OPF ファイル、`pub-manifest`（Web 出版物のマニフェスト JSON ファイル）、`webbook`（目次や Web 出版物のマニフェストへのリンクがある HTML ファイル）形式の読み込みに対応します。

```
vivliostyle build epub-sample.epub -o epub.pdf
vivliostyle build publication.json -o webpub.pdf
```

## 組版結果のプレビュー

`vivliostyle preview` コマンドで組版結果をブラウザでプレビューすることができます。プレビューを実行すると、ブラウザが立ち上がり組版結果を Vivliostyle Viewer で閲覧することができます。

```
vivliostyle preview index.html
vivliostyle preview manuscript.md
vivliostyle preview epub-sample.epub
```

### 多数の文書から構成される出版物をすばやくプレビュー

多数の文書から構成される出版物をすばやくプレビューするためには、`-q` (`--quick`) オプションを指定してください。このオプションでは大まかなページ数カウントを使って迅速に文書をロードします（ページ番号の出力は不正確になります）。

```
vivliostyle preview index.html --quick
vivliostyle preview publication.json --quick
vivliostyle preview epub-sample.epub --quick
```

## PDF 形式以外の出力

Vivliostyle CLI は PDF形式以外にも、EPUB 形式と Web 出版物（WebPub）の出力に対応します。詳細は [特別な出力設定](./special-output-settings.md) をご覧ください。

サポートする出力形式のマトリックスは以下の通りです。

| 入力 \ 出力                         | `pdf` | `webpub` | `epub` |
| ----------------------------------- | :---: | :------: | :----: |
| `pub-manifest`                      |  🔵   |    🔵    |   🔵   |
| `markdown`                          |  🔵   |    🔵    |   🔵   |
| `html` `webbook` (外部 HTML を含む) |  🔵   |    🔵    |   🔵   |
| `epub` `epub-opf`                   |  🔵   |    🙅    |   🙅   |

## その他のオプション

`vivliostyle help` コマンドで Vivliostyle CLI で利用可能なオプションの一覧を表示できます。

```
vivliostyle help
vivliostyle help init
vivliostyle help build
vivliostyle help preview
```

秘密の機能: `vivliostyle` というコマンドの代わりに `vs` というコマンド名でも使用できるので、タイプ数を少し減らせます。

以下もご覧ください:

- [Vivliostyle CLI (README)](https://github.com/vivliostyle/vivliostyle-cli/blob/main/README.md)
