# Batch 05: 数据层审查

审查范围：`prisma/schema.prisma`、全部 migrations（56 个）、`prisma/seed.ts`

---

## Critical

### [C1] deduct_balance 函数并发安全隐患 — 丢失行级锁

- 文件: `prisma/migrations/20260410120000_apikey_to_user_level/migration.sql:40-80`
- 证据: 当前最终版本的 `deduct_balance` 使用 `UPDATE users SET balance = balance - p_amount WHERE id = p_user_id AND balance >= p_amount`。该写法在高并发下会产生 ABA 竞态：两个并发事务可能同时通过 `balance >= p_amount` 检查，随后都执行扣减导致余额变负。正确做法应先 `SELECT ... FOR UPDATE` 锁定用户行，再做条件判断。
- 影响: 高并发 API 调用场景（同一用户多 key 并发）可能透支用户余额，余额变为负值，产生财务损失。
- 建议:
  ```sql
  -- 在 UPDATE 前添加行级锁
  SELECT balance INTO v_balance FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  UPDATE users SET balance = balance - p_amount ...;
  ```

### [C2] `TemplateStep.actionId` 外键缺索引

- 文件: `prisma/schema.prisma:614`、`prisma/migrations/20260405200000_p4_action_template_schema/migration.sql`
- 证据: `template_steps` 表有 `actionId TEXT NOT NULL` 外键，schema 中只有 `@@index([templateId])`，无 `actionId` 索引。查询某个 Action 关联的所有 TemplateStep（级联检查、删除保护）时会发生全表扫描。
- 影响: 删除 Action 或查询 Action 被引用情况时，`ON DELETE RESTRICT` 需全表扫描 `template_steps`，随着数据增长线性变慢。
- 建议: 添加 `@@index([actionId])` 或在 migration 中 `CREATE INDEX "template_steps_actionId_idx" ON "template_steps"("actionId");`

### [C3] `AliasModelLink` 两个外键均无索引

- 文件: `prisma/schema.prisma:303-313`、`prisma/migrations/20260410000000_upgrade_model_alias_schema/migration.sql`
- 证据: `alias_model_links` 表有 `aliasId` 和 `modelId` 两个外键，只有唯一约束 `(aliasId, modelId)`，无单独的 `modelId` 索引。反向查询"某个 Model 属于哪些 Alias"时需全表扫描（路由引擎通过 Model 查 Alias 是高频路径）。
- 影响: 路由引擎查找模型别名映射时性能退化，高流量下成为瓶颈。
- 建议: 添加 `@@index([modelId])` 和 `@@index([aliasId])`（唯一约束虽可替代 aliasId 单列索引但明确性更好）。

---

## High

### [H1] `call_logs` 和 `system_logs` 无数据归档/分区策略，增长失控风险

- 文件: `prisma/schema.prisma:375-417`、`prisma/schema.prisma:639-650`
- 证据: `call_logs` 是高频写入表（每次 API 调用写一行），`system_logs` 记录健康检查和推理日志，两者均无 TTL、分区或归档机制。`health_checks` 同样无清理策略。`promptSnapshot` 为 `JSONB NOT NULL`，每行可能存储完整请求体（数 KB 至数十 KB）。
- 影响: 按现有架构，6 个月后 `call_logs` 可能达到数千万行，单表体积超过数十 GB，索引扫描退化，`VACUUM` 成本上升。
- 建议:
  1. 短期：添加定时清理任务，对 `call_logs`（>90 天）、`health_checks`（>30 天）、`system_logs`（>7 天）软删或硬删。
  2. 中期：对 `call_logs` 按月做范围分区（`PARTITION BY RANGE (createdAt)`）。
  3. 长期：考虑将 `promptSnapshot` / `responseContent` 卸载到对象存储，表内仅保留引用。

### [H2] `Transaction.amount` 符号语义不一致，负值表示扣减

