import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex h-[18px] items-center gap-1 rounded-[3px] border px-1.5 text-[11px] font-medium leading-none whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "border-line bg-surface text-neutral",
      ok: "border-secondary/35 bg-secondary/10 text-secondary",
      bad: "border-error/40 bg-error/10 text-error",
      warn: "border-tertiary/40 bg-tertiary/10 text-tertiary-text",
      amber: "border-tertiary/40 bg-tertiary/10 text-tertiary-text",
      sky: "border-accent/35 bg-accent/10 text-accent",
      solid: "border-primary bg-primary text-on-primary",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, tone, ...p }: BadgeProps) => <span className={cn(badgeVariants({ tone }), className)} {...p} />;
