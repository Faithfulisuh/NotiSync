package rules

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// TestRulesEngineIntegration tests the complete rules engine workflow
func TestRulesEngineIntegration(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	userID := uuid.New()

	// Create test rules
	otpRule := &Rule{
		ID:       uuid.New(),
		UserID:   userID,
		Name:     "Always Show OTP",
		Type:     RuleTypeOTPAlways,
		Priority: PriorityCritical,
		IsActive: true,
		Conditions: map[string]interface{}{},
		Actions: map[string]interface{}{
			"action":    ActionPrioritize,
			"priority":  20,
			"highlight": true,
		},
	}

	promoRule := &Rule{
		ID:       uuid.New(),
		UserID:   userID,
		Name:     "Mute Promotional",
		Type:     RuleTypePromoMute,
		Priority: PriorityLow,
		IsActive: true,
		Conditions: map[string]interface{}{},
		Actions: map[string]interface{}{
			"action":   ActionCategorize,
			"category": types.CategoryJunk,
		},
	}

	appRule := &Rule{
		ID:       uuid.New(),
		UserID:   userID,
		Name:     "Work Apps",
		Type:     RuleTypeAppFilter,
		Priority: PriorityMedium,
		IsActive: true,
		Conditions: map[string]interface{}{
			"app_names": []string{"Slack", "Teams"},
		},
		Actions: map[string]interface{}{
			"action":   ActionCategorize,
			"category": types.CategoryWork,
		},
	}

	rules := []*Rule{otpRule, promoRule, appRule}
	mockRepo.On("GetActiveByUserID", userID).Return(rules, nil)

	// Test 1: OTP notification should be prioritized (highest priority rule wins)
	otpNotification := &types.Notification{
		ID:        uuid.New(),
		UserID:    userID,
		AppName:   "Banking",
		Title:     "Your OTP is 123456",
		Body:      "Use this code to login",
		Priority:  0,
		CreatedAt: time.Now(),
	}

	err := engine.ApplyRules(userID, otpNotification)
	assert.NoError(t, err)
	assert.Equal(t, 20, otpNotification.Priority, "OTP notification should have high priority")

	// Test 2: Promotional notification should be categorized as junk
	promoNotification := &types.Notification{
		ID:        uuid.New(),
		UserID:    userID,
		AppName:   "Shopping",
		Title:     "50% OFF Sale!",
		Body:      "Limited time offer",
		Category:  types.CategoryPersonal,
		CreatedAt: time.Now(),
	}

	err = engine.ApplyRules(userID, promoNotification)
	assert.NoError(t, err)
	assert.Equal(t, types.CategoryJunk, promoNotification.Category, "Promotional notification should be categorized as junk")

	// Test 3: Work app notification should be categorized as work
	workNotification := &types.Notification{
		ID:        uuid.New(),
		UserID:    userID,
		AppName:   "Slack",
		Title:     "New message from team",
		Body:      "Meeting in 10 minutes",
		Category:  types.CategoryPersonal,
		CreatedAt: time.Now(),
	}

	err = engine.ApplyRules(userID, workNotification)
	assert.NoError(t, err)
	assert.Equal(t, types.CategoryWork, workNotification.Category, "Work app notification should be categorized as work")

	// Test 4: Notification that matches multiple rules - highest priority wins
	workOTPNotification := &types.Notification{
		ID:        uuid.New(),
		UserID:    userID,
		AppName:   "Slack",
		Title:     "Your verification code is 789012",
		Body:      "Use this to access your account",
		Category:  types.CategoryPersonal,
		Priority:  0,
		CreatedAt: time.Now(),
	}

	err = engine.ApplyRules(userID, workOTPNotification)
	assert.NoError(t, err)
	// OTP rule has higher priority (20) than work app rule (5), so priority should be set
	assert.Equal(t, 20, workOTPNotification.Priority, "OTP rule should win over work app rule due to higher priority")

	mockRepo.AssertExpectations(t)
}

// TestRuleConflictResolution tests how the engine handles conflicting rules
func TestRuleConflictResolution(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	userID := uuid.New()

	// Create conflicting rules with different priorities
	highPriorityRule := &Rule{
		ID:       uuid.New(),
		UserID:   userID,
		Name:     "High Priority Keyword",
		Type:     RuleTypeKeywordFilter,
		Priority: PriorityHigh,
		IsActive: true,
		Conditions: map[string]interface{}{
			"keywords":    []string{"urgent"},
			"match_title": true,
		},
		Actions: map[string]interface{}{
			"action":    ActionPrioritize,
			"priority":  15,
		},
	}

	lowPriorityRule := &Rule{
		ID:       uuid.New(),
		UserID:   userID,
		Name:     "Low Priority App",
		Type:     RuleTypeAppFilter,
		Priority: PriorityLow,
		IsActive: true,
		Conditions: map[string]interface{}{
			"app_names": []string{"Email"},
		},
		Actions: map[string]interface{}{
			"action": ActionMute,
		},
	}

	rules := []*Rule{highPriorityRule, lowPriorityRule}
	mockRepo.On("GetActiveByUserID", userID).Return(rules, nil)

	// Test notification that matches both rules
	notification := &types.Notification{
		ID:          uuid.New(),
		UserID:      userID,
		AppName:     "Email",
		Title:       "Urgent: Server Down",
		Body:        "Please check immediately",
		Priority:    0,
		IsDismissed: false,
		CreatedAt:   time.Now(),
	}

	err := engine.ApplyRules(userID, notification)
	assert.NoError(t, err)

	// High priority rule should win - notification should be prioritized, not muted
	assert.Equal(t, 15, notification.Priority, "High priority rule should win")
	assert.False(t, notification.IsDismissed, "Notification should not be muted due to higher priority rule")

	mockRepo.AssertExpectations(t)
}

