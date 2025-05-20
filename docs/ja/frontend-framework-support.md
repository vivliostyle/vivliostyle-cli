# フロントエンドフレームワークのサポート

Vivliostyle CLIはWeb技術を活用して出版物を作成します。他のWebフロントエンドフレームワークと組み合わせることで、強力な機能を利用できます。たとえば、同じ原稿をWebページと出版物の両方にエクスポートできます。

## 静的にビルドされたHTMLファイルを参照する

フレームワークに静的サイトのビルド機能がある場合、ビルドされたHTMLファイルをVivliostyle CLIの `static` オプションで参照できます。これにより、そのファイルをエントリーとして読み込むことが可能です。

例として、`dist` ディレクトリにHTMLファイルがビルドされている場合を考えます。このディレクトリには `index.html` と、`blog` ディレクトリ内に `my-first-post.html` と `another-post.html` があります。これら3つのHTMLファイルから出版物を作成するには、以下のように設定します。

```js
{
  static: {
    '/': 'dist',
  },
  entry: [
    '/index.html',
    '/blog/my-first-post.html',
    '/blog/another-post.html',
  ],
};
```

> [!IMPORTANT]
> `static` でホスティングしたエントリーは、絶対パス（`/` ではじまるパス）で参照してください。そうしないと、`static` で指定したディレクトリではなく、`vivliostyle.config.js` からの相対パスでHTMLファイルを読み込もうとします。

> [!NOTE]
> `entry` に直接HTMLファイルを相対パスで指定する方法も動作しますが、`static` オプションを使うほうが便利です。たとえば、直接指定ではHTMLから参照される外部ファイル（画像など）が読み込めませんが、`static` オプションを使うとディレクトリ以下のファイルがすべて参照され、正しく表示されます。

## Viteをベースとしたフレームワークを利用する

Vivliostyle CLIはWebフロントエンド開発ツールのViteをベースに開発されています。そのため、Viteをベースとしたフレームワークと組み合わせて使用できます。

Vivliostyle CLIは、フレームワークのタイプに応じて以下の2つの使用方法を提供します。

### 1. Viteプラグインを利用する

Vivliostyle CLIでは、ViteやRollupのプラグインを利用できます。`vite` オプションにプラグインの設定やViteの設定を記述します。

```js
{
  vite: {
    plugins: [...],
  },
}
```

Vivliostyle Viewerは通常のWebアプリケーションとは異なり、JavaScriptの実行に制約があります。以下の点に注意してください。

- Vivliostyle Viewerはクライアントサイドのルーティング技術（シングルページアプリケーション; SPA）に対応していないため、各ページは静的にレンダリングする必要があります。`appType` に `mpa` を設定して動作しない環境では、この方法は使用できません。

- Vivliostyle ViewerはクライアントサイドでのHTMLコンテンツの変更を検知できません。そのため、使用するUIフレームワークはサーバーサイドレンダリング（SSR）に対応している必要があります。クライアントサイドJavaScriptが含まれる場合、正しく動作しない可能性があります。

### 2. Vivliostyle CLIをViteプラグインとして使用する

- [Example: with-astro](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/with-astro)
- [Example: with-eleventy](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/with-eleventy)

一部のフレームワーク（例: [Astro](https://astro.build/)）は外部からViteプラグインを受け取れるものの、Viteプラグインとしては利用できません。この場合、Vivliostyle CLIをViteプラグインとして使用します。

例えば、Astroでは `astro.config.js` の `vite.plugins` オプションにVivliostyle CLIのViteプラグインを渡すことで、AstroとVivliostyle CLIを同時に利用できます。以下の例では、`openViewer: true` オプションを指定し、Astroのdevサーバー起動時にVivliostyle Viewerを自動で開くようにしています。

```js
import { createVitePlugin } from '@vivliostyle/cli';
import { defineConfig } from 'astro/config';

export default defineConfig({
  vite: {
    plugins: [
      createVitePlugin({
        openViewer: true,
      }),
    ],
  },
});
```
