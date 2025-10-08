package services

import (
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/redis"
	"github.com/notisync/backend/internal/repository"
	"github.com/notisync/backend/internal/types"
)

// NotificationHistoryService handles notification history operations
type NotificationHistoryService struct {
	historyRepo  repository.NotificationHistoryRepositoryInterface
	redisService *redis.Service
}

// NewNotificationHistoryService creates a new notification history service
func NewNotificationHistoryService(historyRepo repository.NotificationHistoryRepositoryInterface, redisService *redis.Service) *NotificationHistoryService {
	return &NotificationHistoryService{
		historyRepo:  historyRepo,
		redisService: redisService,
	}
}

// SearchRequest represents a search request for notification history
type SearchRequest struct {
	UserID      uuid.UUID `json:"user_id"`
	Query       string    `json:"query"`
	AppName     string    `json:"app_name"`
	Category    string    `json:"category"`
	StartDate   string    `json:"start_date"`
	EndDate     string    `json:"end_date"`
	ReadStatus  string    `json:"read_status"` // "all", "read", "unread"
	SortBy      string    `json:"sort_by"`     // "created_at", "updated_at", "app_name", "category"
	SortOrder   string    `json:"sort_order"`  // "asc", "desc"
	Page        int       `json:"page"`
	PageSize    int       `json:"page_size"`
}

// SearchResponse represents the response for a search request
type SearchResponse struct {
	Notifications []*types.Notification `json:"notifications"`
	TotalCount    int                   `json:"total_count"`
	Page          int                   `json:"page"`
	PageSize      int                   `json:"page_size"`
	TotalPages    int                   `json:"total_pages"`
	HasNext       bool                  `json:"has_next"`
	HasPrevious   bool                  `json:"has_previous"`
}

// SearchNotifications searches notification history with advanced filters
func (nhs *NotificationHistoryService) SearchNotifications(req SearchRequest) (*SearchResponse, error) {
	// Validate and set defaults
	if req.Page < 1 {
		req.Page = 1
	}
	if req.PageSize < 1 || req.PageSize > 100 {
		req.PageSize = 20
	}

	// Parse dates (currently not used but may be needed for future filtering)
	if req.StartDate != "" {
		if _, err := time.Parse("2006-01-02", req.StartDate); err != nil {
			return nil, fmt.Errorf("invalid start date format: %w", err)
		}
	}
	if req.EndDate != "" {
		if _, err := time.Parse("2006-01-02", req.EndDate); err != nil {
			return nil, fmt.Errorf("invalid end date format: %w", err)
		}
	}

	// Search notifications
	notifications, totalCount, err := nhs.historyRepo.SearchHistory(req.UserID, req.Query, req.PageSize, (req.Page-1)*req.PageSize)
	if err != nil {
		return nil, fmt.Errorf("failed to search notifications: %w", err)
	}

	// Calculate pagination info
	totalPages := int((totalCount + int64(req.PageSize) - 1) / int64(req.PageSize))
	hasNext := req.Page < totalPages
	hasPrevious := req.Page > 1

	return &SearchResponse{
		Notifications: notifications,
		TotalCount:    int(totalCount),
		Page:          req.Page,
		PageSize:      req.PageSize,
		TotalPages:    totalPages,
		HasNext:       hasNext,
		HasPrevious:   hasPrevious,
	}, nil
}

// GetNotificationHistory retrieves paginated notification history
func (nhs *NotificationHistoryService) GetNotificationHistory(userID uuid.UUID, page, pageSize int) (*SearchResponse, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize
	notifications, totalCount, err := nhs.historyRepo.GetHistory(userID, nil, pageSize, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get notification history: %w", err)
	}

	// Calculate pagination info
	totalPages := int((totalCount + int64(pageSize) - 1) / int64(pageSize))
	hasNext := page < totalPages
	hasPrev := page > 1

	return &SearchResponse{
		Notifications: notifications,
		TotalCount:    int(totalCount),
		Page:          page,
		PageSize:      pageSize,
		TotalPages:    totalPages,
		HasNext:       hasNext,
		HasPrevious:   hasPrev,
	}, nil
}

