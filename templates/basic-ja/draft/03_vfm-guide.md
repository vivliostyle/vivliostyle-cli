````markdown
# VFM: Vivliostyle Flavored Markdown

## VFM とは？

VFM（Vivliostyle Flavored Markdown）は、プロフェッショナルな出版に最適化された Markdown の方言です。標準的な Markdown を拡張し、高品質なドキュメントや出版物の作成に特化した機能を備えています。

VFM は CommonMark と GitHub Flavored Markdown をベースに、タイポグラフィ、数式、セマンティックなドキュメント構造のための機能を追加しています。

## Markdown の基本構文

VFM は標準的な Markdown の機能をすべてサポートしています：

### 見出し

```md
# 見出し 1

## 見出し 2

### 見出し 3
```

### テキストの書式

テキストを _イタリック_ や **太字** で強調できます。**_太字イタリック_** のように組み合わせることもできます。

### リスト

順序なしリスト：

- 項目1
- 項目2
  - ネストされた項目
  - もう1つのネストされた項目
- 項目3

順序付きリスト：

1. 第1ステップ
2. 第2ステップ
3. 第3ステップ

### リンクと画像

[ウェブサイトへのリンク](https://vivliostyle.org) や他のドキュメントへの参照を作成できます。

画像はキャプション付きで埋め込めます：

![サンプル図のキャプション](image-with-caption.webp)

### 引用

> これは引用です。複数行にわたることができ、重要な情報のハイライトや外部ソースの引用に便利です。
>
> 引用には複数の段落を含めることができます。

### コード

インラインコードは `const x = 42;` のように表示されます。

シンタックスハイライト付きのコードブロック：

```js
function greet(name) {
  return `Hello, ${name}!`;
}

console.log(greet('World'));
```

## VFM の拡張機能

### キャプション付きコードブロック

VFM ではコードブロックにキャプションを付けることができます：

```js:example.js
// キャプション付きのコードブロック
function calculateSum(a, b) {
  return a + b;
}
```

別の記法も使えます：

```python title=data_analysis.py
import pandas as pd

df = pd.read_csv('data.csv')
print(df.head())
```

### 数式

VFM は LaTeX 記法を使った数式表記に対応しています。

インライン数式：$E = mc^2$ という式は質量とエネルギーの等価性を表しています。

大きな数式はディスプレイ数式で表示できます：

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

より複雑な例：

$$
f(x) = \sum_{n=0}^{\infty} \frac{f^{(n)}(a)}{n!}(x-a)^n
$$

### ルビ

ルビは読み仮名や注釈の表示に便利で、特に東アジア言語でよく使われます：

ルビの書き方はこうです：{漢字|かんじ}は日本語で「Chinese characters」を意味します。

他の用途にも使えます：{HTML|Hypertext Markup Language}。

### フロントマター

VFM ファイルには YAML フロントマターでメタデータを指定できます：

```yaml
---
title: 'ドキュメントタイトル'
class: document-page
---
```

### ハードラインブレーク

設定で有効にすると、VFM は単一の改行を `<br>` 要素に変換し、
ソーステキストの視覚的な構造を
出力に反映できます。

### 生の HTML

VFM では必要に応じて生の HTML を含めることができます：

<div class="custom-container">

HTML ブロック内でも空行を含めれば **Markdown** の書式を混在させることができます。

</div>

### セクション化

VFM は見出しに続くコンテンツを自動的にセマンティックな `<section>` 要素で囲みます。これにより適切なドキュメントアウトラインが作成され、ドキュメント構造に基づいた高度なスタイリングが可能になります。

自動セクション作成を無効にするには、見出しの末尾に対応するハッシュマークを付けます：

```md
# セクションなしの見出し
```

## 追加リソース

VFM の完全な仕様と高度な機能については、以下をご覧ください：

- [VFM ドキュメント](https://vivliostyle.github.io/vfm/#/vfm)
- [Vivliostyle ユーザーガイド](https://docs.vivliostyle.org/)
- [Vivliostyle テーマ](https://github.com/vivliostyle/themes)

````
