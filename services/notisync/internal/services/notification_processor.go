package services

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/redis"
	"github.com/notisync/backend/internal/repository"
	"github.com/notisync/backend/internal/rules"
	"github.com/notisync/backend/internal/types"
	"github.com/notisync/backend/internal/validation"
)

// NotificationProcessor handles the complete notification processing pipeline
type NotificationProcessor struct {
	repos        *repository.InterfaceRepositories
	redisService *redis.Service
	validator    *validation.NotificationValidator
	rulesService *rules.Service
}

// NewNotificationProcessor creates a new notification processor
func NewNotificationProcessor(repos *repository.InterfaceRepositories, redisService *redis.Service) *NotificationProcessor {
	return &NotificationProcessor{
		repos:        repos,
		redisService: redisService,
		validator:    validation.NewNotificationValidator(),
		rulesService: rules.NewService(repos),
	}
}

// ProcessIncomingNotification handles the complete notification ingestion pipeline
func (np *NotificationProcessor) ProcessIncomingNotification(userID, deviceID uuid.UUID, req *types.CreateNotificationRequest) (*types.Notification, error) {
	log.Printf("Processing notification from device %s for user %s", deviceID, userID)

	// Step 1: Validate the request
	if err := np.validator.ValidateCreateRequest(req); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Step 2: Verify device ownership
	device, err := np.repos.Device.GetByID(deviceID)
	if err != nil {
		return nil, fmt.Errorf("device not found: %w", err)
	}

	if device.UserID != userID {
		return nil, fmt.Errorf("device does not belong to user")
	}

	// Step 3: Convert request to notification
	notification := req.ToNotification(userID, deviceID)

	// Step 4: Apply automatic categorization
	if notification.Category == "" || notification.Category == types.CategoryPersonal {
		notification.Category = np.categorizeNotification(notification)
	}

	// Step 5: Apply user rules
	if err := np.rulesService.ApplyRules(userID, notification); err != nil {
		log.Printf("Warning: failed to apply user rules: %v", err)
	}

	// Step 6: Sanitize content
	np.validator.SanitizeNotification(notification)

	// Step 7: Final validation
	if err := np.validator.ValidateNotification(notification); err != nil {
		return nil, fmt.Errorf("notification validation failed: %w", err)
	}

	// Step 8: Store notification
	if err := np.repos.Notification.Create(notification); err != nil {
		return nil, fmt.Errorf("failed to store notification: %w", err)
	}

	// Step 9: Cache notification status in Redis
	ctx := context.Background()
	status := &redis.NotificationStatus{
		ID:         notification.ID,
		IsRead:     notification.IsRead,
		IsDismissed: notification.IsDismissed,
		UpdatedAt:  time.Now(),
	}
	if err := np.redisService.NotificationCache.SetNotificationStatus(ctx, notification.ID, status); err != nil {
		log.Printf("Warning: failed to cache notification status: %v", err)
	}

	// Step 10: Update device connection tracking
	if err := np.redisService.DeviceTracker.AddUserDevice(ctx, userID, deviceID); err != nil {
		log.Printf("Warning: failed to add device to user tracking: %v", err)
	}
	if err := np.redisService.DeviceTracker.UpdateDeviceHeartbeat(ctx, deviceID); err != nil {
		log.Printf("Warning: failed to update device heartbeat: %v", err)
	}

	// Step 10: Publish new notification to other devices
	notificationData := map[string]interface{}{
		"id":       notification.ID.String(),
		"app_name": notification.AppName,
		"title":    notification.Title,
		"body":     notification.Body,
		"category": string(notification.Category),
		"priority": notification.Priority,
	}
	if err := np.redisService.PubSub.PublishNewNotification(ctx, userID, notificationData); err != nil {
		log.Printf("Warning: failed to publish new notification: %v", err)
	}

	// Step 11: Update device last seen in database
	if err := np.repos.Device.UpdateLastSeen(deviceID); err != nil {
		log.Printf("Warning: failed to update device last seen: %v", err)
	}

	log.Printf("Successfully processed notification %s", notification.ID)
	return notification, nil
}

