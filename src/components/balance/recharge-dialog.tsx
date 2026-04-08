"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { toast } from "sonner";

// ============================================================
// Types & constants
// ============================================================

const AMOUNTS = [10, 50, 100, 200, 500];

interface RechargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecharged?: () => void;
}

// ============================================================
// Component
// ============================================================

export function RechargeDialog({ open, onOpenChange, onRecharged }: RechargeDialogProps) {
  const t = useTranslations("balance");
  const tc = useTranslations("common");
  const { current } = useProject();

  const [amount, setAmount] = useState(50);
  const [customAmount, setCustomAmount] = useState("");
  const [payMethod, setPayMethod] = useState("alipay");

  const effectiveAmount = customAmount ? Number(customAmount) : amount;

  const doRecharge = async () => {
    if (!current) return;
    const amt = effectiveAmount;
    if (amt < 1 || amt > 10000) {
      toast.error(t("amountError"));
      return;
    }
    try {
      const res = await apiFetch<{ paymentUrl?: string }>(`/api/projects/${current.id}/recharge`, {
        method: "POST",
        body: JSON.stringify({ amount: amt, paymentMethod: payMethod }),
      });
      onOpenChange(false);
      if (res.paymentUrl) {
        toast.success(t("redirecting"));
        window.open(res.paymentUrl, "_blank");
      } else {
        toast.success(t("orderCreated"));
      }
      onRecharged?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ds-on-background/40 backdrop-blur-sm">
      <div className="bg-ds-surface-container-lowest w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/20">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold font-[var(--font-heading)]">{t("rechargeTitle")}</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-slate-400 hover:text-ds-on-background"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-8">
          <p className="text-sm text-slate-500 mb-6 font-medium">{t("selectAmount")}</p>

          {/* Quick Amount Selection */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {AMOUNTS.map((a) => (
              <button
                key={a}
                onClick={() => {
                  setAmount(a);
                  setCustomAmount("");
                }}
                className={`py-3 border-2 rounded-xl font-bold transition-colors ${
                  amount === a && !customAmount
                    ? "border-ds-primary text-ds-primary bg-ds-primary/5"
                    : "border-slate-100 text-slate-600 hover:border-ds-primary/40"
                }`}
              >
                ${a}
              </button>
            ))}
          </div>

          {/* Custom Input */}
          <div className="mb-8">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              {t("customAmountLabel")}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-4 flex items-center text-slate-400 font-bold">
                $
              </span>
              <input
                className="w-full bg-ds-surface-container-low border-none rounded-xl py-4 pl-10 pr-4 text-lg font-bold focus:ring-2 focus:ring-ds-primary/20 outline-none"
                placeholder={t("amountPlaceholder")}
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Payment Methods */}
          <div className="space-y-3 mb-10">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              {t("paymentMethod")}
            </label>
            <div
              onClick={() => setPayMethod("alipay")}
              className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                payMethod === "alipay"
                  ? "border-ds-primary bg-ds-primary/5"
                  : "border-slate-100 hover:border-slate-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined ${payMethod === "alipay" ? "text-ds-primary" : "text-slate-400"}`}
                >
                  account_balance
                </span>
                <span className="font-bold text-ds-on-background">{t("alipay")}</span>
              </div>
              <div
                className={`w-5 h-5 rounded-full ${payMethod === "alipay" ? "border-4 border-ds-primary" : "border-2 border-slate-200"}`}
              />
            </div>
            <div
              onClick={() => setPayMethod("wechat")}
              className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                payMethod === "wechat"
                  ? "border-ds-primary bg-ds-primary/5"
                  : "border-slate-100 hover:border-slate-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined ${payMethod === "wechat" ? "text-ds-primary" : "text-slate-400"}`}
                >
                  qr_code_2
                </span>
                <span className="font-bold text-slate-600">{t("wechatPay")}</span>
              </div>
              <div
                className={`w-5 h-5 rounded-full ${payMethod === "wechat" ? "border-4 border-ds-primary" : "border-2 border-slate-200"}`}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={() => onOpenChange(false)}
              className="flex-1 py-4 px-6 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
            >
              {tc("cancel")}
            </button>
            <button
              onClick={doRecharge}
              className="flex-[2] py-4 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-ds-primary to-ds-primary-container shadow-xl shadow-ds-primary/30 active:scale-95 transition-transform"
            >
              {t("confirmRecharge")} ${effectiveAmount.toFixed(2)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
