# 前端样式与玻璃拟态设计笔记

本文记录从蓝本迁移的全局样式体系的要点：CSS 变量、卡片、圆角与动效。

## 主题变量

蓝本的 `theme.css` 定义了一组语义颜色变量：

| 变量 | 含义 | 示例值 |
| --- | --- | --- |
| `--color-brand` | 品牌色 | `#35bfab` |
| `--color-primary` | 正文主色 | `#334f52` |
| `--color-secondary` | 次要文字 | `#7b888e` |
| `--color-bg` | 页面背景 | `#eeeeee` |
| `--color-card` | 卡片背景 | `#ffffff66` |
| `--color-article` | 文章背景 | `#ffffffcc` |

在运行时通过 `site-content.json` 的 theme 字段覆写到 `:root`，实现换肤。

## 玻璃拟态卡片

核心观感来自半透明卡片 + 背景模糊 + 大圆角：

```css
.card {
  background-color: var(--color-card);
  backdrop-filter: blur(4px);
  border-radius: 40px;
  box-shadow: 0 40px 50px -32px rgba(0, 0, 0, 0.05);
}
```

## 背景泡泡

高斯模糊的彩色圆在底部区域缓慢浮动，使用 Canvas + Perlin 噪声实现，给页面带来轻盈的氛围感。

## 动效

- 卡片入场：`scale 0.6 -> 1` + 透明度渐显，按 `order` 递进延迟
- 悬停：轻微放大
- 点赞按钮：心跳动画与粒子

## 关于数学

行内公式示例：$e^{i\pi} + 1 = 0$。

数值渲染状态则取决于具体场景。以上就是本期样式笔记全部内容。