- 文件: `prisma/migrations/20260408010000_balance_user_level/migration.sql:64`
- 证据: `deduct_balance` 函数插入 transaction 时用 `-p_amount`（负值）表示扣减，但 `RECHARGE`/`BONUS` 类型的交易应为正值。Schema 中 `amount Decimal @db.Decimal(16,8)` 无 CHECK 约束确保 DEDUCTION 时 amount < 0、RECHARGE 时 amount > 0。
- 影响: 对账逻辑依赖符号隐式约定，无 DB 层保证，应用层 bug 可能写入符号错误的交易，余额计算出错。
- 建议: 添加 CHECK 约束：
  ```sql
  ALTER TABLE transactions ADD CONSTRAINT transactions_amount_sign_check
    CHECK (
      (type IN ('DEDUCTION', 'REFUND') AND amount < 0) OR
      (type IN ('RECHARGE', 'BONUS', 'ADJUSTMENT'))
    );
  ```

### [H3] `User.balance` 与 `Transaction` 双写无补偿事务保障

- 文件: `prisma/migrations/20260410120000_apikey_to_user_level/migration.sql:52-80`
- 证据: `deduct_balance` 函数在一个 plpgsql 函数体内同时 UPDATE users.balance 和 INSERT transactions。若函数内异常发生在 UPDATE 之后 INSERT 之前（理论上 plpgsql 自动回滚，但若调用方捕获异常），两者可能不一致。更大风险是外部代码绕过该函数直接修改 balance 或插入 transaction，无法保证原子性。
- 影响: 余额与交易记录不一致，对账失败。
- 建议: 在函数签名注释中明确禁止绕过调用；考虑在 `transactions` 上添加触发器自动同步（或反向：依赖 transaction 流水重算余额作为校验）。添加定期对账脚本。

### [H4] `EmailVerificationToken` 外键无 `onDelete` 策略，用户删除被 RESTRICT

- 文件: `prisma/schema.prisma:146`、`prisma/migrations/20260411_add_email_verification_token/migration.sql:23`
- 证据: `email_verification_tokens.userId` FK 使用默认 `ON DELETE RESTRICT`。当软删除用户（设置 `deletedAt`）时不影响，但若硬删除用户则报错，强行阻止删除。
- 影响: 账号注销流程中若需要物理删除用户，会因 token 关联失败。与 `LoginHistory` 同样问题。
- 建议: 将 `email_verification_tokens` 和 `login_history` 的 FK 改为 `ON DELETE CASCADE`，或在应用层删除用户前先清理这些记录。

### [H5] `fix_template_step_order_v2` 数据修复逻辑覆盖范围过宽

- 文件: `prisma/migrations/20260416_fix_template_step_order_v2/migration.sql:18-24`
- 证据: Pass 2 的条件是 `WHERE "order" >= 10000`，此处假设业务数据中不存在 order >= 10000 的合法数据。若将来 template 步数超过 10000 或已有异常数据，Pass 2 会错误地将这些行的 order 减去 9999。
- 影响: 数据迁移潜在误操作，将来步数增长时可能触发隐患。
- 建议: 改用带 `templateId` 作用域的 CTE 更新，而非全表粗粒度偏移；或添加注释说明此修复为一次性操作且依赖业务约束。

### [H6] `TemplateRating.score` 无 CHECK 约束范围限制

- 文件: `prisma/schema.prisma:590`
- 证据: `score Int` 无任何 CHECK 约束，应用层假设 1-5 分，但 DB 层无保证。
- 影响: 异常数据（如 score = -999 或 score = 10000）可能污染 `ratingSum` 汇总，导致评分显示异常。
- 建议: 添加 `@db.SmallInt` 并在 migration 中 `ADD CONSTRAINT template_ratings_score_check CHECK (score BETWEEN 1 AND 5);`

### [H7] `Notification` 表无 TTL 清理，INAPP 通知永久堆积

