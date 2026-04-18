import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth/jwt";
import { ConsoleClientShell, type ConsoleUser } from "./_client-shell";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get("token")?.value;
  if (!token) redirect("/login");

  let payload;
  try {
    payload = await verifyJwt(token);
  } catch {
    redirect("/login");
  }

  const userRecord = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!userRecord) redirect("/login");

  const user: ConsoleUser = {
    userId: userRecord.id,
    role: userRecord.role as "ADMIN" | "DEVELOPER",
    name: userRecord.name ?? undefined,
    email: userRecord.email,
  };

  return <ConsoleClientShell user={user}>{children}</ConsoleClientShell>;
}
