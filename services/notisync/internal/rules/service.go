package rules

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/repository"
	"github.com/notisync/backend/internal/types"
)

// Service provides rule management functionality
type Service struct {
	engine *Engine
	repo   RuleRepository
}

// NewService creates a new rules service
func NewService(repos *repository.InterfaceRepositories) *Service {
	repo := NewRepositoryAdapter(repos.UserRule)
	engine := NewEngine(repo)

	return &Service{
		engine: engine,
		repo:   repo,
	}
}

// CreateRule creates a new rule for a user
func (s *Service) CreateRule(userID uuid.UUID, req CreateRuleRequest) (*Rule, error) {
	return s.engine.CreateRule(userID, req)
}

// GetUserRules retrieves all rules for a user
func (s *Service) GetUserRules(userID uuid.UUID) ([]*Rule, error) {
	return s.engine.GetUserRules(userID)
}

// GetRule retrieves a specific rule by ID
func (s *Service) GetRule(ruleID uuid.UUID) (*Rule, error) {
	return s.engine.GetRule(ruleID)
}

// UpdateRule updates an existing rule
func (s *Service) UpdateRule(ruleID uuid.UUID, req UpdateRuleRequest) (*Rule, error) {
	return s.engine.UpdateRule(ruleID, req)
}

// DeleteRule deletes a rule
func (s *Service) DeleteRule(ruleID uuid.UUID) error {
	return s.engine.DeleteRule(ruleID)
}

// EvaluateNotification evaluates all rules for a user against a notification
func (s *Service) EvaluateNotification(userID uuid.UUID, notification *types.Notification) ([]RuleMatch, error) {
	return s.engine.EvaluateNotification(userID, notification)
}

// ApplyRules applies the highest priority matching rule to a notification
func (s *Service) ApplyRules(userID uuid.UUID, notification *types.Notification) error {
	return s.engine.ApplyRules(userID, notification)
}

// CreateDefaultRules creates default rules for a new user
func (s *Service) CreateDefaultRules(userID uuid.UUID) error {
	return s.engine.CreateDefaultRules(userID)
}

// ValidateRuleRequest validates a rule creation/update request
func (s *Service) ValidateRuleRequest(req CreateRuleRequest) error {
	if req.Name == "" {
		return fmt.Errorf("rule name is required")
	}

	if req.Type == "" {
		return fmt.Errorf("rule type is required")
	}

	// Validate rule type
	switch req.Type {
	case RuleTypeAppFilter, RuleTypeKeywordFilter, RuleTypeTimeBased, RuleTypeOTPAlways, RuleTypePromoMute:
		// Valid types
	default:
		return fmt.Errorf("invalid rule type: %s", req.Type)
	}

	// Validate conditions based on rule type
	switch req.Type {
	case RuleTypeAppFilter:
		if err := s.validateAppFilterConditions(req.Conditions); err != nil {
			return fmt.Errorf("invalid app filter conditions: %w", err)
		}

	case RuleTypeKeywordFilter:
		if err := s.validateKeywordFilterConditions(req.Conditions); err != nil {
			return fmt.Errorf("invalid keyword filter conditions: %w", err)
		}

	case RuleTypeTimeBased:
		if err := s.validateTimeBasedConditions(req.Conditions); err != nil {
			return fmt.Errorf("invalid time-based conditions: %w", err)
		}
	}

	// Validate actions
	if err := s.validateActions(req.Actions); err != nil {
		return fmt.Errorf("invalid actions: %w", err)
	}

	return nil
}

// validateAppFilterConditions validates app filter conditions
func (s *Service) validateAppFilterConditions(conditions map[string]interface{}) error {
	appNames, exists := conditions["app_names"]
	if !exists {
		return fmt.Errorf("app_names is required")
	}

	appNamesSlice, ok := appNames.([]interface{})
	if !ok {
		return fmt.Errorf("app_names must be an array")
	}

	if len(appNamesSlice) == 0 {
		return fmt.Errorf("at least one app name is required")
	}

	// Validate that all app names are strings
	for i, appName := range appNamesSlice {
		if _, ok := appName.(string); !ok {
			return fmt.Errorf("app_names[%d] must be a string", i)
		}
	}

	return nil
}

// validateKeywordFilterConditions validates keyword filter conditions
func (s *Service) validateKeywordFilterConditions(conditions map[string]interface{}) error {
	keywords, exists := conditions["keywords"]
	if !exists {
		return fmt.Errorf("keywords is required")
	}

	keywordsSlice, ok := keywords.([]interface{})
	if !ok {
		return fmt.Errorf("keywords must be an array")
	}

	if len(keywordsSlice) == 0 {
		return fmt.Errorf("at least one keyword is required")
	}

	// Validate that all keywords are strings
	for i, keyword := range keywordsSlice {
		if _, ok := keyword.(string); !ok {
			return fmt.Errorf("keywords[%d] must be a string", i)
		}
	}

	return nil
}

