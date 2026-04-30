/**
 * Vitest global setup — loaded by setupFiles in vitest.config.ts.
 *
 * Wires:
 *   - @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
 *   - MSW Node server lifecycle (listen / resetHandlers / close)
 *
 * `onUnhandledRequest: "warn"` keeps unrelated fetch calls (next/font CDN,
 * etc.) from turning into hard failures while still surfacing the noise
 * during triage. Tests that deliberately probe an un-mocked URL can
 * silence the warning by registering an explicit handler with
 * `server.use(...)`.
 */
import "@testing-library/jest-dom/vitest";

import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
