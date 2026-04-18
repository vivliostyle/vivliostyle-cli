# テンプレート

Vivliostyle CLI は、あらかじめ定義されたファイル構成や設定、コンテンツを持つプロジェクトを生成するためのテンプレートシステムを提供しています。テンプレートは `create` コマンド実行時に適用されます。

## テンプレートを使用する

プロジェクト作成時に `--template` オプションでテンプレートを指定できます：

```sh
vivliostyle create my-project --template gh:org/repo/templates/awesome-template
```

`npm create book` でも同様に指定できます：

```sh
npm create book -- --template gh:org/repo/templates/awesome-template
```

## ビルトインテンプレート

Vivliostyle CLI には以下のプリセットが付属しています：

| 名前 | 説明 |
|------|------|
| `minimal` | 空の Markdown ファイル 1 つだけのミニマルなテンプレート |
| `basic` | 英語のスターターコンテンツを含む基本テンプレート |
| `basic-ja` | 日本語のスターターコンテンツを含む基本テンプレート |

これらのプリセットは `vivliostyle create` を対話形式で実行したときに選択するか、直接指定することもできます：

```sh
vivliostyle create my-project --template minimal
```

## テンプレートソースの種類

`--template` オプションには次の 3 種類の形式を指定できます。

### リモート（giget 形式）

