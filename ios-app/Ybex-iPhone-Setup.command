#!/bin/bash
# v378 (Ravi: "Xcode chalana nahi aata"): double-click this file in Finder (first time: right-click → Open).
# It runs scripts/mac-prepare.sh — installs everything, builds the app files and opens Ybex in Xcode.
cd "$(dirname "$0")" || exit 1
export VITE_API_ORIGIN="${VITE_API_ORIGIN:-https://ybexmedia.in}"
bash scripts/mac-prepare.sh
echo
echo "Ho gaya — Xcode khul gaya hoga. Ye window band kar sakte ho."
read -r -n 1 -p "Press any key to close..." _
