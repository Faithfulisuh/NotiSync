package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/notisync/backend/internal/api"
	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/database"
	"github.com/notisync/backend/internal/jobs"
	"github.com/notisync/backend/internal/redis"
	"github.com/notisync/backend/internal/repository"
)

func main() {
	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize MongoDB connection
	db, err := database.NewMongoConnection(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}
	defer db.Close()

	log.Println("MongoDB connection established")

	// Initialize Redis service (optional)
	var redisService *redis.Service
	redisService, err = redis.NewService(&cfg.Redis)
	if err != nil {
		log.Printf("⚠️  Redis not available: %v", err)
		log.Println("📝 Continuing without Redis (some features may be limited)")
		redisService = nil
	} else {
		defer redisService.Close()
		log.Println("Redis connection established")
	}

	// Initialize repositories
	mongoRepos := repository.NewMongoRepositories(db)
	repos := repository.NewInterfaceRepositories(mongoRepos)

	// Start cleanup job
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cleanupJob := jobs.NewCleanupJob(repos)
	go cleanupJob.Start(ctx)

	// Initialize server with dependencies
	server := api.NewServer(cfg, repos, redisService)
	
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Handle graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Shutting down gracefully...")
		cancel()
		os.Exit(0)
	}()

	log.Printf("Starting server on port %s", port)
	if err := server.Start(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}