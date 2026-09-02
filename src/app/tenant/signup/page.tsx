import { getTenantBaseDomain } from "@/platform/host";
import { TenantSignupForm } from "@/components/tenant/TenantSignupForm";

export default function TenantSignupPage() {
  return <TenantSignupForm baseDomain={getTenantBaseDomain()} />;
}
