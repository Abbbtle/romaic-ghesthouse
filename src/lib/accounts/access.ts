import type { Actor, Role } from "@/lib/kernel/actor";

/**
 * Who can do what in the dashboard: a fixed catalogue of permissions and,
 * for each role, the permissions it is granted (docs/planning/roles.md).
 * Code checks permissions, never role names. Anything not granted is
 * refused: a new permission belongs to nobody until it is added to a grant.
 *
 * Pages check first and explain; server actions and route handlers check
 * again; services check a third time (assertCan), since a server action can
 * be called directly with any arguments.
 */

export const permissions = [
  // Running the house
  "today:view",
  "stays:check-in-out",
  "rooms:status",
  "tasks:work",
  "tasks:manage",
  "availability:view",
  // Bookings and guests
  "bookings:view",
  "bookings:create",
  "bookings:change",
  "bookings:cancel",
  "quotes:manage",
  "guests:view",
  "guests:manage",
  "guests:export",
  "guests:id-numbers",
  "rates:view",
  "rates:manage",
  "promotions:manage",
  "channels:status",
  "channels:configure",
  // Money
  "booking-money:manage",
  "refunds:issue",
  "reports:operations",
  "reports:revenue",
  "ledger:view",
  "ledger:post",
  "expenses:manage",
  "bank:manage",
  "tax:manage",
  "payroll:manage",
  "periods:lock",
  "finance:export",
  // The site and the business's settings
  "content:edit",
  "media:manage",
  "settings:site",
  "settings:contact",
  "settings:booking-rules",
  "settings:payments",
  "integrations:configure",
  // People and records
  "team:view",
  "team:manage-operational",
  "team:manage-all",
  "audit:view",
  /** Every audit entry, sign-ins and money included, and the chain check. */
  "audit:view-all",
  "privacy:requests",
] as const;

export type Permission = (typeof permissions)[number];

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (permissions as readonly string[]).includes(value);
}

/**
 * Permissions that show or move money, or reach tax and payroll: "finance
 * data" as roles.md defines it. Admin holds none of them, anywhere; tests
 * check every one against every role.
 */
export const financePermissions = [
  "bookings:view",
  "quotes:manage",
  "booking-money:manage",
  "refunds:issue",
  "reports:revenue",
  "ledger:view",
  "ledger:post",
  "expenses:manage",
  "bank:manage",
  "tax:manage",
  "payroll:manage",
  "periods:lock",
  "finance:export",
  "settings:payments",
  // The whole audit log, money entries included.
  "audit:view-all",
] as const satisfies readonly Permission[];

export function isFinancePermission(permission: Permission): boolean {
  return (financePermissions as readonly Permission[]).includes(permission);
}

const operations: readonly Permission[] = ["today:view", "stays:check-in-out", "rooms:status", "tasks:work"];

const grants: Record<Role, readonly Permission[]> = {
  /** Everything. */
  owner: permissions,
  /** The site, its settings and integrations, and staff accounts. Never finance, bookings or guests. */
  admin: [
    "content:edit",
    "media:manage",
    "settings:site",
    "integrations:configure",
    "channels:status",
    "channels:configure",
    "team:view",
    "team:manage-operational",
    "audit:view",
  ],
  /** Bookings, guests, rates and booking money. No ledger, tax, payroll, settings or team. */
  sales: [
    ...operations,
    "tasks:manage",
    "availability:view",
    "bookings:view",
    "bookings:create",
    "bookings:change",
    "bookings:cancel",
    "quotes:manage",
    "guests:view",
    "guests:manage",
    "rates:view",
    "rates:manage",
    "promotions:manage",
    "channels:status",
    "booking-money:manage",
    "reports:operations",
  ],
  /** Today, check-in and check-out, room status and tasks, through a limited read model. */
  staff: [...operations],
};

/** The permissions a role holds, in catalogue order. */
export function permissionsOf(role: Role): Permission[] {
  return permissions.filter((permission) => grants[role].includes(permission));
}

/** Whether someone may do something. */
export function can(actor: Pick<Actor, "role">, permission: Permission): boolean {
  return grants[actor.role].includes(permission);
}

/** Roles whose accounts must sign in with an authenticator code as well as a password. */
export const mfaRequiredRoles: readonly Role[] = ["owner", "admin", "sales"];

export function mfaRequiredFor(role: Role): boolean {
  return mfaRequiredRoles.includes(role);
}

/**
 * Roles that reset a forgotten password themselves, with an emailed link
 * (to a confirmed address): the owner, who has nobody above them (roles.md).
 * Everyone else asks someone who manages their role.
 */
export const emailResetRoles: readonly Role[] = ["owner"];

export function resetsPasswordByEmail(role: Role): boolean {
  return emailResetRoles.includes(role);
}

/**
 * Which roles an actor may create, reset, deactivate or remove: owners may
 * manage everyone; admins only staff (roles.md, decision R1); nobody else
 * manages the team.
 */
export function manageableRoles(actor: Pick<Actor, "role">): Role[] {
  if (can(actor, "team:manage-all")) return ["owner", "admin", "sales", "staff"];
  if (can(actor, "team:manage-operational")) return ["staff"];
  return [];
}

