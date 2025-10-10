package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/notisync/backend/internal/auth"
	"github.com/notisync/backend/internal/services"
	"github.com/notisync/backend/internal/types"
)

// Health check handler
func (s *Server) healthCheck(c *gin.Context) {
	// Check database health
	dbStatus := "healthy"
	// Note: In a real implementation, you'd add a Health() method to repositories
	// For now, we'll assume the database is healthy if repos are initialized
	if s.repos == nil {
		dbStatus = "unhealthy"
	}

	// Check Redis health
	redisStatus := "healthy"
	if s.redisService == nil {
		redisStatus = "unhealthy"
	} else {
		if err := s.redisService.Health(c.Request.Context()); err != nil {
			redisStatus = "unhealthy"
		}
	}

	status := http.StatusOK
	if dbStatus == "unhealthy" || redisStatus == "unhealthy" {
		status = http.StatusServiceUnavailable
	}

	c.JSON(status, gin.H{
		"status":   "healthy",
		"service":  "notisync-api",
		"database": dbStatus,
		"redis":    redisStatus,
	})
}

// Auth handlers
func (s *Server) register(c *gin.Context) {
	var req auth.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response, err := s.authService.Register(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, response)
}

func (s *Server) login(c *gin.Context) {
	var req auth.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response, err := s.authService.Login(&req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}

func (s *Server) refreshToken(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response, err := s.authService.RefreshToken(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}

// Device handlers
func (s *Server) getDevices(c *gin.Context) {
	userID, err := auth.GetUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user context"})
		return
	}

	devices, err := s.deviceService.GetUserDevices(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get devices"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"devices": devices})
}

func (s *Server) registerDevice(c *gin.Context) {
	userID, err := auth.GetUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user context"})
		return
	}

	var req auth.DeviceRegistrationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format: " + err.Error()})
		return
	}

	// Validate required fields
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Device name is required"})
		return
	}

	if req.Platform == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Device platform is required"})
		return
	}

	response, err := s.authService.RegisterDevice(userID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, response)
}

func (s *Server) updateDevice(c *gin.Context) {
	userID, err := auth.GetUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user context"})
		return
	}

	deviceIDStr := c.Param("id")
	deviceID, err := uuid.Parse(deviceIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid device ID"})
		return
	}

	var req services.DeviceUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format: " + err.Error()})
		return
	}

	device, err := s.deviceService.UpdateDevice(userID, deviceID, &req)
	if err != nil {
		if err.Error() == "device not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		} else if err.Error() == "access denied: device does not belong to user" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Device updated successfully",
		"device":  device,
	})
}

func (s *Server) removeDevice(c *gin.Context) {
	userID, err := auth.GetUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user context"})
		return
	}

	deviceIDStr := c.Param("id")
	deviceID, err := uuid.Parse(deviceIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid device ID"})
		return
	}

	err = s.deviceService.RemoveDevice(userID, deviceID)
	if err != nil {
		if err.Error() == "device not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		} else if err.Error() == "access denied: device does not belong to user" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete device"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Device removed successfully"})
}

// Notification handlers
func (s *Server) createNotification(c *gin.Context) {
	userID, err := auth.GetUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user context"})
		return
	}

	deviceID, err := auth.GetDeviceID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Device ID required for notification creation"})
		return
	}

	var req types.CreateNotificationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	notification, err := s.notificationService.CreateNotification(userID, deviceID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, notification)
}

func (s *Server) getNotifications(c *gin.Context) {
	userID, err := auth.GetUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user context"})
		return
	}

	// Parse query parameters
	limit := 50
	offset := 0
	category := c.Query("category")
	search := c.Query("search")

	if limitStr := c.Query("limit"); limitStr != "" {
		if parsedLimit := parseInt(limitStr, 50); parsedLimit > 0 && parsedLimit <= 100 {
			limit = parsedLimit
		}
	}

	if offsetStr := c.Query("offset"); offsetStr != "" {
		if parsedOffset := parseInt(offsetStr, 0); parsedOffset >= 0 {
			offset = parsedOffset
		}
	}

	var notifications []*types.Notification

	if search != "" {
		notifications, err = s.notificationService.SearchNotifications(userID, search, limit, offset)
	} else if category != "" {
		notifications, err = s.notificationService.GetNotificationsByCategory(userID, types.NotificationCategory(category), limit, offset)
	} else {
		notifications, err = s.notificationService.GetNotifications(userID, limit, offset)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"notifications": notifications,
		"limit":         limit,
		"offset":        offset,
	})
}

func (s *Server) updateNotificationAction(c *gin.Context) {
	userID, err := auth.GetUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user context"})
		return
	}

	deviceID, err := auth.GetDeviceID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Device ID required"})
		return
	}

	notificationIDStr := c.Param("id")
	notificationID, err := uuid.Parse(notificationIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid notification ID"})
		return
	}

	var req types.UpdateNotificationStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := s.notificationService.UpdateNotificationStatus(userID, notificationID, req.Action, deviceID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Notification status updated successfully"})
}

