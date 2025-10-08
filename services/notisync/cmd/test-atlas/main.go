package main

import (
	"fmt"
	"log"
	"os"

	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/database"
)

func main() {
	fmt.Println("=== MongoDB Atlas Connection Test ===")
	
	// Check if MONGODB_URI is set
	uri := os.Getenv("MONGODB_URI")
	if uri == "" {
		fmt.Println("❌ MONGODB_URI environment variable not set")
		fmt.Println("\nTo set it:")
		fmt.Println("Windows: $env:MONGODB_URI=\"your-connection-string\"")
		fmt.Println("Linux/Mac: export MONGODB_URI=\"your-connection-string\"")
		fmt.Println("\nGet your connection string from MongoDB Atlas:")
		fmt.Println("1. Go to your MongoDB Atlas dashboard")
		fmt.Println("2. Click 'Connect' on your cluster")
		fmt.Println("3. Choose 'Connect your application'")
		fmt.Println("4. Copy the connection string")
		fmt.Println("5. Replace <username> and <password> with your credentials")
		return
	}

	fmt.Println("✓ MONGODB_URI found in environment")
	
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatal("Failed to load config:", err)
	}

	// Try to connect
	fmt.Println("🔄 Attempting to connect to MongoDB Atlas...")
	
	db, err := database.NewMongoConnection(&cfg.Database)
	if err != nil {
		fmt.Printf("❌ Connection failed: %v\n", err)
		fmt.Println("\nTroubleshooting:")
		fmt.Println("1. Check your connection string format")
		fmt.Println("2. Verify username/password are correct")
		fmt.Println("3. Ensure your IP is whitelisted in Atlas")
		fmt.Println("4. Check if the database name exists")
		return
	}
	defer db.Close()

	// Test the connection
	if err := db.Health(); err != nil {
		fmt.Printf("❌ Health check failed: %v\n", err)
		return
	}

	fmt.Println("✅ Successfully connected to MongoDB Atlas!")
	fmt.Println("✅ Health check passed!")
	fmt.Println("\n🎉 Your MongoDB Atlas setup is working correctly!")
	fmt.Println("You can now run: go run cmd/atlas-server/main.go")
}