import { useEffect, useState } from "react";
import { api } from "./api";

// Session 34 (Ravi): Ybex is not GST-registered yet. Documents say "Receipt" and show no GSTIN until
// the admin turns on "GST registered" (Admin → Platform tools, platform_gst_registered + platform_gstin).
// Never a made-up GSTIN.
export default function usePlatformTax() {
  const [tax, setTax] = useState({ gstRegistered: false, gstin: "" });
  useEffect(() => {
    let alive = true;
    api.get("platform/fee-config").then((r) => {
      const c = r?.data || {};
      const gstin = String(c.platform_gstin || "").trim().toUpperCase();
      if (alive) setTax({ gstRegistered: Boolean(c.platform_gst_registered) && gstin.length === 15, gstin });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return tax;
}
