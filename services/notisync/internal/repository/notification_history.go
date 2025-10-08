package repository

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
)

// NotificationHistoryRepository handles notification history operations
type NotificationHistoryRepository struct {
	db *sql.DB
}

// NewNotificationHistoryRepository creates a new notification history repository
func NewNotificationHistoryRepository(db *sql.DB) *NotificationHistoryRepository {
	return &NotificationHistoryRepository{db: db}
}

// SearchOptions defines search parameters for notification history
type SearchOptions struct {
	UserID      uuid.UUID
	Limit       int
	Offset      int
	StartDate   *time.Time
	EndDate     *time.Time
	AppName     string
	Category    string
	Keywords    string
	ReadStatus  string // "all", "read", "unread"
	SortBy      string // "created_at", "app_name", "category"
	SortOrder   string // "asc", "desc"
}

// SearchNotifications searches notification history with advanced filters
func (r *NotificationHistoryRepository) SearchNotifications(opts SearchOptions) ([]*types.Notification, int, error) {
	// Build the base query
	baseQuery := `
		FROM notifications 
		WHERE user_id = $1 AND expires_at > NOW()
	`
	
	countQuery := "SELECT COUNT(*) " + baseQuery
	selectQuery := `
		SELECT id, user_id, source_device_id, app_name, title, body, category, priority, 
		       is_read, is_dismissed, created_at, expires_at
	` + baseQuery

	args := []interface{}{opts.UserID}
	argIndex := 2

	// Add date filters
	if opts.StartDate != nil {
		baseQuery += fmt.Sprintf(" AND created_at >= $%d", argIndex)
		args = append(args, *opts.StartDate)
		argIndex++
	}
	if opts.EndDate != nil {
		baseQuery += fmt.Sprintf(" AND created_at <= $%d", argIndex)
		args = append(args, *opts.EndDate)
		argIndex++
	}

	// Add app name filter
	if opts.AppName != "" {
		baseQuery += fmt.Sprintf(" AND app_name ILIKE $%d", argIndex)
		args = append(args, "%"+opts.AppName+"%")
		argIndex++
	}

	// Add category filter
	if opts.Category != "" {
		baseQuery += fmt.Sprintf(" AND category = $%d", argIndex)
		args = append(args, opts.Category)
		argIndex++
	}

	// Add keyword search (searches in title and body)
	if opts.Keywords != "" {
		keywords := strings.Fields(opts.Keywords)
		if len(keywords) > 0 {
			keywordConditions := make([]string, len(keywords))
			for i, keyword := range keywords {
				keywordConditions[i] = fmt.Sprintf("(title ILIKE $%d OR body ILIKE $%d)", argIndex, argIndex+1)
				args = append(args, "%"+keyword+"%", "%"+keyword+"%")
				argIndex += 2
			}
			baseQuery += " AND (" + strings.Join(keywordConditions, " AND ") + ")"
		}
	}

	// Add read status filter
	if opts.ReadStatus == "read" {
		baseQuery += fmt.Sprintf(" AND is_read = $%d", argIndex)
		args = append(args, true)
		argIndex++
	} else if opts.ReadStatus == "unread" {
		baseQuery += fmt.Sprintf(" AND is_read = $%d", argIndex)
		args = append(args, false)
		argIndex++
	}

	// Update queries with filters
	countQuery = "SELECT COUNT(*) " + baseQuery
	selectQuery = `
		SELECT id, user_id, source_device_id, app_name, title, body, category, priority, 
		       is_read, is_dismissed, created_at, expires_at
	` + baseQuery

	// Get total count
	var totalCount int
	err := r.db.QueryRow(countQuery, args...).Scan(&totalCount)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get count: %w", err)
	}

	// Add sorting
	sortBy := opts.SortBy
	if sortBy == "" {
		sortBy = "created_at"
	}
	sortOrder := opts.SortOrder
	if sortOrder == "" {
		sortOrder = "desc"
	}
	
	// Validate sort fields to prevent SQL injection
	validSortFields := map[string]bool{
		"created_at": true,
		"app_name":   true,
		"category":   true,
		"priority":   true,
	}
	if !validSortFields[sortBy] {
		sortBy = "created_at"
	}
	if sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "desc"
	}

	selectQuery += fmt.Sprintf(" ORDER BY %s %s", sortBy, strings.ToUpper(sortOrder))

	// Add pagination
	if opts.Limit > 0 {
		selectQuery += fmt.Sprintf(" LIMIT $%d", argIndex)
		args = append(args, opts.Limit)
		argIndex++
	}
	if opts.Offset > 0 {
		selectQuery += fmt.Sprintf(" OFFSET $%d", argIndex)
		args = append(args, opts.Offset)
	}

	// Execute query
	rows, err := r.db.Query(selectQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to search notifications: %w", err)
	}
	defer rows.Close()

	var notifications []*types.Notification
	for rows.Next() {
		notification := &types.Notification{}
		err := rows.Scan(
			&notification.ID,
			&notification.UserID,
			&notification.SourceDeviceID,
			&notification.AppName,
			&notification.Title,
			&notification.Body,
			&notification.Category,
			&notification.Priority,
			&notification.IsRead,
			&notification.IsDismissed,
			&notification.CreatedAt,
			&notification.ExpiresAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan notification: %w", err)
		}
		notifications = append(notifications, notification)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("row iteration error: %w", err)
	}

	return notifications, totalCount, nil
}

