"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  fixed?: boolean;
};

export function ThemeToggle({ className, fixed = false }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={cn(
        "inline-flex items-center justify-center rounded-xl border transition-colors",
        "border-[color:var(--surface-border)] bg-[color:var(--surface)] text-[color:var(--foreground)]",
        "hover:bg-[color:var(--surface-hover)] shadow-sm",
        fixed ? "fixed top-4 right-4 z-[60] h-10 w-10 backdrop-blur-md" : "h-9 w-9",
        className,
      )}
    >
      {isDark ? <Sun className="h-4 w-4 text-amber-300" /> : <Moon className="h-4 w-4 text-indigo-600" />}
    </button>
  );
}
