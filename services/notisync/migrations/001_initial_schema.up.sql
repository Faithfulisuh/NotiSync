-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Devices table
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) NOT NULL CHECK (device_type IN ('mobile', 'web', 'desktop')),
    push_token VARCHAR(512),
    last_seen TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    source_device_id UUID REFERENCES devices(id),
    app_name VARCHAR(255) NOT NULL,
    title VARCHAR(500),
    body TEXT,
    category VARCHAR(50) DEFAULT 'Personal' CHECK (category IN ('Work', 'Personal', 'Junk')),
    priority INTEGER DEFAULT 0,
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days')
);

-- User rules table
CREATE TABLE user_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    rule_name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('app_filter', 'keyword_filter', 'time_based')),
    conditions JSONB NOT NULL,
    actions JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Notification actions table (for sync tracking)
CREATE TABLE notification_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id),
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('read', 'dismissed', 'clicked')),
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_notifications_category ON notifications(category);
CREATE INDEX idx_notifications_expires_at ON notifications(expires_at);
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_user_rules_user_id ON user_rules(user_id);
CREATE INDEX idx_notification_actions_notification_id ON notification_actions(notification_id);
CREATE INDEX idx_notification_actions_device_id ON notification_actions(device_id);