"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Ban, CheckCircle2, Flame, Play } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn, formatCountdown } from "@/lib/utils";

export type KitchenBoardItem = {
  id: string;
  itemName: string;
  quantity: number;
  status: string;
  notes?: string | null;
  expectedReadyAt: string;
  isOverdue: boolean;
  categoryName: string;
  categorySlug: string;
};

export type KitchenBoardTicket = {
  id: string;
  orderNumber: number;
  tableNumber: number;
  locationLabel?: string;
  alarmTriggered: boolean;
  items: KitchenBoardItem[];
};

const COLUMNS = [
  { key: "PENDING", label: "New tickets", cookLabel: "NEW", color: "border-amber-500/50 bg-amber-500/5" },
  { key: "PREPARING", label: "Cooking now", cookLabel: "COOKING", color: "border-sky-500/50 bg-sky-500/5" },
  { key: "READY", label: "Ready to bump", cookLabel: "READY", color: "border-emerald-500/50 bg-emerald-500/5" },
] as const;

type KitchenTicketBoardProps = {
  tickets: KitchenBoardTicket[];
  now: number;
  matchesCategoryFilter: (categorySlug: string) => boolean;
  onUpdateItem: (orderId: string, itemId: string, action: string) => void;
  mode?: "standard" | "cook";
};

export function KitchenTicketBoard({
  tickets,
  now,
  matchesCategoryFilter,
  onUpdateItem,
  mode = "standard",
}: KitchenTicketBoardProps) {
  const isCook = mode === "cook";

  return (
    <div className={cn("grid gap-4", isCook ? "grid-cols-1 xl:grid-cols-3" : "grid-cols-1 lg:grid-cols-3")}>
      {COLUMNS.map((col) => {
        const colItems = tickets.flatMap((ticket) =>
          ticket.items
            .filter((item) => item.status === col.key && matchesCategoryFilter(item.categorySlug))
            .map((item) => ({ ticket, item })),
        );

        return (
          <section
            key={col.key}
            className={cn(
              "rounded-2xl border p-4",
              col.color,
              isCook && "min-h-[280px]",
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className={cn("font-bold", isCook ? "text-xl tracking-wide" : "text-lg")}>
                {isCook ? col.cookLabel : col.label}
              </h2>
              <Badge className={cn(isCook ? "text-base px-3 py-1" : "", "bg-white/10 text-zinc-200")}>
                {colItems.length}
              </Badge>
            </div>

            <div className={cn("space-y-3", isCook ? "min-h-[220px]" : "min-h-[200px]")}>
              {colItems.length === 0 && (
                <p className={cn("text-center py-10", isCook ? "text-zinc-500 text-sm" : "text-sm text-zinc-600 py-8")}>
                  Nothing here — stay ready for the next ticket
                </p>
              )}

              {colItems.map(({ ticket, item }) => {
                const remaining = Math.max(
                  0,
                  Math.floor((new Date(item.expectedReadyAt).getTime() - now) / 1000),
                );

                return (
                  <motion.div
                    key={item.id}
                    layout
                    className={cn(
                      "rounded-2xl border",
                      isCook ? "p-5" : "rounded-xl p-4",
                      item.isOverdue
                        ? "border-red-500/60 bg-red-500/15 shadow-[0_0_24px_rgba(239,68,68,0.15)]"
                        : ticket.alarmTriggered
                          ? "border-red-500/40 bg-red-500/10 animate-pulse"
                          : "border-white/10 bg-black/25",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <span className={cn("font-black leading-none", isCook ? "text-4xl" : "text-2xl")}>
                          {ticket.locationLabel ?? `T${ticket.tableNumber}`}
                        </span>
                        <span className={cn("text-zinc-400 ml-2", isCook ? "text-base" : "text-sm")}>
                          #{ticket.orderNumber}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "font-mono font-semibold shrink-0",
                          isCook ? "text-sm" : "text-xs",
                          item.isOverdue ? "text-red-300" : "text-zinc-400",
                        )}
                      >
                        {item.isOverdue ? "OVERDUE" : remaining > 0 ? formatCountdown(remaining) : "Due now"}
                      </span>
                    </div>

                    <p className={cn("font-bold leading-tight", isCook ? "text-2xl" : "text-lg font-semibold")}>
                      {item.quantity}x {item.itemName}
                    </p>
                    <p className={cn("text-zinc-500 mt-1", isCook ? "text-sm" : "text-xs")}>{item.categoryName}</p>

                    {item.notes && (
                      <p
                        className={cn(
                          "text-amber-200 bg-amber-500/15 rounded-xl mt-3",
                          isCook ? "text-sm px-3 py-2" : "text-sm px-2 py-1",
                        )}
                      >
                        {item.notes}
                      </p>
                    )}

                    {ticket.alarmTriggered && (
                      <div className={cn("flex items-center gap-1.5 text-red-300 mt-2", isCook ? "text-sm" : "text-xs")}>
                        <AlertTriangle className="w-4 h-4" /> Table needs help
                      </div>
                    )}

                    {col.key === "READY" && (
                      <p className={cn("text-emerald-300 mt-3 flex items-center gap-2", isCook ? "text-sm font-medium" : "text-xs")}>
                        <CheckCircle2 className={cn(isCook ? "w-5 h-5" : "w-3 h-3")} />
                        Waiting for server to bump
                      </p>
                    )}

                    {col.key !== "READY" && (
                      <div className={cn("mt-4 grid gap-2", isCook ? "grid-cols-1 sm:grid-cols-2" : "flex gap-2")}>
                        {col.key === "PENDING" && (
                          <Button
                            size={isCook ? "lg" : "sm"}
                            className={cn(
                              "font-bold",
                              isCook
                                ? "h-14 text-lg bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/25"
                                : "flex-1 text-xs",
                            )}
                            onClick={() => onUpdateItem(ticket.id, item.id, "prepare-item")}
                          >
                            <Play className={cn(isCook ? "w-5 h-5 mr-2" : "w-3 h-3 mr-1")} />
                            START
                          </Button>
                        )}
                        {(col.key === "PENDING" || col.key === "PREPARING") && (
                          <Button
                            size={isCook ? "lg" : "sm"}
                            className={cn(
                              "font-bold",
                              isCook
                                ? "h-14 text-lg bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/25"
                                : "flex-1 text-xs",
                            )}
                            onClick={() => onUpdateItem(ticket.id, item.id, "ready-item")}
                          >
                            <Flame className={cn(isCook ? "w-5 h-5 mr-2" : "w-3 h-3 mr-1")} />
                            READY
                          </Button>
                        )}
                        <Button
                          size={isCook ? "lg" : "sm"}
                          variant="danger"
                          className={cn(
                            "font-bold",
                            isCook
                              ? "h-14 text-base sm:col-span-2 border-2 border-red-500/60 bg-red-500/20 hover:bg-red-500/30"
                              : "text-xs",
                          )}
                          onClick={() => onUpdateItem(ticket.id, item.id, "reject-item")}
                        >
                          <Ban className={cn(isCook ? "w-5 h-5 mr-2" : "w-3 h-3 mr-1")} />
                          {isCook ? "OUT OF STOCK" : "OOS"}
                        </Button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
