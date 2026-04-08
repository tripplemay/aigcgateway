# Keys Settings — Design Notes

## Partial support
- Status toggle (Active/Disabled) — API only supports irreversible revocation. Show revoke in Danger Zone, not a toggle.

## Fully supported
- Name, description, permissions, rate limit, IP whitelist — all via PATCH /keys/:keyId
