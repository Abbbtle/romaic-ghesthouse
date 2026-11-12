"use client";

import { ServerErrorMessage, StandaloneErrorPage } from "@/components/site/status-views";

type AppErrorProps = {
  error: unknown;
  /** Fetches and renders the failed part again. */
  retry: () => void;
};

/**
 * An error a layout below the root couldn't recover from. Nothing of the
 * page is left to show, so this is a page of its own: the logo slot, a way
 * to try again, and the booking details.
 */
export default function AppError({ retry }: AppErrorProps) {
  return (
    <StandaloneErrorPage>
      <ServerErrorMessage retry={retry} />
    </StandaloneErrorPage>
  );
}
