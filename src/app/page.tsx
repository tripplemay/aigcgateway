import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyJwt } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

export default async function Home() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/landing.html");
  try {
    await verifyJwt(token);
  } catch {
    redirect("/landing.html");
  }
  redirect("/dashboard");
}