// TestRuleValidationWorkflow tests the complete rule creation and validation workflow
func TestRuleValidationWorkflow(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	userID := uuid.New()

	// Test valid rule creation
	validRequest := CreateRuleRequest{
		Name:     "Test Rule",
		Type:     RuleTypeAppFilter,
		Priority: PriorityMedium,
		Conditions: map[string]interface{}{
			"app_names": []string{"TestApp"},
		},
		Actions: map[string]interface{}{
			"action": ActionAllow,
		},
	}

	mockRepo.On("Create", mock.AnythingOfType("*rules.Rule")).Return(nil)

	rule, err := engine.CreateRule(userID, validRequest)
	assert.NoError(t, err)
	assert.NotNil(t, rule)
	assert.Equal(t, userID, rule.UserID)
	assert.Equal(t, validRequest.Name, rule.Name)
	assert.True(t, rule.IsActive)

	// Test invalid rule creation - missing app_names in conditions
	invalidRequest := CreateRuleRequest{
		Name:     "Invalid Rule",
		Type:     RuleTypeAppFilter,
		Priority: PriorityMedium,
		Conditions: map[string]interface{}{}, // Empty conditions for app filter
		Actions: map[string]interface{}{
			"action": ActionAllow,
		},
	}

	// Create a service to test validation
	service := &Service{engine: engine}
	err = service.ValidateRuleRequest(invalidRequest)
	assert.Error(t, err, "Should fail validation for empty app filter conditions")

	mockRepo.AssertExpectations(t)
}

// TestDefaultRulesCreation tests the creation of default rules for new users
func TestDefaultRulesCreation(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	userID := uuid.New()

	// Expect two default rules to be created
	mockRepo.On("Create", mock.MatchedBy(func(rule *Rule) bool {
		return rule.Type == RuleTypeOTPAlways && rule.UserID == userID
	})).Return(nil)

	mockRepo.On("Create", mock.MatchedBy(func(rule *Rule) bool {
		return rule.Type == RuleTypePromoMute && rule.UserID == userID
	})).Return(nil)

	err := engine.CreateDefaultRules(userID)
	assert.NoError(t, err)

	mockRepo.AssertExpectations(t)
}

// TestTimeBasedRuleEvaluation tests time-based rule evaluation with different scenarios
func TestTimeBasedRuleEvaluation(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	// Create time-based rule for work hours (9 AM to 5 PM, Monday to Friday)
	rule := &Rule{
		ID:       uuid.New(),
		UserID:   uuid.New(),
		Name:     "Work Hours Only",
		Type:     RuleTypeTimeBased,
		Priority: PriorityMedium,
		IsActive: true,
		Conditions: map[string]interface{}{
			"start_time": "09:00",
			"end_time":   "17:00",
			"weekdays":   []int{1, 2, 3, 4, 5}, // Monday to Friday
		},
		Actions: map[string]interface{}{
			"action":   ActionCategorize,
			"category": types.CategoryWork,
		},
	}

	testCases := []struct {
		name     string
		time     time.Time
		expected bool
	}{
		{
			name:     "Tuesday 10 AM - should match",
			time:     time.Date(2024, 1, 16, 10, 0, 0, 0, time.UTC), // Tuesday
			expected: true,
		},
		{
			name:     "Tuesday 8 AM - should not match (too early)",
			time:     time.Date(2024, 1, 16, 8, 0, 0, 0, time.UTC),
			expected: false,
		},
		{
			name:     "Tuesday 6 PM - should not match (too late)",
			time:     time.Date(2024, 1, 16, 18, 0, 0, 0, time.UTC),
			expected: false,
		},
		{
			name:     "Saturday 10 AM - should not match (weekend)",
			time:     time.Date(2024, 1, 20, 10, 0, 0, 0, time.UTC), // Saturday
			expected: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			notification := &types.Notification{
				ID:        uuid.New(),
				AppName:   "TestApp",
				Title:     "Test Notification",
				Body:      "Test body",
				CreatedAt: tc.time,
			}

			match, err := engine.evaluateRule(rule, notification)
			assert.NoError(t, err)
			assert.Equal(t, tc.expected, match.Matched, tc.name)
		})
	}
}