// categorizeNotification applies automatic categorization logic
func (np *NotificationProcessor) categorizeNotification(notification *types.Notification) types.NotificationCategory {
	appName := strings.ToLower(notification.AppName)
	title := strings.ToLower(notification.Title)
	body := strings.ToLower(notification.Body)
	content := title + " " + body

	// Check for work-related apps and content
	if np.isWorkRelated(appName, content) {
		return types.CategoryWork
	}

	// Check for junk/promotional content
	if np.isJunkContent(appName, content) {
		return types.CategoryJunk
	}

	// Default to personal
	return types.CategoryPersonal
}

// isWorkRelated checks if the notification is work-related
func (np *NotificationProcessor) isWorkRelated(appName, content string) bool {
	// Known work apps
	workApps := []string{
		"slack", "teams", "microsoft teams", "outlook", "gmail", "email",
		"zoom", "webex", "skype", "calendar", "jira", "confluence",
		"trello", "asana", "notion", "monday", "salesforce",
	}

	for _, workApp := range workApps {
		if strings.Contains(appName, workApp) {
			return true
		}
	}

	// Work-related keywords in content
	workKeywords := []string{
		"meeting", "conference", "deadline", "project", "task",
		"client", "customer", "report", "presentation", "document",
		"schedule", "appointment", "colleague", "team", "manager",
		"office", "work", "business", "professional",
	}

	for _, keyword := range workKeywords {
		if strings.Contains(content, keyword) {
			return true
		}
	}

	return false
}

// isJunkContent checks if the notification is promotional/junk
func (np *NotificationProcessor) isJunkContent(appName, content string) bool {
	// Known promotional/marketing apps
	junkApps := []string{
		"marketing", "promo", "deals", "offers", "shopping",
		"retail", "store", "mall", "advertisement", "ad",
	}

	for _, junkApp := range junkApps {
		if strings.Contains(appName, junkApp) {
			return true
		}
	}

	// Use the existing promotional detection from notification model
	notification := &types.Notification{
		Title: content,
		Body:  "",
	}

	return notification.IsPromotional()
}

// ProcessNotificationAction handles notification action processing
func (np *NotificationProcessor) ProcessNotificationAction(userID, notificationID, deviceID uuid.UUID, action types.NotificationAction) error {
	log.Printf("Processing action %s for notification %s from device %s", action, notificationID, deviceID)

	// Validate action
	if err := np.validator.ValidateNotificationAction(action); err != nil {
		return fmt.Errorf("invalid action: %w", err)
	}

	// Get and verify notification ownership
	notification, err := np.repos.Notification.GetByID(notificationID)
	if err != nil {
		return fmt.Errorf("notification not found: %w", err)
	}

	if notification.UserID != userID {
		return fmt.Errorf("notification does not belong to user")
	}

	// Check if notification is expired
	if notification.IsExpired() {
		return fmt.Errorf("cannot perform action on expired notification")
	}

	// Verify device ownership
	device, err := np.repos.Device.GetByID(deviceID)
	if err != nil {
		return fmt.Errorf("device not found: %w", err)
	}

	if device.UserID != userID {
		return fmt.Errorf("device does not belong to user")
	}

	// Convert action to status and update notification
	var status types.NotificationStatus
	switch action {
	case types.ActionRead:
		status = types.StatusRead
	case types.ActionDismissed:
		status = types.StatusDismissed
	case types.ActionClicked:
		status = types.StatusRead // Clicking marks as read
	default:
		return fmt.Errorf("unsupported action: %s", action)
	}

	// Update notification status
	if err := notification.UpdateStatus(status); err != nil {
		return fmt.Errorf("failed to update notification status: %w", err)
	}

	// Save to database
	var finalStatus types.NotificationStatus
	if notification.IsDismissed {
		finalStatus = types.StatusDismissed
	} else if notification.IsRead {
		finalStatus = types.StatusRead
	} else {
		finalStatus = types.StatusUnread
	}
	
	if err := np.repos.Notification.UpdateStatus(notificationID, finalStatus); err != nil {
		return fmt.Errorf("failed to save notification status: %w", err)
	}

	// Update Redis cache
	ctx := context.Background()
	redisStatus := &redis.NotificationStatus{
		ID:         notificationID,
		IsRead:     notification.IsRead,
		IsDismissed: notification.IsDismissed,
		UpdatedAt:  time.Now(),
	}
	if err := np.redisService.NotificationCache.SetNotificationStatus(ctx, notificationID, redisStatus); err != nil {
		log.Printf("Warning: failed to update notification status cache: %v", err)
	}

	// Publish sync event to other devices
	if err := np.redisService.PubSub.PublishNotificationSync(ctx, userID, notificationID, notification.IsRead, notification.IsDismissed, deviceID); err != nil {
		log.Printf("Warning: failed to publish notification sync: %v", err)
	}

	// Queue message for offline devices
	onlineDevices, err := np.redisService.DeviceTracker.GetOnlineDevicesForUser(ctx, userID)
	if err != nil {
		log.Printf("Warning: failed to get online devices: %v", err)
	} else {
		allDevices, err := np.redisService.DeviceTracker.GetUserDevices(ctx, userID)
		if err != nil {
			log.Printf("Warning: failed to get all user devices: %v", err)
		} else {
			// Find offline devices and queue messages
			onlineDeviceMap := make(map[uuid.UUID]bool)
			for _, deviceID := range onlineDevices {
				onlineDeviceMap[deviceID] = true
			}

			for _, deviceID := range allDevices {
				if !onlineDeviceMap[deviceID] {
					// Device is offline, queue the status update
					if err := np.redisService.MessageQueue.EnqueueStatusUpdate(ctx, deviceID, notificationID, notification.IsRead, notification.IsDismissed); err != nil {
						log.Printf("Warning: failed to queue status update for device %s: %v", deviceID, err)
					}
				}
			}
		}
	}

	// Record the action
	actionRecord := &types.NotificationActionRecord{
		NotificationID: notificationID,
		DeviceID:       deviceID,
		ActionType:     action,
	}
	actionRecord.SetDefaults()

	if err := np.repos.NotificationAction.Create(actionRecord); err != nil {
		log.Printf("Warning: failed to record notification action: %v", err)
	}

	log.Printf("Successfully processed action %s for notification %s", action, notificationID)
	return nil
}

