# P5 Public Templates Verifying Test Cases (2026-04-09)

## Scope

- Batch: `P5-public-templates`
- Stage: `verifying`
- Target feature: `F-P5-07` (executor: codex)
- Environment: `L1 local (http://localhost:3099)`

## Preconditions

1. Test server is started via:
   - `bash scripts/test/codex-setup.sh`
   - `bash scripts/test/codex-wait.sh`
2. DB is reset and seeded by setup script.
3. Admin account exists: `admin@aigc-gateway.local / admin123`.

## Cases

1. Public template listing/detail/fork chain
- Admin creates source Actions + Template.
- Admin marks template as public.
- Normal user can list public templates and fetch public detail.
- Normal user can fork template to own project.
- Forked template keeps `sourceTemplateId` and step count integrity.

2. Fork deep-copy integrity
- Forked template steps count equals source steps count.
- Forked steps point to Actions owned by target project.
- Source and fork Actions do not share IDs (when no name collision).

3. Non-public template should not be forkable
- User calling fork on private template receives `404`.

4. MCP tools availability and behavior
- `initialize` succeeds with API key auth.
- `tools/list` contains `list_public_templates` and `fork_public_template`.
- `tools/call:list_public_templates` returns public templates payload.
- `tools/call:fork_public_template` returns fork result.

5. UI structure / design spot checks
- Templates page contains My/Library tabs and `GlobalLibrary` entry.
- Global library page contains 3-column grid and fork dialog/drawer flow markers.

6. DS token consistency audit
- Check P5 UI files for legacy tokens and hardcoded palette classes/hex.
- Target files:
  - `src/app/(console)/templates/page.tsx`
  - `src/app/(console)/templates/global-library.tsx`
  - `src/app/(console)/templates/template-detail-drawer.tsx`
  - `src/app/(console)/templates/fork-confirm-dialog.tsx`

7. i18n residue audit
- Check known hardcoded UI text residues in P5 UI files.
- Verify required `templates` i18n keys exist in `en.json` and `zh-CN.json`.

