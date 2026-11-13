"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { createContext, use, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";

/** What a toast offers: a link ("View on site") or an action ("Undo"). */
export type ToastAction = { label: string; href: string } | { label: string; onSelect: () => void };

export type ToastInput = {
  /** "Changes saved", "Session saved", "Booking link copied". */
  message: string;
  /** error toasts are alerts and stay until dismissed; prefer inline errors anyway. */
  tone?: "neutral" | "error";
  action?: ToastAction;
};

type Toast = ToastInput & { id: number };

export type ToastApi = {
  show(toast: ToastInput): void;
  dismiss(id: number): void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** The toasts of the dashboard around this component, or null outside one (then show feedback inline). */
export function useToast(): ToastApi | null {
  return use(ToastContext);
}

/** Toasts stay 6 s, longer while the pointer or focus is on them (design-spec §10.1). */
const toastDuration = 6000;
const maxToasts = 3;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [held, setHeld] = useState(false);
  const dismiss = useEffectEvent(() => onDismiss(toast.id));

  useEffect(() => {
    if (toast.tone === "error" || held) return;
    const timer = window.setTimeout(() => dismiss(), toastDuration);
    return () => window.clearTimeout(timer);
  }, [toast.tone, held]);

  const action = toast.action;
  const actionClasses = "shrink-0 text-sm font-medium text-romaic-gold underline-offset-4 hover:underline focus-visible:outline-white";

  return (
    <div
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node && event.currentTarget.contains(next))) setHeld(false);
      }}
      className="pointer-events-auto flex w-full max-w-105 items-center gap-3 rounded-md bg-neutral-900 py-3 pr-2 pl-4 text-sm text-white shadow-3 transition-[opacity,translate] duration-200 ease-out motion-safe:starting:translate-y-2 starting:opacity-0"
    >
      <p className="min-w-0 flex-1">{toast.message}</p>
      {action &&
        ("href" in action ? (
          <Link href={action.href} className={actionClasses} onClick={() => onDismiss(toast.id)}>
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            className={actionClasses}
            onClick={() => {
              action.onSelect();
              onDismiss(toast.id);
            }}
          >
            {action.label}
          </button>
        ))}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-white"
      >
        <X aria-hidden="true" strokeWidth={2} className="size-4" />
      </button>
    </div>
  );
}

/**
 * The dashboard's toasts: short confirmations after an action, near-black
 * with an optional forest action, bottom centre on phones (above the tab bar)
 * and bottom left of the content from 1024 px. Neutral toasts are announced
 * politely and leave after 6 s; error toasts are alerts and stay.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  // One stable object, so components that show toasts from effects don't re-run them.
  const api = useMemo<ToastApi>(
    () => ({
      show: (toast) => {
        const id = nextId.current++;
        setToasts((current) => [...current, { ...toast, id }].slice(-maxToasts));
      },
      dismiss: (id) => setToasts((current) => current.filter((toast) => toast.id !== id)),
    }),
    [],
  );

  const regionClasses = "flex w-full flex-col items-center gap-2 lg:items-start";

  // Above the tab bar on phones, bottom left of the content from 1024 px, and
  // above a form's save bar while one shows, so neither hides the other.
  const placement =
    "bottom-[calc(var(--admin-bottom-inset)+1rem)] lg:right-auto lg:bottom-6 lg:left-[calc(15.5rem+2rem)] lg:px-0 [body:has([data-save-bar])_&]:bottom-[calc(var(--admin-bottom-inset)+5.5rem)] lg:[body:has([data-save-bar])_&]:bottom-28";

  return (
    <ToastContext value={api}>
      {children}
      <div className={`pointer-events-none fixed inset-x-0 z-400 flex flex-col gap-2 px-4 ${placement}`}>
        {/* Both regions are always present, so screen readers notice what arrives in them. */}
        <div role="alert" className={regionClasses}>
          {toasts
            .filter((toast) => toast.tone === "error")
            .map((toast) => (
              <ToastItem key={toast.id} toast={toast} onDismiss={api.dismiss} />
            ))}
        </div>
        <div role="status" className={regionClasses}>
          {toasts
            .filter((toast) => toast.tone !== "error")
            .map((toast) => (
              <ToastItem key={toast.id} toast={toast} onDismiss={api.dismiss} />
            ))}
        </div>
      </div>
    </ToastContext>
  );
}

/**
 * Shows a message once as a toast when it arrives from the server, such as
 * "Password changed" after a redirect. Renders nothing itself.
 */
export function FlashToast({ message, tone }: ToastInput) {
  const toasts = useToast();
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!toasts || shown.current === message) return;
    shown.current = message;
    toasts.show({ message, tone });
  }, [toasts, message, tone]);
  return null;
}
