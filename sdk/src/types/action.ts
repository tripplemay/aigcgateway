export interface Action {
  id: string;
  name: string;
  description: string | null;
  model: string;
  activeVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionVersion {
  id: string;
  actionId: string;
  versionNumber: number;
  messages: ActionMessage[];
  variables: ActionVariable[];
  changelog: string | null;
  createdAt: string;
}

export interface ActionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ActionVariable {
  name: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
}
