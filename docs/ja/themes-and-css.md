# テーマと CSS

原稿に対してフォントや文字の大きさなどの装飾を加えるには、カスケーディングスタイルシート（CSS）を適用します（HTMLファイルと同様のやり方です）。

## スタイルシートの追加の指定

HTMLファイルに指定されているスタイルシートに加えて、追加のスタイルシート（CSSファイル）を使うには、`--style` オプションでスタイルシートを指定します。

```
vivliostyle build example.html --style additional-style.css
```

この方法で指定したスタイルシートは、HTMLファイルで指定されているスタイルシートと同様（[作成者スタイルシート](https://developer.mozilla.org/ja/docs/Web/CSS/Cascade#%E4%BD%9C%E6%88%90%E8%80%85%E3%82%B9%E3%82%BF%E3%82%A4%E3%83%AB%E3%82%B7%E3%83%BC%E3%83%88)）の扱いで、よりあとに指定されたことになるので、CSSのカスケーディング規則により、HTMLファイルからのスタイルの指定を上書きすることになります。

### ユーザースタイルシートの指定

[ユーザースタイルシート](https://developer.mozilla.org/ja/docs/Web/CSS/Cascade#%E3%83%A6%E3%83%BC%E3%82%B6%E3%83%BC%E3%82%B9%E3%82%BF%E3%82%A4%E3%83%AB%E3%82%B7%E3%83%BC%E3%83%88)を使うには、`--user-style` オプションでスタイルシートを指定します。（ユーザースタイルシートは、スタイル指定に `!important` を付けないかぎり、制作者スタイルシートのスタイル指定を上書きしません。）

```
vivliostyle build example.html --user-style user-style.css
```

### CSS の内容を直接指定

`--css` オプションを指定すると、追加したいスタイルシートを直接 CSS のテキストで渡すことができます。このオプションは、簡単なスタイルシートや CSS 変数を設定するのに便利です。

```
vivliostyle build example.html --css "body { background-color: lime; }"
```

### ページサイズの指定

`-s` (`--size`) オプションでページサイズを指定できます。指定できるサイズは、A5, A4, A3, B5, B4, JIS-B5, JIS-B4, letter, legal, ledger のいずれか、またはコンマで区切って幅と高さを指定します。

```
vivliostyle build paper.html -s A4 -o paper.pdf
vivliostyle build letter.html -s letter -o letter.pdf
vivliostyle build slide.html -s 10in,7.5in -o slide.pdf
```

このオプションは、`--css "@page { size: <size>; }"` と同等です。

### トンボ（crop marks）の指定

`-m` (`--crop-marks`) オプションを指定すると、出力されるPDFにトンボ（印刷物の裁断位置を示す目印）が追加されます。

```
vivliostyle build example.html -m
```

`--bleed` オプションでトンボを追加したときの塗り足し幅を指定することができます。また、`--crop-offset` オプションで裁ち落とし線から外側の幅を指定することができます。

```
vivliostyle build example.html -m --bleed 5mm
vivliostyle build example.html -m --crop-offset 20mm
```

このオプションは、`--css "@page { marks: crop cross; bleed: <bleed>; crop-offset: <crop-offset>; }"` と同等です。

## Vivliostyle Themes について

- [Vivliostyle Themes](https://vivliostyle.github.io/themes/)

Vivliostyle Themes は、Vivliostyle で出版物を作る際に使う公式のスタイルテーマ集です。Vivliostyle Themes を参照することで、自分でCSSを用意することなくスタイルを適用することができます。

### テーマを見つける

npm パッケージとして公開されているテーマを見つけるには [npm](https://www.npmjs.com/) でキーワード "vivliostyle-theme" を検索してください:

- [List of Themes (npm)](https://www.npmjs.com/search?q=keywords%3Avivliostyle-theme)

### テーマの利用

- [Example: theme-css](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/theme-css)
- [Example: theme-preset](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/theme-preset)

`-T`（`--theme`）オプション、または [構成ファイル](./using-config-file.md) で `theme` を指定するとテーマを利用できます。ローカルにテーマファイルが存在しない場合、初回実行時に `themes` ディレクトリに自動的にインストールされます。

```
vivliostyle build manuscript.md --theme @vivliostyle/theme-techbook -o paper.pdf
```

また、ローカル環境にあるテーマを利用することもできます。単一の CSS ファイルであれば、以下のように直接 CSS ファイルを指定します。

```
vivliostyle build manuscript.md --theme ./my-theme/style.css -o paper.pdf
```

また、ローカル環境に npm に準拠した `package.json` ファイルがある場合、そのディレクトリにある Vivliostyle Theme を読み込むこともできます。以下は `my-theme` ディレクトリに Vivliostyle Theme として利用可能なパッケージが配置されているときの例です。

```
vivliostyle build manuscript.md --theme ./my-theme -o paper.pdf
```

### Create Book の利用

Create Book を使用すると、あらかじめテーマが設定された状態のプロジェクトを簡単に作成できます。[Create Book](https://docs.vivliostyle.org/#/ja/create-book) を参照してください。
