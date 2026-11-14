import React, { Suspense } from "react";
import useIsMobile from "../../hooks/useIsMobile";
import { lazyRetry } from "../../lib/staleBuild";
// v426: the desktop chat (≈580 KB) loads only on desktop — the phone app pre-loads this file for the Inbox tab.
const Chat = lazyRetry(() => import("../dashboard/Chat"));
import InboxMobile from "../../components/inbox/mobile/InboxMobile";

export default function BrandInbox() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <InboxMobile role="brand" />;
  }

  return (
    <div className="w-full h-full">
      <Suspense fallback={null}><Chat /></Suspense>
    </div>
  );
}
