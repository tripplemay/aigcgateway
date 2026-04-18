import { describe, it, expect } from "vitest";
import { checkMcpPermission } from "../auth";
import type { ApiKeyPermissions } from "@/lib/api/auth-middleware";

// F-IG-04: MCP 权限 + IP 白名单语义统一回归
// checkMcpPermission 只对 === false 拒绝，undefined / true 放行。
describe("checkMcpPermission", () => {
  it("returns null for permission === true (allowed)", () => {
    const perms: Partial<ApiKeyPermissions> = { projectInfo: true };
    expect(checkMcpPermission(perms, "projectInfo")).toBeNull();
  });

  it("returns null for permission === undefined (default allowed)", () => {
    const perms: Partial<ApiKeyPermissions> = {};
    expect(checkMcpPermission(perms, "projectInfo")).toBeNull();
  });

  it("returns error message for permission === false", () => {
    const perms: Partial<ApiKeyPermissions> = { projectInfo: false };
    expect(checkMcpPermission(perms, "projectInfo")).toBe("API key lacks projectInfo permission");
  });

  it("other permissions remain independent", () => {
    const perms: Partial<ApiKeyPermissions> = { projectInfo: true, chatCompletion: false };
    expect(checkMcpPermission(perms, "projectInfo")).toBeNull();
    expect(checkMcpPermission(perms, "chatCompletion")).toBe(
      "API key lacks chatCompletion permission",
    );
  });
});
