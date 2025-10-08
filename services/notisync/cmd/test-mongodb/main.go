package main

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/database"
	"github.com/notisync/backend/internal/repository"
	"github.com/notisync/backend/internal/types"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	fmt.Println("🧪 Testing MongoDB Connection...")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Override with MongoDB settings if provided
	if mongoURI := os.Getenv("MONGODB_URI"); mongoURI != "" {
		cfg.Database.URI = mongoURI
		fmt.Printf("📡 Using MongoDB URI: %s\n", maskURI(mongoURI))
	}
	if dbName := os.Getenv("MONGODB_DATABASE"); dbName != "" {
		cfg.Database.DBName = dbName
		fmt.Printf("🗄️  Database Name: %s\n", dbName)
	}

	// Set default database name
	if cfg.Database.DBName == "" {
		cfg.Database.DBName = "notisync"
	}

	fmt.Println("\n1️⃣ Connecting to MongoDB...")

	// Initialize MongoDB connection
	mongoDB, err := database.NewMongoConnection(&cfg.Database)
	if err != nil {
		log.Fatalf("❌ Failed to connect to MongoDB: %v", err)
	}
	defer mongoDB.Close()

	fmt.Println("✅ Connected to MongoDB successfully!")

	fmt.Println("\n2️⃣ Testing MongoDB health...")

	// Test MongoDB health
	if err := mongoDB.Health(); err != nil {
		log.Fatalf("❌ MongoDB health check failed: %v", err)
	}

	fmt.Println("✅ MongoDB health check passed!")

	fmt.Println("\n3️⃣ Testing MongoDB repositories...")

	// Initialize repositories
	repos := repository.NewMongoRepositories(mongoDB)

	fmt.Println("✅ MongoDB repositories initialized!")

	fmt.Println("\n4️⃣ Testing user creation...")

	// Test creating a user
	testUser := &types.User{
		ID:    uuid.New(),
		Email: fmt.Sprintf("test-%d@example.com", time.Now().Unix()),
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte("testpassword123"), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("❌ Failed to hash password: %v", err)
	}
	testUser.PasswordHash = string(hashedPassword)

	// Create user
	err = repos.User.Create(testUser)
	if err != nil {
		log.Fatalf("❌ Failed to create test user: %v", err)
	}

	fmt.Printf("✅ Test user created: %s\n", testUser.Email)

	fmt.Println("\n5️⃣ Testing user retrieval...")

	// Retrieve user
	retrievedUser, err := repos.User.GetByEmail(testUser.Email)
	if err != nil {
		log.Fatalf("❌ Failed to retrieve test user: %v", err)
	}

	fmt.Printf("✅ User retrieved: %s (ID: %s)\n", retrievedUser.Email, retrievedUser.ID)

	fmt.Println("\n6️⃣ Testing device creation...")

	// Test creating a device
	pushToken := "test-push-token"
	testDevice := &types.Device{
		ID:         uuid.New(),
		UserID:     testUser.ID,
		DeviceName: "Test Device",
		DeviceType: "mobile",
		PushToken:  &pushToken,
	}

	err = repos.Device.Create(testDevice)
	if err != nil {
		log.Fatalf("❌ Failed to create test device: %v", err)
	}

	fmt.Printf("✅ Test device created: %s\n", testDevice.DeviceName)

	fmt.Println("\n7️⃣ Testing notification creation...")

	// Test creating a notification
	testNotification := &types.Notification{
		ID:             uuid.New(),
		UserID:         testUser.ID,
		SourceDeviceID: testDevice.ID,
		AppName:        "Test App",
		Title:          "Test Notification",
		Body:           "This is a test notification from MongoDB",
		Category:       "Personal",
		Priority:       0,
		IsRead:         false,
		IsDismissed:    false,
	}

	err = repos.Notification.Create(testNotification)
	if err != nil {
		log.Fatalf("❌ Failed to create test notification: %v", err)
	}

	fmt.Printf("✅ Test notification created: %s\n", testNotification.Title)

	fmt.Println("\n8️⃣ Cleaning up test data...")

	// Clean up test data
	err = repos.Notification.Delete(testNotification.ID)
	if err != nil {
		fmt.Printf("⚠️  Warning: Failed to delete test notification: %v\n", err)
	}

	err = repos.Device.Delete(testDevice.ID)
	if err != nil {
		fmt.Printf("⚠️  Warning: Failed to delete test device: %v\n", err)
	}

	err = repos.User.Delete(testUser.ID)
	if err != nil {
		fmt.Printf("⚠️  Warning: Failed to delete test user: %v\n", err)
	}

	fmt.Println("✅ Test data cleaned up!")

	fmt.Println("\n🎉 MongoDB Connection Test Complete!")
	fmt.Println("\n✅ All tests passed! Your MongoDB database is ready for NotiSync.")
	fmt.Println("\n🚀 Next steps:")
	fmt.Println("   1. Run the MongoDB server: go run cmd/mongo-atlas-server/main.go")
	fmt.Println("   2. Test the API endpoints")
	fmt.Println("   3. Connect your web/mobile apps")
}

// maskURI masks sensitive information in MongoDB URI
func maskURI(uri string) string {
	if len(uri) > 20 {
		return uri[:20] + "***" + uri[len(uri)-10:]
	}
	return "***"
}