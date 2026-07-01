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

    log("Print job received", { type: body.type, orderId: body.orderId ?? body.orderNumber });

    // Stub: in production, write ESC/POS bytes to USB/serial/network printer.
    // Integrate with `node-thermal-printer` or raw socket to port 9100.
    if (process.env.PRINTER_DEVICE?.startsWith("network:")) {
      log("Would send to printer device:", process.env.PRINTER_DEVICE);
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, queued: true }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  log(`Listening on http://0.0.0.0:${PORT}`);
});
