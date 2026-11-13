import { adminRoutes } from "../admin-routes";
import { Tabs, type TabLink } from "../tabs";

/** The Books pages, each shown only to whoever may open it (every page checks its permission again). */
export const booksPages = {
  overview: { href: adminRoutes.books, label: "Overview" },
  journals: { href: `${adminRoutes.books}/journals`, label: "Journals" },
  expenses: { href: `${adminRoutes.books}/expenses`, label: "Expenses" },
  bank: { href: `${adminRoutes.books}/bank`, label: "Bank" },
  reports: { href: `${adminRoutes.books}/reports`, label: "Reports" },
  months: { href: `${adminRoutes.books}/months`, label: "Months" },
  accounts: { href: `${adminRoutes.books}/accounts`, label: "Accounts" },
} as const;

export type BooksPage = keyof typeof booksPages;

/**
 * The tabs across the Books pages. `allowed` says which the person may open
 * (owner only today: ledger:view, expenses:manage, bank:manage), so a page
 * passes what its permissions open and the current page's key.
 */
export function BooksTabs({ current, allowed }: { current: BooksPage; allowed: Readonly<Record<BooksPage, boolean>> }) {
  const items: TabLink[] = (Object.keys(booksPages) as BooksPage[]).filter((page) => allowed[page]).map((page) => booksPages[page]);
  return <Tabs label="Books" items={items} current={booksPages[current].href} className="mb-5" />;
}
