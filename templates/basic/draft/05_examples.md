# Practical Examples

## Example 1: Technical Documentation

This example demonstrates how to create professional technical documentation.

### Document Structure

A typical technical document includes:

1. **Introduction**: Overview of the topic
2. **Installation**: Step-by-step setup instructions
3. **Usage**: How to use the software or API
4. **Reference**: Detailed API or command documentation
5. **Troubleshooting**: Common issues and solutions

### Code Documentation

Document your APIs with clear examples:

```typescript:api-client.ts
interface UserProfile {
  id: string;
  name: string;
  email: string;
}

async function fetchUser(userId: string): Promise<UserProfile> {
  const response = await fetch(`/api/users/${userId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }
  return response.json();
}
```

### Command Reference

Document command-line tools in structured tables:

| Command   | Description              | Options                 |
| --------- | ------------------------ | ----------------------- |
| `init`    | Initialize a new project | `--template`, `--theme` |
| `build`   | Generate output files    | `-o`, `-s`, `--theme`   |
| `preview` | Launch preview server    | `--quick`, `--port`     |

## Example 2: Academic Writing

Academic publications require precise formatting and citation support.

### Mathematical Proofs

**Theorem 1.** _For any real number $x$, the equation $e^{i\pi} + 1 = 0$ holds._

**Proof.** Using Euler's formula $e^{i\theta} = \cos\theta + i\sin\theta$, we can substitute $\theta = \pi$:

$$
e^{i\pi} = \cos\pi + i\sin\pi = -1 + 0i = -1
$$

Therefore:

$$
e^{i\pi} + 1 = -1 + 1 = 0
$$

This completes the proof. $\square$

### Research Data

Present experimental results in clear tables:

| Trial | Temperature (°C) | Pressure (kPa) | Yield (%) |
| ----- | ---------------- | -------------- | --------- |
| 1     | 25               | 101.3          | 87.3      |
| 2     | 30               | 101.3          | 91.2      |
| 3     | 35               | 101.3          | 89.8      |
| 4     | 25               | 110.0          | 88.1      |

### Citations and References

Use footnotes for citations and references[^citation1]. This keeps the main text readable while providing detailed source information.

Academic writing often requires extensive annotations[^citation2] and cross-references to other sections of the document.

[^citation1]: Smith, J. (2023). _Modern Publishing Methods_. Academic Press, pp. 123-145.

[^citation2]: Johnson, M., & Lee, K. (2024). "Digital Typography in Academic Publishing." _Journal of Scholarly Communication_, 15(2), 67-89.

## Example 3: Multilingual Content

Vivliostyle supports multiple languages and writing systems.

### Japanese Text

日本語のテキストも問題なく扱えます。{縦書|たてが}きにも対応しています。

専門用語には{振|ふ}り{仮名|がな}を付けることができます：

- {HTML|エイチティーエムエル}
- {CSS|シーエスエス}
- {JavaScript|ジャバスクリプト}

### Mixed Language Documents

Documents can seamlessly mix multiple languages:

The term "typography" (活字組版, _かつじそはん_) refers to the art and technique of arranging type. In French, this is called _typographie_, and in German, _Typografie_.

### Right-to-Left Text

Vivliostyle handles right-to-left scripts correctly when properly configured.

## Example 4: Data Visualization

While Vivliostyle focuses on typography, you can include data visualizations.

### ASCII Art Diagrams

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Server    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Database   │
└─────────────┘
```

### Flowcharts with Text

```
Start
  │
  ├─→ Input Data
  │      │
  │      ▼
  │   Process
  │      │
  │      ▼
  │   Validate
  │      │
  ├──────┤
  │      ▼
  │   Output
  │      │
  └─────→ End
```

## Example 5: Creative Writing

Vivliostyle works well for creative content like novels and essays.

### Dialog Formatting

"The key to good typography," explained the master printer, "is invisible design. The reader should focus on the content, not the formatting."

"But how do you achieve that balance?" asked the apprentice.

"Through careful attention to detail: proper spacing, consistent rhythm, and thoughtful hierarchy."

### Poetic Structure

Some poems benefit from precise line breaks:

```
In the digital age,
words flow across screens
like water through a stream.

Typography shapes meaning,
guides the eye,
creates rhythm and pause.
```

### Narrative Sections

---

**Part I: Beginning**

The journey started on a cold morning in November. The fog hung low over the city, obscuring everything beyond a few meters.

Our protagonist stood at the crossroads, uncertain which path to take.

---

## Example 6: Complex Documents

Combine multiple features for sophisticated layouts.

### Sidebar Information

> **Note:** This is an example of highlighted information that might appear as a sidebar or callout box depending on your theme.
>
> Such boxes draw attention to important warnings, tips, or supplementary information.

### Nested Structures

1. **First Major Topic**

   - Subtopic A
     - Detail 1
     - Detail 2
   - Subtopic B
     - Detail 1: More information here
     - Detail 2: Additional context

2. **Second Major Topic**
   - Implementation steps
   - Testing procedures
   - Deployment guidelines

### Cross-References

When writing longer documents, you can reference other sections. For example, see the VFM syntax guide (Chapter 3) for details on mathematical expressions, or refer to the features chapter (Chapter 4) for theme configuration.

## Example 7: Mixed Media

### Code with Explanation

Here's a complete example showing error handling:

```js:error-handler.js
class APIError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'APIError';
  }
}

function handleError(error) {
  if (error instanceof APIError) {
    console.error(`API Error ${error.statusCode}: ${error.message}`);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

The `APIError` class extends the built-in `Error` class to include an HTTP status code. The `handleError` function uses `instanceof` to distinguish API errors from other exceptions.

### Combining Elements

You can combine various elements in a single document:

- **Lists** for enumeration
- **Tables** for structured data
- **Code blocks** for technical examples
- **Math** for equations: $f(x) = ax^2 + bx + c$
- **Footnotes** for additional context[^example]
- **Images** for visual content
- **Blockquotes** for emphasis

[^example]: This footnote provides supplementary information without interrupting the main text flow.

This flexibility makes Vivliostyle suitable for virtually any type of publication.

## Conclusion

These examples demonstrate the versatility of Vivliostyle CLI and VFM. Whether you're writing technical documentation, academic papers, creative works, or business reports, the combination of Markdown simplicity and professional typesetting capabilities provides an excellent foundation for your publications.

Experiment with different features, themes, and configurations to find the workflow that best suits your needs.
