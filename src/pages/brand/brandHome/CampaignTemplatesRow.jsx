import React from "react";


// Session 49 (clean-up): moved out of BrandHomeMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function CampaignTemplatesRow(props) {
  const { CAMPAIGN_TEMPLATES, handleUseTemplate, navigate } = props;
  return (
    <div style={{ flexShrink: 0, padding: "18px 14px 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "10px",
            }}
          >
            <div>
              <div
                style={{
                  font: "700 16px 'DM Sans', sans-serif",
                  letterSpacing: "-0.4px",
                  color: "#0A0A0A",
                  whiteSpace: "nowrap",
                }}
              >
                Launch in 2 minutes
              </div>
              <div
                style={{
                  marginTop: "2px",
                  font: "400 11px 'DM Sans', sans-serif",
                  color: "#6B7280",
                }}
              >
                Pick a template, we pre-fill the brief
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/brand/campaigns/create")}
              style={{
                minHeight: "40px", // v332: tap target
                padding: "0 4px",
                font: "600 12px 'DM Sans', sans-serif",
                color: "#7C3AED",
                whiteSpace: "nowrap",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              Write my own
            </button>
          </div>

          {/* Horizontal Templates Slider */}
          <div
            style={{
              padding: "10px 0 0",
              display: "flex",
              gap: "8px",
              overflowX: "auto",
            }}
            className="no-scrollbar scroll-smooth"
          >
            {CAMPAIGN_TEMPLATES.map((tmpl) => {
              const TmplIcon = tmpl.icon;
              return (
                <div
                  key={tmpl.id}
                  style={{
                    width: "210px",
                    flexShrink: 0,
                    background: "#fff",
                    border: "1px solid #E6E6EE",
                    borderRadius: "18px",
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "11px",
                      background: tmpl.iconBg,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <TmplIcon size={16} strokeWidth={1.9} color={tmpl.iconColor} />
                  </div>

                  <div
                    style={{
                      marginTop: "10px",
                      font: "600 13px/1.3 'DM Sans', sans-serif",
                      color: "#0A0A0A",
                      minHeight: "34px",
                    }}
                  >
                    {tmpl.title}
                  </div>
                  <div
                    style={{
                      marginTop: "3px",
                      font: "400 10.5px/1.4 'DM Sans', sans-serif",
                      color: "#6B7280",
                      marginBottom: "12px",
                    }}
                  >
                    {tmpl.deliverableSummary}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUseTemplate(tmpl)}
                    style={{
                      marginTop: "auto", // v332: buttons line up at the card bottom whatever the text length
                      height: "40px",
                      borderRadius: "10px",
                      background: "#F3EDFF",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      font: "600 11.5px 'DM Sans', sans-serif",
                      color: "#7C3AED",
                      cursor: "pointer",
                      transition: "background 0.2s ease",
                    }}
                  >
                    Use template
                  </button>
                </div>
              );
            })}
          </div>
        </div>
  );
}
