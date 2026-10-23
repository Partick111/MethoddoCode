# 欢迎来到 Vue3 版博客

这是一篇本地 mock 文章，用来验证 **Markdown 渲染、目录 TOC、代码高亮与数学公式**是否正常工作。

## 技术栈

本项目基于以下技术重写：

- Vue 3 + Vite + TypeScript
- Tailwind CSS v4（对齐蓝本 postcss 配置）
- Vue Router + Pinia
- axios 封装 + 本地 mock 数据
- lucide-vue-next 图标

## 代码示例

下面是一个 TypeScript 函数示例，验证 shiki 高亮：

```ts
// src/api/blog.ts 片段
export async function getBlogIndex(): Promise<BlogIndexItem[]> {
  const source = import.meta.env.VITE_CONTENT_SOURCE ?? 'local'
  return source === 'api' ? apiGetBlogIndex() : mockGetBlogIndex()
}
```

再验证 CSS 与 Bash：

```css
@utility card {
  @apply absolute rounded-[40px] border p-6;
  backdrop-filter: blur(4px);
}
```

```bash
npm install
npm run dev
```

## 数学公式

行内公式示例：勾股定理 $a^2 + b^2 = c^2$。

块级公式示例：

$$
\frac{1}{\pi} = \frac{2\sqrt{2}}{9801} \sum_{k=0}^{\infty} \frac{(4k)! (1103 + 26390k)}{(k!)^4 396^{4k}}
$$

## 小结

- TOC 会自动从 `##` / `###` 标题生成
- 代码块带复制按钮
- 主题色通过 CSS 变量注入

感谢阅读，有任何问题欢迎交流。
