-- ROLLBACK: revert commit; manual SQL recovery required (composite migration: ALTER TABLE DROP COLUMN for new columns; DROP INDEX for new indexes)
-- Add source column to call_logs for distinguishing API / SDK / MCP calls
ALTER TABLE call_logs ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'api';
CREATE INDEX idx_call_logs_source ON call_logs(source);