// GetNotificationsForUser retrieves notifications for a user with filtering
func (np *NotificationProcessor) GetNotificationsForUser(userID uuid.UUID, filters NotificationFilters) ([]*types.Notification, error) {
	// Validate pagination
	if filters.Limit <= 0 || filters.Limit > 100 {
		filters.Limit = 50
	}
	if filters.Offset < 0 {
		filters.Offset = 0
	}

	var notifications []*types.Notification
	var err error

	// Apply filters
	if filters.Search != "" {
		if len(filters.Search) < 2 {
			return nil, fmt.Errorf("search term must be at least 2 characters")
		}
		notifications, _, err = np.repos.Notification.Search(userID, filters.Search, filters.Category, filters.Limit, filters.Offset)
	} else if filters.Category != "" {
		if err := np.validator.ValidateNotificationCategory(types.NotificationCategory(filters.Category)); err != nil {
			return nil, fmt.Errorf("invalid category: %w", err)
		}
		notifications, _, err = np.repos.Notification.Search(userID, "", filters.Category, filters.Limit, filters.Offset)
	} else {
		notifications, err = np.repos.Notification.GetByUserID(userID, filters.Limit, filters.Offset)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to retrieve notifications: %w", err)
	}

	return notifications, nil
}

// GetNotificationHistory retrieves historical notifications with comprehensive filtering
func (np *NotificationProcessor) GetNotificationHistory(userID uuid.UUID, filters NotificationFilters) ([]*types.Notification, int, error) {
	// Validate pagination
	if filters.Limit <= 0 || filters.Limit > 100 {
		filters.Limit = 50
	}
	if filters.Offset < 0 {
		filters.Offset = 0
	}

	// Validate search term
	if filters.Search != "" && len(filters.Search) < 2 {
		return nil, 0, fmt.Errorf("search term must be at least 2 characters")
	}

	// Validate category
	if filters.Category != "" {
		if err := np.validator.ValidateNotificationCategory(types.NotificationCategory(filters.Category)); err != nil {
			return nil, 0, fmt.Errorf("invalid category: %w", err)
		}
	}

	// Get notifications and total count using history repository
	notifications, totalCount, err := np.repos.NotificationHistory.GetHistory(userID, nil, filters.Limit, filters.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to retrieve notification history: %w", err)
	}

	return notifications, int(totalCount), nil
}

