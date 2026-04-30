-- ROLLBACK: DROP FUNCTION for functions created in this migration
-- BL-IMAGE-PRICING-OR-P2 F-BIPOR-02: DB 层 trigger 兜底校验。
-- 应用层 (admin-schemas.validateChannelPriceForModality + PATCH 400) 已先行
-- 拦截，本 trigger 是数据完整性最后一道闸：禁止任何路径（直连 SQL / 旧版
-- 应用 / migration script）把 IMAGE channel 的 costPrice 写成 全 0。
--
-- CHECK 约束不能跨表 JOIN models.modality，所以用 PL/pgSQL trigger。
-- BEFORE INSERT OR UPDATE OF costPrice, modelId — 仅这两个字段变化时触发，
-- 不影响 priority 重排或 status 切换的写入路径。

CREATE OR REPLACE FUNCTION validate_image_channel_pricing()
RETURNS TRIGGER AS $$
DECLARE
  v_modality TEXT;
BEGIN
  SELECT modality::text INTO v_modality FROM models WHERE id = NEW."modelId";
  IF v_modality = 'IMAGE' THEN
    IF NOT (
      (NEW."costPrice"->>'unit' = 'call' AND COALESCE((NEW."costPrice"->>'perCall')::numeric, 0) > 0)
      OR (NEW."costPrice"->>'unit' = 'token' AND
          (COALESCE((NEW."costPrice"->>'inputPer1M')::numeric, 0) > 0
           OR COALESCE((NEW."costPrice"->>'outputPer1M')::numeric, 0) > 0))
    ) THEN
      RAISE EXCEPTION
        'IMAGE channel costPrice must have call.perCall>0 OR token.inputPer1M>0 OR token.outputPer1M>0 (channelId=%, modelId=%)',
        NEW.id, NEW."modelId"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_image_channel_pricing ON channels;
CREATE TRIGGER trg_validate_image_channel_pricing
BEFORE INSERT OR UPDATE OF "costPrice", "modelId" ON channels
FOR EACH ROW EXECUTE FUNCTION validate_image_channel_pricing();
