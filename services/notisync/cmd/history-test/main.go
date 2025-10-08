package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/database"
	"github.com/notisync/backend/internal/redis"
	"github.com/notisync/backend/internal/repository"
	"github.com/notisync/backend/internal/services"
	"github.com/notisync/backend/internal/types"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Connect to database
	db, err := database.Connect(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Connect to Redis
	redisService, err := redis.NewService(&cfg.Redis)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redisService.Close()

	// Initialize repositories
	repos := repository.NewRepositories(db)

	// Initialize history service
	historyService := services.NewNotificationHistoryService(repos.NotificationHistory, redisService)

	// Test user ID
	userID := uuid.New()

	// Create some test notifications
	fmt.Println("Creating test notifications...")
	testNotifications := []*types.Notification{
		{
			ID:          uuid.New(),
			UserID:      userID,
			DeviceID:    uuid.New(),
			AppName:     "Slack",
			Title:       "Team Meeting",
			Body:        "Daily standup in 10 minutes",
			Category:    types.CategoryWork,
			Priority:    1,
			IsRead:      false,
			IsDismissed: false,
			CreatedAt:   time.Now().Add(-1 * time.Hour),
			UpdatedAt:   time.Now().Add(-1 * time.Hour),
			ExpiresAt:   time.Now().Add(6 * 24 * time.Hour),
		},
		{
			ID:          uuid.New(),
			UserID:      userID,
			DeviceID:    uuid.New(),
			AppName:     "WhatsApp",
			Title:       "Personal Message",
			Body:        "Hey, how are you doing?",
			Category:    types.CategoryPersonal,
			Priority:    0,
			IsRead:      true,
			IsDismissed: false,
			CreatedAt:   time.Now().Add(-2 * time.Hour),
			UpdatedAt:   time.Now().Add(-2 * time.Hour),
			ExpiresAt:   time.Now().Add(6 * 24 * time.Hour),
		},
		{
			ID:          uuid.New(),
			UserID:      userID,
			DeviceID:    uuid.New(),
			AppName:     "Shopping App",
			Title:       "Sale Alert",
			Body:        "50% off everything! Limited time offer",
			Category:    types.CategoryJunk,
			Priority:    0,
			IsRead:      false,
			IsDismissed: true,
			CreatedAt:   time.Now().Add(-3 * time.Hour),
			UpdatedAt:   time.Now().Add(-3 * time.Hour),
			ExpiresAt:   time.Now().Add(6 * 24 * time.Hour),
		},
	}

	// Insert test notifications
	for _, notification := range testNotifications {
		err := repos.Notification.Create(notification)
		if err != nil {
			log.Printf("Failed to create notification: %v", err)
		} else {
			fmt.Printf("Created notification: %s - %s\n", notification.AppName, notification.Title)
		}
	}

	// Test 1: Get notification history
	fmt.Println("\n=== Test 1: Get Notification History ===\")
	response, err := historyService.GetNotificationHistory(userID, 1, 10)
	if err != nil {
		log.Printf("Failed to get notification history: %v", err)
	} else {
		fmt.Printf("Found %d notifications (page 1, size 10)\n", len(response.Notifications))
		for _, notification := range response.Notifications {
			fmt.Printf("- %s: %s (Read: %t, Dismissed: %t)\n", 
				notification.AppName, notification.Title, notification.IsRead, notification.IsDismissed)\n		}\n	}\n\n	// Test 2: Search notifications\n	fmt.Println(\"=== Test 2: Search Notifications ===\")\n	searchReq := services.SearchRequest{\n		UserID:   userID,\n		Query:    \"meeting\",\n		Page:     1,\n		PageSize: 10,\n	}\n	searchResponse, err := historyService.SearchNotifications(searchReq)\n	if err != nil {\n		log.Printf(\"Failed to search notifications: %v\", err)\n	} else {\n		fmt.Printf(\"Search for 'meeting' found %d notifications\n\", len(searchResponse.Notifications))\n		for _, notification := range searchResponse.Notifications {\n			fmt.Printf(\"- %s: %s\n\", notification.AppName, notification.Title)\n		}\n	}\n\n	// Test 3: Get history statistics\n	fmt.Println(\"\\n=== Test 3: Get History Statistics ===\")\n	stats, err := historyService.GetHistoryStats(userID, 30)\n	if err != nil {\n		log.Printf(\"Failed to get history stats: %v\", err)\n	} else {\n		statsJSON, _ := json.MarshalIndent(stats, \"\", \"  \")\n		fmt.Printf(\"30-day statistics:\\n%s\\n\", string(statsJSON))\n	}\n\n	// Test 4: Get app breakdown\n	fmt.Println(\"\\n=== Test 4: Get App Breakdown ===\")\n	breakdown, err := historyService.GetAppBreakdown(userID, 30)\n	if err != nil {\n		log.Printf(\"Failed to get app breakdown: %v\", err)\n	} else {\n		fmt.Println(\"App breakdown (30 days):\")\n		for appName, count := range breakdown {\n			fmt.Printf(\"- %s: %d notifications\\n\", appName, count)\n		}\n	}\n\n	// Test 5: Advanced search with filters\n	fmt.Println(\"\\n=== Test 5: Advanced Search with Filters ===\")\n	advancedSearchReq := services.SearchRequest{\n		UserID:     userID,\n		Category:   string(types.CategoryWork),\n		ReadStatus: \"unread\",\n		Page:       1,\n		PageSize:   10,\n	}\n	advancedResponse, err := historyService.SearchNotifications(advancedSearchReq)\n	if err != nil {\n		log.Printf(\"Failed to perform advanced search: %v\", err)\n	} else {\n		fmt.Printf(\"Advanced search (Work category, unread) found %d notifications\\n\", len(advancedResponse.Notifications))\n		for _, notification := range advancedResponse.Notifications {\n			fmt.Printf(\"- %s: %s (Category: %s, Read: %t)\\n\", \n				notification.AppName, notification.Title, notification.Category, notification.IsRead)\n		}\n	}\n\n	// Test 6: Cleanup expired notifications\n	fmt.Println(\"\\n=== Test 6: Cleanup Expired Notifications ===\")\n	deletedCount, err := historyService.CleanupExpiredNotifications()\n	if err != nil {\n		log.Printf(\"Failed to cleanup expired notifications: %v\", err)\n	} else {\n		fmt.Printf(\"Cleaned up %d expired notifications\\n\", deletedCount)\n	}\n\n	fmt.Println(\"\\n=== All tests completed! ===\")\n}"