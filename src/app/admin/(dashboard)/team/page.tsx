import type { Metadata } from "next";
import type { TeamRow } from "@/components/admin/team/team-types";
import { TeamManager } from "@/components/admin/team/team-manager";
import { capitalised, whenLabel } from "@/components/admin/when-label";
import { can } from "@/lib/accounts/access";
import { businessTimeZone } from "@/lib/format/zoned-time";
import { accountServices, dashboardOrigin } from "@/server/accounts";
import { adminPaths } from "@/server/admin-paths";
import { requireDashboardActor } from "@/server/admin-session";
import { clock } from "@/server/infrastructure";
import { addTeamMember, changeTeamMemberRole, removeTeamMember, resetTeamMemberMfa, resetTeamMemberPassword, setTeamMemberStatus } from "./actions";

export const metadata: Metadata = { title: "Team" };

/**
 * Who can sign in, and what the person looking may do about each of them.
 * Opening it asks for the password and code again (unless given in the last
 * 15 minutes), since everything here changes who can see what.
 */
export default async function TeamPage() {
  const actor = await requireDashboardActor({ permission: "team:view", stepUp: true });
  const { team } = accountServices();
  const members = await team.list(actor);
  const now = clock.now();
  const ownerPowers = can(actor, "team:manage-all");
  const rows: TeamRow[] = members.map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    disabled: member.status === "disabled",
    temporaryPassword: member.mustChangePassword,
    mfaEnabled: member.mfaEnabled,
    lastSignedIn: member.lastSignedInAt ? capitalised(whenLabel(member.lastSignedInAt, now, businessTimeZone)) : "Never",
    you: member.id === actor.id,
    can: {
      resetPassword: member.manageable,
      setStatus: member.manageable,
      changeRole: member.manageable && ownerPowers,
      resetMfa: member.manageable && ownerPowers,
      remove: member.manageable && ownerPowers,
    },
  }));
  return (
    <TeamManager
      members={rows}
      addableRoles={team.rolesFor(actor)}
      actions={{
        add: addTeamMember,
        changeRole: changeTeamMemberRole,
        resetPassword: resetTeamMemberPassword,
        resetMfa: resetTeamMemberMfa,
        setStatus: setTeamMemberStatus,
        remove: removeTeamMember,
      }}
      signInUrl={`${dashboardOrigin()}${adminPaths.signIn}`}
    />
  );
}
