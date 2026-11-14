// Brand refund account validation and masking.
// Pattern matches backend/payoutMethods.ts:
// Full bank account numbers are never returned to the browser; only account_last4.

const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^[0-9]{9,18}$/;

export type RefundAccountInput = {
  method_type?: string;
  account_details?: any;
  bank_account_number?: string;
  bank_account_confirm?: string;
  bank_ifsc?: string;
  upi_id?: string;
  account_holder_name?: string;
};

export type RefundAccountRow = {
  id?: string;
  brand_id?: string;
  method_type: "UPI" | "BANK";
  bank_account_number: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  account_holder_name: string | null;
  created_at?: string;
  updated_at?: string;
};

export function parseRefundAccount(body: RefundAccountInput): { row?: RefundAccountRow; error?: string } {
  const b = body || {};
  const d = b.account_details || {};
  const type = String(b.method_type || (b.upi_id ? "UPI" : "BANK")).toUpperCase();

  if (type === "UPI") {
    const upi = String(d.upi_id ?? b.upi_id ?? "").trim();
    if (!UPI_RE.test(upi)) return { error: "Enter a valid UPI ID, like name@bank." };
    return {
      row: {
        method_type: "UPI",
        upi_id: upi,
        bank_account_number: null,
        bank_ifsc: null,
        account_holder_name: null
      }
    };
  }

  if (type !== "BANK") return { error: "Choose UPI or bank account." };

  const acc = String(d.account_no ?? d.account_number ?? b.bank_account_number ?? "").replace(/\s+/g, "");
  const confirm = String(d.confirm_account_no ?? d.confirm_account_number ?? b.bank_account_confirm ?? "").replace(/\s+/g, "");
  if (confirm && confirm !== acc) {
    return { error: "Bank account numbers do not match." };
  }

  const ifsc = String(d.ifsc ?? b.bank_ifsc ?? "").trim().toUpperCase();
  const holder = String(d.holder_name ?? d.account_holder ?? b.account_holder_name ?? "").trim();

  if (!ACCOUNT_RE.test(acc)) return { error: "Account number should be 9 to 18 digits." };
  if (!IFSC_RE.test(ifsc)) return { error: "Enter a valid IFSC code, like HDFC0001234." };
  if (holder.length < 2) return { error: "Enter the account holder's name as per bank records." };

  return {
    row: {
      method_type: "BANK",
      upi_id: null,
      bank_account_number: acc,
      bank_ifsc: ifsc,
      account_holder_name: holder
    }
  };
}

/** What the browser gets: full account number is never sent. */
export function toPublicRefundAccount(m: any) {
  if (!m) return null;
  const acc = String(m.bank_account_number || "");
  const isUpi = m.method_type === "UPI" || Boolean(m.upi_id);
  const upi = m.upi_id ? String(m.upi_id) : null;
  const maskedUpi = upi ? `${upi.slice(0, 2)}***@${upi.split("@")[1] || ""}` : null;

  return {
    id: m.id || null,
    brand_id: m.brand_id || null,
    method_type: isUpi ? "UPI" : "BANK",
    upi_id: maskedUpi,
    account_holder_name: m.account_holder_name || null,
    bank_ifsc: m.bank_ifsc || null,
    account_last4: acc ? acc.slice(-4) : (upi ? upi.slice(-4) : null),
    updated_at: m.updated_at || m.created_at || null
  };
}

/** Full snapshot for admin refund execution */
export function toAdminRefundSnapshot(m: any) {
  if (!m) return null;
  const acc = String(m.bank_account_number || "");
  const isUpi = m.method_type === "UPI" || Boolean(m.upi_id);
  return {
    method_type: isUpi ? "UPI" : "BANK",
    upi_id: m.upi_id || null,
    bank_account_number: m.bank_account_number || null,
    bank_ifsc: m.bank_ifsc || null,
    account_holder_name: m.account_holder_name || null,
    account_last4: acc ? acc.slice(-4) : (m.upi_id ? String(m.upi_id).slice(-4) : null)
  };
}
