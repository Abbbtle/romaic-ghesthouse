import { BedDouble, CalendarDays, CheckCircle2, CircleAlert, ClipboardList, DoorOpen, Ellipsis, Hammer, LogIn, LogOut, Sparkles, X } from "lucide-react";
import { EmptyState } from "@/components/admin/empty-state";
import { KpiTile } from "@/components/admin/kpi-tile";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { KpiSkeleton, ListSkeleton } from "@/components/admin/skeletons";
import { StatusPill } from "@/components/admin/status-pill";
import { Cell, HeaderCell, TableFrame } from "@/components/admin/table";
import { Tabs } from "@/components/admin/tabs";
import { buttonClasses } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { errorClasses, hintClasses, inputClasses, labelClasses, selectClasses } from "@/components/ui/form-controls";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { LogoSlot } from "@/components/ui/logo-slot";
import { Notice } from "@/components/ui/notice";
import { KitHeader, KitSection, Specimen } from "./kit-parts";

const sections = [
  { id: "phone", label: "Phone shell" },
  { id: "status", label: "Status" },
  { id: "table", label: "Table" },
  { id: "feedback", label: "Feedback" },
  { id: "forms", label: "Forms" },
  { id: "sign-in", label: "Two-step sign-in" },
  { id: "loading", label: "Loading" },
] as const;

/** Synthetic sample data, for showing the patterns only: never a real guest. */
const arrivals = [
  { time: "14:00", name: "Thandi Mokoena", apartment: "Family apartment", status: "arriving" },
  { time: "16:30", name: "Pieter van Wyk", apartment: "Deluxe double, bath", status: "arriving" },
  { time: "—", name: "Booking.com stay", apartment: "Double or twin", status: "placeholder" },
] as const;

const bookings = [
  { ref: "RG-7K2QX", guest: "Thandi Mokoena", apartment: "Family apartment", arrive: "Thu 12 Nov", leave: "Sun 15 Nov", channel: "Direct", status: "arriving" },
  { ref: "RG-4MPZD", guest: "Lerato Dlamini", apartment: "Deluxe double, shower", arrive: "Tue 10 Nov", leave: "Fri 13 Nov", channel: "Phone", status: "in-house" },
  { ref: "BK-0193", guest: "To complete from the extranet", apartment: "Double or twin", arrive: "Thu 12 Nov", leave: "Sat 14 Nov", channel: "Booking.com", status: "placeholder" },
  { ref: "RG-9TQWA", guest: "Johan Botha", apartment: "Deluxe double, bath", arrive: "Mon 9 Nov", leave: "Thu 12 Nov", channel: "Walk-in", status: "leaving" },
] as const;

type Status = "arriving" | "in-house" | "leaving" | "cleaning" | "out-of-order" | "placeholder";

/** Each status has words, an icon and a tone, so colour never carries it alone. */
const statusLooks: Record<Status, { label: string; tone: "info" | "success" | "warning" | "neutral" | "danger"; icon: typeof LogIn }> = {
  arriving: { label: "Arriving", tone: "info", icon: LogIn },
  "in-house": { label: "In-house", tone: "success", icon: BedDouble },
  leaving: { label: "Leaving", tone: "warning", icon: LogOut },
  cleaning: { label: "Needs cleaning", tone: "neutral", icon: Sparkles },
  "out-of-order": { label: "Out of order", tone: "danger", icon: Hammer },
  placeholder: { label: "To complete", tone: "neutral", icon: ClipboardList },
};

function Status({ status }: { status: Status }) {
  const look = statusLooks[status];
  return (
    <StatusPill tone={look.tone} icon={<look.icon aria-hidden="true" strokeWidth={1.75} className="size-3.5" />}>
      {look.label}
    </StatusPill>
  );
}

const tabBar = [
  { label: "Today", icon: DoorOpen, current: true },
  { label: "Bookings", icon: CalendarDays, current: false },
  { label: "Tasks", icon: ClipboardList, current: false },
  { label: "More", icon: Ellipsis, current: false },
] as const;

