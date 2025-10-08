package database

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"github.com/notisync/backend/internal/config"
)

type MongoDB struct {
	Client   *mongo.Client
	Database *mongo.Database
}

func NewMongoConnection(cfg *config.DatabaseConfig) (*MongoDB, error) {
	// Build MongoDB connection string
	var uri string
	
	// Priority 1: Use URI if provided (for MongoDB Atlas)
	if cfg.URI != "" {
		uri = cfg.URI
	} else if cfg.Host != "" && (len(cfg.Host) > 11 && cfg.Host[:11] == "mongodb+srv" || len(cfg.Host) > 7 && cfg.Host[:7] == "mongodb") {
		// Priority 2: Use host as full connection string for Atlas
		uri = cfg.Host
	} else {
		// Priority 3: Build traditional MongoDB connection
		if cfg.User != "" && cfg.Password != "" {
			uri = fmt.Sprintf("mongodb://%s:%s@%s:%d/%s", 
				cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.DBName)
		} else {
			uri = fmt.Sprintf("mongodb://%s:%d/%s", 
				cfg.Host, cfg.Port, cfg.DBName)
		}
	}

	// Set client options
	clientOptions := options.Client().ApplyURI(uri)
	clientOptions.SetMaxPoolSize(25)
	clientOptions.SetMinPoolSize(5)
	clientOptions.SetMaxConnIdleTime(5 * time.Minute)
	clientOptions.SetConnectTimeout(10 * time.Second)
	clientOptions.SetServerSelectionTimeout(5 * time.Second)

	// Connect to MongoDB
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	// Test the connection
	if err := client.Ping(ctx, nil); err != nil {
		return nil, fmt.Errorf("failed to ping MongoDB: %w", err)
	}

	database := client.Database(cfg.DBName)

	return &MongoDB{
		Client:   client,
		Database: database,
	}, nil
}

func (db *MongoDB) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return db.Client.Disconnect(ctx)
}

func (db *MongoDB) Health() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return db.Client.Ping(ctx, nil)
}

// Collection returns a MongoDB collection
func (db *MongoDB) Collection(name string) *mongo.Collection {
	return db.Database.Collection(name)
}

// Collections we'll use
const (
	UsersCollection              = "users"
	DevicesCollection           = "devices"
	NotificationsCollection     = "notifications"
	UserRulesCollection         = "user_rules"
	NotificationActionsCollection = "notification_actions"
)