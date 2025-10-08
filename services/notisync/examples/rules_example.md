# Rules Engine Examples

This document demonstrates how to use the NotiSync rules engine to create and manage notification rules.

## Overview

The rules engine allows users to create custom rules that automatically process incoming notifications based on various criteria:

- **App Filters**: Filter notifications based on the source application
- **Keyword Filters**: Filter notifications based on keywords in title or body
- **Time-based Filters**: Filter notifications based on time of day or day of week
- **OTP Always**: Always prioritize OTP/verification code notifications
- **Promotional Mute**: Automatically categorize promotional notifications as junk

## Rule Types and Examples

### 1. App Filter Rules

Filter notifications based on the source application:

```go
// Example: Categorize messaging apps as Personal
appRule := rules.CreateRuleRequest{
    Name:     "Messaging Apps",
    Type:     rules.RuleTypeAppFilter,
    Priority: rules.PriorityMedium,
    Conditions: map[string]interface{}{
        "app_names": []string{"WhatsApp", "Telegram", "Signal"},
    },
    Actions: map[string]interface{}{
        "action":   rules.ActionCategorize,
        "category": types.CategoryPersonal,
    },
}

// Example: Mute social media notifications
socialRule := rules.CreateRuleRequest{
    Name:     "Mute Social Media",
    Type:     rules.RuleTypeAppFilter,
    Priority: rules.PriorityLow,
    Conditions: map[string]interface{}{
        "app_names": []string{"Facebook", "Instagram", "Twitter", "TikTok"},
    },
    Actions: map[string]interface{}{
        "action": rules.ActionMute,
    },
}
```

### 2. Keyword Filter Rules

Filter notifications based on keywords in the content:

```go
// Example: Highlight urgent notifications
urgentRule := rules.CreateRuleRequest{
    Name:     "Urgent Keywords",
    Type:     rules.RuleTypeKeywordFilter,
    Priority: rules.PriorityHigh,
    Conditions: map[string]interface{}{
        "keywords":       []string{"urgent", "important", "asap", "emergency"},
        "match_title":    true,
        "match_body":     true,
        "case_sensitive": false,
    },
    Actions: map[string]interface{}{
        "action":    rules.ActionHighlight,
        "priority":  15,
        "highlight": true,
    },
}

// Example: Filter out spam keywords
spamRule := rules.CreateRuleRequest{
    Name:     "Block Spam",
    Type:     rules.RuleTypeKeywordFilter,
    Priority: rules.PriorityLow,
    Conditions: map[string]interface{}{
        "keywords":     []string{"spam", "scam", "phishing"},
        "match_title":  true,
        "match_body":   true,
        "case_sensitive": false,
    },
    Actions: map[string]interface{}{
        "action": rules.ActionMute,
    },
}
```

### 3. Time-based Rules

Filter notifications based on time constraints:

```go
// Example: Work hours rule (9 AM to 5 PM, Monday to Friday)
workHoursRule := rules.CreateRuleRequest{
    Name:     "Work Hours Only",
    Type:     rules.RuleTypeTimeBased,
    Priority: rules.PriorityMedium,
    Conditions: map[string]interface{}{
        "start_time": "09:00",
        "end_time":   "17:00",
        "weekdays":   []int{1, 2, 3, 4, 5}, // Monday to Friday
        "timezone":   "America/New_York",
    },
    Actions: map[string]interface{}{
        "action":   rules.ActionCategorize,
        "category": types.CategoryWork,
    },
}

// Example: Do not disturb during sleep hours
sleepRule := rules.CreateRuleRequest{
    Name:     "Sleep Hours",
    Type:     rules.RuleTypeTimeBased,
    Priority: rules.PriorityHigh,
    Conditions: map[string]interface{}{
        "start_time": "22:00",
        "end_time":   "07:00",
    },
    Actions: map[string]interface{}{
        "action": rules.ActionMute,
    },
}
```

### 4. OTP Always Rule

Always prioritize OTP and verification code notifications:

```go
// Example: Always show OTP notifications
otpRule := rules.CreateRuleRequest{
    Name:     "Always Show OTP",
    Type:     rules.RuleTypeOTPAlways,
    Priority: rules.PriorityCritical,
    Conditions: map[string]interface{}{},
    Actions: map[string]interface{}{
        "action":    rules.ActionPrioritize,
        "priority":  20,
        "highlight": true,
    },
}
```

### 5. Promotional Mute Rule

Automatically categorize promotional notifications:

