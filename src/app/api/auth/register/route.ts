export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { randomBytes } from "crypto";
import { seedDefaultNotificationPreferences } from "@/lib/notifications/defaults";
import { Prisma } from "@prisma/client";

const WELCOME_BONUS_KEY = "WELCOME_BONUS_USD";

type SystemConfigReader = {
  systemConfig: {
    findUnique: (args: { where: { key: string } }) => Promise<{ value: string } | null>;
  };
};

async function readWelcomeBonusAmount(tx: SystemConfigReader): Promise<Prisma.Decimal | null> {
  const cfg = await tx.systemConfig.findUnique({ where: { key: WELCOME_BONUS_KEY } });
  if (!cfg?.value) return null;
  try {
    const amount = new Prisma.Decimal(cfg.value);
    if (amount.isNaN() || amount.lte(0)) return null;
    return amount;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  const { email, password, name } = body;

  if (!email || !password) {
    return errorResponse(400, "invalid_parameter", "email and password are required");
  }

  if (password.length < 8) {
    return errorResponse(422, "invalid_parameter", "Password must be at least 8 characters", {
      param: "password",
    });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return errorResponse(409, "conflict", "Email already registered");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const verificationToken = randomBytes(32).toString("hex");
  const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email,
        passwordHash,
        name: name ?? null,
        role: "DEVELOPER",
        emailVerified: false,
        emailVerificationTokens: {
          create: {
            token: verificationToken,
            expiresAt: tokenExpiresAt,
          },
        },
      },
    });

    const defaultProject = await tx.project.create({
      data: {
        userId: newUser.id,
        name: "My Project",
        description: "Auto-created default project",
      },
    });

    // F-UA-01: seed notification preferences so the user can start
    // receiving balance/rate-limit alerts immediately without having
    // to visit Settings first.
    await seedDefaultNotificationPreferences(tx, newUser.id, newUser.role);

    const withDefaultProject = await tx.user.update({
      where: { id: newUser.id },
      data: { defaultProjectId: defaultProject.id },
    });

    // F-OE-02: welcome bonus — read SystemConfig.WELCOME_BONUS_USD;
    // if positive, credit the balance in-transaction and record a
    // BONUS transaction. Disabled when key missing or amount ≤ 0.
    const bonusAmount = await readWelcomeBonusAmount(tx);
    if (bonusAmount && bonusAmount.gt(0)) {
      const credited = await tx.user.update({
        where: { id: newUser.id },
        data: { balance: { increment: bonusAmount } },
      });
      await tx.transaction.create({
        data: {
          projectId: defaultProject.id,
          userId: newUser.id,
          type: "BONUS",
          amount: bonusAmount,
          balanceAfter: credited.balance,
          status: "COMPLETED",
          description: "Welcome bonus",
        },
      });
      return credited;
    }

    return withDefaultProject;
  });

  return NextResponse.json(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      defaultProjectId: user.defaultProjectId,
      verificationToken,
    },
    { status: 201 },
  );
}
