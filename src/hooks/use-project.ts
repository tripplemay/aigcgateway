"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";

interface Project { id: string; name: string; balance: number }

export function useProject() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ data: Project[] }>("/api/projects")
      .then((r) => {
        setProjects(r.data);
        const saved = typeof window !== "undefined" ? localStorage.getItem("projectId") : null;
        const found = r.data.find((p) => p.id === saved) ?? r.data[0] ?? null;
        setCurrent(found);
        if (found) localStorage.setItem("projectId", found.id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const select = (id: string) => {
    const p = projects.find((x) => x.id === id) ?? null;
    setCurrent(p);
    if (p) localStorage.setItem("projectId", p.id);
  };

  return { projects, current, loading, select };
}