// GetNotificationStats retrieves notification statistics for a user
func (np *NotificationProcessor) GetNotificationStats(userID uuid.UUID, date time.Time) (*NotificationStats, error) {
	stats, err := np.repos.Notification.GetStats(userID, 1) // Get stats for 1 day
	if err != nil {
		return nil, fmt.Errorf("failed to get notification stats: %w", err)
	}

	// Extract category counts from stats
	byCategory := make(map[string]int)
	total := 0
	
	if categoryStats, ok := stats["categories"].(map[string]interface{}); ok {
		for category, count := range categoryStats {
			if countInt, ok := count.(int); ok {
				byCategory[category] = countInt
				total += countInt
			}
		}
	}

	return &NotificationStats{
		Date:       date,
		Total:      total,
		Work:       byCategory[string(types.CategoryWork)],
		Personal:   byCategory[string(types.CategoryPersonal)],
		Junk:       byCategory[string(types.CategoryJunk)],
		ByCategory: byCategory,
	}, nil
}

// CleanupExpiredNotifications removes expired notifications
func (np *NotificationProcessor) CleanupExpiredNotifications() (int64, error) {
	log.Println("Starting cleanup of expired notifications")

	deletedCount, err := np.repos.Notification.CleanupExpired()
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup expired notifications: %w", err)
	}

	if deletedCount > 0 {
		log.Printf("Cleaned up %d expired notifications", deletedCount)
	}

	return deletedCount, nil
}

// GetNotificationAppNames retrieves unique app names for a user
func (np *NotificationProcessor) GetNotificationAppNames(userID uuid.UUID) ([]string, error) {
	// Use the app breakdown method to get app names
	appBreakdown, err := np.repos.NotificationHistory.GetAppBreakdown(userID, 365) // Get apps from last year
	if err != nil {
		return nil, fmt.Errorf("failed to get app breakdown: %w", err)
	}

	appNames := make([]string, 0, len(appBreakdown))
	for _, app := range appBreakdown {
		if appName, ok := app["app_name"].(string); ok {
			appNames = append(appNames, appName)
		}
	}

	return appNames, nil
}

// GetNotificationDateRange retrieves the date range of notifications for a user
func (np *NotificationProcessor) GetNotificationDateRange(userID uuid.UUID) (*time.Time, *time.Time, error) {
	// Use history stats to get date range information
	stats, err := np.repos.NotificationHistory.GetHistoryStats(userID, 365)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get history stats: %w", err)
	}

	var minDate, maxDate *time.Time
	if minDateStr, ok := stats["earliest_date"].(string); ok {
		if parsed, err := time.Parse(time.RFC3339, minDateStr); err == nil {
			minDate = &parsed
		}
	}
	if maxDateStr, ok := stats["latest_date"].(string); ok {
		if parsed, err := time.Parse(time.RFC3339, maxDateStr); err == nil {
			maxDate = &parsed
		}
	}

	return minDate, maxDate, nil
}

// GetWeeklyNotificationStats retrieves weekly notification statistics
func (np *NotificationProcessor) GetWeeklyNotificationStats(userID uuid.UUID, weeks int) (*WeeklyStats, error) {
	if weeks <= 0 || weeks > 52 {
		weeks = 4 // Default to 4 weeks
	}

	// Use history stats to get weekly data
	days := weeks * 7
	stats, err := np.repos.NotificationHistory.GetHistoryStats(userID, days)
	if err != nil {
		return nil, fmt.Errorf("failed to get weekly stats: %w", err)
	}

	// Calculate totals and organize data
	weeklyStats := &WeeklyStats{
		Weeks:      make([]WeekStat, 0),
		TotalCount: 0,
	}

	// Extract weekly data from stats if available
	if weeklyData, ok := stats["weekly"].([]interface{}); ok {
		for _, week := range weeklyData {
			if weekMap, ok := week.(map[string]interface{}); ok {
				weekStat := WeekStat{
					Categories: make(map[string]int),
					Total:      0,
				}

				if weekStart, ok := weekMap["week_start"].(string); ok {
					weekStat.WeekStart = weekStart
				}

				if categories, ok := weekMap["categories"].(map[string]interface{}); ok {
					for category, count := range categories {
						if countInt, ok := count.(int); ok {
							weekStat.Categories[category] = countInt
							weekStat.Total += countInt
							weeklyStats.TotalCount += countInt
						}
					}
				}

				weeklyStats.Weeks = append(weeklyStats.Weeks, weekStat)
			}
		}
	}

	return weeklyStats, nil
}

