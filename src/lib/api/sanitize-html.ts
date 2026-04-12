/**
 * HTML 特殊字符转义工具
 *
 * 用于展示层输出，防止 XSS。不修改数据库存储的原始数据。
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

const HTML_ESCAPE_RE = /[&<>"']/g;

export function escapeHtml(str: string): string {
  return str.replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch]);
}

/**
 * 递归转义 JSON 值中的所有字符串（深拷贝，不修改原对象）
 */
export function escapeJsonStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return escapeHtml(value);
  }
  if (Array.isArray(value)) {
    return value.map(escapeJsonStrings);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = escapeJsonStrings(v);
    }
    return result;
  }
  return value;
}
