// Session 40 (Ravi: "Roles & Permissions save theek se kaam nahi kar raha").
//
// Before: the route only wrote team_role. role was set to "admin" on promotion and never put back,
// so "Standard User (No Admin Access)" left role = "admin" with an empty team_role — which the
// server reads as a FULL Super Admin. On reload the panel showed "Super Admin" again.
// A creator promoted to Sub-Admin kept role = "creator", and the auth layer (neutralizeStaffTeamRole)
// drops a staff team_role on a non-staff role, so that promotion did nothing.
//
// Now:
//   admin     → role "admin", team_role "admin"
//   sub_admin → role "admin", team_role "sub_admin"   (isFullAdmin is false for team_role sub_admin)
//   standard  → role back to what the account is (brand / agency / creator, from its profile),
//               team_role null, module permissions removed. No profile → refused (nothing to go
//               back to; delete the staff account instead).

export type TeamRoleInput = "admin" | "sub_admin" | "" | null | undefined;

export type ProfileFacts = {
  brandProfile?: any | null;
  creatorProfile?: any | null;
};

/** The non-admin role an account goes back to, or null when it has no brand/creator profile. */
export function standardRoleFor(facts: ProfileFacts): "brand" | "agency" | "creator" | null {
  const bp = facts.brandProfile;
  if (bp) return bp.is_agency === true || String(bp.account_type || "").toLowerCase() === "agency" ? "agency" : "brand";
  if (facts.creatorProfile) return "creator";
  return null;
}

export type RoleUpdate =
  | { ok: true; fields: { role: string; team_role: string | null }; clearPermissions: boolean }
  | { ok: false; status: number; detail: string };

export function roleUpdateFor(teamRole: TeamRoleInput, facts: ProfileFacts): RoleUpdate {
  if (teamRole === "admin") return { ok: true, fields: { role: "admin", team_role: "admin" }, clearPermissions: false }; // full admin ignores the module list
  if (teamRole === "sub_admin") return { ok: true, fields: { role: "admin", team_role: "sub_admin" }, clearPermissions: false };
  if (teamRole === "" || teamRole === null || teamRole === undefined) {
    const back = standardRoleFor(facts);
    if (!back) {
      return {
        ok: false,
        status: 400,
        detail: "This account has no brand or creator profile, so it can't become a standard user. Delete the staff account instead.",
      };
    }
    return { ok: true, fields: { role: back, team_role: null }, clearPermissions: true };
  }
  return { ok: false, status: 400, detail: "Unknown team role." };
}
