import React from "react";
import { safeArray } from "../../../utils/safeFormat";
import { FileText, X, ExternalLink, CheckCircle2 } from "lucide-react";


// Session 49 (clean-up): moved out of ManageUGCOrdersView.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function BriefProductInfo(props) {
  const { selectedOrder } = props;
  return <>{(() => {
          const hasProductDescription = Boolean(selectedOrder.productDescription && String(selectedOrder.productDescription).trim());
          const hasRequirements = Boolean(selectedOrder.requirements && String(selectedOrder.requirements).trim());
          const hasDos = Boolean(selectedOrder.dos && Array.isArray(selectedOrder.dos) && selectedOrder.dos.length > 0);
          const hasDonts = Boolean(selectedOrder.donts && Array.isArray(selectedOrder.donts) && selectedOrder.donts.length > 0);
          const hasSampleUrl = Boolean(selectedOrder.sampleUrl && String(selectedOrder.sampleUrl).trim());

          const hasAnyBriefData = hasProductDescription || hasRequirements || hasDos || hasDonts || hasSampleUrl;

          if (!hasAnyBriefData) return null;

          return (
            <div className="space-y-4 pt-3 border-t border-[var(--border-default)]">
              <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                <FileText size={15} className="text-[var(--violet)]" />
                Brief Specifications & Requirements
              </h3>

              {/* Product Description */}
              {hasProductDescription && (
                <div className="space-y-1">
                  <h4 className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-wider">Product Description</h4>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-line font-normal">{selectedOrder.productDescription}</p>
                </div>
              )}

              {/* Detailed Instructions */}
              {hasRequirements && (
                <div className="space-y-1">
                  <h4 className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-wider">Detailed Instructions</h4>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-line font-normal">{selectedOrder.requirements}</p>
                </div>
              )}

              {/* Do's and Don'ts */}
              {(hasDos || hasDonts) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {hasDos && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 size={15} /> What To Do (Do's)
                      </h4>
                      <ul className="space-y-1.5 text-xs text-emerald-800 font-medium">
                        { safeArray(selectedOrder.dos).map((d, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-emerald-600 font-bold">•</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {hasDonts && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                        <X size={15} /> What Not To Do (Don'ts)
                      </h4>
                      <ul className="space-y-1.5 text-xs text-rose-800 font-medium">
                        { safeArray(selectedOrder.donts).map((d, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-rose-600 font-bold">•</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Sample Content Reference */}
              {hasSampleUrl && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-[var(--text-primary)] font-bold">Sample Content Reference:</span>
                  <a href={selectedOrder.sampleUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--violet)] font-bold hover:underline inline-flex items-center gap-1">
                    <span>View Reference Video</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          );
        })()}</>;
}
