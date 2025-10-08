package rules

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/repository"
	"github.com/notisync/backend/internal/types"
)

// RepositoryAdapter adapts the existing UserRuleRepository to work with the new Rule types
type RepositoryAdapter struct {
	userRuleRepo repository.UserRuleRepositoryInterface
}

// NewRepositoryAdapter creates a new repository adapter
func NewRepositoryAdapter(userRuleRepo repository.UserRuleRepositoryInterface) *RepositoryAdapter {
	return &RepositoryAdapter{
		userRuleRepo: userRuleRepo,
	}
}

// Create creates a new rule
func (r *RepositoryAdapter) Create(rule *Rule) error {
	userRule := r.ruleToUserRule(rule)
	return r.userRuleRepo.Create(userRule)
}

// GetByID retrieves a rule by ID
func (r *RepositoryAdapter) GetByID(id uuid.UUID) (*Rule, error) {
	userRule, err := r.userRuleRepo.GetByID(id)
	if err != nil {
		return nil, err
	}
	return r.userRuleToRule(userRule)
}

// GetByUserID retrieves all rules for a user
func (r *RepositoryAdapter) GetByUserID(userID uuid.UUID) ([]*Rule, error) {
	userRules, err := r.userRuleRepo.GetByUserID(userID)
	if err != nil {
		return nil, err
	}

	rules := make([]*Rule, len(userRules))
	for i, userRule := range userRules {
		rule, err := r.userRuleToRule(userRule)
		if err != nil {
			return nil, fmt.Errorf("failed to convert user rule %s: %w", userRule.ID, err)
		}
		rules[i] = rule
	}

	return rules, nil
}

// GetActiveByUserID retrieves all active rules for a user
func (r *RepositoryAdapter) GetActiveByUserID(userID uuid.UUID) ([]*Rule, error) {
	userRules, err := r.userRuleRepo.GetActiveByUserID(userID)
	if err != nil {
		return nil, err
	}

	rules := make([]*Rule, len(userRules))
	for i, userRule := range userRules {
		rule, err := r.userRuleToRule(userRule)
		if err != nil {
			return nil, fmt.Errorf("failed to convert user rule %s: %w", userRule.ID, err)
		}
		rules[i] = rule
	}

	return rules, nil
}

// Update updates an existing rule
func (r *RepositoryAdapter) Update(rule *Rule) error {
	userRule := r.ruleToUserRule(rule)
	return r.userRuleRepo.Update(userRule)
}

// Delete deletes a rule
func (r *RepositoryAdapter) Delete(id uuid.UUID) error {
	return r.userRuleRepo.Delete(id)
}

// ruleToUserRule converts a Rule to a types.UserRule
func (r *RepositoryAdapter) ruleToUserRule(rule *Rule) *types.UserRule {
	return &types.UserRule{
		ID:         rule.ID,
		UserID:     rule.UserID,
		RuleName:   rule.Name,
		RuleType:   string(rule.Type),
		Conditions: rule.Conditions,
		Actions:    rule.Actions,
		IsActive:   rule.IsActive,
		CreatedAt:  rule.CreatedAt,
	}
}

// userRuleToRule converts a types.UserRule to a Rule
func (r *RepositoryAdapter) userRuleToRule(userRule *types.UserRule) (*Rule, error) {
	// Convert conditions and actions to map[string]interface{}
	conditions, ok := userRule.Conditions.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid conditions type")
	}

	actions, ok := userRule.Actions.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid actions type")
	}

	// Extract priority from actions if it exists
	priority := PriorityMedium
	if p, exists := actions["priority"]; exists {
		if pInt, ok := p.(float64); ok {
			priority = RulePriority(int(pInt))
		}
	}

	rule := &Rule{
		ID:         userRule.ID,
		UserID:     userRule.UserID,
		Name:       userRule.RuleName,
		Type:       RuleType(userRule.RuleType),
		Priority:   priority,
		IsActive:   userRule.IsActive,
		Conditions: conditions,
		Actions:    actions,
		CreatedAt:  userRule.CreatedAt,
		UpdatedAt:  userRule.CreatedAt, // Use CreatedAt as UpdatedAt for existing rules
	}

	return rule, nil
}