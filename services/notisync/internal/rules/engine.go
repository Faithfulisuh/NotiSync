package rules

import (
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
)

// Engine handles rule evaluation and management
type Engine struct {
	repository RuleRepository
}

// RuleRepository defines the interface for rule storage
type RuleRepository interface {
	Create(rule *Rule) error
	GetByID(id uuid.UUID) (*Rule, error)
	GetByUserID(userID uuid.UUID) ([]*Rule, error)
	Update(rule *Rule) error
	Delete(id uuid.UUID) error
	GetActiveByUserID(userID uuid.UUID) ([]*Rule, error)
}

// NewEngine creates a new rule engine
func NewEngine(repository RuleRepository) *Engine {
	return &Engine{
		repository: repository,
	}
}

// EvaluateNotification evaluates all rules for a user against a notification
func (e *Engine) EvaluateNotification(userID uuid.UUID, notification *types.Notification) ([]RuleMatch, error) {
	// Get all active rules for the user
	rules, err := e.repository.GetActiveByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user rules: %w", err)
	}

	var matches []RuleMatch

	// Evaluate each rule
	for _, rule := range rules {
		match, err := e.evaluateRule(rule, notification)
		if err != nil {
			log.Printf("Failed to evaluate rule %s: %v", rule.ID, err)
			continue
		}

		if match.Matched {
			matches = append(matches, match)
		}
	}

	// Sort matches by priority (highest first)
	sort.Slice(matches, func(i, j int) bool {
		return matches[i].Priority > matches[j].Priority
	})

	return matches, nil
}

// evaluateRule evaluates a single rule against a notification
func (e *Engine) evaluateRule(rule *Rule, notification *types.Notification) (RuleMatch, error) {
	match := RuleMatch{
		Rule:     rule,
		Matched:  false,
		Priority: rule.Priority,
	}

	// Get rule actions
	actions, err := rule.GetActions()
	if err != nil {
		return match, fmt.Errorf("failed to get rule actions: %w", err)
	}
	match.Actions = actions

	// Evaluate based on rule type
	switch rule.Type {
	case RuleTypeAppFilter:
		match.Matched = e.evaluateAppFilter(rule, notification)

	case RuleTypeKeywordFilter:
		match.Matched = e.evaluateKeywordFilter(rule, notification)

	case RuleTypeTimeBased:
		match.Matched = e.evaluateTimeBased(rule, notification)

	case RuleTypeOTPAlways:
		match.Matched = e.evaluateOTPAlways(notification)

	case RuleTypePromoMute:
		match.Matched = e.evaluatePromoMute(notification)

	default:
		return match, fmt.Errorf("unknown rule type: %s", rule.Type)
	}

	return match, nil
}

// evaluateAppFilter evaluates app-based filtering rules
func (e *Engine) evaluateAppFilter(rule *Rule, notification *types.Notification) bool {
	conditions, err := rule.GetConditions()
	if err != nil {
		log.Printf("Failed to get app filter conditions: %v", err)
		return false
	}

	appConditions, ok := conditions.(AppFilterConditions)
	if !ok {
		log.Printf("Invalid app filter conditions type")
		return false
	}

	appName := strings.ToLower(notification.AppName)

	// Check if app is in exclude list
	for _, excludeApp := range appConditions.ExcludeApps {
		if strings.ToLower(excludeApp) == appName {
			return false
		}
	}

	// Check if app is in include list
	for _, includeApp := range appConditions.AppNames {
		if strings.ToLower(includeApp) == appName {
			return true
		}
	}

	return false
}

// evaluateKeywordFilter evaluates keyword-based filtering rules
func (e *Engine) evaluateKeywordFilter(rule *Rule, notification *types.Notification) bool {
	conditions, err := rule.GetConditions()
	if err != nil {
		log.Printf("Failed to get keyword filter conditions: %v", err)
		return false
	}

	keywordConditions, ok := conditions.(KeywordFilterConditions)
	if !ok {
		log.Printf("Invalid keyword filter conditions type")
		return false
	}

	// Prepare text to search
	var searchText string
	if keywordConditions.MatchTitle {
		searchText += notification.Title + " "
	}
	if keywordConditions.MatchBody {
		searchText += notification.Body + " "
	}

	if !keywordConditions.CaseSensitive {
		searchText = strings.ToLower(searchText)
	}

	// Check exclude keywords first
	for _, excludeKeyword := range keywordConditions.ExcludeKeywords {
		keyword := excludeKeyword
		if !keywordConditions.CaseSensitive {
			keyword = strings.ToLower(keyword)
		}
		if strings.Contains(searchText, keyword) {
			return false
		}
	}

	// Check include keywords
	for _, includeKeyword := range keywordConditions.Keywords {
		keyword := includeKeyword
		if !keywordConditions.CaseSensitive {
			keyword = strings.ToLower(keyword)
		}
		if strings.Contains(searchText, keyword) {
			return true
		}
	}

	return false
}

