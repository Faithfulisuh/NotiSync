package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
)

type NotificationRepository struct {
	db *sql.DB
}

func NewNotificationRepository(db *sql.DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

func (r *NotificationRepository) Create(notification *types.Notification) error {
	query := `
		INSERT INTO notifications (id, user_id, source_device_id, app_name, title, body, category, priority, is_read, is_dismissed, created_at, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`
	
	notification.ID = uuid.New()
	notification.CreatedAt = time.Now()
	notification.ExpiresAt = notification.CreatedAt.Add(7 * 24 * time.Hour) // 7 days

	_, err := r.db.Exec(query,
		notification.ID, notification.UserID, notification.SourceDeviceID,
		notification.AppName, notification.Title, notification.Body,
		notification.Category, notification.Priority, notification.IsRead,
		notification.IsDismissed, notification.CreatedAt, notification.ExpiresAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create notification: %w", err)
	}

	return nil
}

func (r *NotificationRepository) GetByID(id uuid.UUID) (*types.Notification, error) {
	query := `
		SELECT id, user_id, source_device_id, app_name, title, body, category, priority, is_read, is_dismissed, created_at, expires_at
		FROM notifications
		WHERE id = $1
	`

	notification := &types.Notification{}
	err := r.db.QueryRow(query, id).Scan(
		&notification.ID, &notification.UserID, &notification.SourceDeviceID,
		&notification.AppName, &notification.Title, &notification.Body,
		&notification.Category, &notification.Priority, &notification.IsRead,
		&notification.IsDismissed, &notification.CreatedAt, &notification.ExpiresAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("notification not found")
		}
		return nil, fmt.Errorf("failed to get notification by ID: %w", err)
	}

	return notification, nil
}

