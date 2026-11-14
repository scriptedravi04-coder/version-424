import React from "react";
import { PlayCircle, ExternalLink, Lock, Clock } from "lucide-react";
import { mediaHref } from "../../../lib/mediaUrl";
import { resolveMediaUrl, YbexWatermarkOverlay, parseVideoLink } from "../../../components/shared/VideoEmbedPreview";


// Session 49 (clean-up): moved out of BrandUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
// v416 (U28): the creator's note for the draft (desktop showed it, the phone didn't). Old rows that carry the brand's
// own feedback ("Revision feedback: …") are not creator notes and are skipped, same rule as the desktop screen.
const NOT_A_CREATOR_NOTE = /^(revision feedback|live link revision feedback|revision declined)\s*:/i;
export function creatorNoteOf(order) {
  const v = order?.creator_notes || (Array.isArray(order?.deliverables) ? order.deliverables[0]?.creator_notes : "") || "";
  const t = typeof v === "string" ? v.trim() : "";
  return t && !NOT_A_CREATOR_NOTE.test(t) ? t : "";
}

export default function DeliverablePreviewCard(props) {
  const { deliverableUrl, isCompleted, isPlayableDeliverable, selectedOrder, isCollabOrder = true, pendingLabel } = props;
  // v358: real format + delivery date (was always "Reel" and "Submitted recently")
  const deliveredAt = selectedOrder?.delivered_at || selectedOrder?.submitted_at || null;
  const deliveredText = deliveredAt && Number.isFinite(Date.parse(deliveredAt))
    ? `Sent ${new Date(deliveredAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase())}`
    : null;
  return (
    <div className="bg-white rounded-[20px] p-4 border border-[#E5E5EA] shadow-xs space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#7C3AED]" />{/* v415: no endless pulse */}
                <span className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                  Protected Draft
                </span>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${
                isCompleted ? 'bg-[#E9F9EF] text-[#16A34A]' : 'bg-[#FEF7E0] text-[#B45309]'
              }`}>
                {isCompleted ? "Approved" : pendingLabel ? pendingLabel /* v358: revision / approved-draft / closed states */ : (deliverableUrl ? "Awaiting your review" : "Not submitted")}{/* v332: was "Unapproved" even with no draft */}
              </span>
            </div>

            {/* Video Player Container — v416 (U28): no big dark "player" with a play icon when there is nothing to play */}
            {!deliverableUrl ? (
              <div className="w-full rounded-2xl border border-dashed border-[#DDD6FE] bg-[#FAF8FF] p-6 text-center" data-testid="brand-ugc-no-draft">
                <div className="w-11 h-11 rounded-full bg-[#F1E8FF] text-[#7C3AED] flex items-center justify-center mx-auto"><Clock size={20} /></div>
                <h5 className="mt-2 text-sm font-bold text-[#0A0A0A]">No draft yet</h5>
                <p className="text-xs text-[#6B7280] mt-0.5">The creator's video will appear here.</p>
              </div>
            ) : (() => {
              // v430 (Ravi: "yaha preview kyu nahi hai"): a Drive / YouTube / Vimeo / Instagram link now plays right here
              // (their own player, nothing downloads through Ybex). If the creator didn't share the file publicly, the
              // player says so — "Open link" stays under it.
              const embed = !isPlayableDeliverable(deliverableUrl) ? parseVideoLink(deliverableUrl) : null;
              const canEmbed = embed && ["gdrive", "youtube", "vimeo", "instagram"].includes(embed.type);
              if (!canEmbed) return null;
              return (
                <div className="space-y-2" data-testid="brand-ugc-draft-embed">
                  <div className="relative w-full aspect-[9/16] max-h-[420px] bg-[#0A0A0A] rounded-2xl overflow-hidden">
                    <iframe src={embed.embedUrl} title="Draft preview" className="absolute inset-0 w-full h-full border-0"
                      allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="no-referrer" />
                    {!isCompleted && <YbexWatermarkOverlay label="Ybex Protected Draft" />}
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-[#F5F0FF] px-3 py-2">
                    <span className="text-[11.5px] text-[#6B7280]">Not playing? The creator may need to share it as "Anyone with the link".</span>
                    <a href={deliverableUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 text-[12px] font-bold text-[#7C3AED]"><ExternalLink size={12} /> Open</a>
                  </div>
                </div>
              );
            })() || (
            <div className={`relative w-full aspect-[9/16] max-h-[380px] rounded-2xl overflow-hidden flex items-center justify-center group ${isPlayableDeliverable(deliverableUrl) ? "bg-[#0A0A0A]" : "bg-[#F5F0FF] border border-[#DDD6FE]"}`}>
              {/* Session 43 (Ravi): the draft was a storage path (not "http…") so the brand got
                  "Open Cloud Link" instead of the video. Any uploaded file now plays here (through
                  the access-checked media proxy), with the Ybex watermark until approval; only a
                  Drive / Dropbox style link still opens outside. */}
              {deliverableUrl && isPlayableDeliverable(deliverableUrl) ? (
                <>
                  <video 
                    src={resolveMediaUrl(deliverableUrl) || mediaHref(deliverableUrl)} 
                    controls 
                    playsInline 
                    preload="metadata"
                    controlsList={isCompleted ? "nodownload" : "nodownload nofullscreen noremoteplayback"}
                    disablePictureInPicture={!isCompleted}
                    className="w-full h-full object-contain"
                    data-testid="brand-ugc-draft-video"
                  />
                  {!isCompleted && <YbexWatermarkOverlay label="Ybex Protected Draft" />}
                </>
              ) : (
                <div className="text-center p-6 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mx-auto text-[#7C3AED] shadow-sm">
                    <PlayCircle size={36} className="text-[#7C3AED]" />
                  </div>
                  <div>
                    <h5 className="text-[#0A0A0A] text-sm font-bold">{deliverableUrl ? "Draft shared as a link" : "No draft yet"}</h5>
                    {/* v330: this line showed under "No draft yet" too */}
                    <p className="text-[#6B7280] text-xs mt-1">{deliverableUrl ? "Shared as a link — opens outside Ybex" : "The creator's video will appear here."}</p>
                  </div>
                  {deliverableUrl && (
                    <a 
                      href={deliverableUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-[#7C3AED] text-white px-4 py-2 rounded-xl text-xs font-bold"
                    >
                      <ExternalLink size={13} /> Open link
                    </a>
                  )}
                </div>
              )}

              {/* Watermark Tag Overlay — v332: only while the draft is really watermarked (not after approval / with no video) */}
              {!isCompleted && deliverableUrl && isPlayableDeliverable(deliverableUrl) && <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white/90 text-[10px] font-bold px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1">
                <Lock size={10} /> Watermarked Preview
              </div>}
            </div>
            )}

            {deliverableUrl && creatorNoteOf(selectedOrder) && (
              <div className="rounded-xl bg-[#F9F9FB] border border-[#E5E5EA] p-3" data-testid="brand-ugc-creator-note">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Creator's note</div>
                <p className="text-xs text-[#0A0A0A] mt-1 whitespace-pre-line break-words">{creatorNoteOf(selectedOrder)}</p>
              </div>
            )}

            {/* Deliverable Metadata */}
            <div className="flex justify-between items-center text-xs text-[#6B7280] pt-1">
              <span>{/* v332: no made-up "30s · v1" when the order has no duration */}{[isCollabOrder ? "Reel" : "UGC video", selectedOrder.duration || selectedOrder.video_duration || selectedOrder.brief?.video_duration].filter(Boolean).join(" · ")}</span>
              {deliverableUrl && deliveredText && <span>{deliveredText}</span>}{/* v330: not when nothing was submitted · v358: real date */}
            </div>
          </div>
  );
}