// validateTimeBasedConditions validates time-based conditions
func (s *Service) validateTimeBasedConditions(conditions map[string]interface{}) error {
	// At least one time constraint should be specified
	hasConstraint := false

	if startTime, exists := conditions["start_time"]; exists {
		if _, ok := startTime.(string); !ok {
			return fmt.Errorf("start_time must be a string")
		}
		hasConstraint = true
	}

	if endTime, exists := conditions["end_time"]; exists {
		if _, ok := endTime.(string); !ok {
			return fmt.Errorf("end_time must be a string")
		}
		hasConstraint = true
	}

	if weekdays, exists := conditions["weekdays"]; exists {
		weekdaysSlice, ok := weekdays.([]interface{})
		if !ok {
			return fmt.Errorf("weekdays must be an array")
		}

		for i, weekday := range weekdaysSlice {
			weekdayFloat, ok := weekday.(float64)
			if !ok {
				return fmt.Errorf("weekdays[%d] must be a number", i)
			}
			weekdayInt := int(weekdayFloat)
			if weekdayInt < 0 || weekdayInt > 6 {
				return fmt.Errorf("weekdays[%d] must be between 0 and 6", i)
			}
		}
		hasConstraint = true
	}

	if !hasConstraint {
		return fmt.Errorf("at least one time constraint (start_time, end_time, or weekdays) is required")
	}

	return nil
}

// validateActions validates rule actions
func (s *Service) validateActions(actions map[string]interface{}) error {
	action, exists := actions["action"]
	if !exists {
		return fmt.Errorf("action is required")
	}

	actionStr, ok := action.(string)
	if !ok {
		return fmt.Errorf("action must be a string")
	}

	// Validate action type
	switch RuleAction(actionStr) {
	case ActionAllow, ActionMute, ActionHighlight, ActionCategorize, ActionPrioritize:
		// Valid actions
	default:
		return fmt.Errorf("invalid action: %s", actionStr)
	}

	// Validate action-specific parameters
	if actionStr == string(ActionCategorize) {
		category, exists := actions["category"]
		if exists {
			categoryStr, ok := category.(string)
			if !ok {
				return fmt.Errorf("category must be a string")
			}

			// Validate category
			switch types.NotificationCategory(categoryStr) {
			case types.CategoryWork, types.CategoryPersonal, types.CategoryJunk:
				// Valid categories
			default:
				return fmt.Errorf("invalid category: %s", categoryStr)
			}
		}
	}

	if actionStr == string(ActionPrioritize) {
		if priority, exists := actions["priority"]; exists {
			priorityFloat, ok := priority.(float64)
			if !ok {
				return fmt.Errorf("priority must be a number")
			}
			priorityInt := int(priorityFloat)
			if priorityInt < 0 || priorityInt > 100 {
				return fmt.Errorf("priority must be between 0 and 100")
			}
		}
	}

	return nil
}

// GetRuleTemplates returns predefined rule templates for common use cases
func (s *Service) GetRuleTemplates() []CreateRuleRequest {
	return []CreateRuleRequest{
		{
			Name:     "Always Show OTP",
			Type:     RuleTypeOTPAlways,
			Priority: PriorityCritical,
			Conditions: map[string]interface{}{},
			Actions: map[string]interface{}{
				"action":    ActionPrioritize,
				"priority":  20,
				"highlight": true,
			},
		},
		{
			Name:     "Mute Promotional",
			Type:     RuleTypePromoMute,
			Priority: PriorityLow,
			Conditions: map[string]interface{}{},
			Actions: map[string]interface{}{
				"action":   ActionCategorize,
				"category": types.CategoryJunk,
			},
		},
		{
			Name:     "Work Hours Only",
			Type:     RuleTypeTimeBased,
			Priority: PriorityMedium,
			Conditions: map[string]interface{}{
				"start_time": "09:00",
				"end_time":   "17:00",
				"weekdays":   []int{1, 2, 3, 4, 5}, // Monday to Friday
			},
			Actions: map[string]interface{}{
				"action":   ActionCategorize,
				"category": types.CategoryWork,
			},
		},
		{
			Name:     "Mute Social Media",
			Type:     RuleTypeAppFilter,
			Priority: PriorityLow,
			Conditions: map[string]interface{}{
				"app_names": []string{"Facebook", "Instagram", "Twitter", "TikTok", "Snapchat"},
			},
			Actions: map[string]interface{}{
				"action": ActionMute,
			},
		},
		{
			Name:     "Highlight Important Keywords",
			Type:     RuleTypeKeywordFilter,
			Priority: PriorityHigh,
			Conditions: map[string]interface{}{
				"keywords":     []string{"urgent", "important", "asap", "emergency"},
				"match_title":  true,
				"match_body":   true,
				"case_sensitive": false,
			},
			Actions: map[string]interface{}{
				"action":    ActionHighlight,
				"priority":  15,
				"highlight": true,
			},
		},
	}
}

// TestRule tests a rule against a sample notification
func (s *Service) TestRule(rule *Rule, notification *types.Notification) (RuleMatch, error) {
	return s.engine.evaluateRule(rule, notification)
}

// GetRuleStats returns statistics about rules for a user
func (s *Service) GetRuleStats(userID uuid.UUID) (map[string]interface{}, error) {
	rules, err := s.GetUserRules(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user rules: %w", err)
	}

	stats := map[string]interface{}{
		"total_rules":  len(rules),
		"active_rules": 0,
		"rule_types":   make(map[string]int),
	}

	for _, rule := range rules {
		if rule.IsActive {
			stats["active_rules"] = stats["active_rules"].(int) + 1
		}

		ruleTypeCount := stats["rule_types"].(map[string]int)
		ruleTypeCount[string(rule.Type)]++
	}

	return stats, nil
}