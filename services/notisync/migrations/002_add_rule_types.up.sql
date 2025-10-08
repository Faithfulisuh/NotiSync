-- Add new rule types to the user_rules table
ALTER TABLE user_rules 
DROP CONSTRAINT user_rules_rule_type_check;

ALTER TABLE user_rules 
ADD CONSTRAINT user_rules_rule_type_check 
CHECK (rule_type IN ('app_filter', 'keyword_filter', 'time_based', 'otp_always', 'promo_mute'));

-- Add priority column to user_rules table
ALTER TABLE user_rules 
ADD COLUMN priority INTEGER DEFAULT 5;

-- Add updated_at column to user_rules table
ALTER TABLE user_rules 
ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();

-- Create index on priority for better performance
CREATE INDEX idx_user_rules_priority ON user_rules(priority);
CREATE INDEX idx_user_rules_active ON user_rules(is_active);