"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    const variants = {
      primary:
        "bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98]",
      secondary:
        "bg-[color:var(--btn-secondary-bg)] text-[color:var(--btn-secondary-text)] border border-[color:var(--btn-secondary-border)] hover:bg-[color:var(--surface-hover)] backdrop-blur-sm",
      ghost: "text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface-hover)]",
      danger:
        "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30",
      success:
        "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-sm rounded-lg",
      md: "px-4 py-2.5 text-sm rounded-xl",
      lg: "px-6 py-3 text-base rounded-xl",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        className
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
  glow,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface)] backdrop-blur-xl",
        glow && "shadow-lg shadow-orange-500/10",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full px-4 py-3 rounded-xl bg-[color:var(--input-bg)] border border-[color:var(--input-border)] text-[color:var(--foreground)] placeholder:text-[color:var(--muted)] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all",
        className
      )}
      {...props}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-5 h-5 border-2 border-white/20 border-t-orange-500 rounded-full animate-spin",
        className
      )}
    />
  );
}
