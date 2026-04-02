export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { runModelSync } from "@/lib/sync/model-sync";

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  // Fire-and-forget：立即返回 202，后台执行同步
  // runModelSync 内部已调用 setConfig 保存结果，前端通过 GET /admin/sync-status 轮询
  // 注意：当前 PM2 单进程长驻部署，fire-and-forget 安全。如未来迁移 serverless 平台需改用队列。
  runModelSync().catch((err) => console.error("[sync-models] background sync error:", err));

  return NextResponse.json({ message: "Sync started", status: "in_progress" }, { status: 202 });
}
