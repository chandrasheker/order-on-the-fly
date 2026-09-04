# TableTap printer agent

Local restaurant process that **pulls** KOT and customer-bill jobs from TableTap over outbound HTTPS.

The cloud never opens a connection into the restaurant LAN. No port forwarding, public printer IP, or VPN is required for printing.

This is durable at-least-once server delivery with **local de-duplication** and explicit handling of the rare ambiguous crash window. It does **not** claim mathematical exactly-once physical printing.

## 1. Install Node

Use the same Node major version as the TableTap application (Node 20+).

```bash
node --version
```

Copy this `printer-agent/` directory to the restaurant computer, for example `/opt/tabletap-printer-agent`.

## 2. Configure a local CUPS printer

Install CUPS and add the kitchen/bill printers. Confirm the queue name:

```bash
lpstat -p
echo "hello" | lp -d KITCHEN_PRINTER
```

Do not continue until `lp` works locally.

## 3. Create the TableTap agent credential

1. Sign in as OWNER on the restaurant host (`https://YOUR_SLUG.dvadtech.in`).
2. Open **Printing**.
3. Create a printer agent, choose logical targets (`kitchen`, `bill`), and copy the token **once**.
4. The token is never shown again. Rotate it if it is lost.

## 4. Local environment file

Create `/etc/tabletap/printer-agent.env` as root, mode `600`, owned by the service user:

```bash
sudo install -d -m 755 /etc/tabletap
sudo install -d -m 750 -o tabletap -g tabletap /var/lib/tabletap-printer-agent
sudo install -m 600 /dev/null /etc/tabletap/printer-agent.env
```

```env
TABLETAP_SERVER_URL=https://YOUR_SLUG.dvadtech.in
TABLETAP_PRINTER_AGENT_TOKEN=tt_pa_...
TABLETAP_PRINTER_AGENT_STATE_DIR=/var/lib/tabletap-printer-agent
TABLETAP_PRINTER_POLL_MS=2000
TABLETAP_PRINTER_MAP=/etc/tabletap/printers.json
TABLETAP_PRINTER_DRY_RUN=0
```

Never put the token in the systemd unit file.

Production URLs must be HTTPS. `http://localhost` is allowed for development only. TLS certificates are validated. There is no `--insecure` default.

## 5. Map logical targets to CUPS queues

`/etc/tabletap/printers.json`:

```json
{
  "kitchen": {
    "adapter": "cups",
    "printer": "KITCHEN_PRINTER"
  },
  "bill": {
    "adapter": "cups",
    "printer": "BILL_PRINTER"
  }
}
```

This mapping stays on the restaurant computer. TableTap only knows logical targets.

If the server sends `target=kitchen` and this file has no `kitchen` entry, the agent **does not** print to another printer. It reports `PRINTER_NOT_CONFIGURED`.

## 6. Dry-run

```bash
export $(grep -v '^#' /etc/tabletap/printer-agent.env | xargs)
TABLETAP_PRINTER_DRY_RUN=1 node /opt/tabletap-printer-agent/index.mjs
```

Dry-run writes rendered tickets under `$STATE_DIR/dry-run/` and still reports ACK/failure to TableTap. Confirm the agent becomes **Online** on `/admin/printing`.

## 7. Run and install systemd

```bash
sudo cp /opt/tabletap-printer-agent/tabletap-printer-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tabletap-printer-agent
sudo journalctl -u tabletap-printer-agent -f
```

The service user needs write access to `/var/lib/tabletap-printer-agent`. Do not run as root unless CUPS policy genuinely requires it.

## 8. Verify

1. Agent status is Online on the restaurant Printing page.
2. Place an order → a kitchen job appears and is ACKED.
3. Finalize a bill → a bill job appears and is ACKED.
4. Unplug the printer → the job retries with backoff, then FAILED if attempts are exhausted. The order/payment still succeeds.
5. **Retry delivery** re-queues the **same** job. If this computer already recorded that delivery as printed, it will not physically print again.
6. **Print another copy** creates a new job and prints again on purpose.

## Retry vs reprint

| Action | Meaning |
| --- | --- |
| Retry delivery | Same PrintJob / delivery key. Recover uncertain or failed delivery. Local de-dupe may ACK without printing. |
| Print another copy | New PrintJob, new delivery key, original payload. Intentionally another physical copy. |

## Local durable state

Successful local spool acceptance is stored as:

```text
$STATE_DIR/jobs/<deliveryKey>.json
```

written via temp file → fsync → rename. Restart preserves de-duplication.

If the agent crashes after submitting to the spooler but before recording `PRINTED`, the job is treated as **ambiguous**. Staff should check the paper, then Retry or Reprint. The agent will not blindly print a second copy.

## Signals

`SIGINT` / `SIGTERM` stop claiming new work after the current job. systemd `Restart=always` recovers the process.

## Development

```bash
TABLETAP_SERVER_URL=http://localhost:3000 \
TABLETAP_PRINTER_AGENT_TOKEN=tt_pa_... \
TABLETAP_PRINTER_DRY_RUN=1 \
TABLETAP_PRINTER_MAP=printer-agent/printers.example.json \
node printer-agent/index.mjs
```

The older inbound listener under `services/printer-agent` is **legacy-push** only (`PRINT_DELIVERY_MODE=legacy-push`). Production uses this outbound agent.
