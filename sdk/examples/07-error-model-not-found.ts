/**
 * 示例 7：错误处理 — ModelNotFoundError
 *
 * npx tsx examples/07-error-model-not-found.ts
 */
import { Gateway, ModelNotFoundError, GatewayError } from "../src/index";

const gw = new Gateway({
  apiKey: process.env.GATEWAY_API_KEY ?? "pk_test",
  baseUrl: process.env.GATEWAY_BASE_URL ?? "http://localhost:3000",
});

async function main() {
  console.log("--- ModelNotFoundError 测试 ---");

  try {
    await gw.chat({
      model: "nonexistent/gpt-99",
      messages: [{ role: "user", content: "test" }],
    });
    console.log("❌ 应该抛错但没有");
  } catch (e) {
    if (e instanceof ModelNotFoundError) {
      console.log("✅ ModelNotFoundError");
      console.log("  status:", e.status);
      console.log("  code:", e.code);
      console.log("  model:", e.model);
      console.log("  message:", e.message);
    } else if (e instanceof GatewayError) {
      console.log("⚠️ GatewayError:", e.status, e.code, e.message);
    } else {
      console.log("⚠️ 未知错误:", (e as Error).message);
    }
  }
}

main().catch(console.error);
