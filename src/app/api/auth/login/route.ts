export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { errorResponse } from "@/lib/api/errors";
import { signJwt } from "@/lib/api/jwt-middleware";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { checkAuthRateLimit, extractClientIp } from "@/lib/api/auth-rate-limit";
import { NextResponse } from "next/server";

// BL-SEC-POLISH H-9: bcrypt cost 12. Rehash opportunistically on successful
// login so existing cost=10 hashes migrate silently.
const BCRYPT_COST = 12;

// Dummy hash compared against when no user is found or the account is unusable,
// so the observable response time matches the real-user path and a timing
// oracle can't probe account existence. Computed once at module load;
// ~200ms one-off startup cost is acceptable.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync("__aigc_dummy_password__", BCRYPT_COST);

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  const { email, password } = body;
  if (!email || !password) {
    return errorResponse(400, "invalid_parameter", "email and password are required");
  }

  // BL-SEC-POLISH F-SP-01: rate limit (IP + account) before any DB work.
  const ip = extractClientIp(request);
  const rl = await checkAuthRateLimit({ ip, email, route: "login" });
  if (!rl.allowed) {
    return errorResponse(429, "too_many_requests", "Too many login attempts, try again later", {
      headers: { "Retry-After": "60" },
    });
  }

  // BL-SEC-POLISH H-7: constant-time login path.
  // The previous sequence exposed a timing oracle — missing users returned
  // before bcrypt ran, letting an attacker enumerate accounts by latency.
  // Now we always run a bcrypt.compare (real hash when the user exists,
  // a pre-computed dummy when not) and collapse deleted/suspended cases
  // into the same 401 "invalid_credentials" response the miss path uses.
  const user = await prisma.user.findUnique({ where: { email } });

  const hashToVerify = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
  const bcryptValid = await bcrypt.compare(password, hashToVerify);

  // Hide which of the failure modes tripped so callers can't distinguish
  // user-exists vs suspended vs deleted vs bad-password by response shape.
  const unusable = !user || !bcryptValid || user.deletedAt !== null || user.suspended;

  if (unusable) {
    if (user?.deletedAt) console.warn(`[login] deleted account tried login: userId=${user.id}`);
    if (user?.suspended) console.warn(`[login] suspended account tried login: userId=${user.id}`);
    return errorResponse(401, "invalid_credentials", "Invalid email or password");
  }

  // Rehash opportunistically — migrate any cost<12 hash to cost=12 without
  // forcing a password reset flow.
  const currentRounds = bcrypt.getRounds(user.passwordHash);
  if (currentRounds !== BCRYPT_COST) {
    const newHash = await bcrypt.hash(password, BCRYPT_COST);
    prisma.user
      .update({ where: { id: user.id }, data: { passwordHash: newHash } })
      .catch((err) => console.error("[login] rehash failed:", err));
  }

  const token = signJwt({ userId: user.id, role: user.role });

  const userAgent = request.headers.get("user-agent") || null;
  prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent } }).catch(() => {});

  const response = NextResponse.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
  setSessionCookie(response, token);
  return response;
}
