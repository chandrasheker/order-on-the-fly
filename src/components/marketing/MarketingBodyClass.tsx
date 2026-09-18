"use client";

import { useEffect } from "react";

/** Hide the operational SiteFooter on public marketing pages. */
export function MarketingBodyClass({ className }: { className: string }) {
  useEffect(() => {
    const classes = className.split(/\s+/).filter(Boolean);
    document.body.classList.add(...classes);
    return () => {
      document.body.classList.remove(...classes);
    };
  }, [className]);
  return null;
}
