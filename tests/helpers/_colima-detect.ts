/**
 * Auto-detect Colima (macOS Docker alternative) and wire Testcontainers
 * to its socket. Imported for side effect from tests/helpers/db.ts —
 * MUST run before `@testcontainers/postgresql` loads.
 *
 * Without this, `npm run test:integration` fails on a stock macOS +
 * Colima install with "Could not find a working container runtime
 * strategy". Ryuk (Testcontainers' reaper sidecar) also has known
 * issues binding to the default `/var/run/docker.sock` under Colima,
 * so we disable it on that platform.
 *
 * Only activates when:
 *   - Running on macOS (`darwin`)
 *   - Colima's default socket exists at ~/.colima/default/docker.sock
 *   - The user hasn't already set DOCKER_HOST themselves
 *
 * Ported from joyce/KOLMatrix tests/helpers/_colima-detect.ts.
 */
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

if (process.platform === "darwin") {
  const colimaSock = path.join(os.homedir(), ".colima", "default", "docker.sock");
  if (existsSync(colimaSock)) {
    if (!process.env.DOCKER_HOST) {
      process.env.DOCKER_HOST = `unix://${colimaSock}`;
    }
    process.env.TESTCONTAINERS_RYUK_DISABLED ??= "true";
  }
}
