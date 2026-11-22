import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded border text-[12.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 cursor-pointer",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-on-primary hover:bg-primary-hover",
        secondary: "border-line bg-surface text-ink hover:bg-surface-high",
        inverted: "border-line bg-surface-high text-ink hover:bg-surface-highest",
        outline: "border-line bg-transparent text-ink hover:bg-surface",
        ghost: "border-transparent text-neutral hover:bg-surface hover:text-ink",
        danger: "border-error/50 bg-error/12 text-error hover:bg-error/20",
      },
      size: { default: "h-7 px-3", sm: "h-6 px-2 text-[12px]", lg: "h-8 px-3.5", icon: "h-6 w-6" },
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
