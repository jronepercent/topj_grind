import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background,color,transform,opacity,filter] duration-150 ease-[var(--ease-apple)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent hover:brightness-110",
        member: "bg-member text-on-member hover:brightness-105",
        secondary: "bg-hover text-text hover:bg-[var(--border-strong)]",
        outline: "border border-border-strong text-text hover:bg-hover",
        ghost: "text-text hover:bg-hover",
        danger: "bg-danger text-white hover:brightness-110",
        inverse: "bg-text text-bg hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-[13px] [&_svg]:size-4",
        md: "h-10 px-4 text-[14px] [&_svg]:size-[18px]",
        lg: "h-12 px-6 text-[15px] [&_svg]:size-5",
        icon: "size-10 [&_svg]:size-5",
        "icon-sm": "size-8 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
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