func (r *NotificationRepository) GetByUserID(userID uuid.UUID, limit, offset int) ([]*types.Notification, error) {
	query := `
		SELECT id, user_id, source_device_id, app_name, title, body, category, priority, is_read, is_dismissed, created_at, expires_at
		FROM notifications
		WHERE user_id = $1 AND expires_at > NOW()
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.Query(query, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get notifications by user ID: %w", err)
	}
	defer rows.Close()

	var notifications []*types.Notification
	for rows.Next() {
		notification := &types.Notification{}
		err := rows.Scan(
			&notification.ID, &notification.UserID, &notification.SourceDeviceID,
			&notification.AppName, &notification.Title, &notification.Body,
			&notification.Category, &notification.Priority, &notification.IsRead,
			&notification.IsDismissed, &notification.CreatedAt, &notification.ExpiresAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan notification: %w", err)
		}
		notifications = append(notifications, notification)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating notifications: %w", err)
	}

	return notifications, nil
}

func (r *NotificationRepository) GetByCategory(userID uuid.UUID, category types.NotificationCategory, limit, offset int) ([]*types.Notification, error) {
	query := `
		SELECT id, user_id, source_device_id, app_name, title, body, category, priority, is_read, is_dismissed, created_at, expires_at
		FROM notifications
		WHERE user_id = $1 AND category = $2 AND expires_at > NOW()
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`

	rows, err := r.db.Query(query, userID, category, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get notifications by category: %w", err)
	}
	defer rows.Close()

	var notifications []*types.Notification
	for rows.Next() {
		notification := &types.Notification{}
		err := rows.Scan(
			&notification.ID, &notification.UserID, &notification.SourceDeviceID,
			&notification.AppName, &notification.Title, &notification.Body,
			&notification.Category, &notification.Priority, &notification.IsRead,
			&notification.IsDismissed, &notification.CreatedAt, &notification.ExpiresAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan notification: %w", err)
		}
		notifications = append(notifications, notification)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating notifications: %w", err)
	}

	return notifications, nil
}

// SearchOld - keeping for backward compatibility
func (r *NotificationRepository) SearchOld(userID uuid.UUID, searchTerm string, limit, offset int) ([]*types.Notification, error) {
	query := `
		SELECT id, user_id, source_device_id, app_name, title, body, category, priority, is_read, is_dismissed, created_at, expires_at
		FROM notifications
		WHERE user_id = $1 AND expires_at > NOW()
		AND (title ILIKE $2 OR body ILIKE $2 OR app_name ILIKE $2)
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`

	searchPattern := "%" + searchTerm + "%"
	rows, err := r.db.Query(query, userID, searchPattern, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to search notifications: %w", err)
	}
	defer rows.Close()

	var notifications []*types.Notification
	for rows.Next() {
		notification := &types.Notification{}
		err := rows.Scan(
			&notification.ID, &notification.UserID, &notification.SourceDeviceID,
			&notification.AppName, &notification.Title, &notification.Body,
			&notification.Category, &notification.Priority, &notification.IsRead,
			&notification.IsDismissed, &notification.CreatedAt, &notification.ExpiresAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan notification: %w", err)
		}
		notifications = append(notifications, notification)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating notifications: %w", err)
	}

	return notifications, nil
}

// UpdateStatusOld - keeping for backward compatibility
func (r *NotificationRepository) UpdateStatusOld(id uuid.UUID, isRead, isDismissed bool) error {
	query := `
		UPDATE notifications
		SET is_read = $2, is_dismissed = $3
		WHERE id = $1
	`

	result, err := r.db.Exec(query, id, isRead, isDismissed)
	if err != nil {
		return fmt.Errorf("failed to update notification status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("notification not found")
	}

	return nil
}

func (r *NotificationRepository) Delete(id uuid.UUID) error {
	query := `DELETE FROM notifications WHERE id = $1`

	result, err := r.db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete notification: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("notification not found")
	}

	return nil
}

func (r *NotificationRepository) DeleteExpired() (int64, error) {
	query := `DELETE FROM notifications WHERE expires_at <= NOW()`

	result, err := r.db.Exec(query)
	if err != nil {
		return 0, fmt.Errorf("failed to delete expired notifications: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get rows affected: %w", err)
	}

	return rowsAffected, nil
}

// HistoryFilters represents filtering options for notification history
type HistoryFilters struct {
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

// GetHistory retrieves notification history with comprehensive filtering
func (r *NotificationRepository) GetHistory(userID uuid.UUID, filters HistoryFilters) ([]*types.Notification, error) {
	query := `
		SELECT id, user_id, source_device_id, app_name, title, body, category, priority, is_read, is_dismissed, created_at, expires_at
		FROM notifications
		WHERE user_id = $1
	`
	
	args := []interface{}{userID}
	argIndex := 2

	// Add filters
	if filters.Category != "" {
		query += fmt.Sprintf(" AND category = $%d", argIndex)
		args = append(args, filters.Category)
		argIndex++
	}

	if filters.AppName != "" {
		query += fmt.Sprintf(" AND app_name ILIKE $%d", argIndex)
		args = append(args, "%"+filters.AppName+"%")
		argIndex++
	}

	if filters.Search != "" {
		query += fmt.Sprintf(" AND (title ILIKE $%d OR body ILIKE $%d OR app_name ILIKE $%d)", argIndex, argIndex, argIndex)
		args = append(args, "%"+filters.Search+"%")
		argIndex++
	}

	if filters.IsRead != nil {
		query += fmt.Sprintf(" AND is_read = $%d", argIndex)
		args = append(args, *filters.IsRead)
		argIndex++
	}

	if filters.IsDismissed != nil {
		query += fmt.Sprintf(" AND is_dismissed = $%d", argIndex)
		args = append(args, *filters.IsDismissed)
		argIndex++
	}

	if filters.StartDate != nil {
		query += fmt.Sprintf(" AND created_at >= $%d", argIndex)
		args = append(args, *filters.StartDate)
		argIndex++
	}

	if filters.EndDate != nil {
		query += fmt.Sprintf(" AND created_at <= $%d", argIndex)
		args = append(args, *filters.EndDate)
		argIndex++
	}

	query += " ORDER BY created_at DESC"

	if filters.Limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", argIndex)
		args = append(args, filters.Limit)
		argIndex++
	}

	if filters.Offset > 0 {
		query += fmt.Sprintf(" OFFSET $%d", argIndex)
		args = append(args, filters.Offset)
		argIndex++
	}

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get notification history: %w", err)
	}
	defer rows.Close()

	var notifications []*types.Notification
	for rows.Next() {
		notification := &types.Notification{}
		err := rows.Scan(
			&notification.ID, &notification.UserID, &notification.SourceDeviceID,
			&notification.AppName, &notification.Title, &notification.Body,
			&notification.Category, &notification.Priority, &notification.IsRead,
			&notification.IsDismissed, &notification.CreatedAt, &notification.ExpiresAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan notification: %w", err)
		}
		notifications = append(notifications, notification)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating notifications: %w", err)
	}

	return notifications, nil
}

// GetHistoryCount returns the total count of notifications matching the filters
func (r *NotificationRepository) GetHistoryCount(userID uuid.UUID, filters HistoryFilters) (int, error) {
	query := `
		SELECT COUNT(*)
		FROM notifications
		WHERE user_id = $1
	`
	
	args := []interface{}{userID}
	argIndex := 2

	// Add same filters as GetHistory
	if filters.Category != "" {
		query += fmt.Sprintf(" AND category = $%d", argIndex)
		args = append(args, filters.Category)
		argIndex++
	}

	if filters.AppName != "" {
		query += fmt.Sprintf(" AND app_name ILIKE $%d", argIndex)
		args = append(args, "%"+filters.AppName+"%")
		argIndex++
	}

	if filters.Search != "" {
		query += fmt.Sprintf(" AND (title ILIKE $%d OR body ILIKE $%d OR app_name ILIKE $%d)", argIndex, argIndex, argIndex)
		args = append(args, "%"+filters.Search+"%")
		argIndex++
	}

	if filters.IsRead != nil {
		query += fmt.Sprintf(" AND is_read = $%d", argIndex)
		args = append(args, *filters.IsRead)
		argIndex++
	}

	if filters.IsDismissed != nil {
		query += fmt.Sprintf(" AND is_dismissed = $%d", argIndex)
		args = append(args, *filters.IsDismissed)
		argIndex++
	}

	if filters.StartDate != nil {
		query += fmt.Sprintf(" AND created_at >= $%d", argIndex)
		args = append(args, *filters.StartDate)
		argIndex++
	}

	if filters.EndDate != nil {
		query += fmt.Sprintf(" AND created_at <= $%d", argIndex)
		args = append(args, *filters.EndDate)
		argIndex++
	}

	var count int
	err := r.db.QueryRow(query, args...).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get notification history count: %w", err)
	}

	return count, nil
}

// GetAppNames returns a list of unique app names for a user
func (r *NotificationRepository) GetAppNames(userID uuid.UUID) ([]string, error) {
	query := `
		SELECT DISTINCT app_name
		FROM notifications
		WHERE user_id = $1
		ORDER BY app_name
	`

	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get app names: %w", err)
	}
	defer rows.Close()

	var appNames []string
	for rows.Next() {
		var appName string
		err := rows.Scan(&appName)
		if err != nil {
			return nil, fmt.Errorf("failed to scan app name: %w", err)
		}
		appNames = append(appNames, appName)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating app names: %w", err)
	}

	return appNames, nil
}

// GetDateRange returns the earliest and latest notification dates for a user
func (r *NotificationRepository) GetDateRange(userID uuid.UUID) (*time.Time, *time.Time, error) {
	query := `
		SELECT MIN(created_at), MAX(created_at)
		FROM notifications
		WHERE user_id = $1
	`

	var minDate, maxDate sql.NullTime
	err := r.db.QueryRow(query, userID).Scan(&minDate, &maxDate)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get date range: %w", err)
	}

	var min, max *time.Time
	if minDate.Valid {
		min = &minDate.Time
	}
	if maxDate.Valid {
		max = &maxDate.Time
	}

	return min, max, nil
}

// GetWeeklyStats returns notification statistics grouped by week
func (r *NotificationRepository) GetWeeklyStats(userID uuid.UUID, weeks int) (map[string]map[string]int, error) {
	query := `
		SELECT 
			DATE_TRUNC('week', created_at) as week_start,
			category,
			COUNT(*) as count
		FROM notifications
		WHERE user_id = $1 
		AND created_at >= NOW() - INTERVAL '%d weeks'
		GROUP BY week_start, category
		ORDER BY week_start DESC
	`

	rows, err := r.db.Query(fmt.Sprintf(query, weeks), userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get weekly stats: %w", err)
	}
	defer rows.Close()

	stats := make(map[string]map[string]int)
	for rows.Next() {
		var weekStart time.Time
		var category string
		var count int
		
		err := rows.Scan(&weekStart, &category, &count)
		if err != nil {
			return nil, fmt.Errorf("failed to scan weekly stats: %w", err)
		}
		
		weekKey := weekStart.Format("2006-01-02")
		if stats[weekKey] == nil {
			stats[weekKey] = make(map[string]int)
		}
		stats[weekKey][category] = count
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating weekly stats: %w", err)
	}

	return stats, nil
}

func (r *NotificationRepository) GetDailyStats(userID uuid.UUID, date time.Time) (map[string]int, error) {
	query := `
		SELECT category, COUNT(*) as count
		FROM notifications
		WHERE user_id = $1 
		AND DATE(created_at) = DATE($2)
		GROUP BY category
	`

	rows, err := r.db.Query(query, userID, date)
	if err != nil {
		return nil, fmt.Errorf("failed to get daily stats: %w", err)
	}
	defer rows.Close()

	stats := make(map[string]int)
	for rows.Next() {
		var category string
		var count int
		err := rows.Scan(&category, &count)
		if err != nil {
			return nil, fmt.Errorf("failed to scan daily stats: %w", err)
		}
		stats[category] = count
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating daily stats: %w", err)
	}

	return stats, nil
}

// Update method to match interface signature
func (r *NotificationRepository) Update(notification *types.Notification) error {
	query := `
		UPDATE notifications
		SET app_name = $2, title = $3, body = $4, category = $5, priority = $6, is_read = $7, is_dismissed = $8
		WHERE id = $1
	`

	result, err := r.db.Exec(query,
		notification.ID, notification.AppName, notification.Title, notification.Body,
		notification.Category, notification.Priority, notification.IsRead, notification.IsDismissed,
	)
	if err != nil {
		return fmt.Errorf("failed to update notification: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("notification not found")
	}

	return nil
}

// GetUnreadCount returns the count of unread notifications for a user
func (r *NotificationRepository) GetUnreadCount(userID uuid.UUID) (int64, error) {
	query := `
		SELECT COUNT(*)
		FROM notifications
		WHERE user_id = $1 AND is_read = false AND expires_at > NOW()
	`

	var count int64
	err := r.db.QueryRow(query, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get unread count: %w", err)
	}

	return count, nil
}

// CleanupExpired removes expired notifications
func (r *NotificationRepository) CleanupExpired() (int64, error) {
	return r.DeleteExpired()
}

// GetStats returns notification statistics for a user
func (r *NotificationRepository) GetStats(userID uuid.UUID, days int) (map[string]interface{}, error) {
	query := `
		SELECT 
			COUNT(*) as total,
			COUNT(CASE WHEN is_read = true THEN 1 END) as read,
			COUNT(CASE WHEN is_read = false THEN 1 END) as unread,
			COUNT(CASE WHEN is_dismissed = true THEN 1 END) as dismissed,
			COUNT(DISTINCT app_name) as unique_apps
		FROM notifications
		WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '%d days'
	`

	var total, read, unread, dismissed, uniqueApps int
	err := r.db.QueryRow(fmt.Sprintf(query, days), userID).Scan(&total, &read, &unread, &dismissed, &uniqueApps)
	if err != nil {
		return nil, fmt.Errorf("failed to get stats: %w", err)
	}

	stats := map[string]interface{}{
		"total":       total,
		"read":        read,
		"unread":      unread,
		"dismissed":   dismissed,
		"unique_apps": uniqueApps,
		"period_days": days,
		"timestamp":   time.Now(),
	}

	return stats, nil
}

// Search method to match interface signature
func (r *NotificationRepository) Search(userID uuid.UUID, query string, category string, limit, offset int) ([]*types.Notification, int64, error) {
	sqlQuery := `
		SELECT id, user_id, source_device_id, app_name, title, body, category, priority, is_read, is_dismissed, created_at, expires_at
		FROM notifications
		WHERE user_id = $1 AND expires_at > NOW()
	`
	
	args := []interface{}{userID}
	argIndex := 2

	// Add search filter
	if query != "" {
		sqlQuery += fmt.Sprintf(" AND (title ILIKE $%d OR body ILIKE $%d OR app_name ILIKE $%d)", argIndex, argIndex, argIndex)
		args = append(args, "%"+query+"%")
		argIndex++
	}

	// Add category filter
	if category != "" {
		sqlQuery += fmt.Sprintf(" AND category = $%d", argIndex)
		args = append(args, category)
		argIndex++
	}

	// Get total count first
	countQuery := `
		SELECT COUNT(*)
		FROM notifications
		WHERE user_id = $1 AND expires_at > NOW()
	`
	countArgs := []interface{}{userID}
	countArgIndex := 2

	if query != "" {
		countQuery += fmt.Sprintf(" AND (title ILIKE $%d OR body ILIKE $%d OR app_name ILIKE $%d)", countArgIndex, countArgIndex, countArgIndex)
		countArgs = append(countArgs, "%"+query+"%")
		countArgIndex++
	}

	if category != "" {
		countQuery += fmt.Sprintf(" AND category = $%d", countArgIndex)
		countArgs = append(countArgs, category)
		countArgIndex++
	}

	var totalCount int64
	err := r.db.QueryRow(countQuery, countArgs...).Scan(&totalCount)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get search count: %w", err)
	}

	// Add pagination
	sqlQuery += " ORDER BY created_at DESC"
	sqlQuery += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argIndex, argIndex+1)
	args = append(args, limit, offset)

	rows, err := r.db.Query(sqlQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to search notifications: %w", err)
	}
	defer rows.Close()

	var notifications []*types.Notification
	for rows.Next() {
		notification := &types.Notification{}
		err := rows.Scan(
			&notification.ID, &notification.UserID, &notification.SourceDeviceID,
			&notification.AppName, &notification.Title, &notification.Body,
			&notification.Category, &notification.Priority, &notification.IsRead,
			&notification.IsDismissed, &notification.CreatedAt, &notification.ExpiresAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan notification: %w", err)
		}
		notifications = append(notifications, notification)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating notifications: %w", err)
	}

	return notifications, totalCount, nil
}

// UpdateStatus method to match interface signature
func (r *NotificationRepository) UpdateStatus(id uuid.UUID, status types.NotificationStatus) error {
	var isRead, isDismissed bool
	switch status {
	case types.StatusRead:
		isRead, isDismissed = true, false
	case types.StatusDismissed:
		isRead, isDismissed = true, true
	case types.StatusUnread:
		isRead, isDismissed = false, false
	default:
		return fmt.Errorf("invalid status: %s", status)
	}

	query := `
		UPDATE notifications
		SET is_read = $2, is_dismissed = $3
		WHERE id = $1
	`

	result, err := r.db.Exec(query, id, isRead, isDismissed)
	if err != nil {
		return fmt.Errorf("failed to update notification status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("notification not found")
	}

	return nil
}