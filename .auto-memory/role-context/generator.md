---
name: role-context-generator
description: Generator 角色行为规范 — 设计稿还原、编码约定（不存计划和进度）
type: feedback
---

## 设计稿还原规则

- 实现 UI 页面前必须先 Read `design-draft/xxx/code.html`，做 1:1 翻译
- 唯一允许改动：硬编码文本→i18n、硬编码数据→API 绑定、HTML→React 组件、静态→交互
- 禁止：替换指标类型、替换图标、删除原型区块、改变链接语义

## 编码约定

- Schema 变更 + migration + 引用代码必须同一 commit
- git pull 后 schema 变了必须 `npx prisma generate`
- JSON 状态文件（progress.json / features.json）必须使用 ASCII 双引号，禁止中文弯引号
- 不得修改已有设计稿页面的布局结构，除非 Planner 明确标注为「布局变更」

## 设计系统（The Algorithmic Atelier）

- 设计系统文档：`design-draft/Layout Shell - AIGC Gateway/DESIGN.md`
- No-Line 规则：禁止 1px border 分隔，用背景色层级
- 组件对齐：Button 渐变、Input 底线、Card 无 ring、Dialog Glassmorphism
