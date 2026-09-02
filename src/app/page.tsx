import { headers } from "next/headers";
import { LoginForm } from "@/components/LoginForm";
import { ApexLanding } from "@/components/ApexLanding";
import {
  allowsLegacyRestaurantScoping,
  classifyRequestHost,
  getTenantBaseDomain,
} from "@/platform/host";

export default async function HomePage() {
  const host = classifyRequestHost(await headers());
  if (host.kind === "reserved" && !allowsLegacyRestaurantScoping(host)) {
    return <ApexLanding hostname={host.hostname} baseDomain={getTenantBaseDomain()} />;
  }
  return <LoginForm />;
}
