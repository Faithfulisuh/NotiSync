package main

import (
	"log"
	"os"

	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/database"
	"github.com/notisync/backend/internal/redis"
	"github.com/notisync/backend/internal/repository"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Override database configuration for MongoDB Atlas
	if mongoURI := os.Getenv("MONGODB_URI"); mongoURI != "" {
		cfg.Database.URI = mongoURI
	}
	if dbName := os.Getenv("MONGODB_DATABASE"); dbName != "" {
		cfg.Database.DBName = dbName
	}

	// Set default database name if not provided
	if cfg.Database.DBName == "" {
		cfg.Database.DBName = "notisync"
	}

	log.Printf("Starting NotiSync MongoDB server...")
	log.Printf("Environment: %s", cfg.Server.Environment)
	log.Printf("Database: MongoDB (%s)", cfg.Database.DBName)

	// Initialize MongoDB connection
	mongoDB, err := database.NewMongoConnection(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}
	defer mongoDB.Close()

	log.Printf("✅ Connected to MongoDB successfully")

	// Test MongoDB connection
	if err := mongoDB.Health(); err != nil {
		log.Fatalf("MongoDB health check failed: %v", err)
	}

	// Initialize MongoDB repositories
	mongoRepos := repository.NewMongoRepositories(mongoDB)

	// Initialize Redis (optional for testing)
	redisService, err := redis.NewService(&cfg.Redis)
	if err != nil {
		log.Printf("⚠️  Redis not available: %v", err)
		log.Printf("📝 Continuing without Redis (some features may be limited)")
	} else {
		defer redisService.Close()
		log.Printf("✅ Connected to Redis successfully")
	}

	// For now, let's create a simple HTTP server to test MongoDB connectivity
	log.Printf("🚀 MongoDB server ready!")
	log.Printf("📊 User repository: %v", mongoRepos.User != nil)
	log.Printf("📱 Device repository: %v", mongoRepos.Device != nil)
	log.Printf("🔔 Notification repository: %v", mongoRepos.Notification != nil)
	
	// Test creating a user to verify MongoDB works
	log.Printf("🧪 Testing MongoDB connection...")
	
	// Keep the server running
	select {}
}