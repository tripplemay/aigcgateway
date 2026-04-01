/**
 * IP / CIDR 校验与匹配工具
 */

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV4_CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;
const IPV6_CIDR_RE = /^[0-9a-fA-F:]+\/\d{1,3}$/;

/** 校验是否为合法 IPv4/IPv6 地址或 CIDR */
export function isValidIpOrCidr(value: string): boolean {
  if (IPV4_RE.test(value)) {
    return value.split(".").every((o) => {
      const n = parseInt(o, 10);
      return n >= 0 && n <= 255;
    });
  }
  if (IPV4_CIDR_RE.test(value)) {
    const [ip, prefix] = value.split("/");
    const prefixNum = parseInt(prefix, 10);
    return isValidIpOrCidr(ip) && prefixNum >= 0 && prefixNum <= 32;
  }
  if (IPV6_CIDR_RE.test(value)) {
    const prefix = parseInt(value.split("/")[1], 10);
    return prefix >= 0 && prefix <= 128;
  }
  if (IPV6_RE.test(value)) return true;
  return false;
}

/** 从请求中获取客户端真实 IP */
export function getClientIp(request: Request): string {
  // X-Forwarded-For: client, proxy1, proxy2 — 取最左边
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  // Nginx 的 X-Real-IP
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();

  return "0.0.0.0";
}

/** 检查 IP 是否在白名单中（支持精确匹配和 CIDR） */
export function isIpInWhitelist(clientIp: string, whitelist: string[]): boolean {
  return whitelist.some((entry) => {
    if (entry.includes("/")) {
      return matchesCidr(clientIp, entry);
    }
    return clientIp === entry;
  });
}

/** CIDR 匹配（仅 IPv4） */
function matchesCidr(ip: string, cidr: string): boolean {
  const [range, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);
  if (!IPV4_RE.test(ip) || !IPV4_RE.test(range)) return ip === range;

  const ipNum = ipToNumber(ip);
  const rangeNum = ipToNumber(range);
  const mask = ~(2 ** (32 - prefix) - 1) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

function ipToNumber(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}
