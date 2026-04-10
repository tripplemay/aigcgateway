import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue({});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: "proj-1", userId: "user-1", name: "Test" }),
    },
  },
}));

// Mock next/server to avoid pulling in the full Next.js runtime
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      _body: body,
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
    }),
  },
}));

import { authenticateApiKey } from "./auth-middleware";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  key?: string,
  extra?: { url?: string; headers?: Record<string, string> },
): Request {
  const headers: Record<string, string> = {};
  if (key) headers["authorization"] = `Bearer ${key}`;
  if (extra?.headers) Object.assign(headers, extra.headers);
  return new Request(extra?.url ?? "http://localhost/v1/chat/completions", { headers });
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

const BASE_USER = {
  id: "user-1",
  email: "test@test.com",
  role: "DEVELOPER",
  suspended: false,
  deletedAt: null,
  defaultProjectId: "proj-1",
};

const BASE_API_KEY = {
  id: "key-1",
  userId: "user-1",
  keyHash: hashKey("pk_test123"),
  keyPrefix: "pk_test",
  status: "ACTIVE",
  permissions: {},
  expiresAt: null,
  ipWhitelist: null,
  lastUsedAt: null,
  user: BASE_USER,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("authenticateApiKey", () => {
  it("rejects missing Authorization header", async () => {
    const req = makeRequest(); // no auth header
    const result = await authenticateApiKey(req);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(401);
      expect((result.error as any)._body.error.code).toBe("invalid_api_key");
    }
  });

  it("rejects malformed Authorization header (no Bearer prefix)", async () => {
    const req = new Request("http://localhost/v1/chat/completions", {
      headers: { authorization: "Token pk_test123" },
    });
    const result = await authenticateApiKey(req);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(401);
      expect((result.error as any)._body.error.message).toContain("Invalid Authorization format");
    }
  });

  it("rejects unknown API key (not found in database)", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const req = makeRequest("pk_unknown");
    const result = await authenticateApiKey(req);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(401);
      expect((result.error as any)._body.error.message).toBe("Invalid API key");
    }
  });

  it("rejects revoked API key", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...BASE_API_KEY, status: "REVOKED" });

    const req = makeRequest("pk_test123");
    const result = await authenticateApiKey(req);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(401);
      expect((result.error as any)._body.error.message).toBe("API key has been revoked");
    }
  });

  it("rejects expired API key and triggers async revocation", async () => {
    const expired = new Date(Date.now() - 86400_000).toISOString(); // 1 day ago
    mockFindUnique.mockResolvedValueOnce({ ...BASE_API_KEY, expiresAt: expired });

    const req = makeRequest("pk_test123");
    const result = await authenticateApiKey(req);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(401);
      expect((result.error as any)._body.error.message).toBe("API key has expired");
    }
    // The middleware fires an async update to revoke — verify it was called
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects suspended user", async () => {
    mockFindUnique.mockResolvedValueOnce({
      ...BASE_API_KEY,
      user: { ...BASE_USER, suspended: true },
    });

    const req = makeRequest("pk_test123");
    const result = await authenticateApiKey(req);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(403);
      expect((result.error as any)._body.error.code).toBe("account_suspended");
    }
  });

  it("rejects deleted user", async () => {
    mockFindUnique.mockResolvedValueOnce({
      ...BASE_API_KEY,
      user: { ...BASE_USER, deletedAt: new Date() },
    });

    const req = makeRequest("pk_test123");
    const result = await authenticateApiKey(req);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(403);
      expect((result.error as any)._body.error.code).toBe("account_deleted");
    }
  });

  it("rejects chat endpoint when chatCompletion permission is false", async () => {
    mockFindUnique.mockResolvedValueOnce({
      ...BASE_API_KEY,
      permissions: { chatCompletion: false },
    });

    const req = makeRequest("pk_test123", { url: "http://localhost/v1/chat/completions" });
    const result = await authenticateApiKey(req);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(403);
      expect((result.error as any)._body.error.message).toContain("chatCompletion");
    }
  });

  it("allows chat endpoint when chatCompletion permission is undefined (default allow)", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...BASE_API_KEY, permissions: {} });

    const req = makeRequest("pk_test123", { url: "http://localhost/v1/chat/completions" });
    const result = await authenticateApiKey(req);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.user.id).toBe("user-1");
    }
  });

  it("rejects IP not in whitelist", async () => {
    mockFindUnique.mockResolvedValueOnce({
      ...BASE_API_KEY,
      ipWhitelist: ["10.0.0.1"],
    });

    const req = makeRequest("pk_test123", {
      headers: { "x-forwarded-for": "192.168.1.1" },
    });
    const result = await authenticateApiKey(req);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(403);
      expect((result.error as any)._body.error.message).toContain("not in whitelist");
    }
  });

  it("returns AuthContext with user and project on success", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...BASE_API_KEY });

    const req = makeRequest("pk_test123");
    const result = await authenticateApiKey(req);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.user.id).toBe("user-1");
      expect(result.ctx.apiKey.id).toBe("key-1");
      expect(result.ctx.project).toBeTruthy();
    }
  });
});
