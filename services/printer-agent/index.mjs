#!/usr/bin/env node
/**
 * TableTap Printer Agent — local ESC/POS relay.
 * Run: node services/printer-agent/index.mjs
 * Env: PRINTER_AGENT_PORT=8091, PRINTER_AGENT_SECRET=..., PRINTER_DEVICE=network:192.168.1.50:9100
 */
import http from "node:http";

const PORT = Number(process.env.PRINTER_AGENT_PORT ?? 8091);
const SECRET = process.env.PRINTER_AGENT_SECRET ?? "";
const log = (...args) => console.log("[printer-agent]", ...new Date().toISOString(), ...args);

function auth(req) {
  if (!SECRET) return true;
  const h = req.headers.authorization ?? "";
  return h === `Bearer ${SECRET}`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "tabletap-printer-agent" }));
    return;
  }

  if (req.method === "POST" && req.url === "/print") {
    if (!auth(req)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    log("Print job received", { kind: body.kind, ackToken: body.ackToken, orderId: body.payload?.orderId });

    if (process.env.PRINTER_DEVICE?.startsWith("network:")) {
      log("Would send to printer device:", process.env.PRINTER_DEVICE);
    }

    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const ackToken = body.ackToken;
    if (ackToken) {
      try {
        const ackRes = await fetch(`${appUrl}/api/print/ack`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}),
          },
          body: JSON.stringify({ ackToken }),
        });
        log("Ack response", ackRes.status);
      } catch (err) {
        log("Ack failed", err.message);
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ackToken }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  log(`Listening on http://0.0.0.0:${PORT}`);
});
