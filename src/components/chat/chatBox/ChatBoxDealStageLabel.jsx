import React from "react";
import { Upload, CheckCircle, ExternalLink, Clock, AlertCircle } from "lucide-react";


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ChatBoxDealStageLabel(props) {
  const { isContentApproved, isContentSubmitted, isDealCompleted, isLinksRevisionOpen, isLiveLinksSubmitted, isManualRevisionOpen, isPaymentFunded, isRevisionDeclined, isRevisionRequested } = props;
  return <>{isDealCompleted ? (
                        <>
                          <CheckCircle className="text-emerald-400 font-bold shrink-0" size={13} />
                          <span>COMPLETED</span>
                          <span className="relative flex h-2 w-2 ml-0.5">
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                        </>
                      ) : isLiveLinksSubmitted ? (
                        <>
                          <CheckCircle className="text-emerald-400 font-bold shrink-0" size={13} />
                          <span>LINKS UNDER REVIEW</span>
                          <span className="relative flex h-2 w-2 ml-0.5">
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                          </span>
                        </>
                      ) : isContentApproved ? (
                        <>
                          <ExternalLink className="text-emerald-400 font-bold shrink-0" size={13} />
                          <span>{isLinksRevisionOpen ? "RESUBMIT LINK" : "SUBMIT LINK"}</span>
                          <span className="relative flex h-2 w-2 ml-0.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                          </span>
                        </>
                      ) : (isRevisionRequested || isManualRevisionOpen) ? (
                        <>
                          <AlertCircle className="text-rose-400 font-bold shrink-0" size={13} />
                          <span className="text-rose-500">{isManualRevisionOpen ? "SUBMIT REVISION" : "REVISIONS REQUIRED"}</span>
                          <span className="relative flex h-2 w-2 ml-0.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                          </span>
                        </>
                      ) : isRevisionDeclined ? (
                        <>
                          <AlertCircle className="text-rose-400 font-bold shrink-0" size={13} />
                          <span>REVISIONS DECLINED</span>
                          <span className="relative flex h-2 w-2 ml-0.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                          </span>
                        </>
                      ) : isContentSubmitted ? (
                        <>
                          <Clock className="text-amber-700 dark:text-amber-400 font-bold shrink-0" size={13} />{/* v415: waiting — no pulse / ping */}
                          <span className="text-amber-950 dark:text-amber-200 font-black tracking-wider">AWAITING APPROVAL</span>
                          <span className="relative flex h-2 w-2 ml-0.5">
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600 dark:bg-amber-400"></span>
                          </span>
                        </>
                      ) : !isPaymentFunded ? (
                        <>
                          <Clock className="text-amber-500 font-bold shrink-0" size={13} />{/* v415: was an endless spinner + ping while just waiting */}
                          <span>WAITING FOR PAYMENT</span>
                          <span className="relative flex h-2 w-2 ml-0.5">
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                          </span>
                        </>
                      ) : (
                        <>
                          <Upload size={13} className="text-rose-500" />
                          <span className="text-rose-500">UPLOAD CONTENT</span>
                          <span className="relative flex h-2 w-2 ml-0.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                          </span>
                        </>
                      )}</>;
}
