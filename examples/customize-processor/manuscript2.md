# Another Processor & Custom Metadata Example

このファイルはカスタムプロセッサーではなく、VFMでレンダリングされます。

```typescript
export async function greet(name: string): string {
  return `Hello, ${name}`;
}
```

また、`documentMetadataReader`によって文書内容に関わらずタイトルが固定されています。
