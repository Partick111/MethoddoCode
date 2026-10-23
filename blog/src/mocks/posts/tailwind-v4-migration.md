# Tailwind v4 迁移与主题变量

本文整理从 Tailwind v3 升级到 v4 时的主要改造点。

## 配置方式的改变

v4 用 CSS 里的 `@theme` 声明设计变量，不再依赖 `tailwind.config.js`，入口只需 `@import 'tailwindcss'`。

## 自定义工具类

用 `@utility` 注册项目自己的工具类（如卡片、圆角按钮），集中放在全局样式表中便于统一维护。
*（内容由AI生成，仅供参考）*
