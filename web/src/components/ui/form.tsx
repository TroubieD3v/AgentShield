import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const field =
  "w-full rounded border border-line bg-surface-low px-2 py-1 text-[12.5px] text-ink placeholder:text-dim transition-colors focus:border-accent focus:outline-none disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, "h-7", className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, "min-h-16 font-mono text-[12px] leading-relaxed", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(field, "h-7 pr-6", className)} {...p} />
));
Select.displayName = "Select";

export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("mb-1 block text-xs font-medium text-neutral", className)} {...p} />
);

export const Switch = ({ className, ...p }: React.ComponentProps<typeof SwitchPrimitive.Root>) => (
  <SwitchPrimitive.Root
    className={cn(
      "relative h-4 w-7 shrink-0 cursor-pointer rounded-full border border-line bg-surface-high transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary",
      className,
    )}
    {...p}
  >
    <SwitchPrimitive.Thumb className="block h-2.5 w-2.5 translate-x-[2px] rounded-full bg-neutral transition-transform data-[state=checked]:translate-x-[14px] data-[state=checked]:bg-on-primary" />
  </SwitchPrimitive.Root>
);

/** Segmented control (Monitor / Enforce, agent configuration). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  ariaLabel?: string;
}) {
  const { t } = useI18n();
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      <TabsPrimitive.List aria-label={ariaLabel} className="inline-grid auto-cols-fr grid-flow-col rounded border border-line bg-surface-low p-px">
        {options.map((o) => (
          <TabsPrimitive.Trigger
            key={o.value}
            value={o.value}
            className="h-6 cursor-pointer whitespace-nowrap rounded-[3px] px-3 text-[12.5px] font-medium text-neutral transition-colors hover:text-ink data-[state=active]:bg-surface-highest data-[state=active]:text-ink"
          >
            {t(o.label)}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}
