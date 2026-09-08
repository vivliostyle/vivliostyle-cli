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

> [!WARNING]
> `renderMode: docker` オプション（`--render-mode docker`）は非推奨となり、将来のメジャーリリースで削除される可能性があります。背景やフィードバックについては [#823](https://github.com/vivliostyle/vivliostyle-cli/issues/823) を参照してください。

`vivliostyle build` コマンドで `--render-mode docker` オプションを指定すると、PDF 出力時の環境として Docker を指定できます（上記のオプションでは後処理のみ Docker 上で実行しますが、このオプションは全ての処理を Docker 上で実行します）Docker を用いることで出力時の環境を固定できるため、異なる環境・OSでも同じ出力結果となることを保証できます。

Docker render mode を使用する際は、以下の点に注意してください。
- Docker はホスト環境から隔離されているため、ホストにインストールされているフォントを利用することができません。Docker コンテナで標準で使用できるフォントは限られており、通常はローカルのフォントファイルを配置して CSS で指定するか、Google Fonts などの Web フォントを使用する必要があります。
- Docker にマウントされるファイルはプロジェクトの workspace directory （通常は `vivliostyle.config.js` を含むディレクトリ）のみで、その他のファイルは Docker コンテナ内部から参照することができない。イメージなどドキュメント内で参照されるファイルは全て workspace directory に含める必要があります。

## PDF の「しおり」(Bookmarks) の生成

`vivliostyle build` コマンドで出力される PDF には、目次の内容が「しおり」(PDF Bookmarks) として生成されます。PDF の「しおり」は、Adobe Acrobat のような PDF 閲覧ソフトで目次ナビゲーションに利用できます。

この「しおり」生成機能は、出版物に目次が含まれるときに有効になります。[EPUB から PDF を生成](./getting-started.md#他の形式から-pdf-を生成) する場合には、EPUB に含まれる目次が使われます。それ以外については [目次の作成](./toc-page.md) を参照してください。

## CMYK

- [Example: cmyk](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/cmyk)

`vivliostyle.config.js` の `pdfPostprocess.cmyk` に `true` または設定オブジェクトを指定すると、CMYK カラーの PDF を出力できます。

```js
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  entry: ['manuscript.html'],
  pdfPostprocess: {
    cmyk: true,
  },
});
```

この機能は、原稿で指定した CMYK 値や別途用意した画像を PDF に反映するための後処理です。設定するだけで印刷条件に適した色が得られるわけではなく、指定する色と PDF の描画構造を把握して使う必要があります。[印刷用 PDF（PDF/X-1a 形式）の生成](#印刷用-pdfpdfx-1a-形式の生成) とは連携していません。

### 色置換の仕組みと対象

Vivliostyle の PDF 出力では、Vivliostyle.js と Vivliostyle Viewer が Web ブラウザ上に紙面を組み立て、Vivliostyle CLI が Web ブラウザの PDF 出力機能を使ってその紙面を保存します。CMYK 機能は、CMYK 値をいったんブラウザで表示可能な RGB 値に置き換え、PDF を書き出したあとで元の CMYK 値に置換します。この処理は Chromium／Chrome と、その描画エンジンである Skia が `color(srgb ...)` の値を PDF に反映することを前提としています。以下での「Web ブラウザ」は、この Chromium／Chrome を指します。

PDF 内の描画構造によって、利用できる処理が異なります。

| PDF 内の描画構造 | 原稿での例 | 対応する処理 |
| --- | --- | --- |
| ベクターグラフィック | テキスト、ボーダー、背景色、SVG のベクター要素 | `cmyk` による色置換 |
| ラスターグラフィック | `img` などで配置したラスター画像、ブラウザがラスター化した要素 | `replaceImage` による画像置換 |
| シェーディング | CSS や SVG のグラデーション | 変換対象外 |

同じ要素でも、フィルターなどの指定によってブラウザがラスター化する場合があります。CSS で色を指定した要素が、すべて色置換の対象になるわけではありません。

また、色置換は PDF 内の RGB 値を対象とするため、原稿での RGB 指定と CMYK 指定を区別できません。たとえば `rgb(0 0 0)` と `device-cmyk(0 0 0 1)` を併用すると、色置換の対象となる RGB 黒も K100 に置換されます。RGB と CMYK を任意に併用する用途は想定していません。

### CSS での CMYK 指定

CSS では [`device-cmyk()`](https://drafts.csswg.org/css-color-5/#device-cmyk) で CMYK 値を指定できます。各成分は 0〜1 の数値、または 0%〜100% の百分率で指定します。

```css
body {
  color: device-cmyk(0 0 0 1);
}

h1 {
  color: device-cmyk(100% 0% 0% 0%);
}
```

Vivliostyle は CSS の `device-cmyk()` を収集し、ブラウザ表示用の RGB 値と CMYK 値の対応表を作成します。`pdfPostprocess.cmyk` が有効であれば、PDF 出力後にこの対応表で色を置換します。プレビューは置換前の RGB 表示です。

### SVG などの RGB 色の予約

SVG のベクター要素も色置換の対象ですが、SVG 内の CSS や属性に書かれた `device-cmyk()` は収集されません。SVG で使う RGB 値と出力したい CMYK 値の組を `pdfPostprocess.cmyk.reserveMap` に登録してください。

```js
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  entry: ['manuscript.html'],
  pdfPostprocess: {
    cmyk: {
      reserveMap: [
        ['#80ffff', { c: 5000, m: 0, y: 0, k: 0 }],
        ['#808080', { c: 0, m: 0, y: 0, k: 5000 }],
        ['#408080', { c: 5000, m: 0, y: 0, k: 5000 }],
      ],
    },
  },
});
```

この例では、SVG 内の `#80ffff` を C50、`#808080` を K50、`#408080` を C50＋K50 に置換します。RGB 値には `#80ffff` のような 16 進色表記のほか、`{ r: 5000, g: 10000, b: 10000 }` のようなオブジェクトも指定できます。オブジェクトで指定する RGB と CMYK の各成分は 0〜10000 の整数値で、5000 が 50% に対応します。色置換では PDF 内の RGB 値をこの単位に丸めて照合します。

複数の RGB 値に同じ CMYK 値を割り当てることは可能です。

### 対応表にない RGB 色の変換

`pdfPostprocess.cmyk.fallback` は、`device-cmyk()` と `reserveMap` の対応表にない RGB 色を変換します。変換関数は `{ r, g, b }` を受け取り、`{ c, m, y, k }` を返します。いずれも各成分は 0〜10000 の整数値です。変換しない場合は `null` を返します。非同期関数にも対応しています。

```js
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  entry: ['manuscript.html'],
  pdfPostprocess: {
    cmyk: {
      fallback: ({ r, g, b }) => {
        if (r === 1686 && g === 1686 && b === 1686) {
          return { c: 0, m: 0, y: 0, k: 8300 };
        }
        return null;
      },
      ifUnmappedColorsFound: 'error',
    },
  },
});
```

この例では、PDF 内で各成分が 1686 となる RGB 色（`#2b2b2b` 相当）を K83 に変換し、それ以外に対応表にない RGB 色があればエラーにします。

使用色をすべて把握できない SVG などには、`@vivliostyle/cli` からインポートできる次の関数で自動変換を指定できます。出力したい CMYK 値が決まっている場合は、`device-cmyk()`、`reserveMap`、または `fallback` で値を指定してください。自動変換の結果が、意図したインクの配分になるとは限りません。

| 関数 | 変換内容 |
| --- | --- |
| `createBuiltinCmykConversion()` | MuPDF の組み込み変換で CMYK に変換 |
| `createBuiltinGrayConversion()` | グレースケールに変換し、K 成分に割り当て |
| `createIccConversion({ outputProfile })` | 指定した ICC プロファイルで変換。CMYK または Gray プロファイルを受け付け、Gray の場合は K 成分に割り当て |

たとえば `createBuiltinCmykConversion` をインポートし、`fallback: createBuiltinCmykConversion()` と指定します。ICC プロファイルの指定例は、後述の「ICC プロファイルと出力インテント」を参照してください。

### 画像の置換

`pdfPostprocess.replaceImage` は、PDF 内の画像を別の画像に差し替えます。CMYK 以外への置換にも使えるため、`cmyk` の外側に設定し、`cmyk` が無効でも利用できます。

原稿にはブラウザで表示可能な RGB 画像を配置し、その RGB 画像を `source` に、差し替える CMYK 画像を `replacement` に指定します。

CMYK JPEG を原稿に配置した場合、ブラウザでは表示できても、PDF には RGB に変換された画像が埋め込まれます。原稿に直接配置するだけでは、CMYK 値を維持できません。画像置換の照合でも、元の CMYK JPEG と PDF 内の RGB 画像は一致しないため、CMYK JPEG を `source` に指定してもマッチしません。CMYK JPEG を使う場合は、表示と照合に使う RGB 版を別途用意し、CMYK JPEG 自体は `replacement` に指定してください。

```js
import {
  createBuiltinGrayConversionReplacement,
  defineConfig,
} from '@vivliostyle/cli';

export default defineConfig({
  entry: ['manuscript.html'],
  pdfPostprocess: {
    cmyk: true,
    replaceImage: [
      { source: /^(.*)_rgb\.png$/, replacement: '$1_cmyk.tiff' },
      createBuiltinGrayConversionReplacement(),
    ],
  },
});
```

`source` にはローカル画像のパスまたは正規表現を指定します。正規表現は `entryContext` 以下の相対ファイルパスに対して適用され、`replacement` の文字列では `$1` などのキャプチャを参照できます。画像の相対パスの基準は `entryContext`です。

この例では、まず `ck_rgb.png` などの画像を対応する `ck_cmyk.tiff` に置換し、置換されなかった画像をグレースケールに変換します。置換候補は配列の順番に試され、置換が成立した画像に後続の候補は適用されません。ファイルによる置換は、PDF 内のファイル名ではなく、画像の寸法と画素を照合します。ブラウザがフィルター処理後の画像や、`object-view-box` で切り抜いた画像を PDF に埋め込んだ場合、元画像と一致しなくなることがあります。

`replacement` にはパスのほか、置換関数を指定できます。自動変換には次の関数を利用できます。関数による置換は、`source` を指定せず、上の例のように配列に直接並べることもできます。ローカルの元画像がない URL 画像や、ブラウザがラスター化した画像にも、この方法で変換を適用できます。

| 関数 | 変換先 |
| --- | --- |
| `createBuiltinCmykConversionReplacement()` | DeviceCMYK |
| `createBuiltinGrayConversionReplacement()` | DeviceGray |
| `createBuiltinRgbConversionReplacement()` | DeviceRGB |
| `createIccConversionReplacement({ outputProfile })` | ICC プロファイルに対応する DeviceCMYK、DeviceGray、DeviceRGB |

置換関数は `{ image, mupdf }` を受け取り、渡された `mupdf` で作成した画像、または `null` を返します。`null` を返すと次の候補を試します。非同期関数も利用できます。画像の所有権と破棄については [ReplaceFunction](../api-javascript.md#replacefunction) と [ReplaceFunctionContext](../api-javascript.md#replacefunctioncontext) を参照してください。

### 未変換の色と画像の検出

`pdfPostprocess.cmyk` では、未変換の色と画像に対する処理を個別に設定できます。

| 設定 | 検出対象 |
| --- | --- |
| `ifUnmappedColorsFound` | 対応表と `fallback` で変換できなかった RGB 色指定 |
| `ifIncompatibleImagesFound` | 画像走査で見つかった、色空間が DeviceCMYK または DeviceGray ではない画像 |

どちらも `"warn"`（警告、既定値）、`"error"`（ビルドエラー）、`"ignore"`（報告しない）を指定できます。画像の検査は置換後の画像にも適用され、`replaceImage` が未設定でも実行されます。`cmyk` を無効にすると、この画像の検査も無効になります。

これらは変換処理の対象を検査する設定であり、シェーディングを含む PDF 全体の色空間や、印刷条件への適合性を保証するものではありません。出力 PDF は別途確認してください。たとえば Ghostscript の [`ink_cov`](https://ghostscript.readthedocs.io/en/latest/Devices.html#ink-coverage-output) でページごとの CMYK インク量を確認できます。1C や 2C 印刷では、使用しないはずのインクの混入を確認できます。CMYK 4 色印刷では、この出力から RGB 要素の残存を判定することはできません。

```sh
gs -dQUIET -dBATCH -dNOPAUSE -sOutputFile=- -sDEVICE=ink_cov output.pdf
```

### ICC プロファイルと出力インテント

`pdfPostprocess.outputIntent` は、指定した ICC プロファイルを PDF の出力インテントとして埋め込みます。プロファイルと PDF 内容の整合性は検証しません。

出力インテントで示す出力条件に合わせて自動変換する場合は、変換関数の `outputProfile` に同じプロファイルを指定します。変換結果は、その出力条件に対応するデバイス色になります。

```js
import {
  createIccConversion,
  createIccConversionReplacement,
  defineConfig,
} from '@vivliostyle/cli';

export default defineConfig({
  entry: ['manuscript.html'],
  pdfPostprocess: {
    cmyk: {
      fallback: createIccConversion({ outputProfile: './print-cmyk.icc' }),
    },
    replaceImage: [
      createIccConversionReplacement({ outputProfile: './print-cmyk.icc' }),
    ],
    outputIntent: './print-cmyk.icc',
  },
});
```

`device-cmyk()` や `reserveMap` で指定した CMYK 値は DeviceCMYK として出力されるため、ICC 変換は不要です。`createIccConversion` は、`fallback` に渡された RGB 値を `outputProfile` に基づいて DeviceCMYK 値へ変換します。`createIccConversionReplacement` は画像を変換し、結果をプロファイルに対応する Device 色空間で出力します。変換先の ICC プロファイル自体は画像には埋め込みません。

自動変換の各関数には、`inputProfile` も指定できます。これはプロファイルを持たない DeviceRGB、DeviceGray、DeviceCMYK の入力を解釈するための ICC プロファイルで、入力と同じ色空間である必要があります。`cmyk.fallback` の入力は常に RGB です。画像がすでに ICC プロファイルを持っている場合は、そのプロファイルが使われます。

`inputProfile`、`outputProfile`、`outputIntent` の相対パスの基準は `entryContext`です。
