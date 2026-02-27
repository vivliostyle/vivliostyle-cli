````markdown
# はじめに

## Vivliostyle CLI について

Vivliostyle CLI は、HTML や Markdown ドキュメントを高品質な出版物に組版するための強力なコマンドラインツールです。Markdown のシンプルさと、書籍・技術文書・学術論文などに求められるプロフェッショナルな出力品質を兼ね備えています。

### 主な特長

Vivliostyle CLI はデジタル出版に対して以下のような利点を提供します：

- **Markdown による執筆**: シンプルで読みやすい Markdown 形式でコンテンツを執筆
- **プロフェッショナルな組版**: 高度なレイアウト機能を備えた出版品質の PDF を生成
- **複数の出力形式**: PDF、EPUB、Web 出版物に対応
- **テーマシステム**: あらかじめ用意されたテーマの適用や CSS によるカスタムスタイルの作成が可能
- **複数の入力形式**: Markdown、HTML、EPUB、Web 出版物を処理可能

### はじめ方

新しい出版プロジェクトの作成はかんたんです。以下のコマンドを実行してください：

```sh
npm create book
```

対話式のセットアップウィザードが以下の手順を案内してくれます：

1. テンプレートの選択（Minimal、Basic、またはコミュニティテンプレート）
2. 出版物のテーマ選択
3. 基本的なメタデータ（タイトル、著者、言語）の設定

### 基本コマンド

プロジェクトをセットアップしたら、以下の基本コマンドが使えます：

**ドキュメントのプレビュー：**

```sh
vivliostyle preview manuscript.md
```

**PDF のビルド：**

```sh
vivliostyle build manuscript.md -o output.pdf
```

**ページサイズの指定：**

```sh
vivliostyle build manuscript.md -s A4 -o output.pdf
```

### 設定ファイル

複数の章やセクションを持つ出版物には、設定ファイル（`vivliostyle.config.js`）を使います：

```js
// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: 'My Book Title',
  author: '著者名',
  language: 'ja',
  size: 'A4',
  theme: '@vivliostyle/theme-techbook',
  entry: ['chapter1.md', 'chapter2.md', 'chapter3.md'],
  output: 'book.pdf',
});
```

この設定により以下のことが可能になります：

- 複数のソースファイルを1つの出版物にまとめる
- すべての章に一貫したスタイルを適用する
- 出版物のメタデータを設定する
- 出力オプションを設定する

詳しくは [Vivliostyle CLI ドキュメント](https://github.com/vivliostyle/vivliostyle-cli#readme) をご覧ください。

````
