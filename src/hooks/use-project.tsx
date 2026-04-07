"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";

interface Project {
  id: string;
  name: string;
  balance: number;
}

interface ProjectContextValue {
  projects: Project[];
  current: Project | null;
  loading: boolean;
  select: (id: string) => void;
  refresh: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ data: Project[] }>("/api/projects");
      setProjects(r.data);
      const saved = typeof window !== "undefined" ? localStorage.getItem("projectId") : null;
      const found = r.data.find((p) => p.id === saved) ?? r.data[0] ?? null;
      setCurrent(found);
      if (found) localStorage.setItem("projectId", found.id);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const select = useCallback(
    (id: string) => {
      const p = projects.find((x) => x.id === id) ?? null;
      setCurrent(p);
      if (p) localStorage.setItem("projectId", p.id);
    },
    [projects],
  );

  const refresh = useCallback(async () => {
    const r = await apiFetch<{ data: Project[] }>("/api/projects");
    setProjects(r.data);
    // Auto-select newest project if current no longer exists
    const currentStillExists = current && r.data.find((p) => p.id === current.id);
    if (!currentStillExists && r.data.length > 0) {
      const newest = r.data[r.data.length - 1];
      setCurrent(newest);
      localStorage.setItem("projectId", newest.id);
    }
  }, [current]);

  return (
    <ProjectContext.Provider value={{ projects, current, loading, select, refresh }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return ctx;
}
