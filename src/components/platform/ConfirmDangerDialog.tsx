"use client";

import { Button } from "@/components/ui";
import { AlertTriangle } from "lucide-react";

interface ConfirmDangerDialogProps {
  title: string;
  subject: string;
  details: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDangerDialog({
  title,
  subject,
  details,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDangerDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-danger-title"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#14141f] border border-red-500/40 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 id="confirm-danger-title" className="text-lg font-semibold text-white">
              {title}
            </h3>
            <p className="text-sm text-zinc-300 mt-1">{subject}</p>
          </div>
        </div>

        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-semibold text-red-300">This cannot be recovered.</p>
          <p className="text-sm text-red-200/80 mt-1">{details}</p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={onConfirm}>
            {busy ? "Deleting…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
