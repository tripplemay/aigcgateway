-- ROLLBACK: ALTER TABLE ... DROP CONSTRAINT for constraints added in this migration
-- BL-SEC-BILLING-CHECK-FOLLOWUP / F-BCF-01
-- v2: supersedes the failed 20260418_billing_check_constraints (v1).
-- v1's DO block mis-classified REFUND (amount >= 0) as a violation and aborted.
-- Correct sign rule per codebase:
--   DEDUCTION              amount < 0   (balance delta, outflow)
--   REFUND / RECHARGE      amount >= 0  (inflow / return of funds)
--   BONUS                  amount >= 0  (inflow)
--   ADJUSTMENT             any sign     (admin correction)

-- 1. Pre-flight guard: fail loudly if historic rows violate the corrected rule.
DO $$
DECLARE
  v_bad_tx INT;
  v_bad_rating INT;
BEGIN
  SELECT COUNT(*) INTO v_bad_tx FROM "transactions" WHERE
    ("type" = 'DEDUCTION' AND "amount" >= 0) OR
    ("type" IN ('REFUND', 'RECHARGE', 'BONUS') AND "amount" < 0);
  IF v_bad_tx > 0 THEN
    RAISE EXCEPTION '% transactions violate amount-sign rule. DEDUCTION must be < 0; REFUND/RECHARGE/BONUS must be >= 0. Inspect: SELECT * FROM transactions WHERE (type=''DEDUCTION'' AND amount >= 0) OR (type IN (''REFUND'',''RECHARGE'',''BONUS'') AND amount < 0);', v_bad_tx;
  END IF;

  SELECT COUNT(*) INTO v_bad_rating FROM "template_ratings" WHERE "score" < 1 OR "score" > 5;
  IF v_bad_rating > 0 THEN
    RAISE EXCEPTION '% template_ratings violate score range [1,5]; inspect: SELECT * FROM template_ratings WHERE score < 1 OR score > 5;', v_bad_rating;
  END IF;
END $$;

-- 2. Transaction.amount sign check (corrected rule)
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_sign_check" CHECK (
  ("type" = 'DEDUCTION' AND "amount" < 0) OR
  ("type" IN ('REFUND', 'RECHARGE', 'BONUS') AND "amount" >= 0) OR
  ("type" = 'ADJUSTMENT')
);

-- 3. TemplateRating.score range check (unchanged from v1; v1 was never applied)
ALTER TABLE "template_ratings" ADD CONSTRAINT "template_ratings_score_range_check"
  CHECK ("score" >= 1 AND "score" <= 5);