export function canManageRole(actor: Pick<Actor, "role">, role: Role): boolean {
  return manageableRoles(actor).includes(role);
}

/**
 * Thrown when an actor tries something their role doesn't allow. Pages and
 * actions check first and explain; services check again, since a server
 * action can be called directly.
 */
export class NotAllowedError extends Error {
  constructor(readonly permission: Permission | "team:role") {
    super(permission === "team:role" ? "You can't manage people with that role." : notAllowedMessage(permission));
    this.name = "NotAllowedError";
  }
}

function notAllowedMessage(permission: Permission): string {
  if (isFinancePermission(permission)) return "Only the owner can see or change money, tax and payroll.";
  if (permission.startsWith("team:")) return "You can't manage the team.";
  return "Your role doesn't allow that. Ask the owner if you need it.";
}

/** Stops an action the actor's role doesn't allow. Services call it before anything else. */
export function assertCan(actor: Pick<Actor, "role">, permission: Permission): void {
  if (!can(actor, permission)) throw new NotAllowedError(permission);
}

/** Stops a team change on a role the actor may not manage. */
export function assertCanManageRole(actor: Pick<Actor, "role">, role: Role): void {
  if (!canManageRole(actor, role)) throw new NotAllowedError("team:role");
}

/**
 * What a part of the dashboard asks of whoever uses it. Every page, action
 * and route handler states one: there's no default, so leaving the check
 * out can't quietly let every role in.
 */
export type DashboardRequirement = {
  /**
   * The permission the page or action needs, or null when every role may use
   * it (someone's own account, say). Use anySignedInRole for that, so the
   * choice reads as deliberate.
   */
  permission: Permission | null;
  /** Ask for the password and authenticator code again unless given in the last 15 minutes. */
  stepUp?: boolean;
};

/** For parts of the dashboard every role may use, such as someone's own account. */
export const anySignedInRole: DashboardRequirement = Object.freeze({ permission: null });

/**
 * Who a browser is signed in as, as far as entering the dashboard is
 * concerned. The steps come in this order: the authenticator code (when one
 * is set up), then replacing a temporary password, then setting up an
 * authenticator (when the role needs one and none exists yet).
 */
export type SignedInState = {
  actor: Actor;
  /** An authenticator is set up and this session hasn't passed it yet. */
  mfaDue: boolean;
  mustChangePassword: boolean;
  /** The role needs an authenticator and none is set up. */
  mfaEnrolmentDue: boolean;
  /** When the password and code were last re-entered in this session, for step-up. */
  stepUpAt: Date | null;
};

export const stepUpWindowMs = 15 * 60 * 1000;

/**
 * A step of signing in still to take: the authenticator code ("mfa"),
 * replacing a temporary password ("change-password"), or setting up an
 * authenticator the role needs ("mfa-setup").
 */
export type SignInStep = "mfa" | "change-password" | "mfa-setup";

/** Where someone goes next: the first sign-in step still to take, or the dashboard. */
export type NextStep = SignInStep | "dashboard";

/** The one place the steps' order is decided: the code first, then a new password, then authenticator set-up. */
export function nextStepFor(state: Pick<SignedInState, "mfaDue" | "mustChangePassword" | "mfaEnrolmentDue">): NextStep {
  if (state.mfaDue) return "mfa";
  if (state.mustChangePassword) return "change-password";
  if (state.mfaEnrolmentDue) return "mfa-setup";
  return "dashboard";
}

/** Whether someone may use a part of the dashboard, and if not, why not. */
export type DashboardAccess =
  | { status: "allowed"; actor: Actor }
  | { status: "signed-out" }
  /** Signed in, with a step of signing in still to take before anything else. */
  | { status: "sign-in-unfinished"; step: SignInStep }
  | { status: "not-allowed"; permission: Permission }
  | { status: "step-up-due" };

/**
 * The one rule for entering the dashboard, which pages, server actions and
 * route handlers each apply for themselves. Pages redirect on a refusal,
 * actions answer with it, and route handlers answer 401 or 403.
 */
export function dashboardAccess(signedIn: SignedInState | null, requirement: DashboardRequirement, now: Date): DashboardAccess {
  if (!signedIn) return { status: "signed-out" };
  const step = nextStepFor(signedIn);
  if (step !== "dashboard") return { status: "sign-in-unfinished", step };
  if (requirement.permission !== null && !can(signedIn.actor, requirement.permission)) {
    return { status: "not-allowed", permission: requirement.permission };
  }
  if (requirement.stepUp && !(signedIn.stepUpAt && now.getTime() - signedIn.stepUpAt.getTime() < stepUpWindowMs)) {
    return { status: "step-up-due" };
  }
  return { status: "allowed", actor: signedIn.actor };
}

/** One line per role for the team page: what each can do. */
export const roleDescriptions: Record<Role, string> = {
  owner: "Everything, including the books, tax, payroll and the team.",
  admin: "The website, its content and settings, and staff accounts. Never money, bookings or guest details.",
  sales: "Bookings, guests, rates and booking payments. No books, tax, payroll, settings or team.",
  staff: "Today, check-in and check-out, room status and tasks. Sees guest names, rooms and dates only.",
};
