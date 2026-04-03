import { prisma } from "@/lib/prisma";

export type TemplateVariable = {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
};

type TemplateMessage = {
  role: string;
  content: string;
};

/**
 * 根据 templateVersionId 和变量值，注入变量并返回组装好的 messages 数组。
 *
 * 1. 从数据库获取 TemplateVersion
 * 2. 校验所有 required 变量均已提供
 * 3. 对每条 message.content 做 {{变量名}} 全局替换
 * 4. 返回 messages 数组
 */
export async function injectTemplate(
  templateVersionId: string,
  variables: Record<string, string>,
): Promise<{ messages: TemplateMessage[]; templateId: string }> {
  const version = await prisma.templateVersion.findUnique({
    where: { id: templateVersionId },
    include: { template: true },
  });

  if (!version) {
    throw new InjectionError(`Template version not found: ${templateVersionId}`, 404);
  }

  const varDefs = version.variables as TemplateVariable[];
  const messages = version.messages as TemplateMessage[];

  // 校验必填变量
  const missing = varDefs.filter((v) => v.required && !(v.name in variables)).map((v) => v.name);

  if (missing.length > 0) {
    throw new InjectionError(`Missing required variables: ${missing.join(", ")}`, 400);
  }

  // 构建完整变量值映射（含 defaultValue 回退）
  const resolved: Record<string, string> = {};
  for (const def of varDefs) {
    if (def.name in variables) {
      resolved[def.name] = variables[def.name];
    } else if (def.defaultValue !== undefined) {
      resolved[def.name] = def.defaultValue;
    } else {
      resolved[def.name] = "";
    }
  }

  // 替换所有 {{变量名}}
  const injected = messages.map((msg) => ({
    role: msg.role,
    content: msg.content.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      return name in resolved ? resolved[name] : match;
    }),
  }));

  return { messages: injected, templateId: version.templateId };
}

/**
 * 根据 templateId 获取活跃版本 ID，然后注入变量。
 */
export async function injectByTemplateId(
  templateId: string,
  variables: Record<string, string>,
): Promise<{ messages: TemplateMessage[]; templateVersionId: string }> {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new InjectionError(`Template not found: ${templateId}`, 404);
  }

  if (!template.activeVersionId) {
    throw new InjectionError(`Template "${template.name}" has no active version`, 400);
  }

  const result = await injectTemplate(template.activeVersionId, variables);
  return { messages: result.messages, templateVersionId: template.activeVersionId };
}

export class InjectionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "InjectionError";
    this.status = status;
  }
}
