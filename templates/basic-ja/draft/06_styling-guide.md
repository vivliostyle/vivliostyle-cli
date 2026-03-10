# スタイリングとカスタマイズ

## カスタムスタイリング入門

この章では、CSSカスタムプロパティとカスタムクラスを使ってVivliostyle出版物の外観をカスタマイズする方法を説明します。このドキュメントの例は、テンプレートに含まれている `custom.css` ファイルで動作します。

## CSSカスタムプロパティの利用

CSSカスタムプロパティ（CSS変数とも呼ばれます）は、テーマファイルを直接変更せずにドキュメントの外観をカスタマイズする強力な方法を提供します。

### 基本的なタイポグラフィのカスタマイズ

ドキュメント全体のフォントファミリーを変更するには、`custom.css` の `--vs-font-family` 変数のコメントを外して値を変更します：

```css
:root {
  --vs-font-family: 'Georgia', 'Times New Roman', serif;
}
```

この1行でドキュメント全体の書体が変わります。

### フォントサイズの調整

見出しのサイズを個別に制御できます：

```css
:root {
  --vs--h1-font-size: 3rem;
  --vs--h2-font-size: 2.25rem;
  --vs--h3-font-size: 1.75rem;
}
```

または、すべての見出しに一括でスタイルを適用することもできます：

```css
:root {
  --vs--heading-font-family: 'Helvetica Neue', sans-serif;
  --vs--heading-font-weight: 700;
  --vs--heading-line-height: 1.3;
}
```

## 特殊要素のカスタムクラス

### 注記ボックス

<div class="note">

**注記:** これは情報提供のための注記ボックスです。本文の流れを妨げることなく、重要な補足情報に注意を引きます。

このスタイリングを有効にするには、`custom.css` の `.note` クラス定義のコメントを外してください。

</div>

この注記ボックスのMarkdownソース：

```md
<div class="note">

**注記:** ここに内容を記述…

</div>
```

### 警告ボックス

<div class="warning">

**警告:** これは特別な注意が必要な重要情報のための警告ボックスです。潜在的な問題や重要な注意事項をハイライトするために控えめに使用してください。

</div>

## ページレイアウトのカスタマイズ

### ヘッダーとフッター

プロフェッショナルなドキュメントのために、CSSカスタムプロパティでヘッダーとフッターを設定します：

```css
:root {
  /* ページ番号を下部中央に表示 */
  --vs-page--mbox-content-bottom-center: counter(page);

  /* ドキュメントタイトルを左上に表示 */
  --vs-page--mbox-content-top-left: env(doc-title);

  /* 出版物タイトルを右上に表示 */
  --vs-page--mbox-content-top-right: env(pub-title);
}
```

### カスタム改ページ

レイアウト改善のために改ページを制御します：

<div class="break-after-page"></div>

`.break-after-page` クラスで強制的に改ページし、`.break-inside-avoid` で要素内での改ページを防止します。

## 配色

### 色のカスタマイズ

一貫した配色を定義します：

```css
:root {
  --vs-color-bg: #ffffff;
  --vs-color-body: #2c3e50;
  --vs--anchor-color: #3498db;
}
```

### シンタックスハイライト

コードブロックの外観をカスタマイズします：

```css
:root {
  --vs-prism--background: #f8f8f8;
  --vs-prism--color: #2c3e50;
  --vs-prism--color-comment: #6a737d;
}
```

カスタムスタイリングの例：

```python:data_processing.py
import pandas as pd
import numpy as np

def process_data(df):
    """DataFrame を処理してサマリー統計を返す"""
    return df.describe()

# データの読み込みと処理
data = pd.read_csv('input.csv')
summary = process_data(data)
print(summary)
```

## テーブルとリスト

### テーブルスタイリングの強化

テーブルの外観をカスタマイズします：

```css
:root {
  --vs--table-border-width-column: 2px;
  --vs--table-border-color: #34495e;
  --vs--table-cell-padding-block: 1em;
}
```

カスタムスタイリングのテーブル例：

| 機能             | 基本テーマ       | カスタムテーマ   |
| ---------------- | ---------------- | ---------------- |
| タイポグラフィ   | システムフォント | カスタムフォント |
| 色               | デフォルト       | ブランドカラー   |
| 間隔             | 標準             | 最適化済み       |
| ページレイアウト | 片面             | 両面             |

### リストのカスタマイズ

リストのスタイリングを制御します：

```css
:root {
  --vs--ul-list-style-type: square;
  --vs--ol-list-style-type: lower-roman;
  --vs--li-margin-block: 0.75em;
}
```

## 数式

数式は適切な間隔で美しくレンダリングされます：

二次方程式 $ax^2 + bx + c = 0$ の解の公式：

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

インライン数式として、ピタゴラスの定理は直角三角形で $a^2 + b^2 = c^2$ で表されます。

## 脚注と参考文献

脚注は本文を煩雑にすることなく追加の文脈を提供します<span class="footnote">これはデフォルトスタイリングを示す参照スタイルの脚注です。</span>。スタイリングはカスタマイズできます：

```css
:root {
  --vs-footnote--call-font-size: 0.75em;
  --vs-footnote--call-content: '[' counter(footnote) ']';
}
```

名前付き脚注<span class="footnote">名前付き脚注はMarkdownソースをより読みやすく保守しやすくします。</span>を使うと、ソースファイルの保守性が向上します。

## 引用

> 引用のスタイリングをドキュメントの美的感覚に合わせてカスタマイズします：
>
> ```css
> :root {
>   --vs--blockquote-font-size: 0.95em;
>   --vs--blockquote-margin-inline: 2em 0;
> }
> ```
>
> これにより、本文テキストとは視覚的に明確に区別された引用が作成されます。

## 2段組みレイアウト

特定のセクションには2段組みレイアウトを定義できます：

```css
.two-column {
  column-count: 2;
  column-gap: 2em;
  column-rule: 1px solid #e0e0e0;
}
```

## セクション番号

長いドキュメントには自動的なセクション番号を有効にできます：

```css
:root {
  --vs-section--marker-display: inline;
}
```

これにより自動的にセクションに番号が付けられ、相互参照が可能になります。

## 高度なテクニック

### ページ別の条件付きスタイリング

最初のページのスタイルを変える：

```css
@page :first {
  @top-left {
    content: none;
  }
  @top-right {
    content: none;
  }
}
```

### 左右ページのレイアウト

両面印刷用の非対称マージンを作成：

```css
@page :left {
  --vs-page--mbox-content-bottom-left: counter(page);
}

@page :right {
  --vs-page--mbox-content-bottom-right: counter(page);
}
```

## まとめ

Vivliostyleのテーマシステムの力は、これらのテクニックを組み合わせることにあります。CSS変数を慎重にカスタマイズし、セマンティックなクラスを使うことで、ブランドや要件に合ったプロフェッショナルな出版物を作成できます。

小さな変更から始めて、頻繁にプレビューし、システムに慣れたらより複雑なカスタマイズに進んでいきましょう。

## 追加リソース

- [Vivliostyleテーマドキュメント](https://github.com/vivliostyle/themes)
- [CSS Paged Media Module](https://www.w3.org/TR/css-page-3/)
- [Vivliostyleユーザーガイド](https://docs.vivliostyle.org/)
