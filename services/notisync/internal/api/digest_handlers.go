package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/notisync/backend/internal/services"
)

// getDailyDigest returns today's daily digest for the authenticated user
func (s *Server) getDailyDigest(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Get today's digest
	digest, err := s.digestService.GetTodaysDigest(userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate daily digest"})
		return
	}

	c.JSON(http.StatusOK, digest)
}

// getDigestForDate returns the daily digest for a specific date
func (s *Server) getDigestForDate(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	dateStr := c.Param("date")
	if dateStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Date parameter is required"})
		return
	}

	// Validate date format
	_, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid date format. Use YYYY-MM-DD"})
		return
	}

	// Get digest for the specified date
	digest, err := s.digestService.GetDigestForDate(userID.(uuid.UUID), dateStr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate digest for date"})
		return
	}

	c.JSON(http.StatusOK, digest)
}

// getWeeklyDigests returns daily digests for the past week
func (s *Server) getWeeklyDigests(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Get weekly digests
	digests, err := s.digestService.GetWeeklyDigests(userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate weekly digests"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"digests": digests,
		"period":  "7 days",
		"generated_at": time.Now(),
	})
}

// getDigestSummary returns a summary of digest statistics
func (s *Server) getDigestSummary(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Get weekly digests for summary
	digests, err := s.digestService.GetWeeklyDigests(userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate digest summary"})
		return
	}

	// Calculate summary statistics
	summary := calculateDigestSummary(digests)
	c.JSON(http.StatusOK, summary)
}

// calculateDigestSummary calculates summary statistics from multiple digests
func calculateDigestSummary(digests []*services.DailyDigest) map[string]interface{} {
	if len(digests) == 0 {
		return map[string]interface{}{
			"total_days": 0,
			"total_notifications": 0,
			"average_per_day": 0.0,
			"quiet_days": 0,
			"busiest_day": nil,
			"category_totals": map[string]int{},
		}
	}

	totalNotifications := 0
	quietDays := 0
	categoryTotals := make(map[string]int)
	var busiestDay *services.DailyDigest
	maxNotifications := 0

	for _, digest := range digests {
		totalNotifications += digest.TotalNotifications
		
		if digest.IsQuietDay {
			quietDays++
		}

		// Track busiest day
		if digest.TotalNotifications > maxNotifications {
			maxNotifications = digest.TotalNotifications
			busiestDay = digest
		}

		// Aggregate category totals
		for category, count := range digest.CategoryBreakdown {
			categoryTotals[category] += count
		}
	}

	averagePerDay := float64(totalNotifications) / float64(len(digests))

	summary := map[string]interface{}{
		"total_days":         len(digests),
		"total_notifications": totalNotifications,
		"average_per_day":    averagePerDay,
		"quiet_days":         quietDays,
		"category_totals":    categoryTotals,
		"period_start":       digests[0].Date,
		"period_end":         digests[len(digests)-1].Date,
		"generated_at":       time.Now(),
	}

	if busiestDay != nil {
		summary["busiest_day"] = map[string]interface{}{
			"date":  busiestDay.Date,
			"count": busiestDay.TotalNotifications,
		}
	}

	return summary
}