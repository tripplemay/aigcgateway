"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";

// ============================================================
// Terminal animation data — code.html lines 287-321
// ============================================================

const sequences = [
  {
    command: 'aigc chat --model deepseek/v3 --stream "Analyze efficiency"',
    responses: [
      { text: "[STREAM] Trace ID: trc_8f2a1b92 initializing...", color: "text-white/40" },
      { text: "[SUCCESS] Connection established with deepseek/v3", color: "text-[#6d5dd3]" },
      { text: "[DATA] Tokens/sec: 142 | Latency: 18ms", color: "text-white/60" },
      { text: "[BILLING] Cost: $0.032 | Model: deepseek-v3", color: "text-[#c8bfff]" },
    ],
  },
  {
    command: "aigc health --check",
    responses: [
      { text: "[INFO] Querying global node cluster...", color: "text-white/40" },
      { text: "[SUCCESS] 24/24 nodes responding. Status: 200 OK", color: "text-[#6d5dd3]" },
      { text: "[INFO] Current Load: 12.4% | Uptime: 99.99%", color: "text-white/60" },
    ],
  },
  {
    command: 'aigc logs --filter "error" --limit 2',
    responses: [
      { text: "[LOG] 14:02:31 - Request processed in 12ms", color: "text-white/40" },
      { text: "[INFO] Trace ID: trc_7b321x88 | Status: 200 OK", color: "text-white/60" },
      { text: "[SUCCESS] Cache hit: hash_8a221fb", color: "text-[#6d5dd3]" },
    ],
  },
  {
    command: "aigc billing --usage",
    responses: [
      { text: "[INFO] Fetching real-time quota data...", color: "text-white/40" },
      { text: "[DATA] Daily Spend: $142.05 | Monthly: $1,420.55", color: "text-white/90" },
      { text: "[SUCCESS] Quota Remaining: 78.4%", color: "text-[#6d5dd3]" },
    ],
  },
];

// ============================================================
// Terminal component — code.html lines 163-169 + 325-378
// ============================================================

