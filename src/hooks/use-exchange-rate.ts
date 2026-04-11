"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

let cachedRate: number | null = null;

export function useExchangeRate(): number {
  const [rate, setRate] = useState(cachedRate ?? 7.3);

  useEffect(() => {
    if (cachedRate !== null) return;
    apiFetch<{ rate: number }>("/api/exchange-rate")
      .then((res) => {
        cachedRate = res.rate;
        setRate(res.rate);
      })
      .catch(() => {});
  }, []);

  return rate;
}