export function DashboardKit() {
  return (
    <div className="flex min-h-svh flex-col bg-chalk">
      <KitHeader view="admin" sections={sections} />
      <main id="main" className="flex-1">
        <KitSection
          id="phone"
          title="Phone shell"
          tone="cream"
          spec="The dashboard in Operate mode: designed for a phone between tasks. A plain white working surface, navy for actions and the current tab, gold kept to the brand's thin rule and the logo. Sample data only."
        >
          <div className="grid gap-10 lg:grid-cols-[24.375rem_1fr] lg:items-start">
            <div className="mx-auto w-full max-w-[24.375rem] overflow-hidden rounded-lg border border-hairline-strong bg-chalk shadow-3">
              <div className="flex items-center justify-between border-b-2 border-romaic-gold bg-white px-4 py-2">
                <LogoSlot kind="corner-mark" className="w-24" />
                <InitialsAvatar name="Nico" size="sm" />
              </div>
              <div className="grid gap-4 p-4">
                <PageHeader title="Today" description="Thursday 12 November" />
                <div className="grid grid-cols-3 gap-2">
                  <KpiTile value={2} label="Arriving" />
                  <KpiTile value={5} label="In-house" />
                  <KpiTile value={1} label="Leaving" />
                </div>
                <Panel title="Arriving today" flush>
                  <List label="Arriving today">
                    {arrivals.map((row) => (
                      <ListRow key={row.name} lead={row.time} href="#phone" trailing={<Status status={row.status} />}>
                        <span className="block font-bold text-ink">{row.name}</span>
                        <span className="block text-sm text-fg-3">{row.apartment}</span>
                      </ListRow>
                    ))}
                  </List>
                </Panel>
              </div>
              <nav aria-label="Dashboard sample" className="grid grid-cols-4 border-t border-hairline bg-white pb-1">
                {tabBar.map((tab) => (
                  <a
                    key={tab.label}
                    href="#phone"
                    aria-current={tab.current ? "page" : undefined}
                    className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-bold text-fg-3 aria-[current=page]:text-midnight-navy aria-[current=page]:before:absolute aria-[current=page]:before:inset-x-5 aria-[current=page]:before:top-0 aria-[current=page]:before:h-0.5 aria-[current=page]:before:bg-romaic-gold"
                  >
                    <tab.icon aria-hidden="true" strokeWidth={1.75} className="size-5" />
                    {tab.label}
                  </a>
                ))}
              </nav>
            </div>
            <div className="grid content-start gap-6">
              <Specimen label="Empty state">
                <EmptyState
                  title="No arrivals today"
                  icon={<DoorOpen aria-hidden="true" strokeWidth={1.5} className="size-6 text-gold-text" />}
                  actions={
                    <a href="#table" className={buttonClasses({ variant: "secondary" })}>
                      See this week&rsquo;s bookings
                    </a>
                  }
                >
                  Tomorrow&rsquo;s arrivals appear here from midnight.
                </EmptyState>
              </Specimen>
              <Specimen label="Tabs">
                <Tabs
                  label="Bookings"
                  current="#upcoming"
                  items={[
                    { href: "#upcoming", label: "Upcoming", count: 6 },
                    { href: "#in-house", label: "In-house", count: 5 },
                    { href: "#past", label: "Past" },
                  ]}
                />
              </Specimen>
            </div>
          </div>
        </KitSection>

        <KitSection id="status" title="Status" tone="white" spec="Every status is words plus an icon plus a tone. Colour never carries it alone.">
          <div className="flex flex-wrap gap-3">
            {(Object.keys(statusLooks) as Status[]).map((status) => (
              <Status key={status} status={status} />
            ))}
          </div>
        </KitSection>

        <KitSection id="table" title="Table" spec="For desktop: tabular figures, a caption, and a horizontal scroll of its own on narrow screens. Sample data only.">
          <TableFrame caption="Bookings this week" minWidth="48rem">
            <thead>
              <tr>
                <HeaderCell>Reference</HeaderCell>
                <HeaderCell>Guest</HeaderCell>
                <HeaderCell>Apartment</HeaderCell>
                <HeaderCell>Arrive</HeaderCell>
                <HeaderCell>Leave</HeaderCell>
                <HeaderCell>Channel</HeaderCell>
                <HeaderCell>Status</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {bookings.map((row) => (
                <tr key={row.ref}>
                  <Cell>
                    <span className="font-mono text-sm whitespace-nowrap" data-numeric>
                      {row.ref}
                    </span>
                  </Cell>
                  <Cell>{row.guest}</Cell>
                  <Cell>{row.apartment}</Cell>
                  <Cell className="whitespace-nowrap">
                    <time data-numeric>{row.arrive}</time>
                  </Cell>
                  <Cell className="whitespace-nowrap">
                    <time data-numeric>{row.leave}</time>
                  </Cell>
                  <Cell>{row.channel}</Cell>
                  <Cell>
                    <Status status={row.status} />
                  </Cell>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        </KitSection>

        <KitSection id="feedback" title="Feedback" tone="white" spec="Toasts confirm what happened and sit above the tab bar on phones. Notices stay on the page until the problem is fixed.">
          <div className="grid gap-8 lg:grid-cols-2">
            <Specimen label="Toasts">
              <div className="grid max-w-sm gap-3">
                <div role="status" className="flex items-start gap-3 rounded-md bg-midnight-navy px-4 py-3 text-sm text-white shadow-3">
                  <CheckCircle2 aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-romaic-gold" />
                  <p className="flex-1">Booking saved.</p>
                  <button type="button" className="-m-1 inline-flex size-8 items-center justify-center rounded-xs hover:bg-white/10">
                    <X aria-hidden="true" strokeWidth={1.75} className="size-4" />
                    <span className="sr-only">Dismiss</span>
                  </button>
                </div>
                <div role="alert" className="flex items-start gap-3 rounded-md bg-danger-700 px-4 py-3 text-sm text-white shadow-3">
                  <CircleAlert aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-5 shrink-0" />
                  <p className="flex-1">Couldn&rsquo;t save the booking. Check your connection and try again.</p>
                </div>
              </div>
            </Specimen>
            <Specimen label="Notices">
              <div className="grid gap-3">
                <Notice tone="warning" title="Booking.com last synced 3 hours ago">
                  Some stays may be missing. Use Sync now before you take a phone booking.
                </Notice>
                <Notice tone="danger" title="Two bookings overlap">
                  Deluxe double, bath: 12 to 13 November. Move one of them.
                </Notice>
                <Notice tone="success">Staff member added. Share their temporary password privately.</Notice>
              </div>
            </Specimen>
          </div>
        </KitSection>

        <KitSection id="forms" title="Forms" spec="Compact 44 px fields for the dashboard, labels above, errors beside the field, one primary action.">
          <form aria-label="Add a staff member (sample)" className="grid max-w-form gap-5 rounded-md border border-hairline bg-white p-5 shadow-1">
            <h3 className="text-h4 font-bold">Add a staff member</h3>
            <div className="grid gap-1.5">
              <label htmlFor="kit-staff-name" className={labelClasses}>
                Name
              </label>
              <input id="kit-staff-name" className={inputClasses("compact")} defaultValue="Sipho Ndlovu" autoComplete="off" />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="kit-staff-email" className={labelClasses}>
                Email address
              </label>
              <input id="kit-staff-email" type="email" aria-invalid="true" aria-describedby="kit-staff-email-error" className={inputClasses("compact")} defaultValue="sipho@" autoComplete="off" />
              <p id="kit-staff-email-error" className={errorClasses}>
                <CircleAlert aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
                Enter a full email address, like sipho@example.com.
              </p>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="kit-staff-role" className={labelClasses}>
                Role
              </label>
              <p id="kit-staff-role-hint" className={hintClasses}>
                Staff see Today, check-in and tasks: guest names, apartments and dates only.
              </p>
              <select id="kit-staff-role" aria-describedby="kit-staff-role-hint" className={selectClasses("compact")} defaultValue="staff">
                <option value="staff">Staff</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={buttonClasses({ variant: "primary" })}>
                Add staff member
              </button>
              <button type="button" className={buttonClasses({ variant: "ghost" })}>
                Cancel
              </button>
            </div>
          </form>
        </KitSection>

        <KitSection id="sign-in" title="Two-step sign-in" tone="white" spec="One field for the code (paste and autofill work), a numeric keypad on phones, and a way out with a recovery code.">
          <div className="grid max-w-sm gap-5 rounded-md border border-hairline bg-white p-6 shadow-2">
            <div className="grid gap-2">
              <hr className="gold-rule w-12" />
              <h3 className="font-display text-h3 font-semibold tracking-[0.08em] uppercase">Enter your code</h3>
              <p className="text-base text-fg-2">Open your authenticator app and type the 6-digit code for Romaic Guesthouse.</p>
            </div>
            <CodeInput name="kit-code" />
            <button type="button" className={buttonClasses({ variant: "primary", fullWidth: true })}>
              Sign in
            </button>
            <a href="#sign-in" className="justify-self-start text-sm font-bold text-link underline underline-offset-4 hover:text-link-hover">
              Use a recovery code instead
            </a>
          </div>
        </KitSection>

        <KitSection id="loading" title="Loading" spec="Skeletons wait 100 ms before showing, so quick answers never flash.">
          <div className="grid gap-8 lg:grid-cols-2">
            <Specimen label="Tiles">
              <KpiSkeleton tiles={3} label="Loading today's numbers" />
            </Specimen>
            <Specimen label="List">
              <ListSkeleton rows={3} label="Loading arrivals" />
            </Specimen>
          </div>
        </KitSection>
      </main>
    </div>
  );
}
