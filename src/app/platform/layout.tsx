import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { classifyRequestHost, platformRoutesAllowedOnHost } from "@/platform/host";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const host = classifyRequestHost(await headers());
  if (!platformRoutesAllowedOnHost(host)) {
    notFound();
  }
  return children;
}
