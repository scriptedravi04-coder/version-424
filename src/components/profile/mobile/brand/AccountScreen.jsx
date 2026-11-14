import React from "react";
import { MobileScreen } from "./brandMobileUi";
import AccountPanel from "../../../account/AccountPanel";

// Screen — Account (brand mobile). Login details, devices & sessions, privacy & terms, delete account.
export default function AccountScreen({ onBack, onOpen, onDeleted }) {
  return (
    <MobileScreen title="Account" onBack={onBack}>
      <AccountPanel onOpen={onOpen} onDeleted={onDeleted} />
    </MobileScreen>
  );
}
