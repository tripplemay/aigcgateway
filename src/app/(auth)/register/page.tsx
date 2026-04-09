"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export default function RegisterPage() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const validate = () => {
    if (!email || !email.includes("@")) return t("validEmail");
    if (password.length < 8) return t("passwordMin");
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return t("passwordFormat");
    if (password !== confirm) return t("passwordMismatch");
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? t("networkError"));
        setLoading(false);
        return;
      }
      toast.success(t("registered"));
      router.push("/login");
    } catch {
      setError(t("networkError"));
    }
    setLoading(false);
  };

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

      <main className="flex min-h-screen w-full">
        {/* ═══ Left Side: Terminal — mirrored from Login, static version ═══ */}
        <section className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-16 overflow-hidden bg-[#0a0a0c]">
          {/* Background Grid */}
          <div
            className="absolute inset-0 z-0 opacity-10"
            style={{
              backgroundImage: "radial-gradient(#6d5dd3 0.5px, transparent 0.5px)",
              backgroundSize: "24px 24px",
            }}
          />
          <div
            className="w-full h-[100px] z-[5] opacity-10 absolute"
            style={{
              background:
                "linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(109,93,211,0.05) 50%, rgba(0,0,0,0) 100%)",
              animation: "scanline 6s linear infinite",
              bottom: "100%",
            }}
          />

          {/* Brand */}
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-ds-primary-container text-4xl font-bold">
                hub
              </span>
              <span className="text-xl font-bold tracking-tighter text-white font-[family-name:var(--font-heading)]">
                AIGC Gateway
              </span>
            </div>
          </div>

          {/* Static terminal lines + Tagline */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full max-w-2xl mx-auto w-full">
            <div className="w-full font-mono text-sm space-y-4 mb-12">
              <div className="text-ds-primary-container">
                [SYSTEM] Initializing secure handshake...
              </div>
              <div className="text-white/40">
                # Fetching infrastructure metrics for &apos;AIGC-MAIN-CLUSTER&apos;
              </div>
              <div className="text-white flex items-center gap-2">
                <span>&gt;</span>
                <span>Professional Observability for modern AI developers</span>
                <span className="inline-block w-2 h-[1.2em] bg-ds-primary-container animate-[blink_1s_step-end_infinite]" />
              </div>
              <div className="space-y-1 pt-2">
                <div className="text-white/40 flex items-center gap-3">
                  <span className="text-ds-primary-container">09:41:02</span>
                  <span>TRACE: Connection established at edge node LON-1</span>
                </div>
                <div className="text-white/40 flex items-center gap-3">
                  <span className="text-ds-primary-container">09:41:03</span>
                  <span>DEBUG: Optimizing token delivery pathways...</span>
                </div>
                <div className="text-white/40 flex items-center gap-3">
                  <span className="text-ds-primary-container">09:41:05</span>
                  <span>INFO: User authentication module loaded.</span>
                </div>
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-4xl font-extrabold tracking-tight text-white leading-[1.1] mb-4 font-[family-name:var(--font-heading)]">
                {t("tagline")}
              </h1>
              <p className="text-lg text-ds-outline-variant/60 font-medium tracking-wide">
                {t("taglineDesc")}
              </p>
            </div>
          </div>

          {/* Footer stats */}
          <div className="relative z-10 flex justify-between items-end">
            <div className="flex gap-8">
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-white font-[family-name:var(--font-heading)]">
                  99.9%
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-ds-primary-container font-semibold">
                  Uptime
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-white font-[family-name:var(--font-heading)]">
                  &lt;20ms
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-ds-primary-container font-semibold">
                  Latency
                </span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-white/20 tracking-[0.2em] uppercase">
              SYSTEMS_STABLE_V2.0.4
            </span>
          </div>
        </section>

        {/* ═══ Right Side: Registration Form ═══ */}
        <section className="w-full lg:w-1/2 flex flex-col justify-center items-center bg-ds-surface-container-lowest px-8 py-12 md:px-24 overflow-y-auto">
          <div className="w-full max-w-md">
            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-8">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-ds-primary text-3xl font-bold">
                  hub
                </span>
                <span className="text-xl font-bold tracking-tighter text-ds-on-surface font-[family-name:var(--font-heading)]">
                  AIGC Gateway
                </span>
              </div>
            </div>

            {/* Header */}
            <div className="mb-10 text-center lg:text-left">
              <h2 className="text-3xl font-extrabold tracking-tight mb-2 text-ds-on-surface font-[family-name:var(--font-heading)]">
                {t("joinAtelier")}
              </h2>
              <p className="text-sm font-medium text-ds-on-surface-variant">
                {t("createAccountDesc")}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 rounded-xl text-sm font-medium bg-ds-error-container text-ds-on-error-container">
                {error}
              </div>
            )}

            {/* Form */}
            <div className="space-y-5">
              {/* Name (optional) */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant/80 ml-1">
                  {t("nameOptional")}
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                  className="w-full px-4 py-3.5 bg-ds-surface-container-low border-none rounded-xl text-ds-on-surface placeholder:text-ds-outline focus:ring-2 focus:ring-ds-primary-container transition-all duration-200"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant/80 ml-1">
                  {t("emailAddress")}
                </label>
                <Input
                  type="email"
                  placeholder={t("emailInputPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3.5 bg-ds-surface-container-low border-none rounded-xl text-ds-on-surface placeholder:text-ds-outline focus:ring-2 focus:ring-ds-primary-container transition-all duration-200"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant/80 ml-1">
                  {t("createPassword")}
                </label>
                <div className="relative group">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant/80 ml-1">
                  {t("confirmPassword")}
                </label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="w-full px-4 py-3.5 bg-ds-surface-container-low border-none rounded-xl text-ds-on-surface placeholder:text-ds-outline focus:ring-2 focus:ring-ds-primary-container transition-all duration-200"
                />
              </div>

              {/* Submit */}
              <Button
                disabled={loading}
                onClick={submit}
                className="w-full py-4 h-auto text-white font-bold rounded-xl shadow-lg shadow-ds-primary/20 hover:shadow-xl hover:shadow-ds-primary/30 active:scale-[0.98] transition-all duration-200 bg-gradient-to-r from-ds-primary to-ds-primary-container font-[family-name:var(--font-heading)]"
              >
                {loading ? t("creating") : t("signUp")}
              </Button>
            </div>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-ds-outline-variant/30" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-4 bg-ds-surface-container-lowest text-ds-outline font-medium tracking-wide uppercase">
                  {t("orContinueWith")}
                </span>
              </div>
            </div>

            {/* Social Logins */}
            <div className="flex gap-4">
              <button className="flex-1 flex justify-center items-center gap-3 py-3 px-4 bg-ds-surface-container-low border border-transparent rounded-xl hover:bg-ds-surface-container-high transition-colors active:scale-95 duration-150">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                <span className="text-sm font-semibold text-ds-on-surface">Google</span>
              </button>
              <button className="flex-1 flex justify-center items-center gap-3 py-3 px-4 bg-ds-surface-container-low border border-transparent rounded-xl hover:bg-ds-surface-container-high transition-colors active:scale-95 duration-150">
                <svg
                  className="w-5 h-5 text-ds-on-surface fill-current"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.744.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                <span className="text-sm font-semibold text-ds-on-surface">GitHub</span>
              </button>
            </div>

            {/* Login Link */}
            <div className="mt-10 text-center">
              <p className="text-sm font-medium text-ds-on-surface-variant">
                {t("hasAccount")}{" "}
                <Link
                  href="/login"
                  className="font-bold text-ds-primary-container hover:underline ml-1"
                >
                  {t("signInLink")}
                </Link>
              </p>
            </div>
          </div>

          {/* Copyright */}
          <footer className="mt-auto pt-8 flex flex-col items-center">
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
