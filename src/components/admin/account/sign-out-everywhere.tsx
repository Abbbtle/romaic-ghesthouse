"use client";

import { LogOut } from "lucide-react";
import { ConfirmButton } from "../confirm-button";

/**
 * Signing out on every device, this one included, for a lost phone: asked
 * first, since it can't be undone. The action sends this browser to sign in.
 */
export function SignOutEverywhere({ action }: { action: () => Promise<void> }) {
  return (
    <ConfirmButton
      variant="secondary"
      icon={<LogOut aria-hidden="true" />}
      title="Sign out on every device?"
      description="You'll need to sign in again here, and on any other phone or computer you use the dashboard on."
      confirmLabel="Sign out everywhere"
      pendingLabel="Signing out…"
      action={action}
    >
      Sign out everywhere
    </ConfirmButton>
  );
}
