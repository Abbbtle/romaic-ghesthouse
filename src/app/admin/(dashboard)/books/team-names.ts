import "server-only";
import { can } from "@/lib/accounts/access";
import type { Actor } from "@/lib/kernel/actor";
import { accountServices } from "@/server/accounts";

/**
 * Team members' names by account id, for saying who posted a journal or
 * locked a month. Empty for someone who may not see the team (the books are
 * the owner's, who may), so pages fall back to "a team member".
 */
export async function teamNames(actor: Actor): Promise<Map<string, string>> {
  if (!can(actor, "team:view")) return new Map([[actor.id, actor.name]]);
  const members = await accountServices().team.list(actor);
  return new Map(members.map((member) => [member.id, member.name]));
}