function Terminal() {
  const historyRef = useRef<HTMLDivElement>(null);
  const commandRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const seqIndexRef = useRef(0);
  const cancelledRef = useRef(false);

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = setTimeout(resolve, ms);
      // Allow cleanup to reject
      if (cancelledRef.current) clearTimeout(id);
    });

  // code.html lines 325-331: typeText
  const typeText = useCallback(async (text: string) => {
    if (!commandRef.current) return;
    commandRef.current.textContent = "";
    for (let i = 0; i < text.length; i++) {
      if (cancelledRef.current) return;
      commandRef.current.textContent += text.charAt(i);
      await sleep(40 + Math.random() * 40);
    }
  }, []);

  // code.html lines 333-351: addHistoryLine
  const addHistoryLine = useCallback((text: string, colorClass = "text-white/60", isCommand = false) => {
    if (!historyRef.current || !contentRef.current) return;
    const line = document.createElement("div");
    if (isCommand) {
      line.className = "text-white/90 font-bold";
      line.innerHTML = `<span style="color:#6d5dd3;font-weight:bold">$ </span>${text}`;
    } else {
      line.className = `${colorClass} mt-1`;
      line.textContent = text;
    }
    historyRef.current.appendChild(line);
    contentRef.current.scrollTop = contentRef.current.scrollHeight;
    if (historyRef.current.children.length > 20) {
      historyRef.current.removeChild(historyRef.current.firstChild!);
    }
  }, []);

  // code.html lines 353-375: runSequence
  const runSequence = useCallback(async () => {
    while (!cancelledRef.current) {
      const seq = sequences[seqIndexRef.current];
      await typeText(seq.command);
      if (cancelledRef.current) return;
      await sleep(600);
      addHistoryLine(seq.command, "", true);
      if (commandRef.current) commandRef.current.textContent = "";
      for (const res of seq.responses) {
        if (cancelledRef.current) return;
        await sleep(200 + Math.random() * 500);
        addHistoryLine(res.text, res.color);
      }
      if (cancelledRef.current) return;
      await sleep(2000);
      seqIndexRef.current = (seqIndexRef.current + 1) % sequences.length;
    }
  }, [typeText, addHistoryLine]);

  useEffect(() => {
    cancelledRef.current = false;
    const timer = setTimeout(() => { runSequence(); }, 1000);
    return () => { cancelledRef.current = true; clearTimeout(timer); };
  }, [runSequence]);

  return (
    /* code.html lines 151-169 */
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
      <div ref={contentRef} className="p-6 font-mono text-sm leading-relaxed h-[360px] overflow-hidden flex flex-col">
        <div ref={historyRef} className="space-y-4" />
        <div className="mt-4 flex items-center gap-2">
          <span className="text-[#6d5dd3] font-bold">$ </span>
          <span ref={commandRef} className="text-white/90" />
          <span className="inline-block w-2 h-[1.2em] bg-[#6d5dd3] animate-[blink_1s_step-end_infinite]" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Login Page — code.html lines 136-280
// ============================================================

export default function LoginPage() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      <style jsx global>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes scanline { 0% { bottom: 100%; } 100% { bottom: -100%; } }
      `}</style>

      {/* code.html line 136 */}
      <main className="flex min-h-screen w-full">

        {/* ═══ Left Side: Terminal — code.html lines 138-193 ═══ */}
        <section className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-16 overflow-hidden bg-[#0a0a0c]">
          {/* Background Grid — line 140 */}
          <div className="absolute inset-0 z-0 opacity-10" style={{ backgroundImage: "radial-gradient(#6d5dd3 0.5px, transparent 0.5px)", backgroundSize: "24px 24px" }} />
          {/* Scanline — line 141 */}
          <div className="w-full h-[100px] z-[5] opacity-10 absolute" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(109,93,211,0.05) 50%, rgba(0,0,0,0) 100%)", animation: "scanline 6s linear infinite", bottom: "100%" }} />

          {/* Brand — lines 143-148 */}
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <span className="text-[#6d5dd3] text-4xl font-bold">⬡</span>
              <span className="text-xl font-bold tracking-tighter text-white" style={{ fontFamily: "Manrope, sans-serif" }}>AIGC Gateway</span>
            </div>
          </div>

          {/* Terminal + Tagline — lines 150-178 */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full max-w-2xl mx-auto w-full">
            <Terminal />
            <div className="mt-12 text-center">
              <h1 className="text-4xl font-extrabold tracking-tight text-white leading-[1.1] mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>
                Professional Observability.
              </h1>
              <p className="text-lg text-white/40 font-medium tracking-wide">
                The Algorithmic Atelier for modern AI developers.
              </p>
            </div>
          </div>

          {/* Footer stats — lines 181-193 */}
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
            <span className="text-[10px] font-mono text-white/20 tracking-[0.2em] uppercase">SYSTEMS_STABLE_V2.0.4</span>
          </div>
        </section>

        {/* ═══ Right Side: Auth Form — code.html lines 196-279 ═══ */}
        <section className="w-full lg:w-1/2 flex flex-col justify-center items-center bg-white px-8 py-12 md:px-24">
          <div className="w-full max-w-md">
            {/* Mobile logo — lines 199-204 */}
            <div className="lg:hidden flex justify-center mb-12">
              <div className="flex items-center gap-2">
                <span className="text-[#5443b9] text-3xl font-bold">⬡</span>
                <span className="text-xl font-bold tracking-tighter" style={{ fontFamily: "Manrope", color: "#131b2e" }}>AIGC Gateway</span>
              </div>
            </div>

            {/* Header — lines 206-209 */}
            <div className="mb-10 text-center lg:text-left">
              <h2 className="text-3xl font-extrabold tracking-tight mb-2" style={{ fontFamily: "Manrope", color: "#131b2e" }}>
                Welcome Back
              </h2>
              <p className="text-sm font-medium" style={{ color: "#474553" }}>
                Please enter your details to access your dashboard.
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 rounded-xl text-sm font-medium" style={{ background: "#ffdad6", color: "#93000a" }}>
                {error}
              </div>
            )}

            {/* Form — lines 211-234 */}
            <div className="space-y-6">
              {/* Email — lines 212-215 */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-widest ml-1" style={{ color: "rgba(71,69,83,0.8)" }}>
                  Email Address
                </label>
                <input
                  className="w-full px-4 py-3.5 border-none rounded-xl text-sm focus:ring-2 focus:ring-[#6d5dd3]/20 transition-all duration-200 outline-none"
                  style={{ background: "#f2f3ff", color: "#131b2e" }}
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
              </div>

              {/* Password — lines 216-226 */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-1">
                  <label className="block text-[11px] font-bold uppercase tracking-widest" style={{ color: "rgba(71,69,83,0.8)" }}>
                    Password
                  </label>
                  {/* line 219: Forgot Password link */}
                  <a className="text-[11px] font-bold uppercase tracking-widest hover:text-[#5443b9] transition-colors" style={{ color: "#6d5dd3" }} href="#">
                    Forgot Password?
                  </a>
                </div>
                <div className="relative group">
                  <input
                    className="w-full px-4 py-3.5 border-none rounded-xl text-sm focus:ring-2 focus:ring-[#6d5dd3]/20 transition-all duration-200 outline-none"
                    style={{ background: "#f2f3ff", color: "#131b2e" }}
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                  />
                  {/* line 223-225: visibility toggle */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: "#787584" }}
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
                  className="h-4 w-4 rounded text-[#5443b9] focus:ring-[#6d5dd3]"
                  style={{ borderColor: "#c9c4d5", background: "#f2f3ff" }}
                  id="remember"
                  type="checkbox"
                />
                <label className="ml-2 block text-sm font-medium" style={{ color: "#474553" }} htmlFor="remember">
                  Remember Me
                </label>
              </div>

              {/* Submit — lines 232-234 */}
              <button
                disabled={loading}
                onClick={submit}
                className="w-full py-4 text-white font-bold rounded-xl shadow-lg active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
                style={{ fontFamily: "Manrope", background: "linear-gradient(to right, #5443b9, #6d5dd3)", boxShadow: "0 10px 25px rgba(84,67,185,0.2)" }}
              >
                {loading ? t("signingIn") : "Sign In"}
              </button>
            </div>

            {/* Divider — lines 237-243 */}
            <div className="relative my-10">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor: "#e2e7ff" }} />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-4 bg-white font-medium tracking-wide uppercase" style={{ color: "#787584" }}>
                  Or continue with
                </span>
              </div>
            </div>

            {/* Social Logins — lines 246-262 */}
            <div className="flex gap-4">
              <button className="flex-1 flex justify-center items-center gap-3 py-3 px-4 rounded-xl border border-transparent hover:bg-[#e2e7ff] transition-colors active:scale-95 duration-150" style={{ background: "#f2f3ff" }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span className="text-sm font-semibold" style={{ color: "#131b2e" }}>Google</span>
              </button>
              <button className="flex-1 flex justify-center items-center gap-3 py-3 px-4 rounded-xl border border-transparent hover:bg-[#e2e7ff] transition-colors active:scale-95 duration-150" style={{ background: "#f2f3ff" }}>
                <svg className="w-5 h-5 fill-current" style={{ color: "#131b2e" }} viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.744.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                <span className="text-sm font-semibold" style={{ color: "#131b2e" }}>GitHub</span>
              </button>
            </div>

            {/* Footer Link — lines 264-269 */}
            <div className="mt-12 text-center">
              <p className="text-sm font-medium" style={{ color: "#474553" }}>
                {t("noAccount")}{" "}
                <Link href="/register" className="font-bold hover:underline ml-1" style={{ color: "#6d5dd3" }}>
                  {t("signUpLink")}
                </Link>
              </p>
            </div>
          </div>

          {/* Contextual Footer — lines 272-279 */}
          <footer className="mt-auto pt-12 flex flex-col items-center gap-4">
            <div className="flex gap-6">
              <a className="text-[10px] font-bold uppercase tracking-widest hover:text-[#6d5dd3] transition-colors" style={{ color: "#787584" }} href="#">Documentation</a>
              <a className="text-[10px] font-bold uppercase tracking-widest hover:text-[#6d5dd3] transition-colors" style={{ color: "#787584" }} href="#">Privacy Policy</a>
              <a className="text-[10px] font-bold uppercase tracking-widest hover:text-[#6d5dd3] transition-colors" style={{ color: "#787584" }} href="#">Support</a>
            </div>
            <p className="text-[9px] font-medium tracking-wide uppercase" style={{ color: "rgba(201,196,213,0.6)" }}>© 2024 AIGC Gateway. Professional Engineering.</p>
          </footer>
        </section>
      </main>
      <Toaster richColors />
    </>
  );
}
