/**
 * 测试环境加载器
 *
 * 确保脚本进程使用与 codex-setup.sh 服务进程相同的 DATABASE_URL。
 * 在创建 PrismaClient 之前 import 此文件。
 *
 * 逻辑：
 * 1. 如果 DATABASE_URL 已设置且包含 "_test" → 已在正确环境，跳过
 * 2. 如果 codex-env.sh 存在 → 解析其中的环境变量并 apply 到 process.env
 * 3. 否则使用 .env 默认值（本地开发模式）
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadTestEnv(): void {
  // Already pointing to test database
  if (process.env.DATABASE_URL?.includes("_test")) return;

  const envFile = resolve(__dirname, "../../scripts/test/codex-env.sh");
  if (!existsSync(envFile)) return;

  const content = readFileSync(envFile, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^export\s+([A-Z_][A-Z0-9_]*)="([^"]*)"/);
    if (match) {
      const [, key, value] = match;
      // Only set if not already defined in current environment
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadTestEnv();
