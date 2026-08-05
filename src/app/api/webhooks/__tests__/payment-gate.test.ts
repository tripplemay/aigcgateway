/**
 * BL-SEC-HOTFIX-2608 F-SH-02 — 支付端点总开关回归测试。
 *
 * 背景（docs/code-review/backend-fullscan-2026-08-04.md C1/C2）：两个支付回调
 * 完全无验签，配合 /api/projects/:id/recharge 把 order.id 当 paymentOrderId
 * 直接回传给调用方，构成「任意用户自助无限充值」。审查确认该链路从未接通，
 * 裁决为关闭端点而非实现验签。
 *
 * 本测试锁死两件事：
 *   1. PAYMENT_ENABLED 未显式为 "true" 时，三个端点一律 410
 *   2. 关闭时不得触达 processPaymentCallback / markOrderFailed / 创建订单
 *
 * 特别覆盖 PAYMENT_ENABLED="false" 这一档——若将来有人把开关改成
 * z.coerce.boolean()，"false" 会被 coerce 成 true，这条用例会立刻变红。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const processPaymentCallbackMock = vi.fn();
const markOrderFailedMock = vi.fn();
const rechargeOrderCreateMock = vi.fn();
const verifyJwtMock = vi.fn();

vi.mock("@/lib/billing/payment", () => ({
  processPaymentCallback: (...a: unknown[]) => processPaymentCallbackMock(...a),
  markOrderFailed: (...a: unknown[]) => markOrderFailedMock(...a),
}));

vi.mock("@/lib/api/jwt-middleware", () => ({
  verifyJwt: (req: Request) => verifyJwtMock(req),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: vi.fn(async () => ({ id: "p1", userId: "u1" })) },
    rechargeOrder: {
      create: (...a: unknown[]) => rechargeOrderCreateMock(...a),
      update: vi.fn(),
    },
  },
}));

import { POST as alipayPOST } from "../alipay/route";
import { POST as wechatPOST } from "../wechat/route";
import { POST as rechargePOST } from "../../projects/[id]/recharge/route";

const ORIGINAL = process.env.PAYMENT_ENABLED;

function alipayReq() {
  return new Request("http://localhost/api/webhooks/alipay", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "out_trade_no=order-1&trade_status=TRADE_SUCCESS&total_amount=50",
  });
}

function wechatReq() {
  return new Request("http://localhost/api/webhooks/wechat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_type: "TRANSACTION.SUCCESS",
      resource: { plaintext: JSON.stringify({ out_trade_no: "order-1", trade_state: "SUCCESS" }) },
    }),
  });
}

function rechargeReq() {
  return new Request("http://localhost/api/projects/p1/recharge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 50, paymentMethod: "alipay" }),
  });
}

beforeEach(() => {
  processPaymentCallbackMock.mockReset();
  markOrderFailedMock.mockReset();
  rechargeOrderCreateMock.mockReset();
  verifyJwtMock.mockReset();
  verifyJwtMock.mockReturnValue({ ok: true, payload: { userId: "u1" } });
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PAYMENT_ENABLED;
  else process.env.PAYMENT_ENABLED = ORIGINAL;
});

describe("F-SH-02 支付端点在开关关闭时一律 410", () => {
  for (const [label, value] of [
    ["未设置", undefined],
    ['显式 "false"', "false"],
    ["空字符串", ""],
    ['大小写不匹配 "TRUE"', "TRUE"],
  ] as const) {
    describe(`PAYMENT_ENABLED ${label}`, () => {
      beforeEach(() => {
        if (value === undefined) delete process.env.PAYMENT_ENABLED;
        else process.env.PAYMENT_ENABLED = value;
      });

      it("alipay webhook → 410 且不入账", async () => {
        const res = await alipayPOST(alipayReq());
        expect(res.status).toBe(410);
        expect(processPaymentCallbackMock).not.toHaveBeenCalled();
        expect(markOrderFailedMock).not.toHaveBeenCalled();
      });

      it("wechat webhook → 410 且不入账", async () => {
        const res = await wechatPOST(wechatReq());
        expect(res.status).toBe(410);
        expect(processPaymentCallbackMock).not.toHaveBeenCalled();
        expect(markOrderFailedMock).not.toHaveBeenCalled();
      });

      it("recharge 下单 → 410 payment_disabled 且不创建订单", async () => {
        const res = await rechargePOST(rechargeReq(), { params: { id: "p1" } });
        expect(res.status).toBe(410);
        const body = await res.json();
        expect(body.error.code).toBe("payment_disabled");
        expect(rechargeOrderCreateMock).not.toHaveBeenCalled();
      });
    });
  }
});

describe("F-SH-02 开关显式打开时放行到原有逻辑", () => {
  beforeEach(() => {
    process.env.PAYMENT_ENABLED = "true";
  });

  it("alipay webhook 不再被闸门拦截，进入原回调处理", async () => {
    processPaymentCallbackMock.mockResolvedValue({
      success: true,
      alreadyProcessed: false,
      message: "ok",
    });
    const res = await alipayPOST(alipayReq());
    expect(res.status).toBe(200);
    expect(processPaymentCallbackMock).toHaveBeenCalledTimes(1);
  });

  it("recharge 下单不再被闸门拦截，进入原下单流程", async () => {
    rechargeOrderCreateMock.mockResolvedValue({
      id: "o1",
      amount: 50,
      paymentMethod: "alipay",
      expiresAt: new Date(),
    });
    const res = await rechargePOST(rechargeReq(), { params: { id: "p1" } });
    expect(res.status).not.toBe(410);
    expect(rechargeOrderCreateMock).toHaveBeenCalledTimes(1);
  });
});
