package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/notisync/backend/internal/api"
	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/database"
	"github.com/notisync/backend/internal/jobs"
	"github.com/notisync/backend/internal/redis"
	"github.com/notisync/backend/internal/repository"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize database connection
	db, err := database.NewConnection(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	log.Println("Database connection established")

	// Initialize Redis service
	redisService, err := redis.NewService(&cfg.Redis)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redisService.Close()

	log.Println("Redis connection established")

	// Initialize repositories
	repos := repository.NewRepositories(db)

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