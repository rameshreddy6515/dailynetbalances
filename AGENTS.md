# Project workflow

- The React/Vite application lives in `app/`. Run `npm run build` and `npm run lint` from that directory after changes.
- Lint currently reports warnings in existing React components; do not suppress rules to hide them. Vite currently reports a bundle-size warning.
- Keep merchant balance histories independent. Preserve the effective-change formula: closing minus opening plus cash out plus miscellaneous expense (Cash Out and Misc only move the wallet, never the change; Cash In counts via the closing balance).
- Use in-app confirmations and toasts, not browser alert/confirm dialogs.
- UI preferences: non-sticky page header, plain money inputs without steppers, records-first layout, entry side panel on desktop and full-screen panel on mobile.
- Do not read or expose `.env` secrets during UI work. Do not run database repair scripts as part of UI verification.
