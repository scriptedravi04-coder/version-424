import React from "react";


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ChatBoxFeedbackBox(props) {
  const { currentThread, isBrand, offerAmount } = props;
  return <>{(() => {
                      // v332: with no agreed amount the hint judged offers against a made-up ₹15,000
                      const base = Number(currentThread?.amount_fixed) || 0;
                      const val = Number(offerAmount);
                      let color = 'text-[var(--text-secondary)]';
                      let bg = 'bg-[var(--bg-surface)]';
                      let border = 'border-[var(--border-default)]';
                      let msg = 'Enter an amount';
                      let sub = '';

                      if (val > 0 && !base) {
                        msg = `Offer ₹${val.toLocaleString('en-IN')}`;
                      } else if (val > 0) {
                        if (!isBrand) {
                          // Creator side (negotiating up)
                          if (val <= base * 1.2) {
                            color = 'text-emerald-500'; bg = 'bg-emerald-500/10'; border = 'border-emerald-500/20';
                            msg = 'Reasonable Counter Offer!'; sub = "High chance of brand approval.";
                          } else if (val <= base * 1.5) {
                            color = 'text-amber-500'; bg = 'bg-amber-500/10'; border = 'border-amber-500/20';
                            msg = 'Premium Counter Offer'; sub = "A bit high, requires solid justification.";
                          } else {
                            color = 'text-rose-500'; bg = 'bg-rose-500/10'; border = 'border-rose-500/20';
                            msg = 'Significantly Higher Offer'; sub = "May face brand hesitation.";
                          }
                        } else {
                          // Brand side (negotiating down)
                          if (val >= base * 0.9) {
                            color = 'text-emerald-500'; bg = 'bg-emerald-500/10'; border = 'border-emerald-500/20';
                            msg = 'Very fair brand offer!'; sub = "High chance of creator's reply.";
                          } else if (val >= base * 0.7) {
                            color = 'text-amber-500'; bg = 'bg-amber-500/10'; border = 'border-amber-500/20';
                            msg = 'Discounted Offer'; sub = "Creator might negotiate up.";
                          } else {
                            color = 'text-rose-500'; bg = 'bg-rose-500/10'; border = 'border-rose-500/20';
                            msg = 'Considerably low offer'; sub = "Low chance of acceptance.";
                          }
                        }
                      }

                      return (
                        <div className={`mt-6 p-4 rounded-xl border ${bg} ${border} ${color} relative`}>
                          <div className={`absolute -top-2 left-8 w-4 h-4 rotate-45 border-t border-l ${bg} ${border.replace('border-', 'border-t-').replace('border-', 'border-l-')}`}></div>
                          <div className="font-bold text-sm relative z-10">{msg}</div>
                          {sub && <div className="text-[10px] font-bold uppercase tracking-wider opacity-80 mt-1 relative z-10">{sub}</div>}
                        </div>
                      );
                    })()}</>;
}
