/**
 * MSW Node server — used by Vitest (unit + integration) to intercept
 * fetch calls to external services. Lifecycle is wired in tests/setup.ts:
 *   beforeAll → server.listen
 *   afterEach → server.resetHandlers (so test-local overrides clear)
 *   afterAll  → server.close
 */
import { setupServer } from "msw/node";

import { handlers } from "./handlers";

export const server = setupServer(...handlers);
