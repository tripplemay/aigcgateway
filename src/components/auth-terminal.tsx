"use client";
import { useEffect, useRef, useCallback } from "react";

// ============================================================
// Types
// ============================================================

export interface TerminalSequence {
  command: string;
  responses: { text: string; color: string }[];
}

// ============================================================
// Terminal component
// ============================================================

export function AuthTerminal({
  terminalTitle,
  sequences,
}: {
  terminalTitle: string;
  sequences: TerminalSequence[];
}) {
  const historyRef = useRef<HTMLDivElement>(null);
  const commandRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const seqIndexRef = useRef(0);
  const cancelledRef = useRef(false);

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = setTimeout(resolve, ms);
      if (cancelledRef.current) clearTimeout(id);
    });

  const typeText = useCallback(async (text: string) => {
    if (!commandRef.current) return;
    commandRef.current.textContent = "";
    for (let i = 0; i < text.length; i++) {
      if (cancelledRef.current) return;
      commandRef.current.textContent += text.charAt(i);
      await sleep(40 + Math.random() * 40);
    }
  }, []);

  const addHistoryLine = useCallback(
    (text: string, colorClass = "text-white/60", isCommand = false) => {
      if (!historyRef.current || !contentRef.current) return;
      const line = document.createElement("div");
      if (isCommand) {
        line.className = "text-white/90 font-bold";
        line.innerHTML = `<span class="text-ds-primary-container font-bold">$ </span>${text}`;
      } else {
        line.className = `${colorClass} mt-1`;
        line.textContent = text;
      }
      historyRef.current.appendChild(line);
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
      if (historyRef.current.children.length > 20) {
        historyRef.current.removeChild(historyRef.current.firstChild!);
      }
    },
    [],
  );

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
    const timer = setTimeout(() => {
      runSequence();
    }, 1000);
    return () => {
      cancelledRef.current = true;
      clearTimeout(timer);
    };
  }, [runSequence]);

  return (
    <div className="w-full bg-ds-terminal-surface rounded-xl border border-white/10 shadow-2xl overflow-hidden">
      <div className="bg-ds-terminal-surface-high px-4 py-3 flex items-center justify-between border-b border-white/5">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-ds-error" />
          <div className="w-3 h-3 rounded-full bg-ds-tertiary-fixed-dim" />
          <div className="w-3 h-3 rounded-full bg-ds-status-success" />
        </div>
        <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
          {terminalTitle}
        </div>
        <div className="w-12" />
      </div>
      <div
        ref={contentRef}
        className="p-6 font-mono text-sm leading-relaxed h-[360px] overflow-hidden flex flex-col"
      >
        <div ref={historyRef} className="space-y-4" />
        <div className="mt-4 flex items-center gap-2">
          <span className="text-ds-primary-container font-bold">$ </span>
          <span ref={commandRef} className="text-white/90" />
          <span className="inline-block w-2 h-[1.2em] bg-ds-primary-container animate-[blink_1s_step-end_infinite]" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Shared left panel for Login & Register
// ============================================================

export function AuthLeftPanel({
  tagline,
  taglineDesc,
  uptime,
  latency,
  terminalTitle,
  sequences,
}: {
  tagline: string;
  taglineDesc: string;
  uptime: string;
  latency: string;
  terminalTitle: string;
  sequences: TerminalSequence[];
}) {
  return (
    <section className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-16 overflow-hidden bg-ds-terminal-bg">
      {/* Background Grid */}
      <div
        className="absolute inset-0 z-0 opacity-10"
        style={{
          backgroundImage: "radial-gradient(var(--ds-primary-container) 0.5px, transparent 0.5px)",
          backgroundSize: "24px 24px",
        }}
      />
      {/* Scanline */}
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

      {/* Terminal + Tagline */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full max-w-2xl mx-auto w-full">
        <AuthTerminal terminalTitle={terminalTitle} sequences={sequences} />
        <div className="mt-12 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white leading-[1.1] mb-4 font-[family-name:var(--font-heading)]">
            {tagline}
          </h1>
          <p className="text-lg text-ds-outline-variant/60 font-medium tracking-wide">
            {taglineDesc}
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
              {uptime}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-white font-[family-name:var(--font-heading)]">
              &lt;20ms
            </span>
            <span className="text-[10px] font-mono uppercase tracking-widest text-ds-primary-container font-semibold">
              {latency}
            </span>
          </div>
        </div>
        <span className="text-[10px] font-mono text-white/20 tracking-[0.2em] uppercase">
          SYSTEMS_STABLE_V2.0.4
        </span>
      </div>
    </section>
  );
}
