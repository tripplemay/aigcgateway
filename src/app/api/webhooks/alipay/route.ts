export const dynamic = "force-dynamic";
/**
 * POST /api/webhooks/alipay — 支付宝回调
 *
 * 1. 验证签名（P1 简化：检查 trade_status）
 * 2. 处理入账
 * 3. 返回 "success"
 */

import { NextResponse } from "next/server";
import { processPaymentCallback, markOrderFailed } from "@/lib/billing/payment";

export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    // 支付宝回调是 form-urlencoded 格式
    const text = await request.text();
    body = Object.fromEntries(new URLSearchParams(text));
  } catch {
    return new NextResponse("fail", { status: 400 });
  }

  const tradeStatus = body.trade_status;
  const outTradeNo = body.out_trade_no;

  if (!outTradeNo) {
    return new NextResponse("fail", { status: 400 });
  }

  // TODO: P2 实现 RSA2 签名验证
  // const signValid = verifyAlipaySign(body);
  // if (!signValid) return new NextResponse("fail", { status: 400 });

  if (tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED") {
    const result = await processPaymentCallback(outTradeNo, body);
    if (!result.success && !result.alreadyProcessed) {
      console.error("[alipay-webhook] process failed:", result.message);
    }
  } else if (tradeStatus === "TRADE_CLOSED") {
    await markOrderFailed(outTradeNo, body);
  }

  // 支付宝要求返回 "success" 字符串
  return new NextResponse("success", { status: 200 });
}
