package main

import (
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/notisync/backend/internal/api"
	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/database"
	"github.com/notisync/backend/internal/redis"
	"github.com/notisync/backend/internal/repository"
)

func main() {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: .env file not found: %v", err)
	}

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Override database configuration for MongoDB Atlas
	if mongoURI := os.Getenv("MONGODB_URI"); mongoURI != "" {
		cfg.Database.URI = mongoURI
		log.Printf("📡 Using MongoDB URI from environment")
	}
	if dbName := os.Getenv("MONGODB_DATABASE"); dbName != "" {
		cfg.Database.DBName = dbName
	}

	// Set default database name if not provided
	if cfg.Database.DBName == "" {
		cfg.Database.DBName = "notisync"
	}

	log.Printf("🚀 Starting NotiSync API Server...")
	log.Printf("Environment: %s", cfg.Server.Environment)
	log.Printf("Database: MongoDB (%s)", cfg.Database.DBName)

	// Initialize MongoDB connection
	mongoDB, err := database.NewMongoConnection(&cfg.Database)
	if err != nil {
		log.Fatalf("❌ Failed to connect to MongoDB: %v", err)
	}
	defer mongoDB.Close()

	log.Printf("✅ Connected to MongoDB successfully")

	// Test MongoDB connection
	if err := mongoDB.Health(); err != nil {
		log.Fatalf("❌ MongoDB health check failed: %v", err)
	}

	// Initialize MongoDB repositories
	mongoRepos := repository.NewMongoRepositories(mongoDB)
	
	// Create interface-based repositories for the API
	repos := repository.NewInterfaceRepositories(mongoRepos)

	// Initialize Redis (optional)
	var redisService *redis.Service
	redisService, err = redis.NewService(&cfg.Redis)
	if err != nil {
		log.Printf("⚠️  Redis not available: %v", err)
		log.Printf("📝 Continuing without Redis (some features may be limited)")
	} else {
		defer redisService.Close()
		log.Printf("✅ Connected to Redis successfully")
	}

	log.Printf("🔧 Repositories initialized")

	// Initialize API server
	server := api.NewServer(cfg, repos, redisService)

	// Start the server
	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("🌐 Starting HTTP server on port %s", port)
	log.Printf("📋 Available endpoints:")
	log.Printf("   POST /api/v1/auth/register - Register new user")
	log.Printf("   POST /api/v1/auth/login - Login user")
	log.Printf("   GET  /api/v1/notifications - Get notifications")
	log.Printf("   POST /api/v1/notifications - Create notification")
	log.Printf("   GET  /api/v1/devices - Get devices")
	log.Printf("   POST /api/v1/devices - Register device")

	if err := server.Start(":" + port); err != nil {
		log.Fatalf("❌ Failed to start server: %v", err)
	}
}