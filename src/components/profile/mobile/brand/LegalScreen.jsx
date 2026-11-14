import React from "react";
import { MobileScreen, Section } from "./brandMobileUi";
import LegalPanel from "../../../legal/LegalPanel";

// Screen 1g — Privacy & terms (brand mobile). Session 34: same short cards as the desktop settings
// tab (components/legal/LegalPanel.jsx, text in src/lib/legal/legalContent.js); full pages open
// from the links. The old compliance pill and payment-hold copy are gone.
export default function LegalScreen({ onBack }) {
  return (
    <MobileScreen title="Privacy & terms" onBack={onBack}>
      <Section>
        <LegalPanel role="brand" compact />
      </Section>
    </MobileScreen>
  );
}
