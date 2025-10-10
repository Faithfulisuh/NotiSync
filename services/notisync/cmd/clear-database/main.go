package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: .env file not found: %v", err)
	}

	// Get MongoDB URI from environment
	mongoURI := os.Getenv("MONGODB_URI")
	if mongoURI == "" {
		log.Fatal("MONGODB_URI environment variable is required")
	}

	// Get database name from environment
	dbName := os.Getenv("MONGODB_DATABASE")
	if dbName == "" {
		dbName = "notisync" // Default database name
	}

	fmt.Printf("🗑️  Clearing all data from MongoDB database: %s\n", dbName)
	fmt.Printf("📡 MongoDB URI: %s\n", mongoURI)

	// Connect to MongoDB
	client, err := mongo.Connect(context.Background(), options.Client().ApplyURI(mongoURI))
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}
	defer client.Disconnect(context.Background())

	// Test connection
	if err := client.Ping(context.Background(), nil); err != nil {
		log.Fatalf("Failed to ping MongoDB: %v", err)
	}

	fmt.Println("✅ Connected to MongoDB successfully")

	// Get database
	db := client.Database(dbName)

	// List all collections
	collections, err := db.ListCollectionNames(context.Background(), map[string]interface{}{})
	if err != nil {
		log.Fatalf("Failed to list collections: %v", err)
	}

	if len(collections) == 0 {
		fmt.Println("📭 Database is already empty - no collections found")
		return
	}

	fmt.Printf("📋 Found %d collections to clear:\n", len(collections))
	for _, collection := range collections {
		fmt.Printf("   - %s\n", collection)
	}

	// Clear each collection
	for _, collectionName := range collections {
		fmt.Printf("🧹 Clearing collection: %s...", collectionName)
		
		collection := db.Collection(collectionName)
		result, err := collection.DeleteMany(context.Background(), map[string]interface{}{})
		if err != nil {
			fmt.Printf(" ❌ Failed: %v\n", err)
			continue
		}
		
		fmt.Printf(" ✅ Deleted %d documents\n", result.DeletedCount)
	}

	fmt.Println("🎉 All data cleared successfully!")
	fmt.Println("💡 You can now start fresh with new user registrations")
}