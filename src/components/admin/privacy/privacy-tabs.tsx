import { Tabs } from "../tabs";
import { privacyPaths } from "./privacy-paths";

/** The Privacy pages. All are the owner's (privacy:requests), and every page checks again. */
export const privacyPages = {
  overview: { href: privacyPaths.overview, label: "Overview" },
  // Not plain "Requests": the main navigation's Requests are booking requests.
  requests: { href: privacyPaths.requests, label: "Information requests" },
  guests: { href: privacyPaths.guests, label: "Find a guest" },
  breaches: { href: privacyPaths.breaches, label: "Breaches" },
  retention: { href: privacyPaths.retention, label: "Keeping records" },
} as const;

export type PrivacyPage = keyof typeof privacyPages;

export function PrivacyTabs({ current }: { current: PrivacyPage }) {
  return <Tabs label="Privacy" items={Object.values(privacyPages)} current={privacyPages[current].href} className="mb-5" />;
}
