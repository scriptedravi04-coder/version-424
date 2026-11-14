import { api } from "./api";
import { parseMethodChoice, razorpayDisplayConfig } from "../components/payments/checkout/checkoutMethods"; // v366
import { toast } from "sonner";
import { serverOrigin } from "./native"; // v375: absolute logo address (the Android app's own origin is https://localhost)

/**
 * v419 (Ravi: the in-house pay PIN box, in the app's own design — not the browser popup).
 * Opens a small sheet (bottom sheet on phones, centred card on desktop) and resolves with the PIN, or null on Cancel.
 * Plain DOM so it works from this payment helper on every screen. Exported for tests.
 */
export function askInhousePin({ amount = 0, error = "" } = {}) {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    document.getElementById("ybx-inhouse-pin")?.remove();
    const phone = window.matchMedia?.("(max-width: 640px)")?.matches;
    const amt = Number(amount) > 0 ? "₹" + Math.round(Number(amount)).toLocaleString("en-IN") : "this deal";
    const wrap = document.createElement("div");
    wrap.id = "ybx-inhouse-pin";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "ybx-pin-title");
    wrap.dataset.testid = "inhouse-pin-sheet";
    wrap.style.cssText = `position:fixed;inset:0;z-index:2147483000;background:rgba(17,12,34,.55);display:flex;justify-content:center;align-items:${phone ? "flex-end" : "center"};font-family:inherit;`;
    wrap.innerHTML = `
      <div style="width:100%;max-width:${phone ? "100%" : "400px"};background:#fff;border-radius:${phone ? "24px 24px 0 0" : "20px"};padding:24px 20px ${phone ? "calc(20px + env(safe-area-inset-bottom))" : "20px"};box-shadow:0 20px 60px rgba(17,12,34,.25);box-sizing:border-box">
        ${phone ? '<div style="width:40px;height:4px;border-radius:2px;background:#E5E7EB;margin:-10px auto 16px"></div>' : ""}
        <div style="width:48px;height:48px;border-radius:14px;background:#F5F0FF;display:flex;align-items:center;justify-content:center;margin-bottom:14px">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
        </div>
        <div id="ybx-pin-title" style="font-size:18px;font-weight:700;color:#111827;line-height:1.3">Enter pay PIN</div>
        <div style="font-size:13px;color:#6B7280;line-height:1.5;margin-top:6px">Ybex in-house brand: ${amt} is funded by Ybex, you pay ₹0. Enter the PIN your Ybex admin set.</div>
        <input id="ybx-pin-input" data-testid="inhouse-pin-input" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="8" aria-label="Pay PIN" placeholder="••••"
          style="display:block;width:100%;box-sizing:border-box;margin-top:18px;height:56px;border-radius:14px;border:1.5px solid #D1D5DB;background:#FAFAFB;text-align:center;font-size:24px;letter-spacing:12px;font-weight:700;color:#111827;outline:none;font-family:inherit" />
        <div id="ybx-pin-error" data-testid="inhouse-pin-error" role="alert" style="min-height:18px;font-size:12px;color:#DC2626;margin-top:8px;text-align:center"></div>
        <div style="display:flex;gap:10px;margin-top:8px">
          <button type="button" id="ybx-pin-cancel" style="flex:1;height:48px;border-radius:14px;border:1px solid #E5E7EB;background:#fff;color:#374151;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">Cancel</button>
          <button type="button" id="ybx-pin-ok" data-testid="inhouse-pin-confirm" style="flex:1.4;height:48px;border-radius:14px;border:none;background:#7C3AED;color:#fff;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector("#ybx-pin-input");
    const err = wrap.querySelector("#ybx-pin-error");
    const ok = wrap.querySelector("#ybx-pin-ok");
    const setErr = (t) => { err.textContent = t || ""; input.style.borderColor = t ? "#DC2626" : "#D1D5DB"; };
    setErr(error);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (val) => { document.removeEventListener("keydown", onKey, true); document.body.style.overflow = prevOverflow; wrap.remove(); resolve(val); };
    const submit = () => {
      const v = String(input.value || "").trim();
      if (!/^\d{4,8}$/.test(v)) { setErr("The PIN is 4 to 8 digits."); input.focus(); return; }
      close(v);
    };
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(null); } else if (e.key === "Enter") { e.preventDefault(); submit(); } };
    document.addEventListener("keydown", onKey, true);
    input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 8); if (err.textContent) setErr(""); });
    input.addEventListener("focus", () => { if (!err.textContent) input.style.borderColor = "#7C3AED"; });
    input.addEventListener("blur", () => { if (!err.textContent) input.style.borderColor = "#D1D5DB"; });
    ok.addEventListener("click", submit);
    wrap.querySelector("#ybx-pin-cancel").addEventListener("click", () => close(null));
    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(null); });
    setTimeout(() => input.focus(), 30);
  });
}

export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      return resolve(true);
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn("Failed to load Razorpay SDK dynamically");
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

export async function processRazorpayPayment({
  dealId,
  threadId,
  campaignId,
  briefId,
  creatorId,
  grossAmount,
  amount,
  description,
  notes,
  user,
  onSuccess,
  onError,
  // Session 26: told the Razorpay order id as soon as it exists (used by the UGC brief page's
  // safety net, src/lib/briefPaymentRetry.js watchPaidOrder).
  onOrderCreated,
  // Session 58: the method the brand picked on Review & pay ("upi" | "card" | "netbanking") — Razorpay opens on it.
  method,
  // Session 58: the screen shows its own success page → no extra "verified" toasts on top of it.
  quiet = false,
  // v364: brand-fee coupon typed on Review & pay (checked again by the server)
  couponCode = "",
  // v366 (Ravi's checkout): told when Razorpay's window opens (the "Opening secure checkout" screen hands off), and
  // `cancel` = { cancelled } checked once the order exists — Cancel on that screen stops the window from opening.
  onOpen,
  cancel
}) {
  // v366: method may be a choice string ("upi:phonepe", "upi:collect", "card", …). Razorpay gets the plain method in
  // prefill (as before) plus a config.display block that opens on the picked app / flow (default list kept below it).
  const displayConfig = razorpayDisplayConfig(method);
  method = parseMethodChoice(method).method || method;
  // Session 56 (payment audit): the returned promise now finishes only when the payment is DONE —
  // paid, failed or the window closed — not right after the Razorpay window opens. The screens keep
  // their Pay button disabled until then, so a second tap (e.g. after a UPI app switch) can't start a
  // second payment.
  let finish = () => {};
  const finished = new Promise((resolve) => { finish = resolve; });
  try {
    const verifiedAmount = Number(grossAmount ?? amount ?? 0);

    // 1. Create order on backend
    const orderBody = {
      deal_id: dealId || null,
      thread_id: threadId || null,
      campaign_id: campaignId || null,
      brief_id: briefId || null,
      creator_id: creatorId || null,
      gross_amount: verifiedAmount,
      amount: verifiedAmount,
      ...(couponCode ? { coupon_code: couponCode } : {}) // v364
    };
    // v419 (security layer): an in-house brand's ₹0 payment needs the pay PIN an admin set. Up to 3 tries.
    let orderData;
    for (let attempt = 0; ; attempt++) {
      try { ({ data: orderData } = await api.post("payments/razorpay/create-order", orderBody)); break; }
      catch (e) {
        const code = String(e?.response?.data?.code || "");
        if (!/^INHOUSE_PIN_(REQUIRED|WRONG)$/.test(code) || attempt >= 3 || typeof window === "undefined") throw e; // v423 (P17): 3 PIN tries, as the comment says (was 6)
        const pin = await askInhousePin({ amount: verifiedAmount, error: code === "INHOUSE_PIN_WRONG" ? "Wrong PIN. Please try again." : "" });
        if (!pin) { finish(); return finished; }
        orderBody.inhouse_pin = String(pin).trim();
      }
    }

    // v419: a Ybex in-house brand — the server already recorded the deal as funded by Ybex; nothing to pay.
    if (orderData?.inhouse && orderData?.verified) {
      toast.success("Done — this deal is funded by Ybex (in-house brand).", { id: "inhouse-pay" });
      try { if (onSuccess) await onSuccess(orderData); } catch (e) { console.warn("[Razorpay] onSuccess failed:", e?.message); }
      finish();
      return finished;
    }
    if (!orderData?.order_id || !orderData?.key_id) {
      throw new Error(orderData?.error || "Failed to create Razorpay payment order");
    }
    if (cancel?.cancelled) { // v366: brand tapped Cancel while the order was being made — nothing opens, nothing is charged
      // v423 (P15): no toast here; screens read "cancelled" in the message as a calm "nothing was charged". The call now
      // also FINISHES (it returned without finishing, so a caller awaiting it hung).
      if (onError) onError(new Error("Payment cancelled"));
      finish();
      return finished;
    }
    if (onOrderCreated) {
      try { onOrderCreated(orderData.order_id); } catch (e) { console.warn("[Razorpay] onOrderCreated failed:", e?.message); }
    }

    // Session 52 (Ravi: "Razorpay test mode se hata ke real mode pe rakho"): test or live is decided by the
    // SERVER (PAYMENTS_TEST_MODE + the key it sends). The old "*.run.app address = test" guess is gone —
    // on a live key it showed "Test Mode / Auto-Complete" buttons to real brands.
    const isTestMode = Boolean(
      orderData.is_test_mode ||
      orderData.order_id?.startsWith("order_test_") ||
      orderData.key_id?.startsWith("rzp_test_") ||
      orderData.key_id === "rzp_test_placeholder"
    );

    let isCompleted = false;
    let hasTriggeredSuccess = false;
    let pollInterval = null;
    let testToastId = null;
    let pollStartTime = Date.now();
    const POLL_MAX_DURATION = 120000; // 2 minutes hard timeout
    
    // FIX #1: Create a single persistence promise to prevent race condition
    // All success paths must use this same promise to ensure backend is only hit once
    let persistencePromise = null;

    const triggerSuccessOnce = (data) => {
      if (hasTriggeredSuccess) return;
      hasTriggeredSuccess = true;
      isCompleted = true;
      if (testToastId) {
        toast.dismiss(testToastId);
      }
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      Promise.resolve(onSuccess ? onSuccess(data) : null).catch((e) => console.warn("[Razorpay] onSuccess failed:", e?.message)).finally(() => finish());
    };
    
    // One backend call at a time for all paths (handler, polling, window closed) — prevents duplicate verification.
    // v423 (P3): a FAILED call is forgotten, so the next path (or a retry) asks the server again — before, one network
    // blip meant this payment was never recorded in this session. v423 (P4): "still confirming with the bank"
    // (503 PAYMENT_UNCONFIRMED) is retried a few times by itself.
    const persistPaymentOnce = async (paymentId, source, signature = "pending") => {
      if (persistencePromise) return await persistencePromise;
      const call = async () => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await api.post("payments/razorpay/verify", {
              razorpay_order_id: orderData.order_id,
              razorpay_payment_id: paymentId,
              razorpay_signature: signature || "pending",
              deal_id: dealId || null,
              thread_id: threadId || null,
              campaign_id: campaignId || null,
              brief_id: briefId || null,
              transaction_id: orderData.transaction_id || null,
              source
            });
          } catch (e) {
            const code = String(e?.response?.data?.code || "");
            if (code !== "PAYMENT_UNCONFIRMED" || attempt >= 4) throw e;
            await new Promise((r) => setTimeout(r, 4000));
          }
        }
      };
      persistencePromise = call();
      try { return await persistencePromise; } catch (e) { persistencePromise = null; throw e; }
    };

    // v423 (P2/P5): every path looks at what the SERVER said. verified:false is never shown as success.
    const settleVerify = (data, fallbackPaymentId) => {
      if (hasTriggeredSuccess) return;
      if (!data?.verified) {
        toast.error(data?.error || "We couldn't confirm this payment yet. If money left your account, don't pay again — contact support.", { duration: 10000 });
        if (onError) onError(new Error(data?.error || "Verification failed"));
        finish();
        return;
      }
      if (data.duplicate_payment) {
        toast.warning("This deal was already paid, so you were charged twice. The extra payment is refunded in 5–7 working days — no need to do anything.", { duration: 15000 });
      } else if (data.state_sync_failed) {
        toast.error("Payment was received, but we hit an issue updating your deal status. Please refresh in a moment — if 'Payment pending' doesn't clear, contact support with payment ID " + (data.payment_id || fallbackPaymentId || "") + " so we don't charge you again.", { duration: 12000 });
        console.error("[Razorpay] Payment verified but state sync failed:", data.state_sync_error);
      } else if (!quiet) {
        toast.success("Payment received — we hold it until the work is approved.");
      }
      triggerSuccessOnce(data);
    };
    const verifyErrorText = (err) => {
      const b = err?.response?.data || {};
      if (b.code === "PAYMENT_UNCONFIRMED") return b.error || "We're still confirming your payment with the bank. Please don't pay again — check this deal again in a few minutes.";
      return b.error || err?.message || "We couldn't confirm this payment. If money left your account, don't pay again — contact support.";
    };

    // Helper to simulate instant completion in test mode
    // v416: `direct` = called by this function (not from a toast button) → a failure must reach onError,
    // otherwise the screen's button stays on "Processing…" forever.
    const simulateTestComplete = async (direct = false) => {
      try {
        toast.loading("Simulating Test Payment Hold Deposit...", { id: "test-complete-toast" });
        const { data: testData } = await api.post("payments/razorpay/test-complete", {
          deal_id: dealId || null,
          thread_id: threadId || null,
          campaign_id: campaignId || null,
          brief_id: briefId || null,
          creator_id: creatorId || null,
          order_id: orderData.order_id,
          transaction_id: orderData.transaction_id,
          gross_amount: verifiedAmount,
          amount: verifiedAmount
        });
        toast.dismiss("test-complete-toast");
        if (testData?.verified || testData?.success) {
          if (testData?.state_sync_failed) {
            toast.error("Test payment recorded, but the deal status failed to update. This points to a real backend sync bug — check server logs for: " + (testData.state_sync_error || "unknown error"), { duration: 12000 });
          } else {
            toast.success("Test payment received — held until the work is approved.");
          }
          triggerSuccessOnce(testData);
        } else {
          toast.error("Test payment simulation failed");
          if (direct && onError) onError(new Error("Test payment simulation failed")); // v416
        }
      } catch (err) {
        toast.dismiss("test-complete-toast");
        toast.error(err?.response?.data?.error || err.message || "Failed to simulate test payment");
        if (direct && onError) onError(err); // v416
      }
    };

    // If order was created in simulation/test mode on preview, auto-complete
    if (orderData.order_id?.startsWith("order_test_") || orderData.key_id === "rzp_test_placeholder") {
      return await simulateTestComplete(true); // v416
    }

    if (typeof window.Razorpay === "undefined") {
      const loaded = await loadRazorpayScript();
      if (!loaded || typeof window.Razorpay === "undefined") {
        if (isTestMode) {
          toast.info("Razorpay SDK offline in sandbox. Completing the test payment…");
          return await simulateTestComplete(true); // v416
        }
        toast.error("Payment window couldn't load. Please check your network and try again."); // v416
        if (onError) onError(new Error("Payment window couldn't load")); // v416: screen leaves "Processing…"
        return;
      }
    }

    // Auto-polling helper to check if UPI QR payment was captured on phone
    // FIX #4: Add hard timeout to prevent 90-second polling hammering the server
    const startPolling = () => {
      let attempts = 0;
      pollInterval = setInterval(async () => {
        attempts++;
        const elapsedMs = Date.now() - pollStartTime;
        
        // FIX #4: Hard stop conditions
        if (isCompleted || hasTriggeredSuccess || attempts > 30 || elapsedMs > POLL_MAX_DURATION) {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          if (elapsedMs > POLL_MAX_DURATION) {
            console.warn(`[Razorpay] Polling timeout reached (${elapsedMs}ms > ${POLL_MAX_DURATION}ms)`);
          }
          return;
        }
        
        try {
          const { data: statusData } = await api.post("payments/razorpay/check-status", {
            deal_id: dealId || null,
            thread_id: threadId || null,
            order_id: orderData.order_id
          });
          if (statusData?.paid && !hasTriggeredSuccess) {
            const result = await persistPaymentOnce(statusData.payment_id || orderData.order_id, "polling");
            settleVerify(result.data); // v423 (P2): the server's answer decides, not "paid" alone
          }
        } catch (e) {
          // ignore transient poll error
          console.warn("[Razorpay] Poll check error:", e?.message);
        }
      }, 3000);
    };

    startPolling();

    // 2. Configure and launch Razorpay Checkout modal
    const options = {
      key: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency || "INR",
      // v375 (Ravi, written OK in chat 23 Oct: "razorpay.js mein logo aur naam change"): the real Ybex logo in Razorpay's
      // header instead of the letter box, and no "Ybex" text next to it (the logo already says it).
      name: "",
      image: `${serverOrigin()}/pwa-512x512.png`,
      description: description || "Payment for your Ybex deal", // v423 (P16)
      order_id: orderData.order_id,
      // Session 56: the brand's real details only — no made-up email / phone (Razorpay sent
      // receipts and OTP prompts to them). Empty fields are asked for in the window.
      prefill: {
        name: orderData.user_name || user?.name || "",
        email: orderData.user_email || user?.email || "",
        contact: orderData.user_phone || user?.phone || "",
        ...(["upi", "card", "netbanking", "wallet"].includes(method) ? { method } : {})
      },
      ...(displayConfig ? { config: displayConfig } : {}), // v366
      // v375 (Ravi, written OK in chat 23 Oct: "razorpay.js mein webview_intent OK"): inside the Play Store app the
      // checkout runs in an Android WebView, where Razorpay hides the UPI apps (Paytm / PhonePe / GPay) unless this is
      // on. Ignored in a normal browser.
      webview_intent: true,
      retry: {
        enabled: true
      },
      handler: async function (response) {
        if (hasTriggeredSuccess) return;
        try {
          isCompleted = true;
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          if (!quiet) toast.info("Verifying your payment…");
          
          // FIX #1: Use single persistence promise instead of direct API call
          // This ensures that even if handler and polling both fire (race condition),
          // only ONE backend call happens
          const { data: verifyData } = await persistPaymentOnce(
            response.razorpay_payment_id,
            "handler",
            response.razorpay_signature
          );

          settleVerify(verifyData, response.razorpay_payment_id); // v423 (P2/P4/P5)
        } catch (err) {
          const errMsg = verifyErrorText(err); // v423 (P4): the server's own reason, not "signature verification failed"
          toast.error(errMsg, { duration: 10000 });
          if (onError) onError(err);
          finish();
        }
      },
      modal: {
        ondismiss: async function () {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          if (hasTriggeredSuccess) return;

          // Check one last time in case user paid on UPI app and closed popup
          try {
            const { data: statusData } = await api.post("payments/razorpay/check-status", {
              deal_id: dealId || null,
              thread_id: threadId || null,
              order_id: orderData.order_id
            });
            if (statusData?.paid && !hasTriggeredSuccess) {
              try {
                const result = await persistPaymentOnce(statusData.payment_id || orderData.order_id, "ondismiss");
                settleVerify(result.data); // v423 (P2)
              } catch (err) { // v423 (P4): paid but not recorded yet — say so, never "window closed"
                toast.error(verifyErrorText(err), { duration: 10000 });
                if (onError) onError(err);
                finish();
              }
              return;
            }
          } catch (e) {
            console.warn("[Razorpay ondismiss] Final status check error:", e?.message);
          }

          if (!hasTriggeredSuccess && !isCompleted) {
            if (isTestMode) {
              toast.info("Testing Mode: Complete test payment?", {
                action: {
                  label: "⚡ Complete Test Pay",
                  onClick: () => simulateTestComplete()
                },
                duration: 10000
              });
            } else {
              toast.info("Payment window closed");
            }
            if (onError) onError(new Error("Payment window closed"));
          }
          if (!hasTriggeredSuccess) finish();
        }
      },
      theme: {
        color: "#7C3AED" // Ybex purple (was a stray indigo)
      }
    };

    let rzp1;
    try { rzp1 = new window.Razorpay(options); } catch (e) {
      if (!options.config) throw e;
      // v366: an app / block Razorpay doesn't accept → the normal Razorpay sheet, nothing else changes
      console.warn("[Razorpay] display config refused, using the default sheet:", e?.message);
      delete options.config;
      rzp1 = new window.Razorpay(options);
    }
    rzp1.on("payment.failed", function (resp) {
      toast.error(resp.error?.description || "Payment failed");
      if (isTestMode) {
        toast.info("Testing on Desktop? Click to simulate successful test deposit:", {
          action: {
            label: "⚡ Simulate Test Pay",
            onClick: () => simulateTestComplete()
          },
          duration: 10000
        });
      }
      if (onError) onError(resp.error);
    });

    rzp1.open();
    if (onOpen) { try { onOpen(); } catch (e) { console.warn("[Razorpay] onOpen failed:", e?.message); } }

    if (isTestMode) {
      testToastId = toast.info("🧪 Test Mode Active: Pay in Razorpay popup or click below to simulate:", {
        action: {
          label: "⚡ Auto-Complete",
          onClick: () => simulateTestComplete()
        },
        duration: 15000
      });
    }

    return await finished;
  } catch (err) {
    // Session 56: the server refuses a second payment for a deal that is already paid (or finds
    // the earlier payment and records it). That is good news for the brand, not an error.
    const body = err?.response?.data || {};
    if (err?.response?.status === 409 && body?.code === "ALREADY_PAID") {
      toast.success(body.detail || "This deal is already paid.");
      try { if (onSuccess) await onSuccess({ verified: true, already_paid: true, order_id: body.order_id || null }); } catch (e) { console.warn("[Razorpay] onSuccess failed:", e?.message); }
      return;
    }
    const errMsg = (body?.error === "INHOUSE_PIN" && body?.detail) || body?.error || err.message || "Failed to initiate Razorpay payment"; // v419: "Too many wrong PINs…" in words
    toast.error(errMsg);
    if (onError) onError(err);
  }
}
