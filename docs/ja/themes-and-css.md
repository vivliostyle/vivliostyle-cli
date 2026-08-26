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

`-T`（`--theme`）オプション、または [構成ファイル](./using-config-file.md) で `theme` を指定するとテーマを利用できます。ローカルにテーマファイルが存在しない場合、初回実行時に自動的にインストールされます。

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

上記の設定はすべて構成ファイルで指定できます。また、複数使用することもできます。

```js
theme: [
  '@vivliostyle/theme-techbook',
  './my-theme',
],
```

### CSS からのテーマの読み込み

`themes` ディレクトリへの相対パスを書く代わりに、CSS ファイルから npm パッケージ名でテーマを直接読み込むことができます:

```css
@import '@vivliostyle/theme-base';
@import '@vivliostyle/theme-base/css/partial/footnote.css';

h1 {
  /* 独自のカスタマイズ */
}
```

ただし、この方法は単にテーマを利用したいだけであれば通常必要ありません。一般的には、他のテーマを拡張した新しいテーマを作成したいケースで必要となります。

パッケージ名のみを指定した場合、そのパッケージの package.json の `vivliostyle.theme.style`、`style`、`exports`（`style` コンディション）、`main` フィールドをこの順で参照し、既定のスタイルファイルを読み込みます。サブパスを指定した場合は指定したファイルを読み込みます。パッケージが `exports` フィールドを宣言している場合、サブパスは `exports` を通して解決されます。

読み込むパッケージは事前にインストールされている必要があります。`themes` オプションによる指定とは異なり、Vivliostyle CLI が CSS から参照されたパッケージを自動でインストールすることはありません。使用したいパッケージは `npm install` コマンドでインストールしてください。

`.css` 拡張子を持つ既存のファイルを指す指定子は、相対 URL として標準の CSS の扱いが保たれます。例えば `@import 'foo.css'` は、読み込み元のスタイルシートの隣に foo.css が存在する場合、その相対パスのファイルを参照します。それ以外の指定子は npm パッケージとして解決されます。同じパッケージがプロジェクトと `themes` ディレクトリの両方にインストールされている場合、`themes` ディレクトリのものが優先されます。

### Create Book の利用

Create Book を使用すると、あらかじめテーマが設定された状態のプロジェクトを簡単に作成できます。[Create Book](https://docs.vivliostyle.org/ja/cli/getting-started/) を参照してください。

## PostCSS の利用

プロジェクトに [PostCSS](https://postcss.org/) の設定ファイルがある場合、Vivliostyle CLI が処理するすべての CSS ファイルにそのプラグインが適用されます。

PostCSS の設定ファイルは、[構成ファイル](./using-config-file.md) と同じディレクトリに配置してください。[postcss-load-config](https://github.com/postcss/postcss-load-config) がサポートする形式の設定（例: `postcss.config.js`）を読み込めます。この設定は、利用しているテーマパッケージの CSS ファイルにも適用されます。

## Tailwind CSS

- [Example: with-tailwindcss](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/with-tailwindcss)

PostCSS のプラグインを通して、[Tailwind CSS](https://tailwindcss.com/) などの CSS フレームワークを利用することもできます。

Tailwind CSS 公式ドキュメントの [Using PostCSS](https://tailwindcss.com/docs/installation/using-postcss) のセクションに従ってセットアップしてください。

> [!NOTE]
> 現時点の Vivliostyle.js には、Tailwind CSS が出力する一部のセレクター（`:host` など）を含むスタイルを正しく読み込めないバグがあるため、当面は以下のような小さなプラグインを併用する必要があります。この問題は近日中に解決される見込みです。
>
> ```js
> import tailwindcss from '@tailwindcss/postcss';
>
> const unsupportedSelector = /:host|::backdrop|::file-selector-button/;
> const stripUnsupportedSelectors = {
>   postcssPlugin: 'strip-unsupported-selectors',
>   OnceExit(root) {
>     root.walkRules(unsupportedSelector, (rule) => {
>       const selectors = rule.selectors.filter(
>         (s) => !unsupportedSelector.test(s),
>       );
>       if (selectors.length > 0) {
>         rule.selectors = selectors;
>       } else {
>         rule.remove();
>       }
>     });
>   },
> };
>
> export default {
>   plugins: [tailwindcss(), stripUnsupportedSelectors],
> };
> ```

Tailwind CSS は、ユーティリティクラスと呼ばれるクラスを要素に指定して、クラス名に応じたスタイルを適用するフレームワークです。VFM と組み合わせる場合は、以下のように [VFM の属性記法](https://vivliostyle.github.io/vfm/#/vfm) でクラスを指定できます。Tailwind が原稿ファイルをスキャンし、使われているクラスに対応するスタイルを生成します。

```md
# Vivliostyle meets Tailwind CSS {.text-4xl .font-extrabold .tracking-tight .text-accent}

This document is styled with [Tailwind CSS](https://tailwindcss.com/) utility classes.
Tailwind scans this Markdown file for class names, so you can attach utilities to
inline elements with the **VFM attribute syntax**{.bg-accent/15 .px-1 .rounded} like
`**text**{.underline}`.
```

Tailwind CSS は強力なツールですが、Vivliostyle が主な対象とする文章中心のドキュメントは Web ページと異なる点も多く、ユーティリティクラスによる指定が文章の制作に合うかどうかはあなたの執筆スタイルによります。とはいえ、本文中でアドホックなスタイルを多用したい場合には、有力な選択肢となるでしょう。