- 文件: `prisma/schema.prisma:692-711`
- 证据: `notifications` 表无归档或清理策略，高频事件（CHANNEL_DOWN / SPENDING_RATE_EXCEEDED）可能在短时间内产生大量行。`status` 索引 `(status, createdAt)` 无过滤条件，每次查询未读通知扫描量持续增长。
- 影响: 通知列表查询变慢，DB 体积膨胀。
- 建议: 添加定时任务清理 30 天以上已读通知；或为通知表添加 TTL 分区。

---

## Medium

### [M1] 所有主键使用 CUID（随机字符串），B-Tree 索引碎片化

- 文件: `prisma/schema.prisma`（全局）
- 证据: 全库主键均为 `@id @default(cuid())`，cuid 虽然时间有序但不是单调递增，插入时会造成 B-Tree 页分裂。高写入表（`call_logs`、`transactions`）影响尤为显著。
- 影响: 高写入时 B-Tree 碎片率高，`VACUUM` 和 `AUTOVACUUM` 负担重。
- 建议: 对 `call_logs`、`transactions` 等高写入表，考虑改用 `BIGSERIAL GENERATED ALWAYS AS IDENTITY` 或 UUIDv7（时间有序），减少页分裂。现有数据不需要迁移，新表可直接采用。

### [M2] `rateLimit` 字段在多处使用 Json 而非枚举/结构化类型

- 文件: `prisma/schema.prisma:115`（User）、`prisma/schema.prisma:172`（Project）、`prisma/schema.prisma:198`（ApiKey）
- 证据: `rateLimit Json?` 字段在 User、Project、ApiKey 三处重复出现，无统一 schema 定义，JSON 结构完全依赖应用层约定。
- 影响: Schema drift 风险：不同版本代码写入不同 JSON 格式，查询时需 COALESCE 处理各种格式，难以添加 DB 层约束。
- 建议: 将 rateLimit 结构固化为独立表或至少在 JSON schema 注释中明确字段定义，并在应用层添加 Zod 校验。

### [M3] `CallLog.actionId` / `actionVersionId` / `templateRunId` 无外键约束

- 文件: `prisma/schema.prisma:398-400`
- 证据: 这三个字段为 `String?`，无对应的 FK 声明（关联到 `actions.id`、`action_versions.id` 的外键缺失）。
- 影响: 孤儿引用风险：Action 被删除后 CallLog 中的 `actionId` 指向不存在的记录，对账和审计查询需要 LEFT JOIN 防御处理。
- 建议: 添加 FK `onDelete: SetNull`；或至少添加注释说明这是意图设计（denormalized for audit retention）。

### [M4] `Transaction.traceId` 无唯一约束也无索引

- 文件: `prisma/schema.prisma:435`
- 证据: `traceId String?` 字段在 schema 中没有任何索引，而 `CallLog.traceId` 有唯一约束和索引。Transaction 通过 traceId 关联 CallLog 是常见查询路径，但缺乏索引支持。
- 影响: 通过 traceId 查找交易记录时全表扫描。
- 建议: 添加 `@@index([traceId])` 并考虑是否需要唯一约束（同一 trace 是否允许多条 transaction）。

### [M5] `Provider.authConfig` 存储明文 API Key，安全风险

- 文件: `prisma/schema.prisma:219`
- 证据: `authConfig Json` 字段在 seed.ts 中写入 `{ apiKey: "" }`，运营填入真实密钥后明文存储于数据库。无字段加密，任何有 DB 只读权限的角色均可读取所有服务商 API Key。
- 影响: DB 泄漏时所有 11 家服务商 API Key 同时暴露，影响面极大。
- 建议: 在应用层对 authConfig 做 AES-GCM 加密后存储（密钥由环境变量管理），查询时解密；或使用 PostgreSQL pgcrypto 扩展。

### [M6] `TemplateStep.lockedVersionId` 无外键约束

