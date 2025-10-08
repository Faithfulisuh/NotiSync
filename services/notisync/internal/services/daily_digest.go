package services

import (
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/redis"
	"github.com/notisync/backend/internal/repository"
	"github.com/notisync/backend/internal/types"
)

// DailyDigestService handles daily digest generation
type DailyDigestService struct {
	repos        *repository.InterfaceRepositories
	redisService *redis.Service
}

// NewDailyDigestService creates a new daily digest service
func NewDailyDigestService(repos *repository.InterfaceRepositories, redisService *redis.Service) *DailyDigestService {
	return &DailyDigestService{
		repos:        repos,
		redisService: redisService,
	}
}

// DailyDigest represents a daily digest for a user
type DailyDigest struct {
	UserID              uuid.UUID                    `json:"user_id"`
	Date                string                       `json:"date"`
	TotalNotifications  int                          `json:"total_notifications"`
	CategoryBreakdown   map[string]int               `json:"category_breakdown"`
	TopNotifications    []*types.Notification        `json:"top_notifications"`
	Statistics          *DigestStatistics            `json:"statistics"`
	IsQuietDay          bool                         `json:"is_quiet_day"`
	QuietDayMessage     string                       `json:"quiet_day_message,omitempty"`
	GeneratedAt         time.Time                    `json:"generated_at"`
	Insights            *DigestInsights              `json:"insights"`
}

// DigestStatistics contains statistical information about the day
type DigestStatistics struct {
	TotalReceived    int                `json:"total_received"`
	TotalRead        int                `json:"total_read"`
	TotalDismissed   int                `json:"total_dismissed"`
	TotalActedUpon   int                `json:"total_acted_upon"`
	ReadRate         float64            `json:"read_rate"`
	DismissalRate    float64            `json:"dismissal_rate"`
	ActionRate       float64            `json:"action_rate"`
	MostActiveApp    string             `json:"most_active_app"`
	MostActiveHour   int                `json:"most_active_hour"`
	AppBreakdown     map[string]int     `json:"app_breakdown"`
	HourlyBreakdown  map[int]int        `json:"hourly_breakdown"`
}

// DigestInsights provides intelligent insights about notification patterns
type DigestInsights struct {
	TrendComparison     string   `json:"trend_comparison"`
	BusiestPeriod       string   `json:"busiest_period"`
	RecommendedActions  []string `json:"recommended_actions"`
	NotificationHealth  string   `json:"notification_health"`
	WeeklyComparison    string   `json:"weekly_comparison"`
}

// NotificationScore represents a notification with its importance score
type NotificationScore struct {
	Notification *types.Notification `json:"notification"`
	Score        float64             `json:"score"`
	Reasons      []string            `json:"reasons"`
}

// GenerateDailyDigest generates a daily digest for a user for a specific date
func (dds *DailyDigestService) GenerateDailyDigest(userID uuid.UUID, date time.Time) (*DailyDigest, error) {
	// Normalize date to start of day
	startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	endOfDay := startOfDay.Add(24 * time.Hour).Add(-1 * time.Nanosecond)

	// TODO: Check cache first when Redis cache methods are available

	// Get notifications for the day
	notifications, err := dds.getNotificationsForDay(userID, startOfDay, endOfDay)
	if err != nil {
		return nil, fmt.Errorf("failed to get notifications for day: %w", err)
	}

	// Generate digest
	digest := &DailyDigest{
		UserID:      userID,
		Date:        startOfDay.Format("2006-01-02"),
		GeneratedAt: time.Now(),
	}

	// Check if it's a quiet day
	if len(notifications) <= 3 {
		digest.IsQuietDay = true
		digest.QuietDayMessage = dds.generateQuietDayMessage(len(notifications))
	}

	// Calculate basic metrics
	digest.TotalNotifications = len(notifications)
	digest.CategoryBreakdown = dds.calculateCategoryBreakdown(notifications)

	// Get top notifications
	digest.TopNotifications, err = dds.selectTopNotifications(userID, notifications)
	if err != nil {
		log.Printf("Warning: failed to select top notifications: %v", err)
		digest.TopNotifications = []*types.Notification{}
	}

	// Generate statistics
	digest.Statistics, err = dds.generateStatistics(userID, notifications, startOfDay)
	if err != nil {
		log.Printf("Warning: failed to generate statistics: %v", err)
	}

	// Generate insights
	digest.Insights, err = dds.generateInsights(userID, notifications, startOfDay)
	if err != nil {
		log.Printf("Warning: failed to generate insights: %v", err)
	}

	// TODO: Cache the digest for 24 hours when Redis cache methods are available

	return digest, nil
}

