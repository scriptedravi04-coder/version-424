// Session 20. Who may set or change a user's role, and when.
//
// Before: `/auth/onboard` never wrote `users.role` at all, and `/auth/role` wrote only the
// local JSON store (never Supabase) and let anyone switch to any role at any time. A Google
// sign-up is created with `role: null`, so a brand that signed up with Google finished brand
// onboarding (brand_profiles row and all) and the server still did not see them as a brand:
// "Only brands can post campaigns".
//
// The rule, in one place:
//   - no role yet                          → take the requested role
//   - same role                            → nothing to change
//   - different role, not onboarded yet    → take the requested role (wrong tab at sign-up)
//   - different role, already onboarded    → refuse (a creator must not turn into a brand,
//                                             or the reverse, by calling an endpoint)
//   - admin / sub_admin                    → never changed here

export const ONBOARDING_ROLES = ["creator", "brand"] as const;
export const SELECTABLE_ROLES = ["creator", "brand", "talent_manager"] as const;

const STAFF_ROLES = ["admin", "sub_admin"];

// One flat shape: this project compiles without strict null checks, so a discriminated union
// does not narrow on `ok`.
export type RoleDecision = {
  ok: boolean;
  setRole: string | null;
  status?: number;
  code?: string;
  message?: string;
};

export function normalizeRole(role: any): string {
  return String(role ?? "").trim().toLowerCase();
}

export function decideRoleChange(
  currentRole: any,
  requestedRole: any,
  alreadyOnboarded: boolean,
  allowed: readonly string[] = ONBOARDING_ROLES
): RoleDecision {
  const requested = normalizeRole(requestedRole);
  if (!allowed.includes(requested)) {
    return { ok: false, setRole: null, status: 400, code: "INVALID_ROLE", message: "Please choose Creator or Brand." };
  }

  const current = normalizeRole(currentRole);
  if (STAFF_ROLES.includes(current)) return { ok: true, setRole: null };
  if (!current || current === "null" || current === "undefined") return { ok: true, setRole: requested };
  if (current === requested) return { ok: true, setRole: null };
  if (!alreadyOnboarded) return { ok: true, setRole: requested };

  return {
    ok: false,
    setRole: null,
    status: 409,
    code: "ROLE_MISMATCH",
    message: `This account is already set up as a ${current}. To use Ybex as a ${requested}, sign up with a different email or contact support.`
  };
}

/** A user who has finished onboarding by any of the flags the codebase uses. */
export function isOnboarded(user: any): boolean {
  return Boolean(user?.onboarded || user?.onboarding_completed || user?.onboarding_complete);
}

// v416: agency and talent-manager accounts use the brand panel (App.jsx BrandRoute), so the
// server must treat them as brands too. One shared check instead of `role === "brand"`.
export const BRAND_LIKE_ROLES = ["brand", "agency", "talent_manager"] as const;
export function isBrandLike(role: any): boolean {
  return (BRAND_LIKE_ROLES as readonly string[]).includes(normalizeRole(role));
}
