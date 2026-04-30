/**
 * MSW service worker — used by Playwright E2E tests that need to stub
 * upstream provider calls from the actual browser. Usage is opt-in
 * per spec; most E2E tests hit the real app stack end-to-end.
 *
 * Enable from an E2E spec:
 *   import { worker } from "../mocks/browser";
 *   await worker.start({ onUnhandledRequest: "warn" });
 */
import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);
