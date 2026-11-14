// Session 28 (Ravi): every OTP signature leaves a permanent record — which text was on the
// signer's screen, which version, who, when, which email the code went to, from which IP/device.
// Table: public.agreement_signatures (created in Supabase by Ravi, session 28). Rows can never be
// edited; they can only be removed by the admin complete wipe (rpc wipe_agreement_signatures).
//
// The text is what the signing screen actually showed (the browser sends it with the sign call).
// The server never trusts it blindly for money: the deal amount is stored from the server's own
// data, and when the screen text does not show that amount the version is marked
// `|amount-not-in-text`. A screen that sent no text is recorded as `|text-not-captured` with a
// server summary instead — honest, never invented.
//
// Recording never blocks a signature: the locked flows must keep working if the database hiccups.
// A failed write is logged loudly with `[agreement-record] FAILED`.
import crypto from "crypto";

export type AgreementKind = "campaign" | "ugc";

export interface SignMeta {
  email?: string | null;
  verifiedAt?: string | null;
}

export interface AgreementRecordInput {
  kind: AgreementKind;
  req: any;
  user: any;
  signerRole: "brand" | "creator" | "admin";
  actingBrandId?: string | null;
  onBehalfOfUserId?: string | null;
  signMeta?: SignMeta | null;
  threadId?: string | null;
  dealId?: string | null;
  orderId?: string | null;
  briefId?: string | null;
  campaignId?: string | null;
  amount?: number | null;
  /** Fallback summary lines when the screen sent no text. */
  summary?: string[];
}

export const MAX_TEXT = 60000;

/** One stable form of the text: \n line ends, no trailing spaces, at most one blank line. */
export function normalizeAgreementText(t: any): string {
  return String(t || "")
    .replace(/\r\n?/g, "\n")
    .split("\n").map((l) => l.replace(/[ \t\u00a0]+$/g, "").replace(/^[ \t\u00a0]+/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT);
}

export function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/** True when `amount` is written in the text in any common Indian/Western form. */
export function textShowsAmount(text: string, amount: any): boolean {
  const n = Math.round(Number(amount) || 0);
  if (!n) return true; // nothing to check (barter / unknown)
  const forms = new Set([
    String(n),
    n.toLocaleString("en-IN"),
    n.toLocaleString("en-US"),
  ]);
  return [...forms].some((f) => text.includes(f));
}

export function clientIp(req: any): string | null {
  // Session 58: the LAST value is the one Google's front end added (the first can be typed by the caller).
  const fwd = String(req?.headers?.["x-forwarded-for"] || "").split(",").map((x) => x.trim()).filter(Boolean).pop() || "";
  return (fwd || req?.ip || req?.socket?.remoteAddress || null) || null;
}

export function clientAgent(req: any): string | null {
  const ua = String(req?.headers?.["user-agent"] || "").slice(0, 500);
  return ua || null;
}

/** Builds the row (pure — used by tests). */
export function buildAgreementRow(input: AgreementRecordInput) {
  const body = input.req?.body || {};
  const screenText = normalizeAgreementText(body.agreement_text);
  const screenVersion = String(body.agreement_version || "").trim().slice(0, 80) || `${input.kind}-unversioned`;
  const amount = Number(input.amount) || 0;

  let text: string;
  let version: string;
  if (screenText.length >= 40) {
    text = screenText;
    version = screenVersion + (textShowsAmount(screenText, amount) ? "" : "|amount-not-in-text");
  } else {
    text = normalizeAgreementText([
      `Agreement accepted electronically on Ybex (${input.kind}). The signing screen did not send its text.`,
      ...(input.summary || []),
      amount ? `Amount on record: Rs ${amount.toLocaleString("en-IN")}` : "",
    ].filter(Boolean).join("\n"));
    version = `${screenVersion}|text-not-captured`;
  }

  const signerName = input.user?.name || input.user?.full_name || null;
  return {
    agreement_type: input.kind,
    agreement_version: version,
    agreement_text: text,
    text_sha256: sha256Hex(text),
    thread_id: input.threadId ? String(input.threadId) : null,
    deal_id: input.dealId ? String(input.dealId) : null,
    order_id: input.orderId ? String(input.orderId) : null,
    brief_id: input.briefId ? String(input.briefId) : null,
    campaign_id: input.campaignId ? String(input.campaignId) : null,
    signer_user_id: String(input.user?.user_id || input.user?.id || ""),
    signer_role: input.signerRole,
    acting_brand_id: input.actingBrandId ? String(input.actingBrandId) : null,
    on_behalf_of_user_id: input.onBehalfOfUserId ? String(input.onBehalfOfUserId) : null,
    signer_name: signerName,
    signer_email: input.signMeta?.email || null,
    otp_verified_at: input.signMeta?.verifiedAt || null,
    amount: amount || null,
    ip_address: clientIp(input.req),
    user_agent: clientAgent(input.req),
  };
}

/**
 * Writes the record. `client` = privileged Supabase client (or null for local dev → `local`
 * array on the local db). Never throws.
 */
export async function recordAgreementSignature(client: any, local: any, input: AgreementRecordInput) {
  let row: any;
  try {
    row = buildAgreementRow(input);
    if (!row.signer_user_id) throw new Error("no signer id");
    if (row.signer_role !== "admin" && !row.otp_verified_at) throw new Error("no verified OTP on this signature");
  } catch (e: any) {
    console.error("[agreement-record] FAILED (build):", e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
  if (!client) {
    try {
      if (local) {
        local.agreement_signatures = local.agreement_signatures || [];
        const dup = local.agreement_signatures.some((r: any) =>
          r.agreement_type === row.agreement_type && (r.thread_id || "") === (row.thread_id || "") &&
          (r.order_id || "") === (row.order_id || "") && (r.deal_id || "") === (row.deal_id || "") &&
          r.signer_user_id === row.signer_user_id && r.agreement_version === row.agreement_version);
        if (dup) return { ok: true, duplicate: true };
        local.agreement_signatures.push({ id: crypto.randomUUID(), signed_at: new Date().toISOString(), ...row });
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
  try {
    const { error } = await client.from("agreement_signatures").insert(row);
    if (error) {
      if (error.code === "23505") return { ok: true, duplicate: true }; // same signer, same deal, same version
      console.error("[agreement-record] FAILED:", error.code, error.message, { thread: row.thread_id, order: row.order_id, signer: row.signer_user_id });
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e: any) {
    console.error("[agreement-record] FAILED:", e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
