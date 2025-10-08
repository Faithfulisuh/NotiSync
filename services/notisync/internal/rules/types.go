package rules

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
)

// RuleType represents the type of rule
type RuleType string

const (
	RuleTypeAppFilter     RuleType = "app_filter"
	RuleTypeKeywordFilter RuleType = "keyword_filter"
	RuleTypeTimeBased     RuleType = "time_based"
	RuleTypeOTPAlways     RuleType = "otp_always"
	RuleTypePromoMute     RuleType = "promo_mute"
)

// RuleAction represents the action to take when a rule matches
type RuleAction string

const (
	ActionAllow      RuleAction = "allow"
	ActionMute       RuleAction = "mute"
	ActionHighlight  RuleAction = "highlight"
	ActionCategorize RuleAction = "categorize"
	ActionPrioritize RuleAction = "prioritize"
)

// RulePriority represents the priority level of a rule
type RulePriority int

const (
	PriorityLow    RulePriority = 1
	PriorityMedium RulePriority = 5
	PriorityHigh   RulePriority = 10
	PriorityCritical RulePriority = 20
)

// Rule represents a user-defined notification rule
type Rule struct {
	ID          uuid.UUID                  `json:"id" db:"id"`
	UserID      uuid.UUID                  `json:"user_id" db:"user_id"`
	Name        string                     `json:"name" db:"rule_name"`
	Type        RuleType                   `json:"type" db:"rule_type"`
	Priority    RulePriority               `json:"priority" db:"priority"`
	IsActive    bool                       `json:"is_active" db:"is_active"`
	Conditions  map[string]interface{}     `json:"conditions" db:"conditions"`
	Actions     map[string]interface{}     `json:"actions" db:"actions"`
	CreatedAt   time.Time                  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time                  `json:"updated_at" db:"updated_at"`
}

// AppFilterConditions represents conditions for app-based filtering
type AppFilterConditions struct {
	AppNames    []string `json:"app_names"`
	ExcludeApps []string `json:"exclude_apps,omitempty"`
}

// KeywordFilterConditions represents conditions for keyword-based filtering
type KeywordFilterConditions struct {
	Keywords        []string `json:"keywords"`
	ExcludeKeywords []string `json:"exclude_keywords,omitempty"`
	CaseSensitive   bool     `json:"case_sensitive"`
	MatchTitle      bool     `json:"match_title"`
	MatchBody       bool     `json:"match_body"`
}

// TimeBasedConditions represents conditions for time-based filtering
type TimeBasedConditions struct {
	StartTime   string   `json:"start_time"`   // HH:MM format
	EndTime     string   `json:"end_time"`     // HH:MM format
	Weekdays    []int    `json:"weekdays"`     // 0=Sunday, 1=Monday, etc.
	Timezone    string   `json:"timezone"`     // IANA timezone
	DateRanges  []string `json:"date_ranges,omitempty"` // YYYY-MM-DD format
}

// RuleActions represents the actions to take when a rule matches
type RuleActions struct {
	Action       RuleAction                 `json:"action"`
	Category     types.NotificationCategory `json:"category,omitempty"`
	Priority     int                        `json:"priority,omitempty"`
	Mute         bool                       `json:"mute,omitempty"`
	Highlight    bool                       `json:"highlight,omitempty"`
	CustomData   map[string]interface{}     `json:"custom_data,omitempty"`
}

// RuleMatch represents the result of rule evaluation
type RuleMatch struct {
	Rule     *Rule      `json:"rule"`
	Matched  bool       `json:"matched"`
	Actions  RuleActions `json:"actions"`
	Priority RulePriority `json:"priority"`
}

// CreateRuleRequest represents a request to create a new rule
type CreateRuleRequest struct {
	Name       string                     `json:"name" binding:"required"`
	Type       RuleType                   `json:"type" binding:"required"`
	Priority   RulePriority               `json:"priority"`
	Conditions map[string]interface{}     `json:"conditions" binding:"required"`
	Actions    map[string]interface{}     `json:"actions" binding:"required"`
}

