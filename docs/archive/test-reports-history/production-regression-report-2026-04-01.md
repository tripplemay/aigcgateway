# 生产环境回归报告

## 测试目标

按用户指定，在生产环境对以下关键点做回归验证：

1. `doc_urls` 字段迁移是否已在生产生效
2. 种子是否已重跑，使火山引擎 `14` 个 `staticModels` 生效
3. 触发同步后，火山引擎是否应有 `14` 个模型
4. DeepSeek / 硅基流动的 AI 文档提取是否已依赖生产环境 DeepSeek API key 正常工作

## 生产测试开关

根据当前 `AGENTS.md`：

- `PRODUCTION_STAGE=RND`
- `PRODUCTION_DB_WRITE=ALLOW`
- `HIGH_COST_OPS=ALLOW`

## 测试环境

- 生产地址：`https://aigc.guangai.ai`
- 当前日期：`2026-04-01`
- 管理员账号：`test-agent@aigc-gateway.local`

## 执行步骤概述

1. 访问生产站点首页与公开接口
2. 尝试管理员登录
3. 准备进入管理端读取同步状态并触发同步
4. 基于同步结果验证 Volcengine / DeepSeek / SiliconFlow 回归点

## 实际执行结果

本轮未能进入应用层验证。生产站点当前在网关层直接返回 `502 Bad Gateway`。

已验证的只读探针：

- `HEAD /` → `502 Bad Gateway`
- `GET /api/v1/models` → `502 Bad Gateway`
- `POST /api/auth/login` → `502 Bad Gateway`
- `GET /docs` → `502 Bad Gateway`

返回头一致：

- `Server: nginx/1.24.0 (Ubuntu)`

返回体为 nginx 标准错误页：

```html
<html>
<head><title>502 Bad Gateway</title></head>
<body>
<center><h1>502 Bad Gateway</h1></center>
```

## 通过项

- 已确认生产域名可达
- 已确认当前故障发生在应用前的网关层，而不是单一业务接口

## 失败项

### FAIL-001 生产站点当前整体不可用

- 现象：
  - 首页与 API 均返回 `502`
- 影响：
  - 无法登录管理员
  - 无法读取 `sync-status`
  - 无法触发手动同步
  - 无法验证模型数量、同步结果、AI enrichment 结果

## 阻塞项

由于生产环境当前直接返回 `502 Bad Gateway`，以下目标全部无法验收：

- `doc_urls` 迁移是否生效
- seed 是否已重跑
- Volcengine 是否已有 `14` 个模型
- DeepSeek / SiliconFlow 的 AI 文档提取是否已使用生产 DeepSeek key 成功执行

## 证据

- `GET https://aigc.guangai.ai/api/v1/models` → `HTTP/1.1 502 Bad Gateway`
- `POST https://aigc.guangai.ai/api/auth/login` → `HTTP/1.1 502 Bad Gateway`
- `HEAD https://aigc.guangai.ai/` → `HTTP/1.1 502 Bad Gateway`

## 最终结论

本轮生产回归结论为：**环境阻塞，未能开始应用层验证。**

当前最优先问题不是模型同步逻辑，而是生产站点本身未提供可用的应用响应。只有在 `https://aigc.guangai.ai` 从网关层恢复到可正常返回页面/API 后，才能继续验证：

1. `doc_urls` 迁移
2. Volcengine `14` 个模型
3. 手动同步结果
4. DeepSeek / SiliconFlow AI 文档提取
