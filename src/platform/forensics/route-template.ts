const DYNAMIC_SEGMENT = /^[0-9a-f]{20,}$/i;
const TOKENISH = /^(?:[A-Za-z0-9_-]{16,}|[0-9a-f-]{20,})$/;

export function routeTemplateFromPath(pathname: string) {
  const path = pathname.split("?")[0] ?? pathname;
  const parts = path.split("/").filter(Boolean);
  const templated = parts.map((part, index) => {
    const prev = parts[index - 1];
    if (prev === "public" || prev === "gateway" || prev === "token") return `[token]`;
    if (prev === "qr") return `[slug]`;
    if (
      prev === "orders" ||
      prev === "payments" ||
      prev === "jobs" ||
      prev === "agents" ||
      prev === "rewards" ||
      prev === "tenants" ||
      prev === "table-switch"
    ) {
      return `[id]`;
    }
    if (prev === "tenantId" || part === "overview") return part;
    if (DYNAMIC_SEGMENT.test(part) || (TOKENISH.test(part) && prev !== "api")) {
      if (prev === "menu" || prev === "display" || prev === "payment" || prev === "webhooks" || prev === "background") {
        return `[slug]`;
      }
      if (prev === "slug") return `[token]`;
      return `[id]`;
    }
    return part;
  });

  let route = `/${templated.join("/")}`;
  route = route
    .replace(/\/menu\/[^/]+\/[^/]+$/, "/menu/[slug]/[token]")
    .replace(/\/receipts\/public\/[^/]+$/, "/receipts/public/[token]")
    .replace(/\/payments\/gateway\/(?!create|verify)[^/]+$/, "/payments/gateway/[publicToken]")
    .replace(/\/webhooks\/[^/]+\/[^/]+$/, "/webhooks/[provider]/[slug]")
    .replace(/\/branding\/background\/(?!upload)[^/]+$/, "/branding/background/[slug]")
    .replace(/\/payment\/qr\/[^/]+$/, "/payment/qr/[slug]")
    .replace(/\/menu\/display\/[^/]+$/, "/menu/display/[slug]")
    .replace(/\/platform\/tenants\/[^/]+\/overview$/, "/platform/tenants/[tenantId]/overview")
    .replace(/\/print\/jobs\/[^/]+$/, "/print/jobs/[id]")
    .replace(/\/print\/agents\/[^/]+$/, "/print/agents/[id]")
    .replace(/\/orders\/[^/]+\/(receipt|kitchen-chit)$/, "/orders/[id]/$1")
    .replace(/\/orders\/[^/]+$/, "/orders/[id]")
    .replace(/\/payments\/[^/]+$/, "/payments/[id]")
    .replace(/\/table-switch\/[^/]+$/, "/table-switch/[id]")
    .replace(/\/rewards\/[^/]+$/, "/rewards/[id]");
  return route;
}

export function classifyHttpOutcome(status: number, securityDenied?: boolean) {
  if (securityDenied && status === 404) return "DENIED";
  if (status >= 200 && status < 400) return "SUCCESS";
  if (status === 401 || status === 403) return "DENIED";
  return "FAILED";
}
