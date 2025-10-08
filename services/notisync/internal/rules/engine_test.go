package rules

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// MockRuleRepository is a mock implementation of RuleRepository
type MockRuleRepository struct {
	mock.Mock
}

func (m *MockRuleRepository) Create(rule *Rule) error {
	args := m.Called(rule)
	return args.Error(0)
}

func (m *MockRuleRepository) GetByID(id uuid.UUID) (*Rule, error) {
	args := m.Called(id)
	return args.Get(0).(*Rule), args.Error(1)
}

func (m *MockRuleRepository) GetByUserID(userID uuid.UUID) ([]*Rule, error) {
	args := m.Called(userID)
	return args.Get(0).([]*Rule), args.Error(1)
}

func (m *MockRuleRepository) Update(rule *Rule) error {
	args := m.Called(rule)
	return args.Error(0)
}

func (m *MockRuleRepository) Delete(id uuid.UUID) error {
	args := m.Called(id)
	return args.Error(0)
}

func (m *MockRuleRepository) GetActiveByUserID(userID uuid.UUID) ([]*Rule, error) {
	args := m.Called(userID)
	return args.Get(0).([]*Rule), args.Error(1)
}

func TestEngine_EvaluateAppFilter(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	// Create app filter rule
	rule := &Rule{
		ID:       uuid.New(),
		UserID:   uuid.New(),
		Name:     "WhatsApp Filter",
		Type:     RuleTypeAppFilter,
		Priority: PriorityMedium,
		IsActive: true,
		Conditions: map[string]interface{}{
			"app_names": []string{"WhatsApp", "Telegram"},
		},
		Actions: map[string]interface{}{
			"action":   ActionCategorize,
			"category": types.CategoryPersonal,
		},
	}

	// Test matching notification
	notification := &types.Notification{
		ID:      uuid.New(),
		AppName: "WhatsApp",
		Title:   "New Message",
		Body:    "Hello there!",
	}

	match, err := engine.evaluateRule(rule, notification)
	assert.NoError(t, err)
	assert.True(t, match.Matched)
	assert.Equal(t, rule.Priority, match.Priority)

	// Test non-matching notification
	notification.AppName = "Gmail"
	match, err = engine.evaluateRule(rule, notification)
	assert.NoError(t, err)
	assert.False(t, match.Matched)

	// Test excluded app
	rule.Conditions["exclude_apps"] = []string{"Gmail"}
	notification.AppName = "Gmail"
	match, err = engine.evaluateRule(rule, notification)
	assert.NoError(t, err)
	assert.False(t, match.Matched)
}

func TestEngine_EvaluateKeywordFilter(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	// Create keyword filter rule
	rule := &Rule{
		ID:       uuid.New(),
		UserID:   uuid.New(),
		Name:     "Urgent Keywords",
		Type:     RuleTypeKeywordFilter,
		Priority: PriorityHigh,
		IsActive: true,
		Conditions: map[string]interface{}{
			"keywords":       []string{"urgent", "important"},
			"match_title":    true,
			"match_body":     true,
			"case_sensitive": false,
		},
		Actions: map[string]interface{}{
			"action":    ActionHighlight,
			"highlight": true,
		},
	}

	// Test matching notification (title)
	notification := &types.Notification{
		ID:      uuid.New(),
		AppName: "Email",
		Title:   "URGENT: Meeting Update",
		Body:    "Please review the agenda",
	}

	match, err := engine.evaluateRule(rule, notification)
	assert.NoError(t, err)
	assert.True(t, match.Matched)

	// Test matching notification (body)
	notification.Title = "Meeting Update"
	notification.Body = "This is very important"
	match, err = engine.evaluateRule(rule, notification)
	assert.NoError(t, err)
	assert.True(t, match.Matched)

	// Test non-matching notification
	notification.Title = "Regular Update"
	notification.Body = "Just a normal message"
	match, err = engine.evaluateRule(rule, notification)
	assert.NoError(t, err)
	assert.False(t, match.Matched)

	// Test excluded keywords
	rule.Conditions["exclude_keywords"] = []string{"spam"}
	notification.Title = "Urgent spam message"
	match, err = engine.evaluateRule(rule, notification)
	assert.NoError(t, err)
	assert.False(t, match.Matched)
}

