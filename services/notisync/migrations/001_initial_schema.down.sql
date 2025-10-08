-- Drop tables in reverse order to handle foreign key constraints
DROP TABLE IF EXISTS notification_actions;
DROP TABLE IF EXISTS user_rules;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS users;

-- Drop extension
DROP EXTENSION IF EXISTS "uuid-ossp";