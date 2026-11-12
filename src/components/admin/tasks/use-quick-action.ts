"use client";

import { useState, useTransition } from "react";
import { failedState, type FormState } from "@/lib/forms/form-state";
import { callServerAction } from "../server-call";
import { useToast } from "../toast";

/** What a one-tap dashboard action answers: a form state, or the guard's signed-out or step-up. */
export type QuickResult = FormState | { status: "signed-out" } | { status: "step-up" } | void;

const connectionFailure = "That didn't go through. Check your connection and try again.";

function problemOf(result: QuickResult): string | null {
  if (!result) return null;
  switch (result.status) {
    case "failed":
      return result.message;
    case "invalid":
      return Object.values(result.errors)[0] ?? "That didn't work. Reload the page and try again.";
    case "signed-out":
      return "You've been signed out. Sign in again in another tab, then try again.";
    case "step-up":
      return "For your security, reload the page and confirm your password and code, then try again.";
    default:
      return null;
  }
}

/**
 * A button's action that needs no question first (Check in, Start): it says
 * so in a toast when it worked, and keeps the problem to show beside the
 * button when it didn't.
 */
export function useQuickAction() {
  const toasts = useToast();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const run = (call: () => Promise<QuickResult>, success: string) =>
    startTransition(async () => {
      setProblem(null);
      const found = problemOf(await callServerAction(call, () => failedState(connectionFailure)));
      if (found) setProblem(found);
      else toasts?.show({ message: success });
    });

  return { pending, problem, setProblem, run };
}
