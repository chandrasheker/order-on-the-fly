import { getTrustedHostname, isIpHostname, normalizeHostname } from "@/platform/host";
import { FORENSIC_LIMITS } from "@/platform/forensics/constants";
import { boundString } from "@/platform/forensics/serialize";

export type ClientIpSource = "trusted-proxy" | "local" | "untrusted";

export type ResolvedClientIp = {
  clientIp: string | null;
  clientIpSource: ClientIpSource;
  forwardedFor: string | null;
};

const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 =
  /^(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;

function stripIpv4Mapped(ip: string) {
  if (ip.toLowerCase().startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

export function normalizeClientIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = String(raw).trim();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  if (value.includes("%")) value = value.split("%")[0] ?? value;
  value = stripIpv4Mapped(value);
  if (IPV4.test(value)) return value;
  if (IPV6.test(value) || (value.includes(":") && !value.includes("."))) {
    return value.toLowerCase();
  }
  return null;
}

export function forensicTrustProxyEnabled(env = process.env) {
  return env.FORENSIC_TRUST_PROXY === "1";
}

function isLocalHost(hostname: string | null) {
  if (!hostname) return false;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
}

export function resolveClientIp(
  headers: Headers | { get(name: string): string | null },
  options?: { hostname?: string | null; env?: NodeJS.ProcessEnv },
): ResolvedClientIp {
  const env = options?.env ?? process.env;
  const hostname = options?.hostname ?? getTrustedHostname(headers);
  const forwardedRaw = boundString(
    headers.get("x-forwarded-for") ?? headers.get("forwarded"),
    FORENSIC_LIMITS.forwardedFor,
  );
  const realIp = headers.get("x-real-ip");

  if (forensicTrustProxyEnabled(env)) {
    const parts = (headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((part) => normalizeClientIp(part.trim()))
      .filter((part): part is string => Boolean(part));
    const chosen =
      parts.length === 1
        ? parts[0]
        : parts.length > 1
          ? parts[parts.length - 1]
          : normalizeClientIp(realIp);
    return {
      clientIp: chosen,
      clientIpSource: "trusted-proxy",
      forwardedFor: forwardedRaw,
    };
  }

  if (isLocalHost(hostname) || (isIpHostname(hostname) && (hostname === "127.0.0.1" || hostname === "::1"))) {
    return {
      clientIp: hostname === "::1" ? "::1" : "127.0.0.1",
      clientIpSource: "local",
      forwardedFor: forwardedRaw,
    };
  }

  return {
    clientIp: null,
    clientIpSource: "untrusted",
    forwardedFor: forwardedRaw,
  };
}

export function forensicUserAgent(headers: Headers | { get(name: string): string | null }) {
  return boundString(headers.get("user-agent"), FORENSIC_LIMITS.userAgent);
}

export function forensicHostname(headers: Headers | { get(name: string): string | null }) {
  return boundString(normalizeHostname(getTrustedHostname(headers)), FORENSIC_LIMITS.hostname);
}
