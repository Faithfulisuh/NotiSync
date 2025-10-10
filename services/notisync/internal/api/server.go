package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/notisync/backend/internal/auth"
	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/redis"
	"github.com/notisync/backend/internal/repository"
	"github.com/notisync/backend/internal/services"
	"github.com/notisync/backend/internal/websocket"
)

type Server struct {
	config              *config.Config
	router              *gin.Engine
	repos               *repository.InterfaceRepositories
	redisService        *redis.Service
	authService         *auth.Service
	deviceService       *services.DeviceService
	notificationService *services.NotificationService
	historyService      *services.NotificationHistoryService
	digestService       *services.DailyDigestService
	websocketService    *websocket.Service
}

func NewServer(cfg *config.Config, repos *repository.InterfaceRepositories, redisService *redis.Service) *Server {
	if cfg.Server.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.Default()
	
	// Initialize services
	authService := auth.NewService(repos, &cfg.JWT)
	deviceService := services.NewDeviceService(repos)
	notificationService := services.NewNotificationService(repos, redisService)
	historyService := services.NewNotificationHistoryService(repos.NotificationHistory, redisService)
	digestService := services.NewDailyDigestService(repos, redisService)
	websocketService := websocket.NewService(redisService, authService)
	
	server := &Server{
		config:              cfg,
		router:              router,
		repos:               repos,
		redisService:        redisService,
		authService:         authService,
		deviceService:       deviceService,
		notificationService: notificationService,
		historyService:      historyService,
		digestService:       digestService,
		websocketService:    websocketService,
	}

	// Start WebSocket service
	websocketService.Start()

	// Start notification cleanup scheduler (runs every 6 hours)
	historyService.ScheduleCleanup(6 * time.Hour)

	server.setupRoutes()
	return server
}

func (s *Server) setupRoutes() {
	// Add CORS middleware
	s.router.Use(s.corsMiddleware())
	
	// Health check
	s.router.GET("/health", s.healthCheck)
	
	// API v1 routes
	v1 := s.router.Group("/api/v1")
	{
		// Auth routes
		auth := v1.Group("/auth")
		{
			auth.POST("/register", s.register)
			auth.POST("/login", s.login)
			auth.POST("/refresh", s.refreshToken)
		}

		// Protected routes (require authentication)
		protected := v1.Group("/")
		protected.Use(s.authService.AuthMiddleware())
		protected.Use(s.deviceLastSeenMiddleware())
		{
			// Device management
			protected.GET("/devices", s.getDevices)
			protected.POST("/devices", s.registerDevice)
			protected.PUT("/devices/:id", s.updateDevice)
			protected.DELETE("/devices/:id", s.removeDevice)

			// Notifications
			protected.POST("/notifications", s.createNotification)
			protected.GET("/notifications", s.getNotifications)
			protected.PUT("/notifications/:id/action", s.updateNotificationAction)
			
			// Notification history and search
			protected.GET("/notifications/history", s.getNotificationHistory)
			protected.GET("/notifications/search", s.searchNotificationHistory)
			protected.GET("/notifications/summary", s.getNotificationSummary)
			protected.GET("/notifications/apps", s.getNotificationAppNames)
			protected.GET("/notifications/date-range", s.getNotificationDateRange)
			protected.GET("/notifications/weekly-stats", s.getWeeklyNotificationStats)
			
			// Enhanced history endpoints
			protected.GET("/history", s.getNotificationHistory)
			protected.GET("/history/search", s.searchNotificationHistory)
			protected.GET("/history/stats", s.getNotificationHistoryStats)
			protected.GET("/history/metrics", s.getHistoryMetrics)
			protected.GET("/history/apps", s.getAppBreakdown)
			protected.GET("/history/export", s.exportNotificationHistory)
			protected.POST("/history/cleanup", s.cleanupExpiredNotifications)

			// User rules
			protected.GET("/rules", s.getUserRules)
			protected.POST("/rules", s.createUserRule)
			protected.PUT("/rules/:id", s.updateUserRule)
			protected.DELETE("/rules/:id", s.deleteUserRule)

			// Daily digest routes
			digest := protected.Group("/digest")
			{
				digest.GET("/", s.getDailyDigest)
				digest.GET("/today", s.getDailyDigest)
				digest.GET("/date/:date", s.getDigestForDate)
				digest.GET("/weekly", s.getWeeklyDigests)
				digest.GET("/summary", s.getDigestSummary)
			}

			// Notification statistics
			protected.GET("/notifications/stats", s.getNotificationStats)
		}
	}

	// WebSocket endpoint
	s.router.GET("/ws", s.handleWebSocket)
}

func (s *Server) Start(addr string) error {
	return s.router.Run(addr)
}

// deviceLastSeenMiddleware updates device last seen timestamp
func (s *Server) deviceLastSeenMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Try to get device ID from context (set by auth middleware)
		if deviceID, exists := c.Get("device_id"); exists {
			if id, ok := deviceID.(uuid.UUID); ok && id != uuid.Nil {
				// Update last seen in background (don't block request)
				go func() {
					if err := s.deviceService.UpdateDeviceLastSeen(id); err != nil {
						// Log error but don't fail the request
						fmt.Printf("Failed to update device last seen: %v\n", err)
					}
				}()
			}
		}
		c.Next()
	}
}

// corsMiddleware adds CORS headers to allow cross-origin requests
func (s *Server) corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		
		// Allow all origins in development, specific origins in production
		if s.config.Server.Environment == "development" {
			c.Header("Access-Control-Allow-Origin", "*")
		} else {
			// In production, you might want to restrict to specific origins
			allowedOrigins := []string{
				"http://localhost:3000",
				"http://localhost:19006",
				"https://notisync.com",
			}
			
			for _, allowedOrigin := range allowedOrigins {
				if origin == allowedOrigin {
					c.Header("Access-Control-Allow-Origin", origin)
					break
				}
			}
		}
		
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Max-Age", "86400")

		// Handle preflight requests
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}