func TestEngine_EvaluateTimeBased(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	// Create time-based rule (work hours: 9 AM to 5 PM, Monday to Friday)
	rule := &Rule{
		ID:       uuid.New(),
		UserID:   uuid.New(),
		Name:     "Work Hours",
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

	// Test notification during work hours (Tuesday 10 AM)
	workTime := time.Date(2024, 1, 16, 10, 0, 0, 0, time.UTC) // Tuesday
	notification := &types.Notification{
		ID:        uuid.New(),
		AppName:   "Slack",
		Title:     "Work Message",
		Body:      "Meeting in 10 minutes",
		CreatedAt: workTime,
	}

	match, err := engine.evaluateRule(rule, notification)
	assert.NoError(t, err)
	assert.True(t, match.Matched)

	// Test notification outside work hours (Tuesday 8 AM)
	earlyTime := time.Date(2024, 1, 16, 8, 0, 0, 0, time.UTC)
	notification.CreatedAt = earlyTime
	match, err = engine.evaluateRule(rule, notification)
	assert.NoError(t, err)
	assert.False(t, match.Matched)

	// Test notification on weekend (Saturday 10 AM)
	weekendTime := time.Date(2024, 1, 20, 10, 0, 0, 0, time.UTC) // Saturday
	notification.CreatedAt = weekendTime
	match, err = engine.evaluateRule(rule, notification)
	assert.NoError(t, err)
	assert.False(t, match.Matched)
}

func TestEngine_EvaluateOTPAlways(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	// Test OTP detection
	testCases := []struct {
		title    string
		body     string
		expected bool
	}{
		{"Your OTP is 123456", "", true},
		{"Verification Code", "Your code: 789012", true},
		{"", "2FA code: 456789", true},
		{"Login code 1234", "", true},
		{"", "Your security code is 567890", true},
		{"Regular message", "No codes here", false},
		{"Meeting at 3", "See you at 3 PM", false},
		{"", "Your verification code is abc123", false}, // Not purely numeric
	}

	for _, tc := range testCases {
		notification := &types.Notification{
			ID:      uuid.New(),
			AppName: "Banking",
			Title:   tc.title,
			Body:    tc.body,
		}

		result := engine.evaluateOTPAlways(notification)
		assert.Equal(t, tc.expected, result, "Failed for title: '%s', body: '%s'", tc.title, tc.body)
	}
}

func TestEngine_EvaluatePromoMute(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	// Test promotional detection
	testCases := []struct {
		title    string
		body     string
		expected bool
	}{
		{"50% OFF Sale!", "Limited time offer", true},
		{"", "Buy now and save 30%", true},
		{"Free shipping today", "", true},
		{"", "Click here to claim your discount", true},
		{"Meeting reminder", "Don't forget about our meeting", false},
		{"Your order is ready", "Pick up at store", false},
	}

	for _, tc := range testCases {
		notification := &types.Notification{
			ID:      uuid.New(),
			AppName: "Shopping",
			Title:   tc.title,
			Body:    tc.body,
		}

		result := engine.evaluatePromoMute(notification)
		assert.Equal(t, tc.expected, result, "Failed for title: '%s', body: '%s'", tc.title, tc.body)
	}
}

func TestEngine_EvaluateNotification(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	userID := uuid.New()

	// Create test rules with different priorities
	rules := []*Rule{
		{
			ID:       uuid.New(),
			UserID:   userID,
			Name:     "OTP Rule",
			Type:     RuleTypeOTPAlways,
			Priority: PriorityCritical,
			IsActive: true,
			Conditions: map[string]interface{}{},
			Actions: map[string]interface{}{
				"action":    ActionPrioritize,
				"priority":  20,
			},
		},
		{
			ID:       uuid.New(),
			UserID:   userID,
			Name:     "WhatsApp Rule",
			Type:     RuleTypeAppFilter,
			Priority: PriorityMedium,
			IsActive: true,
			Conditions: map[string]interface{}{
				"app_names": []string{"WhatsApp"},
			},
			Actions: map[string]interface{}{
				"action":   ActionCategorize,
				"category": types.CategoryPersonal,
			},
		},
	}

	mockRepo.On("GetActiveByUserID", userID).Return(rules, nil)

	// Test notification that matches both rules
	notification := &types.Notification{
		ID:      uuid.New(),
		AppName: "WhatsApp",
		Title:   "Your OTP is 123456",
		Body:    "Use this code to login",
	}

	matches, err := engine.EvaluateNotification(userID, notification)
	assert.NoError(t, err)
	assert.Len(t, matches, 2)

	// Verify matches are sorted by priority (highest first)
	assert.Equal(t, PriorityCritical, matches[0].Priority)
	assert.Equal(t, PriorityMedium, matches[1].Priority)

	mockRepo.AssertExpectations(t)
}

func TestEngine_ApplyRules(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	userID := uuid.New()

	// Create test rule
	rule := &Rule{
		ID:       uuid.New(),
		UserID:   userID,
		Name:     "Highlight Rule",
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

	mockRepo.On("GetActiveByUserID", userID).Return([]*Rule{rule}, nil)

	// Test notification
	notification := &types.Notification{
		ID:       uuid.New(),
		AppName:  "Email",
		Title:    "Urgent: Server Down",
		Body:     "Please check immediately",
		Priority: 0,
	}

	err := engine.ApplyRules(userID, notification)
	assert.NoError(t, err)
	assert.Equal(t, 15, notification.Priority)

	mockRepo.AssertExpectations(t)
}

func TestEngine_CreateRule(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	userID := uuid.New()
	req := CreateRuleRequest{
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

	rule, err := engine.CreateRule(userID, req)
	assert.NoError(t, err)
	assert.NotNil(t, rule)
	assert.Equal(t, userID, rule.UserID)
	assert.Equal(t, req.Name, rule.Name)
	assert.Equal(t, req.Type, rule.Type)
	assert.True(t, rule.IsActive)

	mockRepo.AssertExpectations(t)
}

func TestEngine_CreateDefaultRules(t *testing.T) {
	mockRepo := new(MockRuleRepository)
	engine := NewEngine(mockRepo)

	userID := uuid.New()

	// Expect two default rules to be created
	mockRepo.On("Create", mock.MatchedBy(func(rule *Rule) bool {
		return rule.Type == RuleTypeOTPAlways
	})).Return(nil)

	mockRepo.On("Create", mock.MatchedBy(func(rule *Rule) bool {
		return rule.Type == RuleTypePromoMute
	})).Return(nil)

	err := engine.CreateDefaultRules(userID)
	assert.NoError(t, err)

	mockRepo.AssertExpectations(t)
}

func TestRule_Validate(t *testing.T) {
	rule := &Rule{
		UserID:     uuid.New(),
		Name:       "Test Rule",
		Type:       RuleTypeAppFilter,
		Conditions: map[string]interface{}{"test": "value"},
		Actions:    map[string]interface{}{"action": "allow"},
	}

	// Valid rule
	err := rule.Validate()
	assert.NoError(t, err)

	// Missing UserID
	rule.UserID = uuid.Nil
	err = rule.Validate()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "user_id is required")

	// Reset and test missing name
	rule.UserID = uuid.New()
	rule.Name = ""
	err = rule.Validate()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "rule name is required")

	// Reset and test invalid type
	rule.Name = "Test Rule"
	rule.Type = "invalid_type"
	err = rule.Validate()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid rule type")
}

func TestRule_GetConditions(t *testing.T) {
	rule := &Rule{
		Type: RuleTypeAppFilter,
		Conditions: map[string]interface{}{
			"app_names": []string{"WhatsApp", "Telegram"},
		},
	}

	conditions, err := rule.GetConditions()
	assert.NoError(t, err)

	appConditions, ok := conditions.(AppFilterConditions)
	assert.True(t, ok)
	assert.Equal(t, []string{"WhatsApp", "Telegram"}, appConditions.AppNames)
}

func TestRule_GetActions(t *testing.T) {
	rule := &Rule{
		Actions: map[string]interface{}{
			"action":   "categorize",
			"category": "Personal",
		},
	}

	actions, err := rule.GetActions()
	assert.NoError(t, err)
	assert.Equal(t, ActionCategorize, actions.Action)
	assert.Equal(t, types.CategoryPersonal, actions.Category)
}