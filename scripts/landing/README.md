# Landing page generator (v333)

`src/components/landing/v2/LandingMobileView.jsx` / `LandingDesktopView.jsx` and their CSS are generated from the
Claude Design handoff (`YBEX_Landing_Page_Design.zip` → `export/Ybex Landing Mobile|Desktop (offline).html`).

1. Unpack the two HTML bundles (template + manifest + logic) into a work folder (see the paths at the top of build.py).
2. `python3 scripts/landing/build.py` — converts the design template to JSX (`conv.py`), copies photos/fonts to
   `public/landing/`, scopes the design CSS under `.ybl-root`, removes the design tool's preview bar / browser frame.
3. Re-compress large PNGs if new ones were added (they were cut from 6.7 MB to 3 MB with sharp, palette PNG).

Don't hand-edit the generated markup — change the design and re-run, so the page always matches it.
