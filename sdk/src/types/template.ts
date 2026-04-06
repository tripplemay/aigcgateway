export interface Template {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  steps: TemplateStep[];
}

export interface TemplateStep {
  id: string;
  templateId: string;
  actionId: string;
  order: number;
  role: "SEQUENTIAL" | "SPLITTER" | "BRANCH" | "MERGE";
}
