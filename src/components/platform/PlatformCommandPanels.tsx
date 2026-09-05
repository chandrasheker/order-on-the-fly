"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import { AttentionList, HealthBadge, Money, RestaurantHealthTable, SummaryCard, Trend } from "@/components/platform/command-center-shared";
import { formatDurationMs } from "@/platform/command-center/classify";
import type { CommandCenterPayload, RestaurantCommandRow } from "@/platform/command-center/types";

export function TenantOverviewStats({
  command,
  sort,
  onSort,
  filter,
}: {
  command: CommandCenterPayload;
  sort: string;
  onSort: (key: string) => void;
  filter: string;
}) {
  const s = command.summary;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Restaurants" value={String(s.restaurantCount)} hint={`${s.enabledRestaurants} enabled · ${s.activeNow} active now`} />
        <SummaryCard label="Orders" value={String(s.orders)} hint={command.range.label} />
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Net captured</p>
          <p className="text-2xl font-semibold mt-1"><Money paise={s.netCapturedPaise} /></p>
        </Card>
        <SummaryCard label="Need attention" value={String(s.needAttention)} warn={s.needAttention > 0} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">On-time SLA</p>
          <p className="text-lg font-semibold mt-1">{s.slaLabel}</p>
        </Card>
        <SummaryCard
          label="Active tables"
          value={String(command.restaurants.reduce((n, row) => n + row.current.activeTables, 0))}
          hint="Current"
        />
        <SummaryCard
          label="Active staff"
          value={String(command.restaurants.reduce((n, row) => n + row.current.activeStaff, 0))}
          hint="Current sessions"
        />
        <SummaryCard
          label="Overdue items"
          value={String(command.restaurants.reduce((n, row) => n + row.current.overdue, 0))}
          hint="Current kitchen"
        />
      </div>
      <RestaurantHealthTable rows={command.restaurants} sort={sort} onSort={onSort} filter={filter} />
    </div>
  );
}

export function TenantOperationsPanel({ command }: { command: CommandCenterPayload }) {
  return (
    <div className="grid gap-3">
      {command.restaurants.map((row) => (
        <RestaurantOperationsCard key={row.restaurantId} row={row} />
      ))}
    </div>
  );
}

