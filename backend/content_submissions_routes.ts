import { logIgnored } from "./logIgnored";
import express from "express";
import { revisionAllowance, REVISION_LIMIT_MESSAGE } from "./campaignGuards"; // v417
import crypto from "crypto";

// Content-submission review routes (approve/request-changes on a
// deliverable draft — legacy/alternate path alongside the newer Deals
// content-approval flow) and Collab routes (recording a deliverable
// against a legacy "collab" deal, listing collabs, and taking an
// accept/reject action on a collab proposal).
export function setupContentSubmissionsRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    insertChatMessageToSupabase,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    insertChatMessageToSupabase: (payload: any) => Promise<any>;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  router.post("/collabs/:dealId/deliverable", async (req, res) => {
    // Session 22: this had NO login check — anyone could overwrite any collab's deliverable and
    // move it to IN_REVIEW. Now only the collab's creator (or staff).
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    const { dealId } = req.params;
    const { videoUrl, notes } = req.body || {};
    const db = getDb();
    let collab = (db.collabs || []).find((c: any) => c.id === dealId || c.deal_id === dealId);
    if (!collab && (privilegedSupabase || supabase)) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('collabs').select('*').eq('collab_id', dealId).maybeSingle(); // Session 58: the key column is collab_id
        if (data) collab = data;
      } catch (e) { logIgnored("content_submissions_routes:deliverable-load", e); }
    }
    if (!collab) return res.status(404).json({ detail: "Collab not found" });
    const staff = ["admin", "sub_admin"].includes(String(user.role)) || user.team_role === "sub_admin";
    const creatorIds = [collab.creator_id, collab.to_user_id, collab.creator_user_id].filter(Boolean).map(String);
    if (!staff && !creatorIds.includes(String(user.user_id))) return res.status(403).json({ detail: "Only this collab's creator can submit its deliverable." });
    if (collab && (db.collabs || []).includes(collab)) {
      collab.stage = "IN_REVIEW";
      collab.status = "CONTENT_SUBMITTED";
      collab.deliverable_url = videoUrl;
      collab.notes = notes;
      saveDb(db);
    }
    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from('collabs').update({
          stage: 'IN_REVIEW',
          status: 'CONTENT_SUBMITTED',
          deliverable_url: videoUrl
        }).eq('id', dealId);
      } catch (e) { logIgnored("content_submissions_routes:49", e); }
    }
    res.json({ ok: true, message: "Deliverable submitted" });
  });


  router.get("/collabs", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const db = getDb();
    let sent: any[] = [];
    let received: any[] = [];
    let waves_sent: any[] = [];
    let waves_received: any[] = [];
    let campaign_applications: any[] = [];

    if (supabase) {
      try {
        // v407 (Ravi OK, Supabase logs: 4 reads per page open, ~9,000 a day): collabs and waves are each read ONCE
        // (sent + received together), both at the same time. Same rows as before, split here.
        const both = `from_user_id.eq.${user.user_id},to_user_id.eq.${user.user_id}`;
        const [allCollabs, allWaves] = await Promise.all([
          supabase.from('collabs').select('*').or(both),
          supabase.from('waves').select('*').or(both),
        ]);
        const mine = (r: any, col: string) => (r?.error || !r?.data ? null : r.data.filter((x: any) => String(x?.[col]) === String(user.user_id)));
        // 1. Fetch direct handshake proposals (collabs table)
        const sCollabs = mine(allCollabs, 'from_user_id');
        
        if (sCollabs) {
          sCollabs.forEach((c: any) => {
            sent.push({
              collab_id: c.collab_id,
              id: c.collab_id,
              deliverable: c.deliverable || "Collaboration Proposal",
              proposed_amount: c.proposed_amount || 0,
              payout: c.proposed_amount || 0,
              status: c.status || "pending",
              created_at: c.created_at,
              brand_name: c.brand_name || "Brand Partner",
              raw: c
            });
          });
        }

        const rCollabs = mine(allCollabs, 'to_user_id');
        
        if (rCollabs) {
          rCollabs.forEach((c: any) => {
            received.push({
              collab_id: c.collab_id,
              id: c.collab_id,
              deliverable: c.deliverable || "Collaboration Proposal",
              proposed_amount: c.proposed_amount || 0,
              payout: c.proposed_amount || 0,
              status: c.status || "pending",
              created_at: c.created_at,
              brand_name: c.brand_name || "Brand Partner",
              raw: c
            });
          });
        }

        // 2. Fetch campaign deals (from deals table)
        const { data: userDeals } = await supabase
          .from('deals')
          .select('*')
          .or(`creator_id.eq.${user.user_id},brand_id.eq.${user.user_id}`);

        const { data: cThreads } = await supabase
          .from('chat_threads')
          .select('*')
          .or(`creator_id.eq.${user.user_id},brand_id.eq.${user.user_id}`);

        const threadByDealId: Record<string, any> = {};
        if (cThreads) {
          cThreads.forEach((ct: any) => {
            if (ct.deal_id) threadByDealId[ct.deal_id] = ct;
          });
        }

        if (userDeals && userDeals.length > 0) {
          const dealIds = userDeals.map((d: any) => String(d.id));
          const campaignIds = Array.from(new Set(userDeals.map((d: any) => d.campaign_id).filter(Boolean)));
          const brandIds = Array.from(new Set(userDeals.map((d: any) => d.brand_id).filter(Boolean)));

          const { data: allSubmissions } = await supabase
            .from('content_submissions')
            .select('*')
            .in('deal_id', dealIds)
            .order('submitted_at', { ascending: false });

          const submissionsByDealId: Record<string, any[]> = {};
          (allSubmissions || []).forEach((sub: any) => {
            const dId = String(sub.deal_id);
            if (!submissionsByDealId[dId]) submissionsByDealId[dId] = [];
            submissionsByDealId[dId].push(sub);
          });

          // v414: payout UTR lives on transactions — the deals list says "Paid to bank" only when it exists
          const payoutRefByDeal: Record<string, string> = {};
          try {
            const { data: txRows } = await supabase.from('transactions').select('deal_id, payout_reference').in('deal_id', dealIds);
            (txRows || []).forEach((t: any) => { if (t?.deal_id && t?.payout_reference) payoutRefByDeal[String(t.deal_id)] = String(t.payout_reference); });
          } catch (e) { /* list still works without it */ }

          // Look up campaigns
          const campaignMap: Record<string, any> = {};
          if (campaignIds.length > 0) {
            const { data: campData } = await supabase
              .from('campaigns')
              .select('campaign_id, title')
              .in('campaign_id', campaignIds);
            if (campData) {
              campData.forEach((c: any) => { campaignMap[c.campaign_id] = c; });
            }
          }

          // Look up brand profiles
          const brandProfileMap: Record<string, any> = {};
          if (brandIds.length > 0) {
            const { data: bpData } = await supabase
              .from('brand_profiles')
              .select('user_id, company_name, logo, is_agency')
              .in('user_id', brandIds);
            if (bpData) {
              bpData.forEach((bp: any) => { brandProfileMap[bp.user_id] = bp; });
            }
          }

          userDeals.forEach((d: any) => {
            const threadObj = threadByDealId[d.id];
            const dealSubmissions = submissionsByDealId[String(d.id)] || [];
            const campObj = d.campaign_id ? campaignMap[d.campaign_id] : null;
            const bpObj = d.brand_id ? brandProfileMap[d.brand_id] : null;

            const mappedDeal = {
              collab_id: d.id,
              id: d.id,
              application_id: d.application_id,
              thread_id: threadObj?.id || null,
              creator_name: threadObj?.creator_name || null, // v415: brands see who the deal is with
              deliverable: d.deliverables || "Campaign Collaboration",
              title: campObj?.title || d.campaigns?.title || d.deliverables || "Campaign Collaboration",
              subtitle: (campObj?.title || d.campaigns?.title) ? "Campaign Deal" : "Direct Deal",
              proposed_amount: d.agreed_amount || d.payout || 0,
              payout: d.agreed_amount || d.payout || 0,
              agreed_amount: d.agreed_amount,
              status: d.status || 'NEGOTIATING',
              agreement_signed_creator: d.agreement_signed_creator || false,
              agreement_signed_brand: d.agreement_signed_brand || false,
              agreement_signed_at: d.agreement_signed_at || null,
              revision_notes: d.revision_notes || null,
              content_submissions: dealSubmissions,
              created_at: d.created_at || d.content_deadline,
              deadline: d.content_deadline,
              brand_name: bpObj?.company_name || d.brand_profiles?.company_name || "Brand Partner",
              brand_logo: bpObj?.logo || d.brand_profiles?.logo || null,
              is_agency: Boolean(bpObj?.is_agency ?? d.brand_profiles?.is_agency),
              deliverables: d.deliverables || "",
              payout_reference: payoutRefByDeal[String(d.id)] || null, // v414
              raw: {
                ...d,
                payout_reference: payoutRefByDeal[String(d.id)] || null, // v414
                thread_id: threadObj?.id || null,
                creator_name: threadObj?.creator_name || null, // v415
                is_agency: Boolean(bpObj?.is_agency ?? d.brand_profiles?.is_agency),
                content_submissions: dealSubmissions
              }
            };

            if (user.role === 'creator') {
              received.push(mappedDeal);
            } else {
              sent.push(mappedDeal);
            }
          });
        }

        // 3. Fetch campaign applications
        if (user.role === 'creator') {
          const { data: creatorApps } = await supabase
            .from('campaign_applications')
            .select('*, campaigns(title, brand_user_id, brand_name)')
            .eq('creator_id', user.user_id);
          
          if (creatorApps) {
            campaign_applications = creatorApps.map((a: any) => ({
              application_id: a.application_id,
              campaign_id: a.campaign_id,
              campaign_title: a.campaigns?.title || "Campaign",
              brand_name: a.campaigns?.brand_name || "Brand Partner",
              proposed_amount: a.proposed_amount || 0,
              pitch: a.pitch || "",
              status: a.status || "pending",
              applied_at: a.created_at,
              creator_id: a.creator_id
            }));
          }
        } else if (user.role === 'brand') {
          const { data: brandApps } = await supabase
            .from('campaign_applications')
            // Session 58: creator_profiles has no full_name (the join made the whole list empty); team members
            // act for their parent brand.
            .select('*, campaigns!inner(title, brand_user_id, brand_name)')
            .eq('campaigns.brand_user_id', user.parent_brand_id || user.user_id);
          
          if (brandApps) {
            campaign_applications = brandApps.map((a: any) => ({
              application_id: a.application_id,
              campaign_id: a.campaign_id,
              campaign_title: a.campaigns?.title || "Campaign",
              brand_name: a.campaigns?.brand_name || "Your Brand",
              creator_name: a.creator_name || "Creator",
              proposed_amount: a.proposed_amount || 0,
              pitch: a.pitch || "",
              status: a.status || "pending",
              applied_at: a.created_at,
              creator_id: a.creator_id
            }));
          }
        }

        // 4. Fetch Waves
        const sWaves = mine(allWaves, 'from_user_id');
        if (sWaves) waves_sent = sWaves;

        const rWaves = mine(allWaves, 'to_user_id');
        if (rWaves) waves_received = rWaves;

        // 5. Check completed non-deal threads
        if (cThreads) {
          cThreads.forEach((ct: any) => {
            const isFinished = ct.status === 'COMPLETED' || ct.status === 'completed' || ct.is_completed;
            if (isFinished) {
              const allDeals = [...sent, ...received];
              const matchingDeal = allDeals.find((d: any) => d.id === ct.id || d.id === ct.deal_id || d.collab_id === ct.id || d.collab_id === ct.collab_id);
              if (!matchingDeal) {
                const mappedThreadDeal = {
                  collab_id: ct.id,
                  id: ct.id,
                  deliverable: ct.deliverables || ct.title || "Completed Campaign Deal",
                  title: ct.title || ct.ugc_title || ct.campaign_title || "Campaign Deal", // v416
                  subtitle: "Completed Collaboration",
                  proposed_amount: Number(ct.agreed_amount || ct.amount || 0) /* v415: no made-up ₹5,000 */,
                  payout: Number(ct.agreed_amount || ct.amount || 0) /* v415: no made-up ₹5,000 */,
                  status: 'COMPLETED',
                  created_at: ct.updated_at || ct.created_at,
                  brand_name: ct.brand_name || "Brand Partner",
                  raw: ct
                };
                if (user.role === 'creator') received.push(mappedThreadDeal);
                else sent.push(mappedThreadDeal);
              }
            }
          });
        }

        // 6. Fetch UGC Orders
        const { data: ugcOrders } = await supabase
          .from('ugc_orders')
          .select('*')
          .or(`creator_id.eq.${user.user_id},brand_id.eq.${user.user_id}`);

        if (ugcOrders) {
          ugcOrders.forEach((o: any) => {
            const isCompleted = o.status === 'COMPLETED' || o.brand_status === 'COMPLETED' || o.payment_status === 'PAID' || o.payment_status === 'RELEASED';
            if (isCompleted) {
              const allDeals = [...sent, ...received];
              const matching = allDeals.find((d: any) => d.id === o.id);
              if (matching) {
                matching.status = 'COMPLETED';
              } else {
                const mappedUgc = {
                  collab_id: o.id,
                  id: o.id,
                  deliverable: o.deliverable_type || "UGC Order",
                  title: o.title || "UGC Video Order",
                  subtitle: "Completed UGC Order",
                  proposed_amount: o.agreed_price || o.price || 0,
                  payout: o.agreed_price || o.price || 0,
                  status: 'COMPLETED',
                  created_at: o.updated_at || o.created_at,
                  brand_name: "Brand Partner",
                  raw: o
                };
                if (user.role === 'creator') received.push(mappedUgc);
                else sent.push(mappedUgc);
              }
            }
          });
        }

      } catch (err: any) {
        console.error("Error fetching Supabase collabs:", err);
      }
    } else {
      // Local DB Fallback
      sent = (db.collabs || []).filter((c: any) => c.from_user_id === user.user_id).map((c: any) => ({ ...c, id: c.collab_id, payout: c.proposed_amount, raw: c }));
      received = (db.collabs || []).filter((c: any) => c.to_user_id === user.user_id).map((c: any) => ({ ...c, id: c.collab_id, payout: c.proposed_amount, raw: c }));
      waves_sent = (db.waves || []).filter((w: any) => w.from_user_id === user.user_id);
      waves_received = (db.waves || []).filter((w: any) => w.to_user_id === user.user_id);
      
      if (user.role === 'creator') {
        const apps: any[] = [];
        (db.campaigns || []).forEach((c: any) => {
          (c.applicants || []).forEach((a: any) => {
            if (a.creator_user_id === user.user_id) {
              apps.push({
                application_id: a.application_id,
                campaign_id: c.campaign_id,
                campaign_title: c.title || "Campaign",
                brand_name: c.company_name || "Brand Partner",
                proposed_amount: a.proposed_amount || 0,
                pitch: a.pitch || "",
                status: a.status || "pending",
                applied_at: a.applied_at || new Date().toISOString(),
                creator_id: a.creator_user_id
              });
            }
          });
        });
        campaign_applications = apps;
      } else if (user.role === 'brand') {
        const apps: any[] = [];
        (db.campaigns || []).forEach((c: any) => {
          if (c.brand_id === user.user_id || c.user_id === user.user_id) {
            (c.applicants || []).forEach((a: any) => {
              const u = db.users?.find((x: any) => x.user_id === a.creator_user_id);
              apps.push({
                application_id: a.application_id,
                campaign_id: c.campaign_id,
                campaign_title: c.title || "Campaign",
                brand_name: c.company_name || "Your Brand",
                creator_name: u?.name || "Creator",
                proposed_amount: a.proposed_amount || 0,
                pitch: a.pitch || "",
                status: a.status || "pending",
                applied_at: a.applied_at || new Date().toISOString(),
                creator_id: a.creator_user_id
              });
            });
          }
        });
        campaign_applications = apps;
      }

      // Check db.chat_threads for completed threads in Local DB
      (db.chat_threads || []).forEach((ct: any) => {
        if (ct.creator_id === user.user_id || ct.brand_id === user.user_id) {
          const isFinished = ct.status === 'COMPLETED' || ct.status === 'completed' || ct.is_completed;
          if (isFinished) {
            if (ct.campaign_id) {
              const matchingApp = campaign_applications.find((a: any) => a.campaign_id === ct.campaign_id);
              if (matchingApp) matchingApp.status = 'COMPLETED';
            }
            const allDeals = [...sent, ...received];
            const matchingDeal = allDeals.find((d: any) => d.id === ct.id || d.id === ct.deal_id || d.collab_id === ct.id || d.collab_id === ct.collab_id);
            if (matchingDeal) {
              matchingDeal.status = 'COMPLETED';
            } else {
              const mappedThreadDeal = {
                collab_id: ct.id,
                id: ct.id,
                deliverable: ct.deliverables || ct.title || "Completed Campaign Deal",
                title: ct.title || ct.ugc_title || ct.campaign_title || "Campaign Deal", // v416
                subtitle: "Completed Collaboration",
                proposed_amount: Number(ct.agreed_amount || ct.amount || 0) /* v415: no made-up ₹5,000 */,
                payout: Number(ct.agreed_amount || ct.amount || 0) /* v415: no made-up ₹5,000 */,
                status: 'COMPLETED',
                created_at: ct.updated_at || ct.created_at,
                brand_name: ct.brand_name || "Brand Partner",
                raw: ct
              };
              if (user.role === 'creator') received.push(mappedThreadDeal);
              else sent.push(mappedThreadDeal);
            }
          }
        }
      });

      // Check db.ugc_orders in Local DB
      (db.ugc_orders || []).forEach((o: any) => {
        if (o.creator_id === user.user_id || o.brand_id === user.user_id) {
          const isCompleted = o.status === 'COMPLETED' || o.brand_status === 'COMPLETED' || o.payment_status === 'PAID' || o.payment_status === 'RELEASED';
          if (isCompleted) {
            const allDeals = [...sent, ...received];
            const matching = allDeals.find((d: any) => d.id === o.id);
            if (matching) {
              matching.status = 'COMPLETED';
            } else {
              const mappedUgc = {
                collab_id: o.id,
                id: o.id,
                deliverable: o.deliverable_type || "UGC Order",
                title: o.title || "UGC Video Order",
                subtitle: "Completed UGC Order",
                proposed_amount: o.agreed_price || o.price || 0,
                payout: o.agreed_price || o.price || 0,
                status: 'COMPLETED',
                created_at: o.updated_at || o.created_at,
                brand_name: "Brand Partner",
                raw: o
              };
              if (user.role === 'creator') received.push(mappedUgc);
              else sent.push(mappedUgc);
            }
          }
        }
      });
    }

    res.json({
      sent,
      received,
      waves_sent,
      waves_received,
      campaign_applications
    });
  });



  // Session 58 (security): only the deal's brand (or a full admin) may approve a draft or ask for changes — these
  // routes only checked "is someone logged in", so a creator could approve their own draft.
  const brandOfSubmissionOk = async (id: string, user: any): Promise<boolean> => {
    if (user?.role === "admin" && user?.team_role !== "sub_admin") return true;
    const c = privilegedSupabase || supabase;
    const me = String(user?.parent_brand_id || user?.user_id || "");
    let dealId = id;
    try { const { data: sub } = await c.from('content_submissions').select('deal_id').eq('id', id).maybeSingle(); if (sub?.deal_id) dealId = sub.deal_id; } catch (e) { /* id is a deal id */ }
    let brandId = "";
    try { const { data: d } = await c.from('deals').select('brand_id').eq('id', dealId).maybeSingle(); brandId = String(d?.brand_id || ""); } catch (e) { /* not a deal */ }
    if (!brandId) { const d = (getDb().deals || []).find((x: any) => x.id === dealId); brandId = String(d?.brand_id || ""); }
    return Boolean(brandId) && (brandId === me || brandId === String(user?.user_id || ""));
  };
  router.post("/content-submissions/:id/approve", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (supabase && !(await brandOfSubmissionOk(req.params.id, user))) return res.status(403).json({ detail: "Only the brand of this deal can approve it." });
    const { id } = req.params;
    const now = new Date().toISOString();

    let submission: any = null;
    let dealId = id;

    if (supabase) {
      try {
        // Try looking up by submission id
        const { data: sById } = await supabase.from('content_submissions').select('*').eq('id', id).maybeSingle();
        if (sById) {
          submission = sById;
          dealId = sById.deal_id;
        } else {
          // Look up latest submission for deal_id
          const { data: sByDeal } = await supabase
            .from('content_submissions')
            .select('*')
            .eq('deal_id', id)
            .order('submitted_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (sByDeal) submission = sByDeal;
        }

        // Session 58: only a draft that is waiting for review can be approved (this moved COMPLETED deals back, and
        // "approved" deals that never had a draft).
        {
          const { data: dSt } = await (privilegedSupabase || supabase).from('deals').select('status').eq('id', dealId).maybeSingle();
          if (String(dSt?.status || '').toUpperCase() !== 'CONTENT_SUBMITTED' || (submission && String(submission.submission_type || 'draft') !== 'draft')) {
            return res.status(409).json({ error: "There's no draft waiting for your review on this deal.", code: "NO_DRAFT_IN_REVIEW" });
          }
        }

        if (submission) {
          await (privilegedSupabase || supabase)
            .from('content_submissions')
            .update({
              status: 'APPROVED',
              reviewed_at: now
            })
            .eq('id', submission.id);
        }

        await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            status: 'CONTENT_APPROVED',
            updated_at: now
          })
          .eq('id', dealId);
      } catch (e) {
        console.error("Error approving content submission in Supabase:", e);
      }
    }

    const db = getDb();
    if (db.content_submissions) {
      const sub = db.content_submissions.find((s: any) => s.id === id || s.deal_id === id);
      if (sub) {
        sub.status = 'APPROVED';
        sub.reviewed_at = now;
        dealId = sub.deal_id || dealId;
      }
    }
    if (db.deals) {
      const d = db.deals.find((x: any) => x.id === dealId || x.deal_id === dealId);
      if (d) {
        d.status = 'CONTENT_APPROVED';
        d.stage = 'CONTENT_APPROVED';
      }
    }
    if (db.collabs) {
      const c = db.collabs.find((x: any) => x.collab_id === dealId || x.id === dealId);
      if (c) {
        c.status = 'CONTENT_APPROVED';
        c.stage = 'CONTENT_APPROVED';
      }
    }
    saveDb(db);

    return res.json({ success: true, message: "Draft content approved! Notification sent to creator to go live." });
  });


  router.post("/content-submissions/:id/request-changes", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (supabase && !(await brandOfSubmissionOk(req.params.id, user))) return res.status(403).json({ detail: "Only the brand of this deal can ask for changes." });
    const { id } = req.params;
    const { feedback } = req.body;
    const now = new Date().toISOString();

    let submission: any = null;
    let dealId = id;
    let dealRecord: any = null;

    if (supabase) {
      try {
        const { data: sById } = await (privilegedSupabase || supabase).from('content_submissions').select('*').eq('id', id).maybeSingle();
        if (sById) {
          submission = sById;
          dealId = sById.deal_id;
        } else {
          const { data: sByDeal } = await (privilegedSupabase || supabase)
            .from('content_submissions')
            .select('*')
            .eq('deal_id', id)
            .order('submitted_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (sByDeal) submission = sByDeal;
        }

        if (dealId) {
          const { data: dData } = await (privilegedSupabase || supabase)
            .from('deals')
            .select('*')
            .eq('id', dealId)
            .maybeSingle();
          if (dData) dealRecord = dData;
        }
      } catch (e) {
        console.error("Error fetching deal or submission in Supabase:", e);
      }
    }

    const db = getDb();
    const localSub = (db.content_submissions || []).find((s: any) => s.id === id || s.deal_id === id);
    if (localSub && localSub.deal_id) {
      dealId = localSub.deal_id;
    }

    const localDeal = (db.deals || []).find((x: any) => x.id === dealId || x.deal_id === dealId)
      || (db.collabs || []).find((x: any) => x.collab_id === dealId || x.id === dealId);

    // Session 58: changes only on a draft that is waiting for review; and the deal's own limit (0 means 0 — it was 5).
    if (supabase && dealRecord && String(dealRecord.status || '').toUpperCase() !== 'CONTENT_SUBMITTED') {
      return res.status(409).json({ error: "There's no draft waiting for your review on this deal.", code: "NO_DRAFT_IN_REVIEW" });
    }
    const currentUsed = Math.max(Number(dealRecord?.revisions_used || 0), Number(localDeal?.revisions_used || 0));
    const maxRevisions = revisionAllowance(dealRecord?.revision_count, localDeal?.revision_count);

    if (currentUsed >= maxRevisions) {
      return res.status(400).json({
        error: REVISION_LIMIT_MESSAGE, // v417: point to Support
        detail: REVISION_LIMIT_MESSAGE,
        code: "REVISION_LIMIT",
        _status: 400,
        revisions_used: currentUsed,
        revision_count: maxRevisions
      });
    }

    const nextUsed = currentUsed + 1;

    if (supabase) {
      try {
        if (submission) {
          await (privilegedSupabase || supabase)
            .from('content_submissions')
            .update({
              status: 'CHANGES_REQUESTED',
              brand_feedback: feedback || "",
              reviewed_at: now
            })
            .eq('id', submission.id);
        }

        await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            status: 'ACTIVE',
            revisions_used: nextUsed,
            revision_count: maxRevisions,
            updated_at: now
          })
          .eq('id', dealId);
      } catch (e) {
        console.error("Error requesting changes in Supabase:", e);
      }
    }

    if (db.content_submissions) {
      const sub = db.content_submissions.find((s: any) => s.id === id || s.deal_id === id);
      if (sub) {
        sub.status = 'CHANGES_REQUESTED';
        sub.brand_feedback = feedback || "";
        sub.reviewed_at = now;
        dealId = sub.deal_id || dealId;
      }
    }
    if (db.deals) {
      const d = db.deals.find((x: any) => x.id === dealId || x.deal_id === dealId);
      if (d) {
        d.status = 'ACTIVE';
        d.stage = 'ACTIVE';
        d.feedback = feedback || "";
        d.revisions_used = nextUsed;
        d.revision_count = maxRevisions;
      }
    }
    if (db.collabs) {
      const c = db.collabs.find((x: any) => x.collab_id === dealId || x.id === dealId);
      if (c) {
        c.status = 'ACTIVE';
        c.stage = 'ACTIVE';
        c.feedback = feedback || "";
        c.revisions_used = nextUsed;
        c.revision_count = maxRevisions;
      }
    }

    // Sync chat message for deal revision
    try {
      const thread = (db.chat_threads || []).find((t: any) => t.deal_id === dealId || t.id === dealId);
      if (thread) {
        const msgId = crypto.randomUUID();
        const msgText = `Brand requested a revision: ${feedback || "Please review feedback and upload an updated draft."}`;
        const msgMetadata = {
          feedback: feedback || "",
          notes: feedback || "",
          revision_notes: feedback || "",
          revisions_used: nextUsed,
          action: 'revision_requested'
        };
        const msgPayload = {
          message_id: msgId,
          thread_id: thread.id,
          sender_user_id: user.user_id,
          receiver_user_id: thread.creator_id,
          text: msgText,
          from_name: user.name || "Brand",
          message_type: 'revision_requested',
          metadata: msgMetadata,
          created_at: now,
          read: false
        };
        if (supabase) {
          try {
            await insertChatMessageToSupabase(msgPayload);
          } catch (e) { logIgnored("content_submissions_routes:692", e); }
        }
        if (!db.chat_messages) db.chat_messages = [];
        db.chat_messages.push({
          ...msgPayload,
          id: msgId,
          content: msgText,
          sender_id: user.user_id,
          receiver_id: thread.creator_id,
          sender_role: 'brand',
          message_type: 'revision_requested',
          metadata: {
            feedback: feedback || "",
            notes: feedback || "",
            revision_notes: feedback || "",
            revisions_used: nextUsed,
            action: 'revision_requested'
          }
        });
      }
    } catch (e) { logIgnored("content_submissions_routes:712", e); }

    saveDb(db);

    return res.json({ 
      success: true, 
      message: `Revision task dispatched to creator panel. (${nextUsed}/${maxRevisions})`,
      revisions_used: nextUsed,
      revision_count: maxRevisions
    });
  });


  router.post("/collabs/:id/action", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { id } = req.params;
    const { action } = req.query; // 'accept' or 'reject'

    const targetStatus = action === 'accept' ? 'active' : 'rejected';

    if (supabase) {
      try {
        const { data: collab, error: findErr } = await supabase
          .from('collabs')
          .select('*')
          .eq('collab_id', id)
          .maybeSingle();
        
        if (findErr || !collab) return res.status(404).json({ error: "Collaboration proposal not found" });
        // Session 58 (security): only the person the proposal was SENT to can accept or reject it.
        if (String(collab.to_user_id) !== String(user.user_id) && !(user.role === "admin" && user.team_role !== "sub_admin")) {
          return res.status(403).json({ error: "Only the person who received this proposal can answer it." });
        }

        const { error: updErr } = await supabase
          .from('collabs')
          .update({ status: targetStatus })
          .eq('collab_id', id);
        
        if (updErr) return res.status(500).json({ error: updErr.message });

        if (action === 'accept') {
          const generatedDealId = crypto.randomUUID();
          await (privilegedSupabase || supabase).from('deals').insert({
            id: generatedDealId,
            creator_id: collab.to_user_id === user.user_id ? collab.to_user_id : collab.from_user_id,
            brand_id: collab.to_user_id === user.user_id ? collab.from_user_id : collab.to_user_id,
            agreed_amount: collab.proposed_amount || 5000,
            deliverables: collab.deliverable || "Custom Content Deliverable",
            revision_count: 5,
            revisions_used: 0,
            status: 'ACTIVE'
          });

          await (privilegedSupabase || supabase).from('notifications').insert({
            notif_id: crypto.randomUUID(),
            user_id: collab.from_user_id === user.user_id ? collab.to_user_id : collab.from_user_id,
            type: 'deal_accepted',
            message: `Proposal accepted! Active deal is now in your pipeline.`
          });
        }

        return res.json({ ok: true });
      } catch (err: any) {
        console.error("Error updating collab status:", err);
        return res.status(500).json({ error: "TEST ERROR: " + err.message });
      }
    } else {
      const db = getDb();
      const collab = db.collabs?.find((c: any) => c.collab_id === id);
      if (!collab) return res.status(404).json({ detail: "Collab not found" });

      collab.status = targetStatus;

      if (action === 'accept') {
        const generatedDealId = `deal_${Date.now()}`;
        db.chat_threads = db.chat_threads || [];
        db.chat_threads.push({
          id: `thread_${id}`,
          collab_id: id,
          creator_id: collab.to_user_id === user.user_id ? collab.to_user_id : collab.from_user_id,
          brand_id: collab.to_user_id === user.user_id ? collab.from_user_id : collab.to_user_id,
          status: "active",
          deal_id: generatedDealId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

        db.notifications = db.notifications || [];
        db.notifications.push({
          notif_id: `notif_${Date.now()}`,
          user_id: collab.from_user_id,
          type: "deal_accepted",
          message: `${user.name} accepted your collaboration proposal!`,
          read: false,
          created_at: new Date().toISOString()
        });
      }

      saveDb(db);
      return res.json({ ok: true });
    }
  });

}