// GetNotificationHistory retrieves paginated notification history for a user
func (r *NotificationHistoryRepository) GetNotificationHistory(userID uuid.UUID, limit, offset int) ([]*types.Notification, error) {
	query := `
		SELECT id, user_id, source_device_id, app_name, title, body, category, priority, 
		       is_read, is_dismissed, created_at, expires_at
		FROM notifications 
		WHERE user_id = $1 AND expires_at > NOW()
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.Query(query, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get notification history: %w", err)
	}
	defer rows.Close()

	var notifications []*types.Notification
	for rows.Next() {
		notification := &types.Notification{}
		err := rows.Scan(
			&notification.ID,
			&notification.UserID,
			&notification.SourceDeviceID,
			&notification.AppName,
			&notification.Title,
			&notification.Body,
			&notification.Category,
			&notification.Priority,
			&notification.IsRead,
			&notification.IsDismissed,
			&notification.CreatedAt,
			&notification.ExpiresAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan notification: %w", err)
		}
		notifications = append(notifications, notification)
	}

	return notifications, nil
}

// CleanupExpiredNotifications removes notifications older than 7 days
func (r *NotificationHistoryRepository) CleanupExpiredNotifications() (int, error) {
	query := `
		DELETE FROM notifications 
		WHERE expires_at <= NOW() OR created_at < NOW() - INTERVAL '7 days'
	`

	result, err := r.db.Exec(query)
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup expired notifications: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get rows affected: %w", err)
	}

	return int(rowsAffected), nil
}

// GetHistoryStats returns statistics about notification history
func (r *NotificationHistoryRepository) GetHistoryStats(userID uuid.UUID, days int) (map[string]interface{}, error) {
	query := `
		SELECT 
			COUNT(*) as total,
			COUNT(CASE WHEN is_read = true THEN 1 END) as read,
			COUNT(CASE WHEN is_read = false THEN 1 END) as unread,
			COUNT(CASE WHEN is_dismissed = true THEN 1 END) as dismissed,
			COUNT(DISTINCT app_name) as unique_apps,
			COUNT(DISTINCT DATE(created_at)) as active_days
		FROM notifications 
		WHERE user_id = $1 
		AND created_at >= NOW() - INTERVAL '%d days'
		AND expires_at > NOW()
	`

	var stats struct {
		Total      int `json:"total"`
		Read       int `json:"read"`
		Unread     int `json:"unread"`
		Dismissed  int `json:"dismissed"`
		UniqueApps int `json:"unique_apps"`
		ActiveDays int `json:"active_days"`
	}

	err := r.db.QueryRow(fmt.Sprintf(query, days), userID).Scan(
		&stats.Total,
		&stats.Read,
		&stats.Unread,
		&stats.Dismissed,
		&stats.UniqueApps,
		&stats.ActiveDays,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get history stats: %w", err)
	}

	// Get daily breakdown
	dailyQuery := `
		SELECT DATE(created_at) as date, COUNT(*) as count
		FROM notifications 
		WHERE user_id = $1 
		AND created_at >= NOW() - INTERVAL '%d days'
		AND expires_at > NOW()
		GROUP BY DATE(created_at)
		ORDER BY date DESC
	`

	rows, err := r.db.Query(fmt.Sprintf(dailyQuery, days), userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get daily breakdown: %w", err)
	}
	defer rows.Close()

	dailyBreakdown := make(map[string]int)
	for rows.Next() {
		var date time.Time
		var count int
		if err := rows.Scan(&date, &count); err != nil {
			continue
		}
		dailyBreakdown[date.Format("2006-01-02")] = count
	}

	return map[string]interface{}{
		"total":           stats.Total,
		"read":            stats.Read,
		"unread":          stats.Unread,
		"dismissed":       stats.Dismissed,
		"unique_apps":     stats.UniqueApps,
		"active_days":     stats.ActiveDays,
		"daily_breakdown": dailyBreakdown,
		"period_days":     days,
		"timestamp":       time.Now(),
	}, nil
}

// GetAppBreakdownMap returns notification count by app for a user (legacy method)
func (r *NotificationHistoryRepository) GetAppBreakdownMap(userID uuid.UUID, days int) (map[string]int, error) {
	query := `
		SELECT app_name, COUNT(*) as count
		FROM notifications 
		WHERE user_id = $1 
		AND created_at >= NOW() - INTERVAL '%d days'
		AND expires_at > NOW()
		GROUP BY app_name
		ORDER BY count DESC
		LIMIT 20
	`

	rows, err := r.db.Query(fmt.Sprintf(query, days), userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get app breakdown: %w", err)
	}
	defer rows.Close()

	breakdown := make(map[string]int)
	for rows.Next() {
		var appName string
		var count int
		if err := rows.Scan(&appName, &count); err != nil {
			continue
		}
		breakdown[appName] = count
	}

	return breakdown, nil
}

// GetHistory retrieves notification history for a user with filters (interface method)
func (r *NotificationHistoryRepository) GetHistory(userID uuid.UUID, filters map[string]interface{}, limit, offset int) ([]*types.Notification, int64, error) {
	opts := SearchOptions{
		UserID: userID,
		Limit:  limit,
		Offset: offset,
	}

	// Parse filters
	if category, ok := filters["category"].(string); ok {
		opts.Category = category
	}
	if appName, ok := filters["app_name"].(string); ok {
		opts.AppName = appName
	}
	if search, ok := filters["search"].(string); ok {
		opts.Keywords = search
	}
	if isRead, ok := filters["is_read"].(bool); ok {
		if isRead {
			opts.ReadStatus = "read"
		} else {
			opts.ReadStatus = "unread"
		}
	}
	if startDate, ok := filters["start_date"].(time.Time); ok {
		opts.StartDate = &startDate
	}
	if endDate, ok := filters["end_date"].(time.Time); ok {
		opts.EndDate = &endDate
	}

	notifications, totalCount, err := r.SearchNotifications(opts)
	if err != nil {
		return nil, 0, err
	}

	return notifications, int64(totalCount), nil
}

// SearchHistory searches notification history with text query (interface method)
func (r *NotificationHistoryRepository) SearchHistory(userID uuid.UUID, query string, limit, offset int) ([]*types.Notification, int64, error) {
	opts := SearchOptions{
		UserID:   userID,
		Keywords: query,
		Limit:    limit,
		Offset:   offset,
	}

	notifications, totalCount, err := r.SearchNotifications(opts)
	if err != nil {
		return nil, 0, err
	}

	return notifications, int64(totalCount), nil
}

// GetAppBreakdown returns notification breakdown by app (interface method)
func (r *NotificationHistoryRepository) GetAppBreakdown(userID uuid.UUID, days int) ([]map[string]interface{}, error) {
	query := `
		SELECT app_name, COUNT(*) as count
		FROM notifications 
		WHERE user_id = $1 
		AND created_at >= NOW() - INTERVAL '%d days'
		AND expires_at > NOW()
		GROUP BY app_name
		ORDER BY count DESC
		LIMIT 20
	`

	rows, err := r.db.Query(fmt.Sprintf(query, days), userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get app breakdown: %w", err)
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var appName string
		var count int
		if err := rows.Scan(&appName, &count); err != nil {
			continue
		}
		results = append(results, map[string]interface{}{
			"_id":   appName,
			"total": count,
		})
	}

	return results, nil
}

// CleanupExpired removes expired notifications (interface method)
func (r *NotificationHistoryRepository) CleanupExpired() (int64, error) {
	count, err := r.CleanupExpiredNotifications()
	return int64(count), err
}