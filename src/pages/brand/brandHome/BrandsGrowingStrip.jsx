import React from "react";
import { trustedBrands } from "../../../lib/constants/trustedBrands";


// Session 49 (clean-up): moved out of BrandHomeMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function BrandsGrowingStrip(props) {
  const {  } = props;
  return (
    <div style={{ flexShrink: 0, padding: "14px 14px 18px" }}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #E6E6EE",
              borderRadius: "18px",
              padding: "11px 12px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              {trustedBrands.map((brand, idx) => (
                <div
                  key={idx}
                  style={{
                    position: "relative",
                    width: "28px",
                    height: "28px",
                    borderRadius: "14px",
                    border: "2px solid #fff",
                    background: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    overflow: "hidden",
                    marginLeft: idx === 0 ? 0 : "-8px",
                    zIndex: trustedBrands.length - idx,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={brand.logoUrl}
                    alt="" // v332: decorative logos — screen readers no longer read "Trusted Brand 1…6"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.parentElement.style.backgroundColor = "#F3F4F6";
                    }}
                  />
                </div>
              ))}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  font: "600 12.5px 'DM Sans', sans-serif",
                  color: "#0A0A0A",
                  whiteSpace: "nowrap",
                  overflow: "hidden", // v330: no spill past the card on 320px phones
                  textOverflow: "ellipsis",
                }}
              >
                Brands growing with Ybex{/* v332: brand name spelled like the rest of the app */}
              </div>
              <div
                style={{
                  font: "400 10.5px 'DM Sans', sans-serif",
                  color: "#6B7280",
                  whiteSpace: "nowrap",
                  overflow: "hidden", // v330: no spill past the card on 320px phones
                  textOverflow: "ellipsis",
                }}
              >
                Leading brands found their creators here
              </div>
            </div>
          </div>
        </div>
  );
}