`[provider]:repo[/subpath][#ref]` の形式でリモートリポジトリからテンプレートをダウンロードします。テンプレートのダウンロード元は [giget](https://github.com/unjs/giget#readme) の形式で指定できます。

```sh
# GitHub から取得
--template gh:org/repo/templates/my-template

# 特定のブランチまたはタグを指定
--template gh:org/repo/templates/my-template#v2.0.0

# GitLab から取得
--template gitlab:org/repo/templates/my-template
```

### ローカルディレクトリ

相対パスまたは絶対パスでローカルディレクトリを指定します：

```sh
--template ./my-custom-template
--template ../shared-templates/book-template
```

`node_modules/` と `.git/` を除く全ファイルが再帰的にコピーされます。

### Vivliostyle Themes固有のテンプレート

インストールした [Vivliostyle Themes](./themes-and-css) のパッケージが `package.json` の `vivliostyle.template` フィールドでテンプレートを提供している場合、プロジェクト作成の対話フローの中でそのテンプレートが選択肢として表示されます。Theme パッケージへのテンプレートの組み込み方は [Theme パッケージでテンプレートを提供する](#theme-パッケージでテンプレートを提供する) を参照してください。

## テンプレート変数

テンプレートのファイルには [Handlebars](https://handlebarsjs.com/) 式を埋め込むことができ、プロジェクト作成時に実際の値に置き換えられます。UTF-8 のテキストファイルのみが処理対象で、バイナリファイル（画像など）はそのままコピーされます。

### 利用可能な変数

| 変数 | 型 | 説明 |
|------|----|------|
| `projectPath` | `string` | プロジェクトのパス |
| `title` | `string` | タイトル |
| `author` | `string` | 著者名 |
| `language` | `string` | 言語コード（BCP 47） |
| `theme` | `ThemeSpecifier \| undefined` | テーマ設定 |
| `themePackage` | `object \| undefined` | テーマパッケージのメタデータ |
| `themePackage.name` | `string` | テーマパッケージ名 |
| `themePackage.version` | `string` | テーマパッケージバージョン |
| `cliVersion` | `string` | Vivliostyle CLI のバージョン |
| `coreVersion` | `string` | Vivliostyle Core のバージョン |
| `browser` | `object \| undefined` | ブラウザ設定 |
| `browser.type` | `string` | ブラウザの種類（例：`"chrome"`） |
| `browser.tag` | `string \| undefined` | ブラウザのタグ |

テーマパッケージが [カスタムプロンプト](#カスタムプロンプト) を定義している場合、ユーザーの回答も各プロンプトの `name` をキーとするテンプレート変数として使用できます。

### ビルトインヘルパー

以下の Handlebars ヘルパーが登録されています：

| ヘルパー | 説明 | 入力例 → 出力例 |
|---------|------|----------------|
| `upper` | 大文字に変換 | `my book` → `MY BOOK` |
| `lower` | 小文字に変換 | `My Book` → `my book` |
| `capital` | キャピタルケースに変換 | `my book` → `My Book` |
| `camel` | キャメルケースに変換 | `my book` → `myBook` |
| `snake` | スネークケースに変換 | `my book` → `my_book` |
| `kebab` | ケバブケースに変換 | `my book` → `my-book` |
| `proper` | タイトルケースに変換 | `a guide to vivliostyle` → `A Guide to Vivliostyle` |
| `lorem` | Lorem ipsum のダミーテキストを挿入 | （引数なし） |
| `json` | JSON 文字列にシリアライズ | オブジェクト → JSON 文字列 |

### 例：`vivliostyle.config.js`

```js
// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: "{{proper title}}",
  author: "{{author}}",
  {{#if language}}
  language: "{{language}}",
  {{/if}}
  {{#if theme}}
  theme: {{json theme}},
  {{/if}}
  image: "ghcr.io/vivliostyle/cli:{{cliVersion}}",
  entry: ["manuscript.md"],
});
```

### 例：`package.json`

```json
{
  "name": "{{kebab title}}",
  "description": "{{proper title}}",
  "author": "{{author}}",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "vivliostyle build",
    "preview": "vivliostyle preview"
  },
  "dependencies": {
    "@vivliostyle/cli": "{{cliVersion}}"
  }
}
```

## Theme パッケージでテンプレートを提供する

[Vivliostyle Themes](./themes-and-css) のパッケージには、1 つ以上のプロジェクトテンプレートをバンドルできます。テンプレートは `package.json` の `vivliostyle.template` フィールドで宣言します：

```json
{
  "name": "my-vivliostyle-theme",
  "version": "1.0.0",
  "vivliostyle": {
    "theme": {
      "name": "My Theme",
      "style": "./theme.css"
    },
    "template": {
      "default": {
        "name": "デフォルトテンプレート",
        "description": "基本的なスタート地点",
        "source": "org/my-vivliostyle-theme/template/default"
      },
      "with-prompts": {
        "name": "カスタムオプション付きテンプレート",
        "source": "org/my-vivliostyle-theme/template/with-prompts",
        "prompt": [
          {
            "type": "text",
            "name": "subtitle",
            "message": "サブタイトルを入力してください：",
            "required": false
          },
          {
            "type": "select",
            "name": "pageSize",
            "message": "ページサイズを選択してください：",
            "options": ["A4", "A5", "B5"]
          }
        ]
      }
    }
  }
}
```

`vivliostyle.template` の各キーはテンプレート ID です。値のオブジェクトには以下のフィールドがあります：

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `name` | `string` | | 対話プロンプトに表示される名前 |
| `description` | `string` | | ヒントとして表示される短い説明 |
| `source` | `string` | ✔ | ダウンロードするテンプレートの参照先 |
| `prompt` | `PromptOption[]` | | ユーザーへの追加質問の定義 |

`source` フィールドには `--template` オプションと同じく giget 形式でダウンロードするテンプレートを指定します。

### カスタムプロンプト

`prompt` 配列を使うと、プロジェクト作成時にユーザーへの追加質問を定義できます。回答は Handlebars 式で利用できるテンプレート変数になります。

以下のプロンプトタイプが使用できます：

#### `text`

自由入力のテキストフィールドです。

```json
{
  "type": "text",
  "name": "subtitle",
  "message": "サブタイトルを入力してください：",
  "placeholder": "（省略可）",
  "defaultValue": "",
  "initialValue": "",
  "required": false
}
```

#### `select`

一覧から 1 つを選択します。

```json
{
  "type": "select",
  "name": "pageSize",
  "message": "ページサイズを選択してください：",
  "options": [
    { "value": "A4", "label": "A4（210×297 mm）", "hint": "標準" },
    { "value": "A5", "label": "A5（148×210 mm）" },
    "B5"
  ],
  "initialValue": "A4"
}
```

選択肢には文字列またはオブジェクト（`value`・`label`・`hint` フィールド）を指定できます。

#### `multiSelect`

一覧から複数を選択します。

```json
{
  "type": "multiSelect",
  "name": "features",
  "message": "含める機能を選択してください：",
  "options": ["toc", "cover", "bibliography"]
}
```

#### `autocomplete`

タイプアヘッドによる絞り込みができる単一選択です。

```json
{
  "type": "autocomplete",
  "name": "locale",
  "message": "ロケールを選択してください：",
  "options": ["en", "ja", "zh", "fr", "de"]
}
```

#### `autocompleteMultiSelect`

タイプアヘッドによる絞り込みができる複数選択です。

```json
{
  "type": "autocompleteMultiSelect",
  "name": "locales",
  "message": "対応するロケールを選択してください：",
  "options": ["en", "ja", "zh", "fr", "de"]
}
```

### テンプレートディレクトリの構成

`source` に指定したディレクトリ以下にテンプレートファイルを配置します。ファイルは新しいプロジェクトディレクトリにコピーされ、テンプレート変数が置き換えられます。

```
my-vivliostyle-theme/
├── package.json               # vivliostyle.template を宣言
├── theme.css
└── template/
    └── default/
        ├── vivliostyle.config.js   # {{title}}、{{author}} などを使用
        ├── manuscript.md
        └── assets/
            └── cover.webp          # バイナリファイルはそのままコピー
```

## ミニマルテンプレートの例

最小構成のテンプレートの例として、Markdown ファイル 1 つと設定ファイルだけで構成された例を示します。

**`vivliostyle.config.js`：**

```js
// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: "{{proper title}}",
  author: "{{author}}",
  entry: ["manuscript.md"],
});
```

**`manuscript.md`：**

```markdown
# {{proper title}}
```

ユーザーが `vivliostyle create my-book --title "はじめての本" --author "山田 太郎"` を実行すると、次のように置き換えられます：

**`vivliostyle.config.js`**（置き換え後）：

```js
// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: "はじめての本",
  author: "山田 太郎",
  entry: ["manuscript.md"],
});
```
