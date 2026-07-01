import { NextRequest, NextResponse } from "next/server";
import { acknowledgePrintJob } from "@/domains/printing/print-job-service";

export async function POST(req: NextRequest) {
  const secret = process.env.PRINTER_AGENT_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json();
  const ackToken = String(body.ackToken ?? "");
  if (!ackToken) {
    return NextResponse.json({ error: "ackToken required" }, { status: 400 });
  }

  const job = await acknowledgePrintJob(ackToken);
  if (!job) return NextResponse.json({ error: "Print job not found" }, { status: 404 });

  return NextResponse.json({ ok: true, jobId: job.id, status: job.status });
}
