import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold tracking-wide whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-surface text-neutral",
      ok: "bg-secondary/12 text-secondary",
      bad: "bg-error/10 text-error",
      warn: "bg-tertiary/14 text-tertiary-text",
      amber: "bg-tertiary/14 text-tertiary-text",
      sky: "bg-inverse/10 text-inverse",
      solid: "bg-primary text-on-primary",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, tone, ...p }: BadgeProps) => <span className={cn(badgeVariants({ tone }), className)} {...p} />;
