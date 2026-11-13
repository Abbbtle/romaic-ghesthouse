import { roleNames, type Actor, type Role } from "@/lib/kernel/actor";
import { moreSenior, type AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import { assertCan, assertCanManageRole, canManageRole, manageableRoles } from "./access";
import type { AddMemberInput, ChangeRoleInput } from "./input";
import type { Account, AccountStatus, AccountStore, MfaStore, PasswordHasher, SecretGenerator, SessionStore, TeamChangeOutcome, TeamMember } from "./ports";
import { issueTemporaryPassword, temporaryPasswordLifetimeMs } from "./temporary-passwords";

export type TeamServiceDependencies = {
  accounts: AccountStore;
  sessions: Pick<SessionStore, "deleteForAccount">;
  mfa: Pick<MfaStore, "remove">;
  passwords: PasswordHasher;
  secrets: SecretGenerator;
  ids: IdGenerator;
  clock: Clock;
  audit: AuditRecorder;
};

/** Said whenever an address can't be given to an account, without saying whose it is. */
export const emailUnavailable = "This email address can't be used. Try another one.";

// The friendly checks below read the team first; the store checks again as it writes, and this
// is what someone hears when the team changed in between.
const teamChanged = "Someone changed the team just now. Reload the page and try again.";
const notOnTeam = "That person isn't on the team any more. Reload the page.";
const ownAccess = "You can't change your own access. Ask the owner.";
const lastOwner = "The team must keep an active owner.";

/** What someone hears when the store refuses a change it was asked for. */
function refusalFor(outcome: Exclude<TeamChangeOutcome, "changed">): string {
  return outcome === "last-owner" ? lastOwner : teamChanged;
}

/** A team member as an actor sees them, with what the actor may do to them. */
export type TeamMemberView = TeamMember & { manageable: boolean };

/**
 * Who can sign in to the dashboard (roles.md):
 * - owners add, change, reset, turn off and remove anyone;
 * - admins add, reset and turn off staff accounts only (decision R1);
 * - only owners change roles, remove people or reset someone's authenticator.
 * The team always keeps an active owner, and nobody changes their own access
 * (their own password and authenticator are on their account page).
 */
export function createTeamService(deps: TeamServiceDependencies) {
  /** The member an actor is acting on, or why they can't: only roles they may manage, never themselves. */
  const memberFor = async (actor: Actor, memberId: string, ownAccount: string): Promise<{ member: Account } | { refusal: string }> => {
    if (memberId === actor.id) return { refusal: ownAccount };
    const member = await deps.accounts.findById(memberId);
    if (!member) return { refusal: notOnTeam };
    assertCanManageRole(actor, member.role);
    return { member };
  };

  /** Records a change to `member`, under their role so only those who may manage it read the entry. */
  const audit = (actor: Actor, action: string, member: Pick<Account, "id" | "name" | "role">, summary: string, details?: Record<string, unknown>) =>
    deps.audit.record({ actor, category: "team", action, target: { type: "account", id: member.id }, subjectRole: member.role, summary, details });

  return {
    /** Everyone on the team, and which of them the actor may manage. */
    async list(actor: Actor): Promise<TeamMemberView[]> {
      assertCan(actor, "team:view");
      const members = await deps.accounts.list();
      return members.map((member) => ({ ...member, manageable: member.id !== actor.id && canManageRole(actor, member.role) }));
    },

    /** The roles the actor may give a new member. */
    rolesFor(actor: Actor): Role[] {
      return manageableRoles(actor);
    },

    /**
     * Gives someone access with a temporary password, returned to show once:
     * shared privately, it must be replaced at first sign-in and expires
     * after 72 hours.
     */
    async addMember(actor: Actor, input: AddMemberInput): Promise<ChangeResult<{ memberId: string; temporaryPassword: string; expiresAt: Date }>> {
      assertCanManageRole(actor, input.role);
      if (await deps.accounts.findByEmail(input.email)) return refused({ email: emailUnavailable });
      const temporaryPassword = deps.secrets.temporaryPassword();
      const now = deps.clock.now();
      const expiresAt = new Date(now.getTime() + temporaryPasswordLifetimeMs);
      const memberId = deps.ids.newId();
      const created = await deps.accounts.create({
        id: memberId,
        email: input.email,
        name: input.name,
        role: input.role,
        status: "active",
        passwordHash: await deps.passwords.hash(temporaryPassword),
        mustChangePassword: true,
        temporaryPasswordExpiresAt: expiresAt,
        emailVerifiedAt: null,
        createdAt: now,
        updatedAt: now,
        lastSignedInAt: null,
      });
      if (created.status === "email-taken") return refused({ email: emailUnavailable });
      await audit(actor, "team.member-added", { id: memberId, name: input.name, role: input.role }, `Added ${input.name} as ${roleNames[input.role]}`);
      return done({ memberId, temporaryPassword, expiresAt });
    },

    /** Changes someone's role. Owners only. The last owner can't stop being one. Signs them out everywhere. */
    async changeRole(actor: Actor, memberId: string, { role }: ChangeRoleInput): Promise<ChangeResult> {
      assertCan(actor, "team:manage-all");
      const found = await memberFor(actor, memberId, ownAccess);
      if ("refusal" in found) return refusedWith(found.refusal);
      if (found.member.role === role) return done();
      const outcome = await deps.accounts.changeRole(memberId, { from: found.member.role, to: role, at: deps.clock.now() });
      if (outcome !== "changed") return refusedWith(refusalFor(outcome));
      await audit(
        actor,
        "team.role-changed",
        { ...found.member, role: moreSenior(found.member.role, role) },
        `Changed ${found.member.name} from ${roleNames[found.member.role]} to ${roleNames[role]}`,
        { from: found.member.role, to: role },
      );
      return done();
    },

    /**
     * Sets a new temporary password for someone who's locked out, and signs
     * them out everywhere. Their authenticator, if any, stays. Returns the
     * password to show once.
     */
    async resetPassword(actor: Actor, memberId: string): Promise<ChangeResult<{ temporaryPassword: string; expiresAt: Date }>> {
      const found = await memberFor(actor, memberId, "Change your own password from your account page.");
      if ("refusal" in found) return refusedWith(found.refusal);
      const issued = await issueTemporaryPassword(deps, found.member.id);
      if (!issued) return refusedWith(notOnTeam);
      await audit(actor, "team.password-reset", found.member, `Reset ${found.member.name}'s password`);
      return done({ temporaryPassword: issued.password, expiresAt: issued.expiresAt });
    },

    /** Removes someone's authenticator and recovery codes, and signs them out: they set one up again at next sign-in. Owners only. */
    async resetMfa(actor: Actor, memberId: string): Promise<ChangeResult> {
      assertCan(actor, "team:manage-all");
      const found = await memberFor(actor, memberId, "You can't reset your own authenticator. Use a recovery code, or ask another owner.");
      if ("refusal" in found) return refusedWith(found.refusal);
      await deps.mfa.remove(found.member.id);
      await deps.sessions.deleteForAccount(found.member.id);
      await audit(actor, "team.mfa-reset", found.member, `Reset ${found.member.name}'s authenticator`);
      return done();
    },

    /** Turns someone's access off ("disabled", keeping their record) or back on ("active"). Turning off signs them out everywhere. */
    async setStatus(actor: Actor, memberId: string, status: AccountStatus): Promise<ChangeResult> {
      const found = await memberFor(actor, memberId, ownAccess);
      if ("refusal" in found) return refusedWith(found.refusal);
      if (found.member.status === status) return done();
      const outcome = await deps.accounts.setStatus(memberId, { status, role: found.member.role, at: deps.clock.now() });
      if (outcome !== "changed") return refusedWith(refusalFor(outcome));
      const turnedOn = status === "active";
      await audit(actor, turnedOn ? "team.member-enabled" : "team.member-disabled", found.member, `${turnedOn ? "Turned on" : "Turned off"} ${found.member.name}'s access`);
      return done();
    },

    /** Removes someone's account, and with it every session they had. Owners only; never the last owner. */
    async removeMember(actor: Actor, memberId: string): Promise<ChangeResult> {
      assertCan(actor, "team:manage-all");
      const found = await memberFor(actor, memberId, ownAccess);
      if ("refusal" in found) return refusedWith(found.refusal);
      const outcome = await deps.accounts.remove(memberId, { role: found.member.role });
      if (outcome !== "changed") return refusedWith(refusalFor(outcome));
      await audit(actor, "team.member-removed", found.member, `Removed ${found.member.name} (${roleNames[found.member.role]})`);
      return done();
    },
  };
}

export type TeamService = ReturnType<typeof createTeamService>;
