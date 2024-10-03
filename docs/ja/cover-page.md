## 表紙ページの作成

構成ファイル `vivliostyle.config.js` に `cover: 'image.png'` のような指定がある場合、表紙 HTML ファイル `cover.html` が生成されて、出版物の表紙ページとして追加されます。

生成される表紙 HTML ファイルの内容は次のようになります。

```html
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Book Title</title>
    <style data-vv-style>
      body {
        margin: 0;
      }
      [role="doc-cover"] {
        display: block;
        width: 100vw;
        height: 100vh;
        object-fit: contain;
      }
      @page {
        margin: 0;
      }
    </style>
  </head>
  <body>
    <section role="region" aria-label="Cover">
      <img role="doc-cover" src="image.png" alt="Cover image" />
    </section>
  </body>
</html>
```

`cover` はオブジェクト形式でも指定でき、以下のようなプロパティが指定できます。

- `src` を指定すると、読み込ませる表紙画像を指定できます。
- `htmlPath` を指定すると、目次の HTML ファイルを `cover.html` 以外に出力します。また、`false` を設定することで表紙 HTML ファイルを出力させないこともできます。このようにした場合、PDFでの出力には表紙ページが含まれずに、EPUBやWebPub形式で出力した場合の表紙画像として設定されます。
- `name` を指定すると、カバー画像の代替テキストを変更します。

```js
cover: {
  src: 'image.png',
  htmlPath: 'toc.html',
  name: 'My awesome cover image',
},
```

### 表紙ページを出版物の先頭以外の場所に出力するには

構成ファイル `vivliostyle.config.js` の `entry` の配列の要素として `{ rel: 'cover' }` を指定すると、その位置に表紙 HTML ファイルが生成されます。

```js
entry: [
  'titlepage.md',
  { rel: 'cover' },
  'chapter1.md',
  ...
],
cover: 'image.png',
```

これで、出版物の先頭の HTML ファイルは `titlepage.html` で、その次に目次の HTML ファイル `cover.html` という順番になります。

また、複数の表紙ページを追加することもできます。以下の例は、最初と最後のページにそれぞれ別の表紙ページを追加する例です。

```js
entry: [
  {
    rel: 'cover',
    output: 'front-cover.html',
  },
  ...
  {
    rel: 'cover',
    output: 'back-cover.html',
    imageSrc: 'back.png',
  },
],
cover: 'front.png',
```

### 表紙ページをカスタマイズするには

* [Example: customize-generated-content](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/customize-generated-content)

表紙ページをカスタマイズするには、次のように構成ファイルの `entry` の配列の要素として目次のファイルの `path` と `output`、`rel: 'contents'` を指定してください。

```js
entry: [
  {
    path: 'cover-template.html',
    output: 'cover.html',
    rel: 'cover'
  },
  ...
],
```

そして、表紙のテンプレートとなる HTML ファイル `cover-template.html` を用意してください。`cover-template.html` の中に `<img role="doc-cover" />` というタグを用意することで、その部分に表紙画像が挿入された上で表紙の HTML ファイルが `cover.html` に出力されます。
