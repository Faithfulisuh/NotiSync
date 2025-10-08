-- Remove indexes
DROP INDEX IF EXISTS idx_user_rules_priority;
DROP INDEX IF EXISTS idx_user_rules_active;

-- Remove new columns
ALTER TABLE user_rules DROP COLUMN IF EXISTS priority;
ALTER TABLE user_rules DROP COLUMN IF EXISTS updated_at;

-- Revert rule type constraint to original
ALTER TABLE user_rules 
DROP CONSTRAINT user_rules_rule_type_check;

ALTER TABLE user_rules 
ADD CONSTRAINT user_rules_rule_type_check 
CHECK (rule_type IN ('app_filter', 'keyword_filter', 'time_based'));