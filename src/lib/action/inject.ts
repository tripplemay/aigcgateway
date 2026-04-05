/**
 * 变量注入：替换 messages 中的 {{variable}} 占位符
 */

export interface VarDef {
  name: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
}

export interface Message {
  role: string;
  content: string;
}

export class InjectionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "InjectionError";
  }
}

export function injectVariables(
  messages: Message[],
  variableDefs: VarDef[],
  providedVars: Record<string, string>,
): Message[] {
  // Check required variables
  for (const def of variableDefs) {
    if (def.required && !(def.name in providedVars) && !def.defaultValue) {
      throw new InjectionError(`Missing required variable: ${def.name}`, 400);
    }
  }

  // Build resolved variables map (provided > default)
  const resolved: Record<string, string> = {};
  for (const def of variableDefs) {
    if (def.name in providedVars) {
      resolved[def.name] = providedVars[def.name];
    } else if (def.defaultValue !== undefined) {
      resolved[def.name] = def.defaultValue;
    }
  }

  // Also include any extra variables not in defs (e.g. reserved variables)
  for (const [key, value] of Object.entries(providedVars)) {
    if (!(key in resolved)) {
      resolved[key] = value;
    }
  }

  // Replace {{variable}} in all message content
  return messages.map((msg) => ({
    ...msg,
    content: msg.content.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      return name in resolved ? resolved[name] : match;
    }),
  }));
}
