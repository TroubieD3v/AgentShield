import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Button set from the design board: Primary, Secondary, Inverted, Outlined (+ ghost, danger). */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-45 cursor-pointer active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary hover:bg-primary-hover hover:shadow-lift",
        secondary: "bg-surface-high text-ink hover:bg-surface-highest",
        inverted: "bg-inverse text-on-inverse hover:bg-inverse-hover",
        outline: "border border-neutral/60 text-ink hover:bg-surface-low",
        ghost: "text-neutral hover:text-ink hover:bg-surface",
        danger: "bg-error text-on-error hover:opacity-90",
      },
      size: { default: "h-10 px-5", sm: "h-8 px-3.5 text-[13px]", lg: "h-11 px-6", icon: "h-8 w-8" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