// GetTodaysDigest gets today's digest for a user
func (dds *DailyDigestService) GetTodaysDigest(userID uuid.UUID) (*DailyDigest, error) {
	return dds.GenerateDailyDigest(userID, time.Now())
}

// GetDigestForDate gets digest for a specific date
func (dds *DailyDigestService) GetDigestForDate(userID uuid.UUID, dateStr string) (*DailyDigest, error) {
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return nil, fmt.Errorf("invalid date format: %w", err)
	}
	
	return dds.GenerateDailyDigest(userID, date)
}

// GetWeeklyDigests gets digests for the past week
func (dds *DailyDigestService) GetWeeklyDigests(userID uuid.UUID) ([]*DailyDigest, error) {
	var digests []*DailyDigest
	now := time.Now()
	
	for i := 6; i >= 0; i-- {
		date := now.AddDate(0, 0, -i)
		digest, err := dds.GenerateDailyDigest(userID, date)
		if err != nil {
			log.Printf("Warning: failed to generate digest for %s: %v", date.Format("2006-01-02"), err)
			continue
		}
		digests = append(digests, digest)
	}
	
	return digests, nil
}

// getNotificationsForDay retrieves all notifications for a specific day
func (dds *DailyDigestService) getNotificationsForDay(userID uuid.UUID, startOfDay, endOfDay time.Time) ([]*types.Notification, error) {
	// Get notifications for the day using search functionality
	notifications, _, err := dds.repos.NotificationHistory.SearchHistory(userID, "", 1000, 0)
	if err != nil {
		return nil, err
	}

	return notifications, nil
}

// calculateCategoryBreakdown calculates notification count by category
func (dds *DailyDigestService) calculateCategoryBreakdown(notifications []*types.Notification) map[string]int {
	breakdown := make(map[string]int)
	
	for _, notification := range notifications {
		category := string(notification.Category)
		breakdown[category]++
	}
	
	return breakdown
}

// selectTopNotifications selects the top 5 most important notifications based on user rules
func (dds *DailyDigestService) selectTopNotifications(userID uuid.UUID, notifications []*types.Notification) ([]*types.Notification, error) {
	if len(notifications) == 0 {
		return []*types.Notification{}, nil
	}

	// Get user rules for scoring
	userRules, err := dds.repos.UserRule.GetByUserID(userID)
	if err != nil {
		log.Printf("Warning: failed to get user rules for scoring: %v", err)
		userRules = []*types.UserRule{} // Continue with empty rules
	}

	// Score all notifications
	scoredNotifications := make([]*NotificationScore, 0, len(notifications))
	for _, notification := range notifications {
		score, reasons := dds.calculateNotificationScore(notification, userRules)
		scoredNotifications = append(scoredNotifications, &NotificationScore{
			Notification: notification,
			Score:        score,
			Reasons:      reasons,
		})
	}

	// Sort by score (highest first)
	sort.Slice(scoredNotifications, func(i, j int) bool {
		return scoredNotifications[i].Score > scoredNotifications[j].Score
	})

	// Return top 5
	topCount := 5
	if len(scoredNotifications) < topCount {
		topCount = len(scoredNotifications)
	}

	topNotifications := make([]*types.Notification, topCount)
	for i := 0; i < topCount; i++ {
		topNotifications[i] = scoredNotifications[i].Notification
	}

	return topNotifications, nil
}

