package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/notisync/backend/internal/services"
)

// getNotificationHistory retrieves paginated notification history
func (s *Server) getNotificationHistory(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse query parameters
	page := 1
	if pageStr := c.Query("page"); pageStr != "" {
		if parsedPage, err := strconv.Atoi(pageStr); err == nil && parsedPage > 0 {
			page = parsedPage
		}
	}

	pageSize := 20
	if pageSizeStr := c.Query("page_size"); pageSizeStr != "" {
		if parsedPageSize, err := strconv.Atoi(pageSizeStr); err == nil && parsedPageSize > 0 && parsedPageSize <= 100 {
			pageSize = parsedPageSize
		}
	}

	// Get notification history
	response, err := s.historyService.GetNotificationHistory(userID.(uuid.UUID), page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get notification history"})
		return
	}

	c.JSON(http.StatusOK, response)
}

// searchNotificationHistory searches notification history with advanced filters
func (s *Server) searchNotificationHistory(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse query parameters
	searchReq := services.SearchRequest{
		UserID:     userID.(uuid.UUID),
		Query:      c.Query("q"),
		AppName:    c.Query("app_name"),
		Category:   c.Query("category"),
		StartDate:  c.Query("start_date"),
		EndDate:    c.Query("end_date"),
		ReadStatus: c.Query("read_status"),
		SortBy:     c.Query("sort_by"),
		SortOrder:  c.Query("sort_order"),
	}

	// Parse pagination
	page := 1
	if pageStr := c.Query("page"); pageStr != "" {
		if parsedPage, err := strconv.Atoi(pageStr); err == nil && parsedPage > 0 {
			page = parsedPage
		}
	}
	searchReq.Page = page

	pageSize := 20
	if pageSizeStr := c.Query("page_size"); pageSizeStr != "" {
		if parsedPageSize, err := strconv.Atoi(pageSizeStr); err == nil && parsedPageSize > 0 && parsedPageSize <= 100 {
			pageSize = parsedPageSize
		}
	}
	searchReq.PageSize = pageSize

	// Search notifications
	response, err := s.historyService.SearchNotifications(searchReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search notifications"})
		return
	}

	c.JSON(http.StatusOK, response)
}

// getNotificationHistoryStats returns notification history statistics
func (s *Server) getNotificationHistoryStats(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse days parameter
	days := 30 // default
	if daysStr := c.Query("days"); daysStr != "" {
		if parsedDays, err := strconv.Atoi(daysStr); err == nil && parsedDays > 0 && parsedDays <= 365 {
			days = parsedDays
		}
	}

	// Get statistics
	stats, err := s.historyService.GetHistoryStats(userID.(uuid.UUID), days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get history statistics"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"stats": stats})
}

// getAppBreakdown returns notification breakdown by app
func (s *Server) getAppBreakdown(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse days parameter
	days := 30 // default
	if daysStr := c.Query("days"); daysStr != "" {
		if parsedDays, err := strconv.Atoi(daysStr); err == nil && parsedDays > 0 && parsedDays <= 365 {
			days = parsedDays
		}
	}

	// Get app breakdown
	breakdown, err := s.historyService.GetAppBreakdown(userID.(uuid.UUID), days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get app breakdown"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"breakdown": breakdown,
		"days":      days,
		"timestamp": time.Now(),
	})
}

// exportNotificationHistory exports notification history in specified format
func (s *Server) exportNotificationHistory(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse parameters
	format := c.Query("format")
	if format == "" {
		format = "json"
	}

	days := 30
	if daysStr := c.Query("days"); daysStr != "" {
		if parsedDays, err := strconv.Atoi(daysStr); err == nil && parsedDays > 0 && parsedDays <= 365 {
			days = parsedDays
		}
	}

	// Export notifications
	data, err := s.historyService.ExportNotifications(userID.(uuid.UUID), format, days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to export notifications"})
		return
	}

	// Set appropriate headers
	filename := "notifications_" + time.Now().Format("2006-01-02") + "." + format
	switch format {
	case "json":
		c.Header("Content-Type", "application/json")
	case "csv":
		c.Header("Content-Type", "text/csv")
	default:
		c.Header("Content-Type", "application/octet-stream")
	}
	c.Header("Content-Disposition", "attachment; filename="+filename)

	c.Data(http.StatusOK, c.GetHeader("Content-Type"), data)
}