// GetHistoryStats returns notification history statistics
func (nhs *NotificationHistoryService) GetHistoryStats(userID uuid.UUID, days int) (map[string]interface{}, error) {
	if days <= 0 {
		days = 30 // Default to 30 days
	}
	if days > 365 {
		days = 365 // Maximum 1 year
	}

	// TODO: Try to get from cache first when Redis cache methods are available

	// Get from database
	stats, err := nhs.historyRepo.GetHistoryStats(userID, days)
	if err != nil {
		return nil, fmt.Errorf("failed to get history stats: %w", err)
	}

	// TODO: Cache for 1 hour when Redis cache methods are available

	return stats, nil
}

// GetAppBreakdown returns notification breakdown by app
func (nhs *NotificationHistoryService) GetAppBreakdown(userID uuid.UUID, days int) (map[string]int, error) {
	if days <= 0 {
		days = 30
	}
	if days > 365 {
		days = 365
	}

	// TODO: Try to get from cache first when Redis cache methods are available

	// Get from database
	rawBreakdown, err := nhs.historyRepo.GetAppBreakdown(userID, days)
	if err != nil {
		return nil, fmt.Errorf("failed to get app breakdown: %w", err)
	}

	// Convert []map[string]interface{} to map[string]int
	breakdown := make(map[string]int)
	for _, item := range rawBreakdown {
		if appName, ok := item["app_name"].(string); ok {
			if count, ok := item["count"].(int64); ok {
				breakdown[appName] = int(count)
			} else if count, ok := item["count"].(int); ok {
				breakdown[appName] = count
			}
		}
	}

	// TODO: Cache for 30 minutes when Redis cache methods are available

	return breakdown, nil
}

// CleanupExpiredNotifications removes old notifications
func (nhs *NotificationHistoryService) CleanupExpiredNotifications() (int, error) {
	deletedCount, err := nhs.historyRepo.CleanupExpired()
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup expired notifications: %w", err)
	}

	log.Printf("Cleaned up %d expired notifications", deletedCount)
	return int(deletedCount), nil
}

// ScheduleCleanup starts a background goroutine to periodically cleanup expired notifications
func (nhs *NotificationHistoryService) ScheduleCleanup(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		for range ticker.C {
			if _, err := nhs.CleanupExpiredNotifications(); err != nil {
				log.Printf("Error during scheduled cleanup: %v", err)
			}
		}
	}()
	log.Printf("Scheduled notification cleanup every %v", interval)
}

// ExportNotifications exports notifications for a user in a specific format
func (nhs *NotificationHistoryService) ExportNotifications(userID uuid.UUID, format string, days int) ([]byte, error) {
	if days <= 0 {
		days = 30
	}
	if days > 365 {
		days = 365
	}

	// Get all notifications for the period
	searchReq := SearchRequest{
		UserID:   userID,
		Page:     1,
		PageSize: 10000, // Large page size for export
		SortBy:   "created_at",
		SortOrder: "desc",
	}

	// Set date range
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -days)
	searchReq.StartDate = startDate.Format("2006-01-02")
	searchReq.EndDate = endDate.Format("2006-01-02")

	response, err := nhs.SearchNotifications(searchReq)
	if err != nil {
		return nil, fmt.Errorf("failed to get notifications for export: %w", err)
	}

	switch format {
	case "json":
		return nhs.exportAsJSON(response.Notifications)
	case "csv":
		return nhs.exportAsCSV(response.Notifications)
	default:
		return nil, fmt.Errorf("unsupported export format: %s", format)
	}
}

// exportAsJSON exports notifications as JSON
func (nhs *NotificationHistoryService) exportAsJSON(notifications []*types.Notification) ([]byte, error) {
	// This would use encoding/json to marshal the notifications
	// For now, return a placeholder
	return []byte("{}"), nil
}

// exportAsCSV exports notifications as CSV
func (nhs *NotificationHistoryService) exportAsCSV(notifications []*types.Notification) ([]byte, error) {
	// This would use encoding/csv to create CSV data
	// For now, return a placeholder
	return []byte("id,app_name,title,category,created_at\n"), nil
}