import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { PlatformAuditConsole } from "@/components/platform/PlatformAuditConsole";

export default async function PlatformAuditPage() {
  const admin = await requirePlatformAdmin();
  if (!admin) notFound();
  return <PlatformAuditConsole admin={admin} />;
}