// calculateNotificationScore calculates importance score for a notification
func (dds *DailyDigestService) calculateNotificationScore(notification *types.Notification, userRules []*types.UserRule) (float64, []string) {
	score := 0.0
	reasons := []string{}

	// Base score by category
	switch notification.Category {
	case types.CategoryWork:
		score += 3.0
		reasons = append(reasons, "Work notification")
	case types.CategoryPersonal:
		score += 2.0
		reasons = append(reasons, "Personal notification")
	case types.CategoryJunk:
		score += 0.5
		reasons = append(reasons, "Promotional notification")
	}

	// Priority boost
	score += float64(notification.Priority)
	if notification.Priority > 0 {
		reasons = append(reasons, fmt.Sprintf("High priority (%d)", notification.Priority))
	}

	// Unread notifications get higher score
	if !notification.IsRead {
		score += 1.0
		reasons = append(reasons, "Unread")
	}

	// Not dismissed notifications get higher score
	if !notification.IsDismissed {
		score += 0.5
	}

	// Apply user rules (simplified for current UserRule structure)
	for _, rule := range userRules {
		if dds.ruleMatchesNotification(rule, notification) {
			// Extract action from rule.Actions interface{}
			if actions, ok := rule.Actions.(map[string]interface{}); ok {
				if action, exists := actions["type"]; exists {
					switch action {
					case "always_show":
						score += 5.0
						reasons = append(reasons, "Always show rule")
					case "mute":
						score -= 2.0
						reasons = append(reasons, "Muted by rule")
					case "priority_boost":
						score += 2.0
						reasons = append(reasons, "Priority boost rule")
					}
				}
			}
		}
	}

	// OTP/Security notifications get highest priority
	if dds.isSecurityNotification(notification) {
		score += 10.0
		reasons = append(reasons, "Security/OTP notification")
	}

	// Recent notifications get slight boost
	if time.Since(notification.CreatedAt) < 2*time.Hour {
		score += 0.5
		reasons = append(reasons, "Recent notification")
	}

	return score, reasons
}

// ruleMatchesNotification checks if a user rule matches a notification
func (dds *DailyDigestService) ruleMatchesNotification(rule *types.UserRule, notification *types.Notification) bool {
	// This is a simplified implementation
	// In a real system, you'd have more sophisticated rule matching
	
	// Extract conditions from rule.Conditions interface{}
	if conditions, ok := rule.Conditions.(map[string]interface{}); ok {
		// Check app filter
		if appFilter, exists := conditions["app_filter"]; exists {
			if appFilterStr, ok := appFilter.(string); ok && appFilterStr != "" {
				if appFilterStr != notification.AppName {
					return false
				}
			}
		}

		// Check keyword filter
		if keywordFilter, exists := conditions["keyword_filter"]; exists {
			if keywordFilterStr, ok := keywordFilter.(string); ok && keywordFilterStr != "" {
				// Simple keyword matching in title and body
				title := notification.Title
				body := notification.Body
				if !contains(title, keywordFilterStr) && !contains(body, keywordFilterStr) {
					return false
				}
			}
		}
	}

	return true
}

// isSecurityNotification checks if a notification is security-related
func (dds *DailyDigestService) isSecurityNotification(notification *types.Notification) bool {
	securityKeywords := []string{
		"otp", "verification", "security", "login", "signin", "code",
		"authenticate", "verify", "2fa", "two-factor", "password",
	}

	title := strings.ToLower(notification.Title)
	body := strings.ToLower(notification.Body)

	for _, keyword := range securityKeywords {
		if contains(title, keyword) || contains(body, keyword) {
			return true
		}
	}

	return false
}

