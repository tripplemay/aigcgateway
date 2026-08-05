/**
 * BL-SEC-HOTFIX-2608 F-SH-05 — MCP create_api_key 权限继承（审查 C5 回归）。
 *
 * 修复前 create_api_key 硬编码 `permissions: {}`。由于 checkMcpPermission 只在
 * `=== false` 时拒绝，空对象等价于**全部权限**——一把只有 keyManagement、其余
 * 全 false 的受限 Key，可以铸造出能 chat / 生成图片 / 读日志的全权限 Key。
 *
 * 这里用 derivePermissionsForNewKey + checkMcpPermission 组合验证「权限边界不可
 * 通过创建新 Key 突破」这一性质本身，而不是只断言某个字段值。
 */
import { describe, it, expect } from "vitest";
import { derivePermissionsForNewKey, checkMcpPermission } from "@/lib/mcp/auth";
import { API_KEY_PERMISSION_KEYS, type ApiKeyPermissions } from "@/lib/api/auth-middleware";

/** 新 Key 在某权限上是否被放行 */
const allows = (perms: Partial<ApiKeyPermissions>, k: keyof ApiKeyPermissions) =>
  checkMcpPermission(perms, k) === null;

describe("F-SH-05 权限继承", () => {
  it("keyManagement-only 的受限 Key，创建出的新 Key 不得具备任何被禁权限", () => {
    const caller: Partial<ApiKeyPermissions> = {
      keyManagement: true,
      chatCompletion: false,
      imageGeneration: false,
      logAccess: false,
      projectInfo: false,
    };

    const derived = derivePermissionsForNewKey(caller);

    expect(allows(derived, "chatCompletion")).toBe(false);
    expect(allows(derived, "imageGeneration")).toBe(false);
    expect(allows(derived, "logAccess")).toBe(false);
    expect(allows(derived, "projectInfo")).toBe(false);
    // 调用方自己有的权限可以传下去
    expect(allows(derived, "keyManagement")).toBe(true);
  });

  it("性质断言：任何被调用方禁止的权限，新 Key 一律不得放行", () => {
    // 遍历所有单项禁用组合，确保没有任何一位漏掉继承
    for (const denied of API_KEY_PERMISSION_KEYS) {
      const caller: Partial<ApiKeyPermissions> = { [denied]: false };
      const derived = derivePermissionsForNewKey(caller);
      expect(
        allows(derived, denied),
        `权限 ${denied} 被调用方禁用，但新 Key 仍被放行`,
      ).toBe(false);
    }
  });

  it("全权限 Key（permissions={}）创建新 Key 的行为与修复前一致", () => {
    const derived = derivePermissionsForNewKey({});
    expect(derived).toEqual({});
    for (const k of API_KEY_PERMISSION_KEYS) {
      expect(allows(derived, k)).toBe(true);
    }
  });

  it("显式 true 不会被降级为 false", () => {
    const caller: Partial<ApiKeyPermissions> = { chatCompletion: true, logAccess: false };
    const derived = derivePermissionsForNewKey(caller);
    expect(allows(derived, "chatCompletion")).toBe(true);
    expect(allows(derived, "logAccess")).toBe(false);
  });

  it("继承结果不可再放宽：用派生权限再派生一次是幂等的（不得逐级恢复权限）", () => {
    const caller: Partial<ApiKeyPermissions> = { chatCompletion: false, imageGeneration: false };
    const gen1 = derivePermissionsForNewKey(caller);
    const gen2 = derivePermissionsForNewKey(gen1);
    expect(gen2).toEqual(gen1);
    // 链式创建多代也不能把 chatCompletion 拿回来
    const gen3 = derivePermissionsForNewKey(gen2);
    expect(allows(gen3, "chatCompletion")).toBe(false);
  });
});

describe("F-SH-05 权限位清单完整性", () => {
  it("API_KEY_PERMISSION_KEYS 覆盖 ApiKeyPermissions 的全部字段", () => {
    // 该清单由 Record<keyof ApiKeyPermissions, true> 推导，新增权限位若未补齐会编译报错；
    // 这里再做一次运行时断言，锁住数量，防止有人改成手写数组后悄悄漏项。
    expect(API_KEY_PERMISSION_KEYS.sort()).toEqual(
      ["chatCompletion", "imageGeneration", "keyManagement", "logAccess", "projectInfo"].sort(),
    );
  });
});
