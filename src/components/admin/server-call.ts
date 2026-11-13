import { unstable_rethrow } from "next/navigation";

/**
 * Runs a call to a server action. If it never got an answer (the phone lost
 * signal), it answers `whenUnreachable()` instead of crashing the page, so
 * the form keeps what was typed and can say what to do. Next.js's own
 * control flow, such as an action redirecting, passes straight through.
 */
export async function callServerAction<Result>(call: () => Promise<Result>, whenUnreachable: () => Result): Promise<Result> {
  try {
    return await call();
  } catch (error) {
    unstable_rethrow(error);
    return whenUnreachable();
  }
}
