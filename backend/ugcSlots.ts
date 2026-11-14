// Session 20. UGC brief slots (claimed_count / max_creators), in one place.
//
// Before: the claim read claimed_count, checked it, inserted the order and wrote count+1.
// Two creators claiming at the same moment both read the old count, both passed, and a
// one-slot brief got two orders — two payouts for one slot. Cancel did the same read-then-write
// in reverse and always set the brief back to OPEN, even a brief the brand had closed.
//
// Now a slot is taken with a compare-and-set on claimed_count (the UPDATE only lands if the
// count is still what we read; otherwise re-read and try again), and a double tap by the same
// creator on this server is stopped by an in-flight guard.

type Client = any;

const IN_FLIGHT_MS = 60_000;
const MAX_ATTEMPTS = 5;

export type SlotResult = { ok: boolean; previousCount?: number; status?: number; code?: string; error?: string };

export function createUgcSlots(deps: { getClient: () => Client | null; getDb: () => any; saveDb: (db: any) => void }) {
  const inFlight = new Map<string, number>();
  const keyOf = (briefId: string, userId: string) => `${briefId}:${userId}`;

  const localBrief = (briefId: string) => (deps.getDb().ugc_briefs || []).find((b: any) => b.id === briefId);

  const mirrorLocal = (briefId: string, count: number, status?: string) => {
    const db = deps.getDb();
    const b = (db.ugc_briefs || []).find((x: any) => x.id === briefId);
    if (!b) return;
    b.claimed_count = count;
    if (status) b.status = status;
    deps.saveDb(db);
  };

  /** Take one slot on the brief for this creator, or say why not. */
  async function reserveBriefSlot(brief: any, userId: string): Promise<SlotResult> {
    const briefId = String(brief?.id || "");
    const key = keyOf(briefId, userId);
    const started = inFlight.get(key);
    if (started && Date.now() - started < IN_FLIGHT_MS) {
      return { ok: false, status: 409, code: "CLAIM_IN_PROGRESS", error: "Your claim is already being processed." };
    }
    inFlight.set(key, Date.now());

    const full: SlotResult = { ok: false, status: 400, code: "BRIEF_FULL", error: "This brief has already reached creator capacity." };
    const client = deps.getClient();

    try {
      if (client) {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          const { data: row, error } = await client
            .from("ugc_briefs")
            .select("claimed_count, max_creators, status")
            .eq("id", briefId)
            .maybeSingle();
          if (error || !row) break; // not in Supabase — fall through to the local store
          const raw = row.claimed_count;
          const count = Number(raw) || 0;
          const max = Number(row.max_creators) || 1;
          if (count >= max) { inFlight.delete(key); return full; }
          const next = count + 1;
          let q = client
            .from("ugc_briefs")
            .update({ claimed_count: next, status: next >= max ? "CLAIMED" : row.status || "OPEN" })
            .eq("id", briefId);
          q = raw === null || raw === undefined ? q.is("claimed_count", null) : q.eq("claimed_count", raw);
          const { data: updated, error: updErr } = await q.select("id");
          if (updErr) {
            console.error("[ugcSlots] reserve update failed:", updErr.message || updErr);
            inFlight.delete(key);
            return { ok: false, status: 500, code: "SLOT_ERROR", error: "Could not claim this brief right now. Please try again." };
          }
          if (updated && updated.length === 1) {
            mirrorLocal(briefId, next, next >= max ? "CLAIMED" : undefined);
            return { ok: true, previousCount: count };
          }
          // Someone else changed the count between our read and write — read again.
        }
        if (!localBrief(briefId)) {
          inFlight.delete(key);
          return { ok: false, status: 409, code: "CLAIM_CONFLICT", error: "Lots of creators are claiming this brief right now. Please try again." };
        }
      }

      // Local store (no Supabase, or a brief that only exists locally). Node runs this
      // synchronously, so the check and the increment cannot interleave.
      const b = localBrief(briefId);
      if (!b) { inFlight.delete(key); return { ok: false, status: 404, code: "BRIEF_NOT_FOUND", error: "Brief not found" }; }
      const count = Number(b.claimed_count) || 0;
      const max = Number(b.max_creators) || 1;
      if (count >= max) { inFlight.delete(key); return full; }
      mirrorLocal(briefId, count + 1, count + 1 >= max ? "CLAIMED" : undefined);
      return { ok: true, previousCount: count };
    } catch (e: any) {
      inFlight.delete(key);
      console.error("[ugcSlots] reserve error:", e?.message || e);
      return { ok: false, status: 500, code: "SLOT_ERROR", error: "Could not claim this brief right now. Please try again." };
    }
  }

  /** The claim finished (order saved): the in-flight guard can go. */
  function finishBriefClaim(briefId: string, userId: string) {
    inFlight.delete(keyOf(briefId, userId));
  }

  /**
   * Give one slot back (failed claim, or a cancelled order). A full brief (CLAIMED) reopens;
   * a brief in any other state (closed, cancelled by the brand, …) keeps that state.
   */
  async function releaseBriefSlot(briefId: string, userId?: string) {
    if (!briefId) return;
    if (userId) inFlight.delete(keyOf(briefId, userId));
    const reopen = (status: any, next: number, max: number) =>
      String(status || "").toUpperCase() === "CLAIMED" && next < max ? "OPEN" : status;

    const client = deps.getClient();
    if (client) {
      try {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          const { data: row, error } = await client
            .from("ugc_briefs")
            .select("claimed_count, max_creators, status")
            .eq("id", briefId)
            .maybeSingle();
          if (error || !row) break;
          const raw = row.claimed_count;
          const count = Number(raw) || 0;
          if (count <= 0) return;
          const next = count - 1;
          const status = reopen(row.status, next, Number(row.max_creators) || 1);
          let q = client.from("ugc_briefs").update({ claimed_count: next, status }).eq("id", briefId);
          q = raw === null || raw === undefined ? q.is("claimed_count", null) : q.eq("claimed_count", raw);
          const { data: updated } = await q.select("id");
          if (updated && updated.length === 1) {
            mirrorLocal(briefId, next, status);
            return;
          }
        }
      } catch (e: any) {
        console.error("[ugcSlots] release error:", e?.message || e);
      }
    }
    const b = localBrief(briefId);
    if (b) {
      const next = Math.max(0, (Number(b.claimed_count) || 0) - 1);
      mirrorLocal(briefId, next, reopen(b.status, next, Number(b.max_creators) || 1));
    }
  }

  return { reserveBriefSlot, finishBriefClaim, releaseBriefSlot };
}
