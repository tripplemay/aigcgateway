"use client";
import { Suspense, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { AuthLeftPanel, type TerminalSequence } from "@/components/auth-terminal";
import { sanitizeRedirect } from "@/lib/safe-redirect";

function hasLiveToken(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const token = window.localStorage.getItem("token");
    if (!token) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
    };
    if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Terminal sequences — always English regardless of locale.
 * Terminal simulation area is a decorative CLI demo; not localized.
 */
const TERMINAL_SEQUENCES: TerminalSequence[] = [
  {
    command: 'aigc chat --model deepseek/v3 --stream "Analyze efficiency"',
    responses: [
      { text: "[STREAM] Trace ID: trc_8f2a1b92 initializing...", color: "text-white/40" },
      {
        text: "[SUCCESS] Connection established with deepseek/v3",
        color: "text-ds-primary-container",
      },
      { text: "[DATA] Tokens/sec: 142 | Latency: 18ms", color: "text-white/60" },
      { text: "[BILLING] Cost: $0.032 | Model: deepseek-v3", color: "text-ds-primary-fixed-dim" },
    ],
  },
  {
    command: "aigc health --check",
    responses: [
      { text: "[INFO] Querying global node cluster...", color: "text-white/40" },
      {
        text: "[SUCCESS] 24/24 nodes responding. Status: 200 OK",
        color: "text-ds-primary-container",
      },
      { text: "[INFO] Current Load: 12.4% | Uptime: 99.99%", color: "text-white/60" },
    ],
  },
  {
    command: 'aigc logs --filter "error" --limit 2',
    responses: [
      { text: "[LOG] 14:02:31 - Request processed in 12ms", color: "text-white/40" },
      { text: "[INFO] Trace ID: trc_7b321x88 | Status: 200 OK", color: "text-white/60" },
      { text: "[SUCCESS] Cache hit: hash_8a221fb", color: "text-ds-primary-container" },
    ],
  },
  {
    command: "aigc billing --usage",
    responses: [
      { text: "[INFO] Fetching real-time quota data...", color: "text-white/40" },
      { text: "[DATA] Daily Spend: $142.05 | Monthly: $1,420.55", color: "text-white/90" },
      { text: "[SUCCESS] Quota Remaining: 78.4%", color: "text-ds-primary-container" },
    ],
  },
];

// ============================================================
// Login Page
// ============================================================

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ds-surface-container-lowest" />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const redirectTarget = sanitizeRedirect(searchParams.get("redirect"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const router = useRouter();

  // F-LL-02: if the user already has a live token, skip the form
  // entirely and hop to the redirect target. authChecked gates the
  // first render so the form doesn't flash before the replace fires.
  useEffect(() => {
    if (hasLiveToken()) {
      router.replace(redirectTarget);
      return;
    }
    setAuthChecked(true);
  }, [router, redirectTarget]);

  const submit = async () => {
    if (!email || !password) {
      setError(t("emailRequired"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? t("loginFailed"));
        setLoading(false);
        return;
      }
      // TODO(BL-SEC-AUTH-SESSION follow-up): drop localStorage once all
      // API routes migrate to cookie-based auth. Kept for apiFetch Bearer
      // header during the transition. Cookie is now set by the server
      // (HttpOnly, SameSite=Lax, Secure in prod) via Set-Cookie.
      localStorage.setItem("token", data.token);
      router.push(redirectTarget);
    } catch {
      setError(t("networkError"));
    }
    setLoading(false);
  };

  if (!authChecked) {
    return <div className="min-h-screen bg-ds-surface-container-lowest" />;
  }

  return (
    <>
      <style jsx global>{`
        @keyframes blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
        }
        @keyframes scanline {
          0% {
            bottom: 100%;
          }
          100% {
            bottom: -100%;
          }
        }
      `}</style>

      {/* code.html line 136 */}
      <main className="flex min-h-screen w-full">
        <AuthLeftPanel
          tagline={t("tagline")}
          taglineDesc={t("taglineDesc")}
          uptime="Uptime"
          latency="Latency"
          terminalTitle="aigc-cli — bash"
          sequences={TERMINAL_SEQUENCES}
        />

        {/* ═══ Right Side: Auth Form — code.html lines 196-279 ═══ */}
        <section className="w-full lg:w-1/2 flex flex-col justify-center items-center bg-ds-surface-container-lowest px-8 py-12 md:px-24">
          <div className="w-full max-w-md">
            {/* Mobile logo — lines 199-204 */}
            <div className="lg:hidden flex justify-center mb-12">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-ds-primary text-3xl font-bold">
                  hub
                </span>
                <span className="text-xl font-bold tracking-tighter text-ds-on-surface font-[family-name:var(--font-heading)]">
                  AIGC Gateway
                </span>
              </div>
            </div>

            {/* Header — lines 206-209 */}
            <div className="mb-10 text-center lg:text-left">
              <h2 className="text-3xl font-extrabold tracking-tight mb-2 text-ds-on-surface font-[family-name:var(--font-heading)]">
                {t("welcomeBack")}
              </h2>
              <p className="text-sm font-medium text-ds-on-surface-variant">{t("enterDetails")}</p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 rounded-xl text-sm font-medium bg-ds-error-container text-ds-on-error-container">
                {error}
              </div>
            )}

            {/* Form — lines 211-234 */}
            <div className="space-y-6">
              {/* Email — lines 212-215 */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant/80 ml-1">
                  {t("emailAddress")}
                </label>
                <Input
                  type="email"
                  placeholder={t("emailInputPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="w-full px-4 py-3.5 bg-ds-surface-container-low border-none rounded-xl text-ds-on-surface placeholder:text-ds-outline focus:ring-2 focus:ring-ds-primary-container transition-all duration-200"
                />
              </div>

              {/* Password — lines 216-226 */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-1">
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant/80">
                    {t("password")}
                  </label>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant/50">
                    {t("forgotPassword")}
                  </span>
                </div>
                <div className="relative group">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    className="w-full px-4 py-3.5 bg-ds-surface-container-low border-none rounded-xl text-ds-on-surface placeholder:text-ds-outline focus:ring-2 focus:ring-ds-primary-container transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-ds-outline hover:text-ds-on-surface transition-colors"
                  >
                    <span className="material-symbols-outlined text-xl">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Remember Me — lines 228-231 */}
              <div className="flex items-center">
                <input
                  className="h-4 w-4 rounded border-ds-outline-variant text-ds-primary focus:ring-ds-primary-container bg-ds-surface-container-low"
                  id="remember"
                  type="checkbox"
                />
                <label
                  className="ml-2 block text-sm font-medium text-ds-on-surface-variant"
                  htmlFor="remember"
                >
                  {t("rememberMe")}
                </label>
              </div>

              {/* Submit — lines 232-234 */}
              <Button
                disabled={loading}
                onClick={submit}
                className="w-full py-4 h-auto text-white font-bold rounded-xl shadow-lg shadow-ds-primary/20 hover:shadow-xl hover:shadow-ds-primary/30 active:scale-[0.98] transition-all duration-200 bg-gradient-to-r from-ds-primary to-ds-primary-container font-[family-name:var(--font-heading)]"
              >
                {loading ? t("signingIn") : t("signIn")}
              </Button>
            </div>

            {/* Divider — lines 237-243 */}
            <div className="relative my-10">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-ds-surface-container-high" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-4 bg-ds-surface-container-lowest text-ds-outline font-medium tracking-wide uppercase">
                  {t("orContinueWith")}
                </span>
              </div>
            </div>

            {/* Social Logins — lines 246-262 */}
            <div className="flex gap-4">
              <button className="flex-1 flex justify-center items-center gap-3 py-3 px-4 bg-ds-surface-container-low border border-transparent rounded-xl hover:bg-ds-surface-container-high transition-colors active:scale-95 duration-150">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    className="fill-ds-brand-google-blue"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    className="fill-ds-brand-google-green"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    className="fill-ds-brand-google-yellow"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    className="fill-ds-brand-google-red"
                  />
                </svg>
                <span className="text-sm font-semibold text-ds-on-surface">Google</span>
              </button>
              <button className="flex-1 flex justify-center items-center gap-3 py-3 px-4 bg-ds-surface-container-low border border-transparent rounded-xl hover:bg-ds-surface-container-high transition-colors active:scale-95 duration-150">
                <svg className="w-5 h-5 text-ds-on-surface fill-current" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.744.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                <span className="text-sm font-semibold text-ds-on-surface">GitHub</span>
              </button>
            </div>

            {/* Footer Link — lines 264-269 */}
            <div className="mt-12 text-center">
              <p className="text-sm font-medium text-ds-on-surface-variant">
                {t("noAccount")}{" "}
                <Link
                  href="/register"
                  className="font-bold text-ds-primary-container hover:underline ml-1"
                >
                  {t("signUpLink")}
                </Link>
              </p>
            </div>
          </div>

          {/* Contextual Footer — lines 272-279 */}
          <footer className="mt-auto pt-12 flex flex-col items-center gap-4">
            <p className="text-[9px] font-medium tracking-wide uppercase text-ds-outline-variant/60">
              {t("copyright")}
            </p>
          </footer>
        </section>
      </main>
      <Toaster richColors />
    </>
  );
}
