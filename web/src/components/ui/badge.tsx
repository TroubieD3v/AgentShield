import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "border-line bg-panel-2 text-muted",
      ok: "border-[#1f4a37] bg-[#0f2a1f] text-ok",
      bad: "border-[#5a2626] bg-[#2b1414] text-bad",
      warn: "border-[#5e4417] bg-[#2a2010] text-warn",
      amber: "border-[#6a4a14] bg-[#2b1e0a] text-amber",
      sky: "border-[#1f4a63] bg-[#0e2230] text-sky",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, tone, ...p }: BadgeProps) => <span className={cn(badgeVariants({ tone }), className)} {...p} />;
