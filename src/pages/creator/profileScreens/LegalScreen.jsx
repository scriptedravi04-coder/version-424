import React from "react";
import LegalPanel from "../../../components/legal/LegalPanel";


// Session 49 (clean-up): moved out of CreatorMobileProfile.jsx word for word — the "legal" screen.
// Everything it needs comes in as props from CreatorMobileProfile; no logic or server call changed.
export default function LegalScreen(props) {
  const { renderBackHeader } = props;

    // Session 34: same short cards as desktop settings (components/legal/LegalPanel.jsx).
    return (
      <div className="min-h-screen bg-white flex flex-col pb-28">
        {renderBackHeader("Privacy & terms")}
        <div className="p-5">
          <LegalPanel role="creator" compact />
        </div>
      </div>
    );
  
}