// Notification history handlers are implemented in history_handlers.go

// Advanced notification history and search handlers are implemented in history_handlers.go

// getNotificationSummary is implemented in history_handlers.go

// getNotificationAppNames is implemented in history_handlers.go

// getNotificationDateRange is implemented in history_handlers.go

// getWeeklyNotificationStats is implemented in history_handlers.go

// User rules handlers - placeholder implementations
func (s *Server) getUserRules(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

func (s *Server) createUserRule(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

func (s *Server) updateUserRule(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

func (s *Server) deleteUserRule(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// Daily digest handlers are implemented in digest_handlers.go

// WebSocket handler
func (s *Server) handleWebSocket(c *gin.Context) {
	s.websocketService.HandleWebSocket(c.Writer, c.Request)
}

// Helper function to parse notification filters from query parameters
func parseNotificationFilters(c *gin.Context) services.NotificationFilters {
	filters := services.NotificationFilters{
		Limit:  50,
		Offset: 0,
	}

	// Parse pagination
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsedLimit := parseInt(limitStr, 50); parsedLimit > 0 && parsedLimit <= 100 {
			filters.Limit = parsedLimit
		}
	}

	if offsetStr := c.Query("offset"); offsetStr != "" {
		if parsedOffset := parseInt(offsetStr, 0); parsedOffset >= 0 {
			filters.Offset = parsedOffset
		}
	}

	// Parse filters
	filters.Category = c.Query("category")
	filters.AppName = c.Query("app_name")
	filters.Search = c.Query("search")

	// Parse boolean filters
	if isReadStr := c.Query("is_read"); isReadStr != "" {
		if isRead, err := strconv.ParseBool(isReadStr); err == nil {
			filters.IsRead = &isRead
		}
	}

	if isDismissedStr := c.Query("is_dismissed"); isDismissedStr != "" {
		if isDismissed, err := strconv.ParseBool(isDismissedStr); err == nil {
			filters.IsDismissed = &isDismissed
		}
	}

	// Parse date filters
	if startDateStr := c.Query("start_date"); startDateStr != "" {
		if startDate, err := time.Parse("2006-01-02", startDateStr); err == nil {
			filters.StartDate = &startDate
		}
	}

	if endDateStr := c.Query("end_date"); endDateStr != "" {
		if endDate, err := time.Parse("2006-01-02", endDateStr); err == nil {
			// Set to end of day
			endDate = endDate.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
			filters.EndDate = &endDate
		}
	}

	return filters
}

// Helper function to parse integer with default value
func parseInt(s string, defaultValue int) int {
	if i, err := strconv.Atoi(s); err == nil {
		return i
	}
	return defaultValue
}

// getNotificationStats retrieves notification statistics
func (s *Server) getNotificationStats(c *gin.Context) {
	userID, err := auth.GetUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user context"})
		return
	}

	// Parse date parameter (default to today)
	dateStr := c.Query("date")
	var date time.Time
	if dateStr != "" {
		parsedDate, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid date format. Use YYYY-MM-DD"})
			return
		}
		date = parsedDate
	} else {
		date = time.Now()
	}

	stats, err := s.notificationService.GetDailyStats(userID, date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// ============================================================================
// SYSTEM ENDPOINTS
// ============================================================================

// Get system information
func (s *Server) getSystemInfo(c *gin.Context) {
	info := gin.H{
		"service":     "notisync-api",
		"version":     "1.0.0",
		"environment": s.config.Server.Environment,
		"timestamp":   time.Now(),
	}

	c.JSON(http.StatusOK, info)
}

// Get API documentation info
func (s *Server) getAPIInfo(c *gin.Context) {
	info := gin.H{
		"name":        "NotiSync API",
		"version":     "v1",
		"description": "Cross-device notification synchronization service",
		"endpoints": gin.H{
			"auth": gin.H{
				"POST /api/v1/auth/register":      "Register new user",
				"POST /api/v1/auth/login":         "User login",
				"POST /api/v1/auth/refresh":       "Refresh JWT token",
				"POST /api/v1/auth/logout":        "User logout",
				"POST /api/v1/auth/devices":       "Register device",
			},
			"notifications": gin.H{
				"GET /api/v1/notifications":           "Get notifications",
				"GET /api/v1/notifications/:id":       "Get single notification",
				"POST /api/v1/notifications":          "Create notification",
				"PUT /api/v1/notifications/:id":       "Update notification status",
				"DELETE /api/v1/notifications/:id":    "Delete notification",
				"GET /api/v1/notifications/stats":     "Get notification statistics",
			},
			"devices": gin.H{
				"GET /api/v1/devices":        "Get user devices",
				"GET /api/v1/devices/:id":    "Get single device",
				"PUT /api/v1/devices/:id":    "Update device",
				"DELETE /api/v1/devices/:id": "Delete device",
			},
			"system": gin.H{
				"GET /health":           "Health check",
				"GET /api/v1/info":      "API information",
				"GET /api/v1/system":    "System information",
			},
		},
	}

	c.JSON(http.StatusOK, info)
}