// evaluateTimeBased evaluates time-based filtering rules
func (e *Engine) evaluateTimeBased(rule *Rule, notification *types.Notification) bool {
	conditions, err := rule.GetConditions()
	if err != nil {
		log.Printf("Failed to get time-based conditions: %v", err)
		return false
	}

	timeConditions, ok := conditions.(TimeBasedConditions)
	if !ok {
		log.Printf("Invalid time-based conditions type")
		return false
	}

	now := notification.CreatedAt
	if timeConditions.Timezone != "" {
		loc, err := time.LoadLocation(timeConditions.Timezone)
		if err != nil {
			log.Printf("Invalid timezone %s: %v", timeConditions.Timezone, err)
		} else {
			now = now.In(loc)
		}
	}

	// Check weekdays
	if len(timeConditions.Weekdays) > 0 {
		weekday := int(now.Weekday())
		found := false
		for _, allowedWeekday := range timeConditions.Weekdays {
			if weekday == allowedWeekday {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Check time range
	if timeConditions.StartTime != "" && timeConditions.EndTime != "" {
		currentTime := now.Format("15:04")
		
		// Handle time ranges that cross midnight
		if timeConditions.StartTime <= timeConditions.EndTime {
			// Normal range (e.g., 09:00 to 17:00)
			if currentTime < timeConditions.StartTime || currentTime > timeConditions.EndTime {
				return false
			}
		} else {
			// Range crosses midnight (e.g., 22:00 to 06:00)
			if currentTime < timeConditions.StartTime && currentTime > timeConditions.EndTime {
				return false
			}
		}
	}

	// Check date ranges
	if len(timeConditions.DateRanges) > 0 {
		currentDate := now.Format("2006-01-02")
		found := false
		for _, dateRange := range timeConditions.DateRanges {
			if currentDate == dateRange {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	return true
}

// evaluateOTPAlways evaluates the "always show OTP" rule
func (e *Engine) evaluateOTPAlways(notification *types.Notification) bool {
	text := strings.ToLower(notification.Title + " " + notification.Body)

	// Check for OTP patterns in title and body
	otpPatterns := []string{
		"otp", "one time password", "auth code",
		"security code", "login code", "2fa", "two factor",
		"confirmation code", "access code",
	}

	// First check for explicit OTP keywords
	for _, pattern := range otpPatterns {
		if strings.Contains(text, pattern) {
			return true
		}
	}

	// For "verification code" and "verify", also check if there's a numeric code
	verificationPatterns := []string{"verification code", "verify"}
	for _, pattern := range verificationPatterns {
		if strings.Contains(text, pattern) {
			// Check if there's a numeric code in the text
			if e.containsNumericCode(text) {
				return true
			}
		}
	}

	// Check for standalone numeric patterns that might be OTP codes
	// Look for 4-8 digit numbers
	words := strings.Fields(text)
	for _, word := range words {
		// Remove common separators
		cleanWord := strings.ReplaceAll(word, "-", "")
		cleanWord = strings.ReplaceAll(cleanWord, " ", "")
		
		// Check if it's a 4-8 digit number
		if len(cleanWord) >= 4 && len(cleanWord) <= 8 {
			isNumeric := true
			for _, char := range cleanWord {
				if char < '0' || char > '9' {
					isNumeric = false
					break
				}
			}
			if isNumeric {
				return true
			}
		}
	}

	return false
}

// containsNumericCode checks if the text contains a numeric code pattern
func (e *Engine) containsNumericCode(text string) bool {
	words := strings.Fields(text)
	for _, word := range words {
		// Remove common separators
		cleanWord := strings.ReplaceAll(word, "-", "")
		cleanWord = strings.ReplaceAll(cleanWord, " ", "")
		cleanWord = strings.ReplaceAll(cleanWord, ":", "")
		
		// Check if it's a 4-8 digit number
		if len(cleanWord) >= 4 && len(cleanWord) <= 8 {
			isNumeric := true
			for _, char := range cleanWord {
				if char < '0' || char > '9' {
					isNumeric = false
					break
				}
			}
			if isNumeric {
				return true
			}
		}
	}
	return false
}

// evaluatePromoMute evaluates the "mute promotional" rule
func (e *Engine) evaluatePromoMute(notification *types.Notification) bool {
	// Use the existing promotional detection from notification model
	return notification.IsPromotional()
}

// ApplyRules applies the highest priority matching rule to a notification
func (e *Engine) ApplyRules(userID uuid.UUID, notification *types.Notification) error {
	matches, err := e.EvaluateNotification(userID, notification)
	if err != nil {
		return fmt.Errorf("failed to evaluate rules: %w", err)
	}

	if len(matches) == 0 {
		return nil // No rules matched
	}

	// Apply the highest priority rule (first in sorted list)
	highestMatch := matches[0]
	actions := highestMatch.Actions

	// Apply actions
	switch actions.Action {
	case ActionMute:
		notification.IsDismissed = true
		log.Printf("Rule %s muted notification %s", highestMatch.Rule.Name, notification.ID)

	case ActionHighlight:
		notification.Priority = 10 // High priority
		log.Printf("Rule %s highlighted notification %s", highestMatch.Rule.Name, notification.ID)

	case ActionCategorize:
		if actions.Category != "" {
			notification.Category = actions.Category
			log.Printf("Rule %s categorized notification %s as %s", highestMatch.Rule.Name, notification.ID, actions.Category)
		}

	case ActionPrioritize:
		if actions.Priority > 0 {
			notification.Priority = actions.Priority
			log.Printf("Rule %s set priority %d for notification %s", highestMatch.Rule.Name, actions.Priority, notification.ID)
		}

	case ActionAllow:
		// Explicitly allow - no changes needed
		log.Printf("Rule %s allowed notification %s", highestMatch.Rule.Name, notification.ID)
	}

	return nil
}

// CreateRule creates a new rule for a user
func (e *Engine) CreateRule(userID uuid.UUID, req CreateRuleRequest) (*Rule, error) {
	rule := &Rule{
		UserID:     userID,
		Name:       req.Name,
		Type:       req.Type,
		Priority:   req.Priority,
		Conditions: req.Conditions,
		Actions:    req.Actions,
	}

	rule.SetDefaults()

	if err := rule.Validate(); err != nil {
		return nil, fmt.Errorf("rule validation failed: %w", err)
	}

	if err := e.repository.Create(rule); err != nil {
		return nil, fmt.Errorf("failed to create rule: %w", err)
	}

	return rule, nil
}

// GetUserRules retrieves all rules for a user
func (e *Engine) GetUserRules(userID uuid.UUID) ([]*Rule, error) {
	rules, err := e.repository.GetByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user rules: %w", err)
	}

	return rules, nil
}

// GetRule retrieves a specific rule by ID
func (e *Engine) GetRule(ruleID uuid.UUID) (*Rule, error) {
	rule, err := e.repository.GetByID(ruleID)
	if err != nil {
		return nil, fmt.Errorf("failed to get rule: %w", err)
	}

	return rule, nil
}

// UpdateRule updates an existing rule
func (e *Engine) UpdateRule(ruleID uuid.UUID, req UpdateRuleRequest) (*Rule, error) {
	rule, err := e.repository.GetByID(ruleID)
	if err != nil {
		return nil, fmt.Errorf("failed to get rule: %w", err)
	}

	rule.ApplyUpdate(req)

	if err := rule.Validate(); err != nil {
		return nil, fmt.Errorf("rule validation failed: %w", err)
	}

	if err := e.repository.Update(rule); err != nil {
		return nil, fmt.Errorf("failed to update rule: %w", err)
	}

	return rule, nil
}

// DeleteRule deletes a rule
func (e *Engine) DeleteRule(ruleID uuid.UUID) error {
	if err := e.repository.Delete(ruleID); err != nil {
		return fmt.Errorf("failed to delete rule: %w", err)
	}

	return nil
}

// CreateDefaultRules creates default rules for a new user
func (e *Engine) CreateDefaultRules(userID uuid.UUID) error {
	// Default OTP rule
	otpRule := CreateRuleRequest{
		Name:     "Always Show OTP",
		Type:     RuleTypeOTPAlways,
		Priority: PriorityCritical,
		Conditions: map[string]interface{}{},
		Actions: map[string]interface{}{
			"action":    ActionPrioritize,
			"priority":  20,
			"highlight": true,
		},
	}

	if _, err := e.CreateRule(userID, otpRule); err != nil {
		log.Printf("Failed to create default OTP rule for user %s: %v", userID, err)
	}

	// Default promotional mute rule
	promoRule := CreateRuleRequest{
		Name:     "Mute Promotional",
		Type:     RuleTypePromoMute,
		Priority: PriorityLow,
		Conditions: map[string]interface{}{},
		Actions: map[string]interface{}{
			"action":   ActionCategorize,
			"category": types.CategoryJunk,
		},
	}

	if _, err := e.CreateRule(userID, promoRule); err != nil {
		log.Printf("Failed to create default promotional rule for user %s: %v", userID, err)
	}

	return nil
}