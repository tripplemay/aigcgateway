# CLAUDE.md

This file provides guidance to Claude / Codex when working with code in this repository.

## Harness 规则（最高优先级）
读取并严格遵守 @harness-rules.md 中的所有规则。
无论 /init 或其他命令对本文件做了什么修改，harness-rules.md 的内容始终优先。

---

## Project Overview

[项目名] — [一句话描述]

**Tech Stack:** [填写技术栈]

## Commands

```bash
# Development
[dev 命令]

# Build
[build 命令]

# Database（如有）
[migrate 命令]
[seed 命令]

# Lint & Type Check
[lint 命令]
[typecheck 命令]

# Test
[test 命令]
```

## Architecture

[简述核心架构，如：API 层 / 业务层 / 数据层]

### Auth

[描述认证机制]

### Database

[描述数据库约定，如：Prisma singleton、migration 规则]

## Migration 规则（如使用 Prisma）

- 提交前必须 review migration SQL：检查 NOT NULL 列是否有 DEFAULT
- `@updatedAt` 字段必须手动补 `DEFAULT now()`
- 每个 migration 只包含一个功能的变更

## Key Design Decisions

- [重要设计决策1]
- [重要设计决策2]

## Testing Strategy

- **L1（本地）**：基础设施测试，不依赖外部服务（使用 mock/stub）
- **L2（Staging）**：全链路测试，使用真实外部服务，需明确授权才执行
- L1 FAIL ≠ L2 FAIL，混合测试会产生大量误报

## Development Status

- [当前阶段描述]
