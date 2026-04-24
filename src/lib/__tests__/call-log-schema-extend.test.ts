/**
 * F-BAX-01 regression — CallLog schema extension.
 *
 * Migration `20260424_call_logs_source_extend` 将 call_logs.projectId 改为
 * nullable，使 probe / sync / admin_health 等系统路径可以写入 call_logs
 * 做统一审计。
 *
 * 本测试验证 Prisma Client 类型契约：
 *   1) CallLog.projectId 在 Input 层接受 null（非空约束已去除）
 *   2) CallLog.source 接受新扩展值 'probe' / 'sync' / 'admin_health'（String 类型）
 *   3) prisma.callLog.create 以这些入参调用不会抛错（mock 层）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Prisma } from "@prisma/client";

const createMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    callLog: {
      create: (args: Prisma.CallLogCreateArgs) => createMock(args),
    },
  },
}));

import { prisma } from "@/lib/prisma";

describe("CallLog schema extension (F-BAX-01)", () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({ id: "cl_test" });
  });

  it("accepts projectId=null with source='probe'", async () => {
    const data: Prisma.CallLogUncheckedCreateInput = {
      traceId: "probe_test_1",
      projectId: null,
      channelId: null,
      modelName: "probe-model",
      promptSnapshot: {},
      status: "SUCCESS",
      source: "probe",
    };
    await prisma.callLog.create({ data });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].data.projectId).toBeNull();
    expect(createMock.mock.calls[0][0].data.source).toBe("probe");
  });

  it("accepts projectId=null with source='sync'", async () => {
    const data: Prisma.CallLogUncheckedCreateInput = {
      traceId: "sync_classifier_1",
      projectId: null,
      modelName: "deepseek-chat",
      promptSnapshot: {},
      status: "SUCCESS",
      source: "sync",
    };
    await prisma.callLog.create({ data });
    expect(createMock.mock.calls[0][0].data.source).toBe("sync");
  });

  it("accepts projectId=null with source='admin_health'", async () => {
    const data: Prisma.CallLogUncheckedCreateInput = {
      traceId: "admin_health_1",
      projectId: null,
      modelName: "gpt-4o",
      promptSnapshot: {},
      status: "SUCCESS",
      source: "admin_health",
    };
    await prisma.callLog.create({ data });
    expect(createMock.mock.calls[0][0].data.source).toBe("admin_health");
  });

  it("still accepts a non-null projectId with legacy source='api'", async () => {
    const data: Prisma.CallLogUncheckedCreateInput = {
      traceId: "api_user_1",
      projectId: "proj_xyz",
      modelName: "gpt-4o",
      promptSnapshot: {},
      status: "SUCCESS",
      source: "api",
    };
    await prisma.callLog.create({ data });
    expect(createMock.mock.calls[0][0].data.projectId).toBe("proj_xyz");
  });
});
