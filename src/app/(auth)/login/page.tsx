"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";

// Terminal animation sequences
const TERMINAL_LINES = [
  { cmd: 'aigc chat --model deepseek/v3 --stream "Analyze"', responses: ["[STREAM] Trace ID: trc_8f2a1b92 initializing...", "[SUCCESS] Connection established", "[DATA] Tokens/sec: 142 | Latency: 18ms", "[BILLING] Cost: $0.032"] },
  { cmd: "aigc health --check", responses: ["[INFO] Querying node cluster...", "[SUCCESS] 24/24 nodes responding. Status: 200 OK", "[INFO] Load: 12.4% | Uptime: 99.99%"] },
  { cmd: 'aigc logs --filter "error" --limit 2', responses: ["[LOG] Request processed in 12ms", "[INFO] Trace ID: trc_7b321x88 | 200 OK", "[SUCCESS] Cache hit: hash_8a221fb"] },
];

export default function LoginPage() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const submit = async () => {
    if (!email || !password) { setError(t("emailRequired")); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? t("loginFailed")); setLoading(false); return; }
      localStorage.setItem("token", data.token);
      router.push("/dashboard");
    } catch { setError(t("networkError")); }
    setLoading(false);
  };

  return (
    <>
      <style jsx>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .cursor-blink { display: inline-block; width: 8px; height: 1.2em; background-color: #6d5dd3; vertical-align: middle; animation: blink 1s step-end infinite; }
        @keyframes scanline { 0% { bottom: 100%; } 100% { bottom: -100%; } }
        .scanline { width: 100%; height: 100px; z-index: 5; background: linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(109,93,211,0.05) 50%, rgba(0,0,0,0) 100%); opacity: 0.1; position: absolute; bottom: 100%; animation: scanline 6s linear infinite; }
        .command-line::before { content: "$ "; color: #6d5dd3; font-weight: bold; }
      `}</style>

      <main className="flex min-h-screen w-full">
        {/* ═══ Left Side: Terminal — code.html lines 138-193 ═══ */}
        <section className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-16 overflow-hidden bg-[#0a0a0c]">
          <div className="absolute inset-0 z-0 opacity-10" style={{ backgroundImage: "radial-gradient(#6d5dd3 0.5px, transparent 0.5px)", backgroundSize: "24px 24px" }} />
          <div className="scanline" />

          {/* Brand */}
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <span className="text-[#6d5dd3] text-4xl font-bold">⬡</span>
              <span className="text-xl font-bold tracking-tighter text-white" style={{ fontFamily: "Manrope, sans-serif" }}>AIGC Gateway</span>
            </div>
          </div>

          {/* Terminal */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full max-w-2xl mx-auto w-full">
            <div className="w-full bg-[#13141C] rounded-xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="bg-[#1C1E26] px-4 py-3 flex items-center justify-between border-b border-white/5">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                  <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                  <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
                </div>
                <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">aigc-cli — bash</div>
                <div className="w-12" />
              </div>
              <div className="p-6 font-mono text-sm leading-relaxed h-[360px] overflow-hidden">
                {TERMINAL_LINES.map((seq, si) => (
                  <div key={si} className="mb-4">
                    <div className="text-white/90">
                      <span className="text-[#6d5dd3] font-bold">$ </span>{seq.cmd}
                    </div>
                    {seq.responses.map((r, ri) => (
                      <div key={ri} className={`ml-2 ${r.startsWith("[SUCCESS]") ? "text-[#6d5dd3]" : r.startsWith("[DATA]") || r.startsWith("[BILLING]") ? "text-white/60" : "text-white/40"}`}>
                        {r}
                      </div>
                    ))}
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="text-[#6d5dd3] font-bold">$ </span>
                  <span className="cursor-blink" />
                </div>
              </div>
            </div>
            <div className="mt-12 text-center">
              <h1 className="text-4xl font-extrabold tracking-tight text-white leading-[1.1] mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>
                Professional Observability.
              </h1>
              <p className="text-lg text-white/40 font-medium tracking-wide">
                The Algorithmic Atelier for modern AI developers.
              </p>
            </div>
          </div>

          {/* Footer stats */}
          <div className="relative z-10 flex justify-between items-end">
            <div className="flex gap-8">
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-white" style={{ fontFamily: "Manrope" }}>99.9%</span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#6d5dd3] font-semibold">Uptime</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-white" style={{ fontFamily: "Manrope" }}>&lt;20ms</span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#6d5dd3] font-semibold">Latency</span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-white/20 tracking-[0.2em] uppercase">SYSTEMS_STABLE</span>
          </div>
        </section>

        {/* ═══ Right Side: Login Form — code.html lines 196-279 ═══ */}
        <section className="w-full lg:w-1/2 flex flex-col justify-center items-center bg-white px-8 py-12 md:px-24">
          <div className="w-full max-w-md">
            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-12">
              <span className="text-xl font-bold tracking-tighter" style={{ fontFamily: "Manrope", color: "#5443b9" }}>AIGC Gateway</span>
            </div>

            {/* Header */}
            <div className="mb-10 text-center lg:text-left">
              <h2 className="text-3xl font-extrabold tracking-tight mb-2" style={{ fontFamily: "Manrope", color: "#131b2e" }}>
                {t("signIn")}
              </h2>
              <p className="text-sm font-medium" style={{ color: "#474553" }}>{t("subtitle")}</p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 rounded-xl text-sm font-medium" style={{ background: "#ffdad6", color: "#93000a" }}>
                {error}
              </div>
            )}

            {/* Form */}
            <div className="space-y-6">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-widest ml-1" style={{ color: "#474553" }}>
                  {t("email")}
                </label>
                <input
                  className="w-full px-4 py-3.5 border-none rounded-xl text-sm placeholder:text-[#787584] focus:ring-2 focus:ring-[#6d5dd3]/20 transition-all outline-none"
                  style={{ background: "#f2f3ff", color: "#131b2e" }}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("emailPlaceholder")}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-widest ml-1" style={{ color: "#474553" }}>
                  {t("password")}
                </label>
                <input
                  className="w-full px-4 py-3.5 border-none rounded-xl text-sm placeholder:text-[#787584] focus:ring-2 focus:ring-[#6d5dd3]/20 transition-all outline-none"
                  style={{ background: "#f2f3ff", color: "#131b2e" }}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="••••••••"
                />
              </div>
              <button
                disabled={loading}
                onClick={submit}
                className="w-full py-4 text-white font-bold rounded-xl shadow-lg active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
                style={{ fontFamily: "Manrope", background: "linear-gradient(to right, #5443b9, #6d5dd3)", boxShadow: "0 10px 25px rgba(84,67,185,0.2)" }}
              >
                {loading ? t("signingIn") : t("signIn")}
              </button>
            </div>

            {/* Footer */}
            <div className="mt-12 text-center">
              <p className="text-sm font-medium" style={{ color: "#474553" }}>
                {t("noAccount")}{" "}
                <Link href="/register" className="font-bold hover:underline ml-1" style={{ color: "#6d5dd3" }}>
                  {t("signUpLink")}
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>
      <Toaster richColors />
    </>
  );
}
