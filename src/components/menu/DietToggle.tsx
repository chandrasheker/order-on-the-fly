import { cn } from "@/lib/utils";

export function DietToggle({
  isVeg,
  onChange,
  disabled,
  size = "md",
}: {
  isVeg: boolean;
  onChange: (isVeg: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const compact = size === "sm";
  return (
    <div
      className="inline-flex rounded-xl border border-white/10 overflow-hidden"
      role="group"
      aria-label="Veg or non-veg"
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(true)}
        aria-pressed={isVeg}
        className={cn(
          "inline-flex items-center gap-1.5 font-medium transition-colors disabled:opacity-50",
          compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
          isVeg ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "text-muted hover:text-foreground",
        )}
      >
        <span className="w-3.5 h-3.5 rounded-sm border-2 border-emerald-500 flex items-center justify-center shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </span>
        Veg
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(false)}
        aria-pressed={!isVeg}
        className={cn(
          "inline-flex items-center gap-1.5 font-medium border-l border-white/10 transition-colors disabled:opacity-50",
          compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
          !isVeg ? "bg-red-500/20 text-red-700 dark:text-red-300" : "text-muted hover:text-foreground",
        )}
      >
        <span className="w-3.5 h-3.5 rounded-sm border-2 border-red-500 flex items-center justify-center shrink-0">
          <span className="w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent border-b-red-500" />
        </span>
        Non-veg
      </button>
    </div>
  );
}
