import React, { useState } from "react";
import { LifeBuoy, Bot } from "lucide-react";
import AdminHelpdesk from "../../pages/admin/AdminHelpdesk";
import AdminFeedbackInbox from "./AdminFeedbackInbox";

// v293 (Ravi): the Ybex Assist bot's reports are not "help requests" — Help desk now has two sections:
// Support tickets (people asking for help) and Chatbot (bugs / suggestions / confusing from the bot).
export default function AdminHelpdeskHub({ initial = "tickets", single = false }) { // v419: single = inside "Support & safety" (its own tabs there)
  const [section, setSection] = useState(initial === "chatbot" ? "chatbot" : "tickets");
  const tab = (key, label, Icon) => (
    <button type="button" onClick={() => setSection(key)} data-testid={`helpdesk-section-${key}`}
      style={{ height: 38, padding: "0 16px", borderRadius: 19, border: section === key ? "none" : "1px solid #E5E7EB", background: section === key ? "#0A0A0A" : "#fff", color: section === key ? "#fff" : "#1F2937", font: "600 13px 'DM Sans',sans-serif", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
      <Icon size={15} /> {label}
    </button>
  );
  if (single) return initial === "chatbot" ? <AdminFeedbackInbox /> : <AdminHelpdesk />;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tab("tickets", "Support tickets", LifeBuoy)}
        {tab("chatbot", "Chatbot", Bot)}
      </div>
      {section === "chatbot" ? <AdminFeedbackInbox /> : <AdminHelpdesk />}
    </div>
  );
}
