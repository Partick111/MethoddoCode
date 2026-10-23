# Vue3 组合式 API 重构笔记

本文记录把页面从 Options API 迁移到组合式 API（setup 语法糖）的思路与对照写法。

## 状态与计算属性

`ref` 承接基础类型、`reactive` 承接对象，`computed` 统一替换原来的 `computed` 选项，模板中无需再写 `this`。

## 生命周期与逻辑复用

`onMounted` 对应 `mounted`，可抽成 `composables` 里的独立函数，让同一份逻辑在多个组件间共享。
*（内容由AI生成，仅供参考）*