- 文件: `prisma/schema.prisma:608`、`prisma/migrations/20260415_workflow_polish_step_locked_version/migration.sql`
- 证据: `lockedVersionId String?` 字段用于锁定特定 ActionVersion，但无 FK 声明，删除 ActionVersion 时不触发任何级联行为。
- 影响: 锁定版本被删除后，执行 template 时查询该版本返回空，导致静默失败。
- 建议: 添加 FK `lockedVersionId -> action_versions.id ON DELETE SET NULL` 并在应用层处理 null 时回退到 activeVersionId。

### [M7] `SystemLog` / `HealthCheck` 无 level 复合索引

- 文件: `prisma/schema.prisma:639-650`、`prisma/schema.prisma:455-470`
- 证据: `system_logs` 只有 `@@index([category])` 和 `@@index([createdAt])`，常见查询是 `WHERE category = X AND level = 'ERROR' ORDER BY createdAt DESC`，缺少 `(category, level, createdAt)` 复合索引。
- 影响: 查询特定 category 下的 ERROR 级别日志时，需回表过滤 level，效率低。
- 建议: 添加 `@@index([category, level, createdAt(sort: Desc)])`。

### [M8] `RechargeOrder.transactionId` 唯一约束字段无 onDelete 联动

- 文件: `prisma/schema.prisma:485`
- 证据: `transactionId String? @unique` 引用一个 Transaction，但无 FK 声明，删除 Transaction 时 RechargeOrder 中的引用悬空。
- 影响: 数据一致性风险，查询充值订单关联交易时可能返回已删除记录的 ID。
- 建议: 声明 FK `@relation(fields: [transactionId], references: [id], onDelete: SetNull)`。

---

## Low

### [L1] `seed.ts` 幂等性有限 — Provider 更新不覆盖 authConfig

- 文件: `prisma/seed.ts:326-342`
- 证据: `provider.upsert` 的 `update` 块不包含 `authConfig`，重新运行 seed 不会覆盖已有的 authConfig（包括管理员手动填入的真实 API Key），这是故意设计。但 `ProviderConfig.upsert` 的 `update` 块会覆盖 `pricingOverrides`，可能清除运营手动修改的定价。
- 影响: 重跑 seed 可能意外重置 pricingOverrides 为 seed 中的默认值。
- 建议: 在 ProviderConfig upsert 的 `update` 块中排除 `pricingOverrides`，或添加注释说明此行为是预期的。

### [L2] `seed.ts` 中包含明文弱密码

- 文件: `prisma/seed.ts:283`
- 证据: `hashSync("admin123", 12)` — 管理员默认密码为 `admin123`，虽然经过 bcrypt 哈希，但密码本身极弱。
- 影响: 生产环境若未修改密码，账号极易被字典攻击。
- 建议: seed 仅用于 dev/test 环境，添加注释明确禁止在生产环境直接使用；同时在应用层启动检查中如果检测到默认密码未修改则发出警告。

### [L3] `models_enabled_idx` 重复 — `@@index([enabled])` 与 `@@index([name])` 低选择性

- 文件: `prisma/schema.prisma:275-277`
- 证据: `models` 表有 `@@index([enabled])` 索引，但 `enabled` 字段只有 true/false 两个值，选择性极低（约 50%），B-Tree 索引几乎无用，Planner 大概率选择 Seq Scan。
- 影响: 浪费索引存储空间，维护写放大。
- 建议: 改为部分索引 `CREATE INDEX ON models(name) WHERE enabled = true`，同时覆盖常用查询（只查已启用模型）。

### [L4] `Transaction.callLogId` 无索引

- 文件: `prisma/schema.prisma:437`
- 证据: `callLogId String?` 用于关联 CallLog，但无索引，且无 FK 约束（孤儿引用风险同 M3）。
- 影响: 通过 callLogId 反查交易时全表扫描。
- 建议: 添加 `@@index([callLogId])` 并考虑添加 FK。

### [L5] `Notification.projectId` 无索引