// cleanupExpiredNotifications manually triggers cleanup of expired notifications
func (s *Server) cleanupExpiredNotifications(c *gin.Context) {
	// This endpoint could be protected with admin authentication
	deletedCount, err := s.historyService.CleanupExpiredNotifications()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cleanup notifications"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":       "Cleanup completed successfully",
		"deleted_count": deletedCount,
		"timestamp":     time.Now(),
	})
}

// getHistoryMetrics returns detailed metrics about notification history
func (s *Server) getHistoryMetrics(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse days parameter
	days := 30
	if daysStr := c.Query("days"); daysStr != "" {
		if parsedDays, err := strconv.Atoi(daysStr); err == nil && parsedDays > 0 && parsedDays <= 365 {
			days = parsedDays
		}
	}

	// Get statistics and app breakdown
	stats, err := s.historyService.GetHistoryStats(userID.(uuid.UUID), days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get history statistics"})
		return
	}

	breakdown, err := s.historyService.GetAppBreakdown(userID.(uuid.UUID), days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get app breakdown"})
		return
	}

	// Combine metrics
	metrics := gin.H{
		"stats":     stats,
		"breakdown": breakdown,
		"period": gin.H{
			"days":       days,
			"start_date": time.Now().AddDate(0, 0, -days).Format("2006-01-02"),
			"end_date":   time.Now().Format("2006-01-02"),
		},
		"timestamp": time.Now(),
	}

	c.JSON(http.StatusOK, metrics)
}

// getNotificationSummary returns a summary of notifications
func (s *Server) getNotificationSummary(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Get summary from history service
	stats, err := s.historyService.GetHistoryStats(userID.(uuid.UUID), 30)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get notification summary"})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// getNotificationAppNames returns list of app names that have sent notifications
func (s *Server) getNotificationAppNames(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Get app breakdown and extract app names
	breakdown, err := s.historyService.GetAppBreakdown(userID.(uuid.UUID), 365)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get app names"})
		return
	}

	// Extract app names from breakdown
	appNames := make([]string, 0, len(breakdown))
	for appName := range breakdown {
		appNames = append(appNames, appName)
	}

	c.JSON(http.StatusOK, gin.H{"app_names": appNames})
}

// getNotificationDateRange returns the date range of notifications
func (s *Server) getNotificationDateRange(c *gin.Context) {
	_, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// For now, return a simple date range based on 7 days retention
	// In a real implementation, this would query the database for actual min/max dates
	now := time.Now()
	minDate := now.AddDate(0, 0, -7) // 7 days ago
	maxDate := now

	c.JSON(http.StatusOK, gin.H{
		"min_date": minDate.Format("2006-01-02"),
		"max_date": maxDate.Format("2006-01-02"),
	})
}

// getWeeklyNotificationStats returns weekly notification statistics
func (s *Server) getWeeklyNotificationStats(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse weeks parameter
	weeks := 4
	if weeksStr := c.Query("weeks"); weeksStr != "" {
		if parsedWeeks, err := strconv.Atoi(weeksStr); err == nil && parsedWeeks > 0 && parsedWeeks <= 52 {
			weeks = parsedWeeks
		}
	}

	// Generate weekly stats (simplified implementation)
	weeklyStats := make([]gin.H, weeks)
	now := time.Now()
	
	for i := 0; i < weeks; i++ {
		weekStart := now.AddDate(0, 0, -7*(i+1))
		weekEnd := now.AddDate(0, 0, -7*i)
		
		// Get stats for this week (simplified - using daily stats)
		stats, err := s.historyService.GetHistoryStats(userID.(uuid.UUID), 7)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get weekly stats"})
			return
		}
		
		weeklyStats[weeks-1-i] = gin.H{
			"week_start": weekStart.Format("2006-01-02"),
			"week_end":   weekEnd.Format("2006-01-02"),
			"stats":      stats,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"weekly_stats": weeklyStats,
		"weeks":        weeks,
		"timestamp":    time.Now(),
	})
}