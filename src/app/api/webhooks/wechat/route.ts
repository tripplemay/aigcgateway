/**
 * POST /api/webhooks/wechat — 微信支付回调
 *
 * 1. 验证签名（P1 简化：解析 JSON body）
 * 2. 处理入账
 * 3. 返回 200 + { code: "SUCCESS" }
 */

import { NextResponse } from "next/server";
import { processPaymentCallback, markOrderFailed } from "@/lib/billing/payment";

export async function POST(request: Request) {
  let body: {
    resource?: {
      ciphertext?: string;
      original_type?: string;
      // 解密后的明文（P1 简化：假设已解密）
      plaintext?: string;
    };
    event_type?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "FAIL", message: "Invalid body" }, { status: 400 });
  }

  // TODO: P2 实现 WECHATPAY2-SHA256-RSA2048 签名验证 + AES-256-GCM 解密
  // const signValid = verifyWechatSign(request.headers, rawBody);
  // const decrypted = decryptWechatNotification(body.resource.ciphertext);

  // P1 简化：直接解析（生产环境必须验签+解密）
  const eventType = body.event_type;

  // 尝试解析明文
  let notification: { out_trade_no?: string; trade_state?: string } = {};
  try {
    if (body.resource?.plaintext) {
      notification = JSON.parse(body.resource.plaintext);
    } else if (body.resource?.ciphertext) {
      // P1: 假设 ciphertext 是明文 JSON（仅开发环境）
      notification = JSON.parse(body.resource.ciphertext);
    }
  } catch {
    // 解析失败
  }

  const outTradeNo = notification.out_trade_no;
  const tradeState = notification.trade_state;

  if (!outTradeNo) {
    return NextResponse.json({ code: "FAIL", message: "Missing out_trade_no" }, { status: 400 });
  }

  if (tradeState === "SUCCESS") {
    const result = await processPaymentCallback(outTradeNo, body);
    if (!result.success && !result.alreadyProcessed) {
      console.error("[wechat-webhook] process failed:", result.message);
    }
  } else if (tradeState === "CLOSED" || tradeState === "REVOKED" || tradeState === "PAYERROR") {
    await markOrderFailed(outTradeNo, body);
  }

  return NextResponse.json({ code: "SUCCESS" });
}
