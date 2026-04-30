#!/usr/bin/env bash
#
# Walk every Prisma migration and verify it carries an explicit
# `-- ROLLBACK:` comment block. Every migration we ship MUST have a
# rollback recipe checked in alongside it — otherwise a prod
# schema-change incident would leave on-call with no documented
# undo path.
#
# Invoked by:
#   - CI (.github/workflows/ci.yml → validate-rollback-sql job)
#   - Pre-deploy guard (recommended; wire into deploy script when added)
#
# Exit 0 when every migration passes, exit 1 on the first offender
# (and print which one + a pointer to the convention).
#
# Convention: docs/dev/rules.md § "Migration ROLLBACK 注释规范"

set -euo pipefail

shopt -s nullglob
migrations=(prisma/migrations/*/migration.sql)

if [[ ${#migrations[@]} -eq 0 ]]; then
  echo "❌ No migrations found under prisma/migrations/"
  exit 1
fi

fail=0
for migration in "${migrations[@]}"; do
  if ! grep -q "^-- ROLLBACK:" "$migration"; then
    echo "❌ Missing '-- ROLLBACK:' comment in $migration"
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo
  echo "Every migration must include a line starting with '-- ROLLBACK:'"
  echo "followed by either inline SQL or a commented-out DROP recipe."
  echo "See docs/dev/rules.md § 'Migration ROLLBACK 注释规范' for the"
  echo "classification table (CREATE INDEX / ADD COLUMN / CREATE TABLE /"
  echo "ADD CHECK / DATA migration / composite)."
  exit 1
fi

echo "✅ ${#migrations[@]} migration(s) all include -- ROLLBACK: recipe"