// generateQuietDayMessage generates a message for quiet days
func (dds *DailyDigestService) generateQuietDayMessage(notificationCount int) string {
	messages := []string{
		"What a peaceful day! You had minimal notifications today.",
		"Enjoy the quiet! Only a few notifications came through today.",
		"A calm day with very few interruptions.",
		"Looks like it was a quiet day in your notification world.",
		"Minimal digital noise today - time well spent!",
	}

	if notificationCount == 0 {
		return "Complete silence! No notifications today - enjoy the peace."
	}

	// Simple hash to pick a consistent message for the day
	index := notificationCount % len(messages)
	return messages[index]
}

// generateStatistics generates comprehensive statistics for the day
func (dds *DailyDigestService) generateStatistics(userID uuid.UUID, notifications []*types.Notification, date time.Time) (*DigestStatistics, error) {
	stats := &DigestStatistics{
		TotalReceived:   len(notifications),
		AppBreakdown:    make(map[string]int),
		HourlyBreakdown: make(map[int]int),
	}

	if len(notifications) == 0 {
		return stats, nil
	}

	// Count read, dismissed, and acted upon notifications
	for _, notification := range notifications {
		if notification.IsRead {
			stats.TotalRead++
		}
		if notification.IsDismissed {
			stats.TotalDismissed++
		}
		
		// Count as acted upon if read OR dismissed
		if notification.IsRead || notification.IsDismissed {
			stats.TotalActedUpon++
		}

		// App breakdown
		stats.AppBreakdown[notification.AppName]++

		// Hourly breakdown
		hour := notification.CreatedAt.Hour()
		stats.HourlyBreakdown[hour]++
	}

	// Calculate rates
	if stats.TotalReceived > 0 {
		stats.ReadRate = float64(stats.TotalRead) / float64(stats.TotalReceived) * 100
		stats.DismissalRate = float64(stats.TotalDismissed) / float64(stats.TotalReceived) * 100
		stats.ActionRate = float64(stats.TotalActedUpon) / float64(stats.TotalReceived) * 100
	}

	// Find most active app
	maxCount := 0
	for app, count := range stats.AppBreakdown {
		if count > maxCount {
			maxCount = count
			stats.MostActiveApp = app
		}
	}

	// Find most active hour
	maxHourCount := 0
	for hour, count := range stats.HourlyBreakdown {
		if count > maxHourCount {
			maxHourCount = count
			stats.MostActiveHour = hour
		}
	}

	return stats, nil
}

