"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, RefreshCw, Copy } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";

type Agent = {
  id: string;
  name: string;
  branchId: string | null;
  tokenPrefix: string;
  enabled: boolean;
  allowedTargets: string[];
  lastSeenAt: string | null;
  status: string;
};

type Job = {
  id: string;
  kind: string;
  target: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  ackedAt: string | null;
  reprintOfPrintJobId: string | null;
  orderNumber?: number | null;
  tableNumber?: number | null;
  billNumber?: string | null;
};

export default function PrintingAdminPage() {
  const [role, setRole] = useState<string>("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [counts, setCounts] = useState({ pending: 0, sent: 0, failed: 0, acked: 0 });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("Kitchen printer");
  const [targets, setTargets] = useState("kitchen,bill");
  const [newToken, setNewToken] = useState<string | null>(null);

  const isOwner = role === "OWNER";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await fetch("/api/auth/me");
      if (me.ok) {
        const json = await me.json();
        setRole(json.user?.role ?? json.role ?? "");
      }
      const [agentRes, jobRes] = await Promise.all([fetch("/api/print/agents"), fetch("/api/print/jobs?limit=50")]);
      if (agentRes.ok) setAgents((await agentRes.json()).agents ?? []);
      if (jobRes.ok) {
        const json = await jobRes.json();
        setJobs(json.jobs ?? []);
        setCounts(json.counts ?? { pending: 0, sent: 0, failed: 0, acked: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createAgent() {
    const res = await fetch("/api/print/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        allowedTargets: targets.split(",").map((item) => item.trim()).filter(Boolean),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(json.error ?? "Could not create agent");
      return;
    }
    setNewToken(json.token ?? null);
    setMessage("Token shown once. Copy it into the local agent env file.");
    await load();
  }

  async function mutateAgent(id: string, action: "rotate" | "revoke") {
    const res = await fetch(`/api/print/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(json.error ?? "Forbidden");
      return;
    }
    if (json.token) setNewToken(json.token);
    await load();
  }

  async function jobAction(id: string, action: "retry" | "reprint") {
    const res = await fetch(`/api/print/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessage(json.error ?? "Print action failed");
      return;
    }
    await load();
  }

  return (
    <div className="min-h-screen bg-app-shell text-foreground">
      <header className="border-b border-white/5 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/staff/dashboard" className="p-2 rounded-xl bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Printer className="w-5 h-5" /> Printing
            </h1>
            <p className="text-sm text-zinc-400">Agents · queue · retry delivery · print another copy</p>
          </div>
          <Button className="ml-auto" variant="secondary" onClick={() => void load()}>
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {message ? <p className="text-sm text-amber-300">{message}</p> : null}
        {newToken ? (
          <Card className="p-4 space-y-2">
            <p className="text-sm text-zinc-400">Copy this token now. It will not be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all text-xs bg-black/40 p-2 rounded">{newToken}</code>
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(newToken);
                }}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <pre className="text-xs text-zinc-400 whitespace-pre-wrap bg-black/30 p-3 rounded">
{`TABLETAP_SERVER_URL=https://YOUR_RESTAURANT.dvadtech.in
TABLETAP_PRINTER_AGENT_TOKEN=${newToken}
TABLETAP_PRINTER_AGENT_STATE_DIR=/var/lib/tabletap-printer-agent
TABLETAP_PRINTER_POLL_MS=2000`}
            </pre>
          </Card>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Card className="p-3">Pending {counts.pending}</Card>
          <Card className="p-3">Sent {counts.sent}</Card>
          <Card className="p-3">Failed {counts.failed}</Card>
          <Card className="p-3">Acked {counts.acked}</Card>
        </div>

        {isOwner ? (
          <Card className="p-4 space-y-3">
            <h2 className="font-semibold">Create printer agent</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" />
              <Input value={targets} onChange={(e) => setTargets(e.target.value)} placeholder="kitchen,bill" />
            </div>
            <Button onClick={() => void createAgent()}>Create agent and show token once</Button>
          </Card>
        ) : null}

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Printer agents</h2>
          {loading ? <Spinner /> : null}
          {agents.map((agent) => (
            <div key={agent.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 py-2 text-sm">
              <div>
                <p className="font-medium">{agent.name}</p>
                <p className="text-zinc-400">
                  {agent.status} · {agent.allowedTargets.join(",")} · {agent.tokenPrefix}
                </p>
              </div>
              {isOwner ? (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => void mutateAgent(agent.id, "rotate")}>
                    Rotate token
                  </Button>
                  <Button variant="secondary" onClick={() => void mutateAgent(agent.id, "revoke")}>
                    Revoke
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {!agents.length && !loading ? <p className="text-sm text-zinc-500">No printer agents yet.</p> : null}
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Print queue</h2>
          {jobs.map((job) => (
            <div key={job.id} className="border-b border-white/5 py-2 text-sm space-y-1">
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  {job.kind} → {job.target} · {job.status}
                  {job.reprintOfPrintJobId ? " · reprint" : ""}
                </span>
                <span className="text-zinc-400">
                  {job.attempts}/{job.maxAttempts}
                </span>
              </div>
              <p className="text-zinc-400">
                {job.billNumber ? `Bill ${job.billNumber}` : ""}
                {job.orderNumber != null ? ` Order #${job.orderNumber}` : ""}
                {job.tableNumber != null ? ` Table ${job.tableNumber}` : ""}
                {` · queued ${new Date(job.createdAt).toLocaleString()}`}
                {job.ackedAt ? ` · acked ${new Date(job.ackedAt).toLocaleString()}` : ""}
              </p>
              {job.lastError ? <p className="text-amber-300">{job.lastError}</p> : null}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void jobAction(job.id, "retry")}>
                  Retry delivery
                </Button>
                <Button variant="secondary" onClick={() => void jobAction(job.id, "reprint")}>
                  Print another copy
                </Button>
              </div>
            </div>
          ))}
        </Card>
      </main>
    </div>
  );
}