- 文件: `prisma/schema.prisma:695`
- 证据: `projectId String?` 无索引，也无 FK。项目维度的通知查询会全表扫描。
- 影响: 项目详情页查询相关通知时性能差。
- 建议: 添加索引；若 projectId 与 userId 常一起查询，可以用覆盖索引 `(userId, projectId, createdAt DESC)`。

### [L6] `TIMESTAMP(3)` 精度而非 `timestamptz` — 无时区信息

- 文件: `prisma/schema.prisma`（全局），所有 `createdAt`、`updatedAt`、`expiresAt` 等
- 证据: Prisma 对 PostgreSQL 使用 `TIMESTAMP(3)` 而非 `TIMESTAMPTZ`。虽然项目目前统一使用 UTC（`DEFAULT CURRENT_TIMESTAMP`），但存储层无时区强制，多时区部署时存在歧义。
- 影响: 如未来部署到多时区环境，时间查询可能出现偏差。这是 Prisma 的已知设计决策，影响可控。
- 建议: 在 DB 层设置 `timezone = 'UTC'`（`SET TIME ZONE 'UTC'`），在 `postgresql.conf` 或连接字符串中固化，防止意外漂移。

### [L7] `ProviderConfig` 无 `createdAt` 字段

- 文件: `prisma/schema.prisma:233-254`
- 证据: `provider_configs` 表只有 `updatedAt` 无 `createdAt`，无法追溯配置初次创建时间。
- 影响: 审计时无法判断配置是何时建立的。
- 建议: 添加 `createdAt DateTime @default(now())`（不锁表）。

---

## Info

### [I1] `fix_template_step_order_base` 作为 no-op 占位符存在但保留在历史中

- 文件: `prisma/migrations/20260416_fix_template_step_order_base/migration.sql`
- 证据: 整个 migration 仅执行 `SELECT 1`，注释说明原始逻辑已移至 v2。
- 影响: 无功能影响，但 migration 历史存在哑迁移，可能让新开发者困惑。
- 建议: 在文件顶部注释中补充更完整的上下文（为什么失败、v2 是哪个文件），方便后续维护者理解。

### [I2] `users_email_idx` 与 `users_email_key`（UNIQUE） 重复索引

- 文件: `prisma/schema.prisma:133`、`prisma/migrations/20260329065335_init/migration.sql:212-215`
- 证据: `email @unique` 已隐式创建 `users_email_key` 唯一索引，而 `@@index([email])` 再次创建 `users_email_idx`，两者完全重叠。
- 影响: 写放大，多余索引维护开销。可考虑移除 `@@index([email])`。

### [I3] `TemplateTestRun.mode` / `.status` 使用 `String` 而非枚举

- 文件: `prisma/schema.prisma:569-570`
- 证据: `mode String` 和 `status String` 用于描述测试运行状态，无 enum 约束，应用层用字符串字面量区分。
- 影响: 无 DB 约束，可能写入无效值；查询时无法利用枚举的 CHECK 约束。
- 建议: 定义 `TemplateTestRunMode` 和 `TemplateTestRunStatus` 枚举，与其他状态字段保持一致风格。

### [I4] `channels` 表 unique 约束变更历史（`_realModelId` 去掉后有效性验证缺失）

- 文件: `prisma/migrations/20260329065335_init/migration.sql:248` 与 `prisma/schema.prisma:365`
- 证据: Init migration 中唯一约束为 `(providerId, modelId, realModelId)`，但当前 schema 已改为 `(providerId, modelId)`，没有对应 migration 修改该约束的记录（可能在某次中间 migration 通过 DROP + RECREATE 完成）。
- 影响: 无直接 bug，但历史 migration 链与最终 schema 存在微小不一致，`prisma migrate status` 可能报告差异。
- 建议: 确认 `prisma migrate status` 状态正常；如有漂移，使用 `prisma migrate resolve` 标记。
