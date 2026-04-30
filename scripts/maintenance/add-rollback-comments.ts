/**
 * One-shot retrofit script — prepend a `-- ROLLBACK:` comment to every
 * historical migration that lacks one. Classification mirrors the
 * convention table in docs/dev/rules.md:
 *
 *   CREATE INDEX           → DROP INDEX
 *   ADD COLUMN             → ALTER TABLE ... DROP COLUMN
 *   CREATE TABLE           → DROP TABLE
 *   ADD CONSTRAINT (CHECK) → ALTER TABLE ... DROP CONSTRAINT
 *   CREATE FUNCTION        → DROP FUNCTION
 *   CREATE TYPE / ENUM     → DROP TYPE
 *   UPDATE / INSERT (data) → revert commit + restore from backup
 *   composite / mixed      → manual SQL recovery required (reason)
 *
 * After this script runs, `./scripts/validate-rollback-sql.sh` must
 * pass. Spot-check a sample of files in `git diff` for sanity before
 * committing.
 *
 * Idempotent: skips files that already contain a `-- ROLLBACK:` line.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "prisma/migrations";

type Verdict = {
  rollback: string;
  category: string;
};

function classify(sql: string): Verdict {
  const ops = {
    createIndex: /\bCREATE\s+(UNIQUE\s+)?INDEX\b/i.test(sql),
    addColumn: /\bADD\s+COLUMN\b/i.test(sql),
    dropColumn: /\bDROP\s+COLUMN\b/i.test(sql),
    createTable: /\bCREATE\s+TABLE\b/i.test(sql),
    dropTable: /\bDROP\s+TABLE\b/i.test(sql),
    alterColumn: /\bALTER\s+COLUMN\b/i.test(sql),
    addConstraint: /\bADD\s+CONSTRAINT\b/i.test(sql),
    dropConstraint: /\bDROP\s+CONSTRAINT\b/i.test(sql),
    createFunction: /\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b/i.test(sql),
    createType: /\bCREATE\s+TYPE\b/i.test(sql),
    alterEnum: /\bALTER\s+TYPE\b.*\bADD\s+VALUE\b/is.test(sql),
    update: /^\s*UPDATE\s+/im.test(sql),
    insert: /^\s*INSERT\s+/im.test(sql),
    delete: /^\s*DELETE\s+/im.test(sql),
    renameTable: /\bRENAME\s+TO\b/i.test(sql),
    renameColumn: /\bRENAME\s+COLUMN\b/i.test(sql),
  };

  const trueCount = Object.values(ops).filter(Boolean).length;

  // Pure DATA migration (UPDATE/INSERT/DELETE without DDL)
  const isDataOnly =
    (ops.update || ops.insert || ops.delete) &&
    !ops.createIndex &&
    !ops.addColumn &&
    !ops.createTable &&
    !ops.alterColumn &&
    !ops.addConstraint &&
    !ops.createFunction &&
    !ops.createType &&
    !ops.alterEnum &&
    !ops.renameTable &&
    !ops.renameColumn &&
    !ops.dropTable &&
    !ops.dropColumn &&
    !ops.dropConstraint;

  if (isDataOnly) {
    return {
      rollback:
        "revert commit + restore from backup (data migration is not idempotently reversible)",
      category: "data",
    };
  }

  // ALTER TYPE ... ADD VALUE (PostgreSQL enum) — not natively reversible
  if (ops.alterEnum) {
    return {
      rollback:
        "revert commit; PostgreSQL ALTER TYPE ... ADD VALUE is not reversible — manual SQL recovery required (drop + recreate enum or accept residual value)",
      category: "alter-enum",
    };
  }

  // Rename — needs to flip
  if (ops.renameTable || ops.renameColumn) {
    return {
      rollback:
        "revert commit; manual SQL recovery required (RENAME ops must be flipped by hand based on the original SQL)",
      category: "rename",
    };
  }

  // Composite (multiple op types)
  if (trueCount > 1) {
    const chosen: string[] = [];
    if (ops.createTable) chosen.push("DROP TABLE for new tables");
    if (ops.addColumn) chosen.push("ALTER TABLE DROP COLUMN for new columns");
    if (ops.createIndex) chosen.push("DROP INDEX for new indexes");
    if (ops.addConstraint) chosen.push("ALTER TABLE DROP CONSTRAINT for new constraints");
    if (ops.createFunction) chosen.push("DROP FUNCTION for new functions");
    if (ops.createType) chosen.push("DROP TYPE for new types");
    if (ops.alterColumn) chosen.push("ALTER COLUMN must be reversed manually");
    if (ops.update || ops.insert || ops.delete) chosen.push("data ops require restore from backup");
    return {
      rollback: `revert commit; manual SQL recovery required (composite migration: ${chosen.join("; ")})`,
      category: "composite",
    };
  }

  // Single-op cases
  if (ops.createIndex) {
    return {
      rollback: "DROP INDEX for indexes created in this migration",
      category: "create-index",
    };
  }
  if (ops.addColumn) {
    return {
      rollback: "ALTER TABLE ... DROP COLUMN for columns added in this migration",
      category: "add-column",
    };
  }
  if (ops.createTable) {
    return {
      rollback: "DROP TABLE for tables created in this migration (cascade if FKs)",
      category: "create-table",
    };
  }
  if (ops.addConstraint) {
    return {
      rollback: "ALTER TABLE ... DROP CONSTRAINT for constraints added in this migration",
      category: "add-constraint",
    };
  }
  if (ops.createFunction) {
    return {
      rollback: "DROP FUNCTION for functions created in this migration",
      category: "create-function",
    };
  }
  if (ops.createType) {
    return { rollback: "DROP TYPE for types created in this migration", category: "create-type" };
  }
  if (ops.alterColumn) {
    return {
      rollback:
        "revert commit; ALTER COLUMN reversal must reproduce the original column definition by hand",
      category: "alter-column",
    };
  }
  if (ops.dropTable || ops.dropColumn || ops.dropConstraint) {
    return {
      rollback:
        "revert commit + restore from backup (DROP is destructive — no schema-only recovery)",
      category: "drop",
    };
  }

  // Empty / unrecognized
  return {
    rollback: "no schema or data effect (migration body is empty or comment-only)",
    category: "noop",
  };
}

function main(): void {
  const dirs = readdirSync(MIGRATIONS_DIR).filter((name) => {
    if (name === "migration_lock.toml") return false;
    return statSync(join(MIGRATIONS_DIR, name)).isDirectory();
  });

  let touched = 0;
  let skipped = 0;
  const byCategory = new Map<string, number>();

  for (const dir of dirs.sort()) {
    const file = join(MIGRATIONS_DIR, dir, "migration.sql");
    let sql: string;
    try {
      sql = readFileSync(file, "utf8");
    } catch {
      console.warn(`⚠ skip (no migration.sql): ${dir}`);
      continue;
    }

    if (/^-- ROLLBACK:/m.test(sql)) {
      skipped += 1;
      continue;
    }

    const verdict = classify(sql);
    byCategory.set(verdict.category, (byCategory.get(verdict.category) ?? 0) + 1);

    const header = `-- ROLLBACK: ${verdict.rollback}\n`;
    writeFileSync(file, header + sql, "utf8");
    touched += 1;
    console.log(`  + ${dir.padEnd(60)} [${verdict.category}]`);
  }

  console.log("\nSummary:");
  console.log(`  retrofitted: ${touched}`);
  console.log(`  skipped (already had ROLLBACK): ${skipped}`);
  console.log(`  by category:`);
  for (const [cat, n] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(20)} ${n}`);
  }
}

main();
