-- ROLLBACK: revert commit; PostgreSQL ALTER TYPE ... ADD VALUE is not reversible — manual SQL recovery required (drop + recreate enum or accept residual value)
-- BL-IMG-GUANGTECH-CHANNEL F-GTI-02 — NotificationEventType 增加 SYNC_IMAGE_CHANNEL_SKIPPED
--
-- 背景：model-sync 按 F-SI-01 的设计**跳过 IMAGE channel 创建**（DB 触发器
-- trg_validate_image_channel_pricing 禁止 costPrice 全零的 IMAGE channel，而
-- sync 拿不到真实图片单价），留待人工在 Admin 补 channel + 真实定价。该设计本身
-- 合理，但跳过记录只走 console.log —— 全仓 grep skippedImageChannels 只命中
-- model-sync.ts 自身，没有任何 UI / 通知 / SystemLog 消费它。
--
-- 后果：2026-07-03 的 sync 为 guangtech 建了 gpt-image-1 / -1.5 / -2 三行 models
-- 却没建 channel，无人知晓，三个模型静默不可用一个月，直到用户报障「guangtech
-- 无法生图」。这是 SYNC_RECONCILE_SKIPPED 那次事故（F-DSV4-03）的同款病根第二次
-- 复发：自动化主动放弃处置 = 必须有人来看一眼。

-- AlterEnum
ALTER TYPE "NotificationEventType" ADD VALUE 'SYNC_IMAGE_CHANNEL_SKIPPED';