// UpdateRuleRequest represents a request to update an existing rule
type UpdateRuleRequest struct {
	Name       *string                    `json:"name,omitempty"`
	Priority   *RulePriority              `json:"priority,omitempty"`
	IsActive   *bool                      `json:"is_active,omitempty"`
	Conditions map[string]interface{}     `json:"conditions,omitempty"`
	Actions    map[string]interface{}     `json:"actions,omitempty"`
}

// SetDefaults sets default values for a rule
func (r *Rule) SetDefaults() {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	if r.Priority == 0 {
		r.Priority = PriorityMedium
	}
	if r.CreatedAt.IsZero() {
		r.CreatedAt = time.Now()
	}
	r.UpdatedAt = time.Now()
	r.IsActive = true
}

// Validate validates the rule structure
func (r *Rule) Validate() error {
	if r.UserID == uuid.Nil {
		return fmt.Errorf("user_id is required")
	}
	if r.Name == "" {
		return fmt.Errorf("rule name is required")
	}
	if r.Type == "" {
		return fmt.Errorf("rule type is required")
	}
	if r.Conditions == nil {
		return fmt.Errorf("conditions are required")
	}
	if r.Actions == nil {
		return fmt.Errorf("actions are required")
	}

	// Validate rule type
	switch r.Type {
	case RuleTypeAppFilter, RuleTypeKeywordFilter, RuleTypeTimeBased, RuleTypeOTPAlways, RuleTypePromoMute:
		// Valid types
	default:
		return fmt.Errorf("invalid rule type: %s", r.Type)
	}

	return nil
}

// GetConditions returns typed conditions based on rule type
func (r *Rule) GetConditions() (interface{}, error) {
	conditionsJSON, err := json.Marshal(r.Conditions)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal conditions: %w", err)
	}

	switch r.Type {
	case RuleTypeAppFilter:
		var conditions AppFilterConditions
		if err := json.Unmarshal(conditionsJSON, &conditions); err != nil {
			return nil, fmt.Errorf("failed to unmarshal app filter conditions: %w", err)
		}
		return conditions, nil

	case RuleTypeKeywordFilter:
		var conditions KeywordFilterConditions
		if err := json.Unmarshal(conditionsJSON, &conditions); err != nil {
			return nil, fmt.Errorf("failed to unmarshal keyword filter conditions: %w", err)
		}
		return conditions, nil

	case RuleTypeTimeBased:
		var conditions TimeBasedConditions
		if err := json.Unmarshal(conditionsJSON, &conditions); err != nil {
			return nil, fmt.Errorf("failed to unmarshal time-based conditions: %w", err)
		}
		return conditions, nil

	case RuleTypeOTPAlways, RuleTypePromoMute:
		// These types don't need specific conditions
		return map[string]interface{}{}, nil

	default:
		return nil, fmt.Errorf("unknown rule type: %s", r.Type)
	}
}

// GetActions returns typed actions
func (r *Rule) GetActions() (RuleActions, error) {
	actionsJSON, err := json.Marshal(r.Actions)
	if err != nil {
		return RuleActions{}, fmt.Errorf("failed to marshal actions: %w", err)
	}

	var actions RuleActions
	if err := json.Unmarshal(actionsJSON, &actions); err != nil {
		return RuleActions{}, fmt.Errorf("failed to unmarshal actions: %w", err)
	}

	return actions, nil
}

// ToCreateRequest converts a rule to a create request
func (r *Rule) ToCreateRequest() CreateRuleRequest {
	return CreateRuleRequest{
		Name:       r.Name,
		Type:       r.Type,
		Priority:   r.Priority,
		Conditions: r.Conditions,
		Actions:    r.Actions,
	}
}

// ApplyUpdate applies an update request to the rule
func (r *Rule) ApplyUpdate(req UpdateRuleRequest) {
	if req.Name != nil {
		r.Name = *req.Name
	}
	if req.Priority != nil {
		r.Priority = *req.Priority
	}
	if req.IsActive != nil {
		r.IsActive = *req.IsActive
	}
	if req.Conditions != nil {
		r.Conditions = req.Conditions
	}
	if req.Actions != nil {
		r.Actions = req.Actions
	}
	r.UpdatedAt = time.Now()
}