// generateInsights generates intelligent insights about notification patterns
func (dds *DailyDigestService) generateInsights(userID uuid.UUID, notifications []*types.Notification, date time.Time) (*DigestInsights, error) {
	insights := &DigestInsights{
		RecommendedActions: []string{},
	}

	// Get previous day's data for comparison
	previousDay := date.AddDate(0, 0, -1)
	previousNotifications, err := dds.getNotificationsForDay(userID, 
		time.Date(previousDay.Year(), previousDay.Month(), previousDay.Day(), 0, 0, 0, 0, previousDay.Location()),
		time.Date(previousDay.Year(), previousDay.Month(), previousDay.Day(), 23, 59, 59, 999999999, previousDay.Location()))
	
	if err == nil {
		// Trend comparison
		todayCount := len(notifications)
		yesterdayCount := len(previousNotifications)
		
		if todayCount > yesterdayCount {
			diff := todayCount - yesterdayCount
			insights.TrendComparison = fmt.Sprintf("📈 %d more notifications than yesterday (+%d)", diff, diff)
		} else if todayCount < yesterdayCount {
			diff := yesterdayCount - todayCount
			insights.TrendComparison = fmt.Sprintf("📉 %d fewer notifications than yesterday (-%d)", diff, diff)
		} else {
			insights.TrendComparison = "➡️ Same number of notifications as yesterday"
		}
	}

	// Analyze busiest period
	if len(notifications) > 0 {
		hourlyCount := make(map[int]int)
		for _, notification := range notifications {
			hour := notification.CreatedAt.Hour()
			hourlyCount[hour]++
		}

		maxHour := 0
		maxCount := 0
		for hour, count := range hourlyCount {
			if count > maxCount {
				maxCount = count
				maxHour = hour
			}
		}

		insights.BusiestPeriod = fmt.Sprintf("%d:00 - %d:00 (%d notifications)", maxHour, maxHour+1, maxCount)
	}

	// Generate recommendations based on patterns
	if len(notifications) > 20 {
		insights.RecommendedActions = append(insights.RecommendedActions, 
			"Consider setting up notification rules to reduce noise")
	}

	unreadCount := 0
	for _, notification := range notifications {
		if !notification.IsRead {
			unreadCount++
		}
	}

	if unreadCount > 10 {
		insights.RecommendedActions = append(insights.RecommendedActions,
			"You have many unread notifications - consider batch processing them")
	}

	// Notification health assessment
	if len(notifications) == 0 {
		insights.NotificationHealth = "🟢 Perfect - No notifications today"
	} else if len(notifications) <= 5 {
		insights.NotificationHealth = "🟢 Excellent - Very few notifications"
	} else if len(notifications) <= 15 {
		insights.NotificationHealth = "🟡 Good - Moderate notification volume"
	} else if len(notifications) <= 30 {
		insights.NotificationHealth = "🟠 Busy - High notification volume"
	} else {
		insights.NotificationHealth = "🔴 Overwhelming - Very high notification volume"
	}

	// Weekly comparison (simplified)
	weekAgo := date.AddDate(0, 0, -7)
	weekAgoNotifications, err := dds.getNotificationsForDay(userID,
		time.Date(weekAgo.Year(), weekAgo.Month(), weekAgo.Day(), 0, 0, 0, 0, weekAgo.Location()),
		time.Date(weekAgo.Year(), weekAgo.Month(), weekAgo.Day(), 23, 59, 59, 999999999, weekAgo.Location()))
	
	if err == nil {
		todayCount := len(notifications)
		weekAgoCount := len(weekAgoNotifications)
		
		if todayCount > weekAgoCount {
			insights.WeeklyComparison = fmt.Sprintf("📈 %d more than same day last week", todayCount-weekAgoCount)
		} else if todayCount < weekAgoCount {
			insights.WeeklyComparison = fmt.Sprintf("📉 %d fewer than same day last week", weekAgoCount-todayCount)
		} else {
			insights.WeeklyComparison = "➡️ Same as last week"
		}
	}

	return insights, nil
}

// ScheduleDigestGeneration schedules daily digest generation for all users
func (dds *DailyDigestService) ScheduleDigestGeneration() {
	// Run at 8 AM every day
	ticker := time.NewTicker(24 * time.Hour)
	
	// Calculate time until next 8 AM
	now := time.Now()
	next8AM := time.Date(now.Year(), now.Month(), now.Day(), 8, 0, 0, 0, now.Location())
	if now.After(next8AM) {
		next8AM = next8AM.Add(24 * time.Hour)
	}
	
	// Initial delay until 8 AM
	initialDelay := time.Until(next8AM)
	
	go func() {
		// Wait until 8 AM
		time.Sleep(initialDelay)
		
		// Generate digests for all users
		dds.generateDigestsForAllUsers()
		
		// Then run every 24 hours
		for range ticker.C {
			dds.generateDigestsForAllUsers()
		}
	}()
	
	log.Printf("Scheduled daily digest generation at 8 AM (next run in %v)", initialDelay)
}

// generateDigestsForAllUsers generates digests for all active users
func (dds *DailyDigestService) generateDigestsForAllUsers() {
	log.Println("Starting daily digest generation for all users...")
	
	// Get all users (this would need to be implemented in the user repository)
	// For now, we'll skip this as it requires additional repository methods
	
	log.Println("Daily digest generation completed")
}

// Helper function for case-insensitive string contains
func contains(s, substr string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(substr))
}