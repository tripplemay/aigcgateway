# Register — Design Notes

## Ignore (no backend support)
- Google / GitHub OAuth buttons — no OAuth integration in backend
- "99.9% UPTIME" / "<20ms LATENCY" bottom stats — decorative

## Fully supported
- Email + Password + Confirm Password form → POST /api/auth/register
- "Already have an account? Sign in" link
- Terminal simulation visual style (same as Login page)

## Notes
- Current implementation has a "Name (optional)" field not in the design. Keep it — backend accepts it.
- Password visibility toggle (eye icon) — pure frontend, should implement.