// SearchNotifications performs advanced search with highlighting
func (np *NotificationProcessor) SearchNotifications(userID uuid.UUID, query string, filters NotificationFilters) (*SearchResults, error) {
	if query == "" {
		return nil, fmt.Errorf("search query is required")
	}

	if len(query) < 2 {
		return nil, fmt.Errorf("search query must be at least 2 characters")
	}

	// Set search in filters
	filters.Search = query

	// Get search results
	notifications, totalCount, err := np.GetNotificationHistory(userID, filters)
	if err != nil {
		return nil, fmt.Errorf("failed to search notifications: %w", err)
	}

	// Create search results with metadata
	results := &SearchResults{
		Query:        query,
		Notifications: notifications,
		TotalCount:   totalCount,
		Page:         (filters.Offset / filters.Limit) + 1,
		PageSize:     filters.Limit,
		TotalPages:   (totalCount + filters.Limit - 1) / filters.Limit,
	}

	return results, nil
}

// GetNotificationSummary provides a summary of notifications for a user
func (np *NotificationProcessor) GetNotificationSummary(userID uuid.UUID) (*NotificationSummary, error) {
	// Get date range
	minDate, maxDate, err := np.GetNotificationDateRange(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get date range: %w", err)
	}

	// Get history stats which should include counts
	stats, err := np.repos.NotificationHistory.GetHistoryStats(userID, 365)
	if err != nil {
		return nil, fmt.Errorf("failed to get history stats: %w", err)
	}

	// Extract counts from stats
	var totalCount, unreadCount, dismissedCount int
	if total, ok := stats["total_count"].(int); ok {
		totalCount = total
	}
	if unread, ok := stats["unread_count"].(int); ok {
		unreadCount = unread
	}
	if dismissed, ok := stats["dismissed_count"].(int); ok {
		dismissedCount = dismissed
	}

	// Get app names
	appNames, err := np.GetNotificationAppNames(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get app names: %w", err)
	}

	// Get today's stats
	today := time.Now()
	todayStats, err := np.GetNotificationStats(userID, today)
	if err != nil {
		return nil, fmt.Errorf("failed to get today's stats: %w", err)
	}

	summary := &NotificationSummary{
		TotalCount:     totalCount,
		UnreadCount:    unreadCount,
		DismissedCount: dismissedCount,
		AppCount:       len(appNames),
		EarliestDate:   minDate,
		LatestDate:     maxDate,
		TodayStats:     todayStats,
	}

	return summary, nil
}

// NotificationFilters represents filtering options for notifications
type NotificationFilters struct {
	Category    string
	AppName     string
	Search      string
	IsRead      *bool
	IsDismissed *bool
	StartDate   *time.Time
	EndDate     *time.Time
	Limit       int
	Offset      int
}

// NotificationStats represents notification statistics
type NotificationStats struct {
	Date       time.Time      `json:"date"`
	Total      int            `json:"total"`
	Work       int            `json:"work"`
	Personal   int            `json:"personal"`
	Junk       int            `json:"junk"`
	ByCategory map[string]int `json:"by_category"`
}

// WeeklyStats represents weekly notification statistics
type WeeklyStats struct {
	Weeks      []WeekStat `json:"weeks"`
	TotalCount int        `json:"total_count"`
}

// WeekStat represents statistics for a single week
type WeekStat struct {
	WeekStart  string         `json:"week_start"`
	Categories map[string]int `json:"categories"`
	Total      int            `json:"total"`
}

// SearchResults represents search results with metadata
type SearchResults struct {
	Query         string                   `json:"query"`
	Notifications []*types.Notification    `json:"notifications"`
	TotalCount    int                      `json:"total_count"`
	Page          int                      `json:"page"`
	PageSize      int                      `json:"page_size"`
	TotalPages    int                      `json:"total_pages"`
}

// NotificationSummary provides an overview of user's notifications
type NotificationSummary struct {
	TotalCount     int                 `json:"total_count"`
	UnreadCount    int                 `json:"unread_count"`
	DismissedCount int                 `json:"dismissed_count"`
	AppCount       int                 `json:"app_count"`
	EarliestDate   *time.Time          `json:"earliest_date"`
	LatestDate     *time.Time          `json:"latest_date"`
	TodayStats     *NotificationStats  `json:"today_stats"`
}