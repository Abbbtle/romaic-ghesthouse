"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/** A button that opens a slide-over holding one form, which closes once it has saved. */
export function SheetForm({
  trigger,
  icon,
  variant,
  size = "md",
  title,
  description,
  children,
}: {
  trigger: string;
  icon?: ReactNode;
  variant: "primary" | "secondary";
  size?: "sm" | "md";
  title: string;
  description: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  return (
    <>
      <Button ref={button} variant={variant} size={size} icon={icon} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <Sheet open={open} onClose={close} returnFocus={button} title={title} description={description}>
        <div className="pt-2">{children(close)}</div>
      </Sheet>
    </>
  );
}