```go
// Example: Mute promotional notifications
promoRule := rules.CreateRuleRequest{
    Name:     "Mute Promotional",
    Type:     rules.RuleTypePromoMute,
    Priority: rules.PriorityLow,
    Conditions: map[string]interface{}{},
    Actions: map[string]interface{}{
        "action":   rules.ActionCategorize,
        "category": types.CategoryJunk,
    },
}
```

## Using the Rules Engine

### Creating Rules

```go
// Initialize the rules service
rulesService := rules.NewService(repositories)

// Create a new rule
rule, err := rulesService.CreateRule(userID, ruleRequest)
if err != nil {
    log.Printf("Failed to create rule: %v", err)
    return
}

log.Printf("Created rule: %s", rule.Name)
```

### Applying Rules to Notifications

```go
// Process an incoming notification
notification := &types.Notification{
    UserID:    userID,
    AppName:   "WhatsApp",
    Title:     "New message",
    Body:      "Hello there!",
    Category:  types.CategoryPersonal,
    Priority:  0,
}

// Apply user rules
err := rulesService.ApplyRules(userID, notification)
if err != nil {
    log.Printf("Failed to apply rules: %v", err)
    return
}

log.Printf("Notification processed: Category=%s, Priority=%d", 
    notification.Category, notification.Priority)
```

### Managing Rules

```go
// Get all rules for a user
rules, err := rulesService.GetUserRules(userID)
if err != nil {
    log.Printf("Failed to get user rules: %v", err)
    return
}

// Update a rule
updateRequest := rules.UpdateRuleRequest{
    Name:     &newName,
    IsActive: &false,
}

updatedRule, err := rulesService.UpdateRule(ruleID, updateRequest)
if err != nil {
    log.Printf("Failed to update rule: %v", err)
    return
}

// Delete a rule
err = rulesService.DeleteRule(ruleID)
if err != nil {
    log.Printf("Failed to delete rule: %v", err)
    return
}
```

## Rule Priority and Conflict Resolution

Rules are evaluated in priority order (highest first). When multiple rules match a notification, the highest priority rule's actions are applied:

1. **Critical Priority (20)**: OTP rules, emergency rules
2. **High Priority (10)**: Important keyword filters, urgent notifications
3. **Medium Priority (5)**: App filters, general categorization
4. **Low Priority (1)**: Promotional filters, spam detection

### Example Conflict Resolution

```go
// If a notification matches both rules:
// 1. OTP Rule (Priority: Critical = 20) -> Prioritize notification
// 2. App Rule (Priority: Medium = 5) -> Categorize as Work

// Result: The OTP rule wins, notification gets prioritized
// The app categorization is ignored due to lower priority
```

## Default Rules

When a new user is created, default rules are automatically added:

1. **Always Show OTP**: Prioritizes OTP and verification codes
2. **Mute Promotional**: Categorizes promotional content as junk

```go
// Create default rules for a new user
err := rulesService.CreateDefaultRules(userID)
if err != nil {
    log.Printf("Failed to create default rules: %v", err)
}
```

## Rule Templates

The service provides predefined templates for common use cases:

```go
// Get available rule templates
templates := rulesService.GetRuleTemplates()

for _, template := range templates {
    log.Printf("Template: %s (Type: %s)", template.Name, template.Type)
}
```

## Testing Rules

You can test how a rule would behave against a sample notification:

```go
// Test a rule against a sample notification
sampleNotification := &types.Notification{
    AppName: "Gmail",
    Title:   "Urgent: Server Alert",
    Body:    "The server is down, please check immediately",
}

match, err := rulesService.TestRule(rule, sampleNotification)
if err != nil {
    log.Printf("Failed to test rule: %v", err)
    return
}

if match.Matched {
    log.Printf("Rule would match: Action=%s", match.Actions.Action)
} else {
    log.Printf("Rule would not match")
}
```

## Rule Statistics

Get statistics about a user's rules:

```go
stats, err := rulesService.GetRuleStats(userID)
if err != nil {
    log.Printf("Failed to get rule stats: %v", err)
    return
}

log.Printf("Total rules: %d", stats["total_rules"])
log.Printf("Active rules: %d", stats["active_rules"])
log.Printf("Rule types: %v", stats["rule_types"])
```

## Best Practices

1. **Use appropriate priorities**: Reserve critical priority for truly important rules like OTP detection
2. **Test rules before deploying**: Use the test functionality to verify rule behavior
3. **Keep rules simple**: Complex conditions can be hard to debug and maintain
4. **Monitor rule performance**: Check rule statistics to ensure they're working as expected
5. **Use specific conditions**: More specific rules are less likely to have unintended matches
6. **Regular cleanup**: Remove or disable rules that are no longer needed