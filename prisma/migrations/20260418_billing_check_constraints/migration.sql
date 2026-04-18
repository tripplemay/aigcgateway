-- BL-SEC-BILLING-AI / F-BA-03
-- DB-level CHECK constraints for Transaction.amount sign + TemplateRating.score range.
-- Prisma does not support @@check, so constraints are declared here and
-- documented in schema.prisma model comments.

-- 1. Pre-flight: fail loudly (RAISE EXCEPTION) if historic rows violate the
--    rules we are about to enforce. Prevents silent ALTER TABLE failure and
--    forces ops to clean data intentionally before constraint lands.
DO $$
DECLARE
  v_bad_tx INT;
  v_bad_rating INT;
BEGIN
  SELECT COUNT(*) INTO v_bad_tx FROM "transactions" WHERE
    ("type" IN ('DEDUCTION', 'REFUND') AND "amount" >= 0) OR
    ("type" IN ('RECHARGE', 'BONUS') AND "amount" < 0);
  IF v_bad_tx > 0 THEN
    RAISE EXCEPTION '% transactions violate amount-sign rule; inspect with: SELECT * FROM transactions WHERE (type IN (''DEDUCTION'',''REFUND'') AND amount >= 0) OR (type IN (''RECHARGE'',''BONUS'') AND amount < 0);', v_bad_tx;
  END IF;

  SELECT COUNT(*) INTO v_bad_rating FROM "template_ratings" WHERE "score" < 1 OR "score" > 5;
  IF v_bad_rating > 0 THEN
    RAISE EXCEPTION '% template_ratings violate score range [1,5]; inspect with: SELECT * FROM template_ratings WHERE score < 1 OR score > 5;', v_bad_rating;
  END IF;
END $$;

-- 2. Transaction.amount sign check
--    DEDUCTION / REFUND must be negative (outflow)
--    RECHARGE / BONUS must be non-negative (inflow)
--    ADJUSTMENT is allowed either direction (manual reconciliation)
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_sign_check" CHECK (
  ("type" IN ('DEDUCTION', 'REFUND') AND "amount" < 0) OR
  ("type" IN ('RECHARGE', 'BONUS') AND "amount" >= 0) OR
  ("type" = 'ADJUSTMENT')
);

-- 3. TemplateRating.score range check
ALTER TABLE "template_ratings" ADD CONSTRAINT "template_ratings_score_range_check"
  CHECK ("score" >= 1 AND "score" <= 5);
