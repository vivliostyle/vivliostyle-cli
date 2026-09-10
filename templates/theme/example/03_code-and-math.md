# Code and Math

## Code Blocks

Fenced code blocks are rendered with `<pre>` and highlighted by Prism when a language is given.

```js
export function greet(name) {
  return `Hello, ${name}!`;
}
```

A code block with a title becomes a numbered listing with a caption.

```js:vivliostyle.config.js
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  theme: '{{name}}',
  entry: ['manuscript.md'],
});
```

Inline code such as `npm run example:preview` should be distinguishable from the surrounding text without breaking the line rhythm.

## Math

Math written between dollar signs is typeset as a formula. Inline math like $E = mc^2$ flows with the text, and display math is set on its own line:

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

Long formulas show how the theme aligns display math and how much space it leaves around it.
