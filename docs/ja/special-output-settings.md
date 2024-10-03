# 特別な出力設定

## EPUB 形式の出力

`vivliostyle build` コマンドに `-f` (`--format`）オプションで `epub` を指定する、または `-o`（`--output`）オプションで `.epub` 拡張子をつけて指定するとEPUBを出力します。

EPUB 形式で出力する場合、目次を設定した状態で出力することが推奨されます。[目次の作成](./toc-page.md) を参考にして、構成ファイルに `toc` を設定した上で、以下のように出力オプションで EPUB を設定します。

```
vivliostyle build -o output.epub
```

また、次のように1回の `vivliostyle build` コマンドで PDF と EPUB の両方を生成することもできます（他の出力形式も同様です）。

```
vivliostyle build -o pdfbook.pdf -o epubbook.epub
```

Vivliostyle CLI では、EPUB 3 に準拠した EPUB ファイルを生成します。一方で、EPUB に適用する CSS ファイル自体はそのままの状態で出力されるため、EPUB ビューワーによっては表示に問題が発生する可能性があります。より多くの EPUB ビューワーに対応するためには、それぞれのビューワーに対応したテーマやCSSファイルを適用するようにしてください。日本語向けの EPUB の場合、[電書協 EPUB3 制作ガイド](https://dpfj.or.jp/counsel/guide) に準拠した Vivliostyle Theme ["@vivliostyle/theme-epub3j"](https://github.com/vivliostyle/themes/tree/main/packages/%40vivliostyle/theme-epub3j) を用意しています。

## Web 出版物（WebPub）の出力

`vivliostyle build` コマンドに `-f` (`--format`） オプションで `webpub` を指定すると、Web 出版物 (WebPub) を生成します。出力先 `-o` (`--output`) オプションには WebPub を配置するディレクトリを指定します。

```
vivliostyle build -o webpub/ -f webpub
```

生成された WebPub ディレクトリ内には出版物マニフェスト `publication.json` ファイルがあり、コンテンツの HTML ファイルの読み込み順などの情報が記述されています。これは W3C 標準仕様である [Publication Manifest](https://www.w3.org/TR/pub-manifest/) に準拠しています。

WebPub は、Web 上で読むことができる出版物を作るのに使えます。また、次のように `publication.json` ファイルを `vivliostyle build` コマンドに指定することで、WebPub から PDF を生成することができます。

```
vivliostyle build webpub/publication.json -o pdfbook.pdf
```

## 印刷用 PDF（PDF/X-1a 形式）の生成

- [Example: preflight](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/preflight)

`vivliostyle build` コマンドの `--preflight press-ready` オプション、または [構成ファイル](./using-config-file.md) で `preflight: 'press-ready'` を指定すると印刷入稿に適した PDF/X-1a 形式で出力することができます。この機能を使うためには、事前に [Docker](https://docs.docker.jp/get-docker.html) のインストールが必要です。

`--preflight-option` オプションを指定すると、この処理を実行する [press-ready](https://github.com/vibranthq/press-ready) に対してオプションを追加できます。

```
# グレースケール化して出力
vivliostyle build manuscript.md --preflight press-ready --preflight-option gray-scale
# フォントを強制的にアウトライン化して出力
vivliostyle build manuscript.md --preflight press-ready --preflight-option enforce-outline
```

また、`--preflight press-ready-local` オプションを指定すると、PDF/X-1a 形式への出力をローカル環境で実行します。ただし、通常は Docker 環境上で実行することをおすすめします。

## Docker を利用した生成

- [Example: render-on-docker](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/render-on-docker)

`vivliostyle build` コマンドで `--render-mode docker` オプションを指定すると、PDF 出力時の環境として Docker を指定できます（上記のオプションでは後処理のみ Docker 上で実行しますが、このオプションは全ての処理を Docker 上で実行します）Docker を用いることで出力時の環境を固定できるため、異なる環境・OSでも同じ出力結果となることを保証できます。

Docker render mode を使用する際は、以下の点に注意してください。
- Docker はホスト環境から隔離されているため、ホストにインストールされているフォントを利用することができません。Docker コンテナで標準で使用できるフォントは限られており、通常はローカルのフォントファイルを配置して CSS で指定するか、Google Fonts などの Web フォントを使用する必要があります。
- Docker にマウントされるファイルはプロジェクトの workspace directory （通常は `vivliostyle.config.js` を含むディレクトリ）のみで、その他のファイルは Docker コンテナ内部から参照することができない。イメージなどドキュメント内で参照されるファイルは全て workspace directory に含める必要があります。

## PDF の「しおり」(Bookmarks) の生成

`vivliostyle build` コマンドで出力される PDF には、目次の内容が「しおり」(PDF Bookmarks) として生成されます。PDF の「しおり」は、Adobe Acrobat のような PDF 閲覧ソフトで目次ナビゲーションに利用できます。

この「しおり」生成機能は、出版物に目次が含まれるときに有効になります。[EPUB から PDF を生成](./getting-started.md#他の形式から-pdf-を生成) する場合には、EPUB に含まれる目次が使われます。それ以外については [目次の作成](./toc-page.md) を参照してください。