export function TenantAnalyticsPanel({ command }: { command: CommandCenterPayload }) {
  const most = [...command.restaurants].sort((a, b) => b.period.orders - a.period.orders)[0];
  const least = [...command.restaurants].sort((a, b) => a.period.orders - b.period.orders)[0];
  const busiest = [...command.restaurants].sort((a, b) => b.activity.index - a.activity.index)[0];
  const quietest = [...command.restaurants].sort((a, b) => a.activity.index - b.activity.index)[0];
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs text-zinc-500">Most orders</p>
          <p className="font-semibold">{most ? `${most.restaurantName} · ${most.period.orders}` : "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">Least orders</p>
          <p className="font-semibold">{least ? `${least.restaurantName} · ${least.period.orders}` : "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">Most active currently</p>
          <p className="font-semibold">
            {busiest ? `${busiest.restaurantName} · ${busiest.current.activeTables} tables · ${busiest.activity.guestRequests} guest requests` : "—"}
          </p>
          {busiest && (
            <p className="text-xs text-zinc-500 mt-1">
              Activity index {busiest.activity.index} = {busiest.activity.orders} orders + {busiest.activity.items} items + {busiest.activity.paymentCount} payments + {busiest.activity.activeTables} tables + {busiest.activity.guestRequests} requests
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">Quietest currently</p>
          <p className="font-semibold">{quietest ? `${quietest.restaurantName} · ${quietest.current.activeTables} open tables` : "—"}</p>
        </Card>
      </div>
      <div className="grid gap-3">
        {(command.rankings ?? []).map((ranking) => (
          <Card key={ranking.key} className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-500">{ranking.label}</p>
              <p className="font-semibold">{ranking.restaurantName}</p>
            </div>
            <p className="text-sm text-zinc-300">{ranking.display}</p>
          </Card>
        ))}
      </div>
      <Card className="p-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-zinc-500">
            <tr>
              <th className="text-left py-1">Restaurant</th>
              <th className="text-left py-1">Orders</th>
              <th className="text-left py-1">Net revenue</th>
              <th className="text-left py-1">SLA</th>
              <th className="text-left py-1">Serve time</th>
              <th className="text-left py-1">Refunds</th>
            </tr>
          </thead>
          <tbody>
            {command.restaurants.map((row) => (
              <tr key={row.restaurantId} className="border-t border-white/5">
                <td className="py-2"><Link href={row.hrefs.overview} className="text-violet-200">{row.restaurantName}</Link></td>
                <td className="py-2">{row.period.orders} <Trend value={row.trends.orders} /></td>
                <td className="py-2"><Money paise={row.revenue.netCapturedPaise} /> <Trend value={row.trends.netRevenuePaise} /></td>
                <td className="py-2">{row.kitchen.sla.label} <Trend value={row.trends.onTimePercent} /></td>
                <td className="py-2">{formatDurationMs(row.service.orderToServed.average)} <Trend value={row.trends.avgServeMs} invert /></td>
                <td className="py-2"><Money paise={row.revenue.refundsPaise} /> <Trend value={row.trends.refundsPaise} invert /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function RestaurantOperationsCard({ row, focus }: { row: RestaurantCommandRow; focus?: string }) {
  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={row.hrefs.overview} className="text-lg font-semibold hover:text-violet-200">{row.restaurantName}</Link>
          <p className="text-sm text-zinc-500">{row.tenantName}</p>
        </div>
        <AttentionList row={row} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className={focus === "sla" ? "rounded-xl border border-amber-500/40 p-3" : ""}>
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Kitchen</h3>
            <HealthBadge level={row.kitchen.load.level} />
          </div>
          <p className="text-sm text-zinc-400 mt-1">{row.kitchen.load.reasons.join(" · ")}</p>
          <p className="text-sm mt-2">
            PENDING {row.kitchen.pending} · PREPARING {row.kitchen.preparing} · READY {row.kitchen.ready} · overdue {row.kitchen.overdue}
          </p>
          <p className="text-sm">
            Oldest overdue {formatDurationMs(row.kitchen.oldestOverdueMs)} · paused {row.kitchen.paused ? "yes" : "no"}
            {row.kitchen.autoPauseThreshold ? ` · auto-pause at ${row.kitchen.autoPauseThreshold}` : ""}
          </p>
          <Link href={row.hrefs.sla} className="text-sm text-violet-300 mt-2 inline-block">
            SLA {row.kitchen.sla.label} →
          </Link>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Service</h3>
            <HealthBadge level={row.service.load.level} />
          </div>
          <p className="text-sm text-zinc-400 mt-1">{row.service.load.reasons.join(" · ")}</p>
          <p className="text-sm mt-2">
            Ready waiting {row.service.readyWaiting} · unresolved requests {row.service.unresolvedRequests}
          </p>
          <p className="text-sm">
            Created→served avg {formatDurationMs(row.service.orderToServed.average)} · P95 {formatDurationMs(row.service.orderToServed.p95)} · n={row.service.orderToServed.sampleCount}
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Payments</h3>
            <Link href={row.hrefs.paymentsFailed}><HealthBadge level={row.money.health.level} /></Link>
          </div>
          <p className="text-sm text-zinc-400 mt-1">{row.money.health.reasons.join(" · ")}</p>
          <p className="text-sm mt-2">
            Captured <Money paise={row.money.capturedGrossPaise} /> · refunds <Money paise={row.money.refundsPaise} /> · net <Money paise={row.money.netCapturedPaise} />
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Printing</h3>
            <Link href={row.hrefs.printingAmbiguous}><HealthBadge level={row.printing.health.level} /></Link>
          </div>
          <p className="text-sm text-zinc-400 mt-1">{row.printing.health.reasons.join(" · ")}</p>
          <p className="text-sm mt-2">
            Jobs {row.printing.jobs} · ACK {row.printing.acked} · failures {row.printing.failures} · AMBIGUOUS {row.printing.ambiguous}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function RestaurantDetailPanels({
  row,
  tab,
  focus,
}: {
  row: RestaurantCommandRow;
  tab: string;
  focus?: string;
}) {
  if (tab === "financial") {
    return (
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Money health</h2>
          <HealthBadge level={row.money.health.level} />
        </div>
        <p className="text-sm text-zinc-400">{row.money.health.reasons.join(" · ")}</p>
        <dl className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>Captured <strong><Money paise={row.money.capturedGrossPaise} compact={false} /></strong></div>
          <div>Refunds <strong><Money paise={row.money.refundsPaise} compact={false} /></strong></div>
          <div>Net captured <strong><Money paise={row.money.netCapturedPaise} compact={false} /></strong></div>
          <div>Outstanding <strong><Money paise={row.money.outstandingPaise} compact={false} /></strong></div>
          <div>Cash <strong><Money paise={row.revenue.cashPaise} compact={false} /></strong></div>
          <div>Manual UPI <strong><Money paise={row.revenue.manualUpiPaise} compact={false} /></strong></div>
          <div>Automatic gateway <strong><Money paise={row.revenue.automaticGatewayPaise} compact={false} /></strong></div>
          <div>Pending gateway attempts <Link href={row.hrefs.paymentsFailed} className="text-violet-300">{row.money.pendingGatewayAttempts}</Link></div>
          <div>Failed gateway attempts <Link href={row.hrefs.paymentsFailed} className="text-violet-300">{row.money.failedGatewayAttempts}</Link></div>
          <div>Refund pending {row.money.refundPending}</div>
          <div>Refund failures {row.money.refundFailures}</div>
          <div>Reconciliation variance <Money paise={row.money.reconciliationVariancePaise} compact={false} /></div>
          <div>Cash variance <Money paise={row.money.cashVariancePaise} compact={false} /></div>
        </dl>
      </Card>
    );
  }

  if (tab === "staff") {
    return (
      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Staff workload</h2>
          <p className="text-sm text-zinc-400">Facts only — not a punishment score.</p>
          <p className="text-sm mt-2">
            {row.staff.activeSessions} active sessions · {row.staff.ordersPlaced} orders placed · {row.staff.itemsServed} items served
          </p>
        </Card>
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">Staff</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Orders placed</th>
                <th className="px-3 py-2 text-left">Prepared</th>
                <th className="px-3 py-2 text-left">Ready</th>
                <th className="px-3 py-2 text-left">Served</th>
                <th className="px-3 py-2 text-left">Payments</th>
                <th className="px-3 py-2 text-left">Collected</th>
              </tr>
            </thead>
            <tbody>
              {row.staff.rows.map((staff) => (
                <tr key={staff.userId} className="border-t border-white/5">
                  <td className="px-3 py-2">{staff.name}</td>
                  <td className="px-3 py-2">{staff.role}</td>
                  <td className="px-3 py-2">{staff.ordersPlaced}</td>
                  <td className="px-3 py-2">{staff.itemsPrepared}</td>
                  <td className="px-3 py-2">{staff.itemsReady}</td>
                  <td className="px-3 py-2">{staff.itemsServed}</td>
                  <td className="px-3 py-2">{staff.paymentsCollected}</td>
                  <td className="px-3 py-2"><Money paise={staff.revenueCollectedPaise} compact={false} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {row.service.servers.length > 0 && (
          <div className="grid gap-3">
            {row.service.servers.map((server) => (
              <Card key={server.userId} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{server.name} · {server.role}</p>
                  <HealthBadge level={server.load} />
                </div>
                <p className="text-sm text-zinc-400 mt-1">
                  {server.activeTables} active tables · {server.readyWaiting} ready waiting · {server.pendingRequests} guest requests
                  {server.avgAckMs != null ? ` · ${formatDurationMs(server.avgAckMs)} avg response` : ""}
                </p>
                {server.note && <p className="text-xs text-zinc-500 mt-1">{server.note}</p>}
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Orders" value={String(row.period.orders)} hint={`${row.period.items} items`} />
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Net captured</p>
          <p className="text-2xl font-semibold mt-1"><Money paise={row.revenue.netCapturedPaise} /></p>
        </Card>
        <Link href={row.hrefs.sla}>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Kitchen SLA</p>
            <p className="text-lg font-semibold mt-1">{row.kitchen.sla.label}</p>
          </Card>
        </Link>
        <Link href={row.hrefs.errors}>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">API errors</p>
            <p className="text-2xl font-semibold mt-1">{row.reliability.requestFailed + row.reliability.http5xx}</p>
          </Card>
        </Link>
      </div>
      <RestaurantOperationsCard row={row} focus={focus} />
      <Card className="p-5 space-y-2">
        <h3 className="font-medium">Guest service</h3>
        <p className="text-sm">
          Waiter calls {row.guest.waiterCalls} · bill {row.guest.billRequests} · water/refill {row.guest.waterOrRefill} · unresolved {row.guest.unresolved}
        </p>
        <p className="text-sm text-zinc-400">
          Avg ack {formatDurationMs(row.guest.avgAckMs)} · avg resolve {formatDurationMs(row.guest.avgResolveMs)} · oldest pending {formatDurationMs(row.guest.oldestPendingMs)}
        </p>
      </Card>
      <Card className="p-5 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Reliability</h3>
          <Link href={row.hrefs.errors}><HealthBadge level={row.reliability.health.level} /></Link>
        </div>
        <p className="text-sm text-zinc-400">{row.reliability.health.reasons.join(" · ")}</p>
        <div className="space-y-1">
          {row.reliability.topErrors.map((error) => (
            <Link key={error.fingerprint} href={`${row.hrefs.errors}&errorFingerprint=${encodeURIComponent(error.fingerprint)}`} className="block text-sm text-violet-300">
              {error.fingerprint.slice(0, 12)} · {error.count} · {error.action ?? error.route ?? "—"}
            </Link>
          ))}
        </div>
      </Card>
      <Card className="p-5 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Security</h3>
          <Link href={row.hrefs.security} className="text-sm text-violet-300">{row.security.total} events →</Link>
        </div>
        <p className="text-sm">
          Failed auth {row.security.failedAuth} · permission denied {row.security.permissionDenied} · cross-restaurant {row.security.crossRestaurant} · printer auth {row.security.invalidPrinterAuth} · Razorpay signature {row.security.razorpaySignature}
        </p>
      </Card>
    </div>
  );
}
