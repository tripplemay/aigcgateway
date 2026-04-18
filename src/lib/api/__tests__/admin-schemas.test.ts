import { describe, it, expect } from "vitest";
import {
  providerConfigUpdateSchema,
  channelUpdateSchema,
  modelCreateSchema,
  modelUpdateSchema,
  providerCreateSchema,
  providerUpdateSchema,
} from "../admin-schemas";

// F-IG-01: strict whitelists block mass assignment (CRIT-8/H-11/H-12) +
// baseUrl protocol refine blocks non-http(s) schemes (H-29).
describe("admin-schemas — strict unknown-field rejection", () => {
  it("providerConfigUpdate rejects stray apiKey / id / providerId", () => {
    expect(() =>
      providerConfigUpdateSchema.parse({ apiKey: "fake", id: "fake" }),
    ).toThrow();
    expect(() => providerConfigUpdateSchema.parse({ providerId: "pid" })).toThrow();
    // Valid partial update still passes
    expect(providerConfigUpdateSchema.parse({ temperatureMin: 0.1 })).toEqual({
      temperatureMin: 0.1,
    });
  });

  it("channelUpdate rejects providerId / createdAt and unknown status", () => {
    expect(() =>
      channelUpdateSchema.parse({ status: "HIJACKED", createdAt: "2000-01-01" }),
    ).toThrow();
    expect(() => channelUpdateSchema.parse({ providerId: "other" })).toThrow();
    expect(channelUpdateSchema.parse({ priority: 5, status: "DISABLED" })).toEqual({
      priority: 5,
      status: "DISABLED",
    });
  });

  it("modelCreate rejects projectId / id", () => {
    expect(() =>
      modelCreateSchema.parse({
        name: "m",
        displayName: "M",
        modality: "TEXT",
        projectId: "other",
      }),
    ).toThrow();
    expect(() =>
      modelCreateSchema.parse({
        name: "m",
        displayName: "M",
        modality: "TEXT",
        id: "spoof",
      }),
    ).toThrow();
  });

  it("modelUpdate rejects unknown capability keys", () => {
    expect(() =>
      modelUpdateSchema.parse({ capabilities: { hax: true } }),
    ).toThrow();
    expect(
      modelUpdateSchema.parse({
        capabilities: { streaming: true, vision: false },
      }),
    ).toMatchObject({ capabilities: { streaming: true, vision: false } });
  });
});

describe("admin-schemas — baseUrl protocol guard (H-29)", () => {
  it("providerCreate rejects file:// baseUrl", () => {
    expect(() =>
      providerCreateSchema.parse({
        name: "p",
        displayName: "P",
        baseUrl: "file:///etc/passwd",
      }),
    ).toThrow();
  });

  it("providerCreate rejects javascript: baseUrl", () => {
    expect(() =>
      providerCreateSchema.parse({
        name: "p",
        displayName: "P",
        baseUrl: "javascript:alert(1)",
      }),
    ).toThrow();
  });

  it("providerUpdate rejects ftp:// baseUrl", () => {
    expect(() =>
      providerUpdateSchema.parse({ baseUrl: "ftp://example.com" }),
    ).toThrow();
  });

  it("providerUpdate accepts http(s) baseUrl", () => {
    expect(providerUpdateSchema.parse({ baseUrl: "https://api.example.com" })).toEqual({
      baseUrl: "https://api.example.com",
    });
    expect(providerUpdateSchema.parse({ baseUrl: "http://localhost:8080" })).toEqual({
      baseUrl: "http://localhost:8080",
    });
  });
});
