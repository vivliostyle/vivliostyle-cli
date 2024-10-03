# 目次の作成

- [Example: table-of-contents](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/table-of-contents)

構成ファイル `vivliostyle.config.js` に `toc: true` の指定がある場合、目次 HTML ファイル `index.html` が生成されて、それが出版物の先頭のファイルになります。

生成される目次 HTML ファイルの内容は次のようになります。目次 HTML の `title` と `h1` 要素には、出版物のタイトル（構成ファイルの `title` で指定）が出力されます。

```html
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Book Title</title>
    <link href="publication.json" rel="publication" type="application/ld+json" />
    <link href="style.css" rel="stylesheet" type="text/css" />
  </head>
  <body>
    <h1>Book Title</h1>
    <nav id="toc" role="doc-toc">
      <h2>Table of Contents</h2>
      <ol>
        <li><a href="prologue.html">Prologue</a></li>
        <li><a href="chapter1.html">Chapter 1</a></li>
        <li><a href="chapter2.html">Chapter 2</a></li>
        <li><a href="chapter3.html">Chapter 3</a></li>
        <li><a href="epilogue.html">Epilogue</a></li>
      </ol>
    </nav>
  </body>
</html>
```

`toc` はオブジェクト形式でも指定でき、以下のプロパティが指定できます。

- `htmlPath` を指定すると、目次の HTML ファイルを `index.html` 以外に出力します。
- `title` を指定すると、目次タイトル（`nav` 要素内の見出し `h2` 要素の内容 "Table of Contents"）を変更します。
- 目次には各エントリーへの参照以外にも、エントリー内の見出しも目次に含めることができます。そのようにしたい場合、`sectionDepth` に `1` から `6` の値（それぞれ `h1` から `h6` までのどのレベルを含めるか）を指定します。

```js
toc: {
  htmlPath: 'toc.html',
  title: 'Contents',
  sectionDepth: 6,
},
```

## 目次を出版物の先頭以外の場所に出力するには

構成ファイル `vivliostyle.config.js` の `entry` の配列の要素として `{ rel: 'contents' }` を指定すると、その位置に目次 HTML ファイルが生成されます。

```js
entry: [
  'titlepage.md',
  { rel: 'contents' },
  'chapter1.md',
  ...
],
toc: 'toc.html',
```

これで、出版物の先頭の HTML ファイルは `titlepage.html` で、その次に目次の HTML ファイル `toc.html` という順番になります。

## 目次をカスタマイズするには

* [Example: customize-generated-content](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/customize-generated-content)

目次をカスタマイズするには、次のように構成ファイルの `entry` の配列の要素として目次のファイルの `path` と `output`、`rel: 'contents'` を指定してください。

```js
entry: [
  {
    path: 'toc-template.html',
    output: 'index.html',
    rel: 'contents'
  },
  ...
],
```

そして、目次のテンプレートとなる HTML ファイル `toc-template.html` を用意してください。`toc-template.html` の中に `<nav role="doc-toc"></nav>` というタグを用意することで、その部分に目次の項目が挿入された上で目次の HTML ファイルが `index.html` に出力されます。

詳しい目次の作り方については [W3C Publication Manifest](https://www.w3.org/TR/pub-manifest/) 仕様に付属の [Machine-Processable Table of Contents](https://www.w3.org/TR/pub-manifest/#app-toc-structure) を参照してください。
