package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"github.com/notisync/backend/internal/database"
	"github.com/notisync/backend/internal/types"
)

// NotificationActionMongoRepository handles notification action operations with MongoDB
type NotificationActionMongoRepository struct {
	collection *mongo.Collection
}

// NewNotificationActionMongoRepository creates a new notification action repository for MongoDB
func NewNotificationActionMongoRepository(db *database.MongoDB) *NotificationActionMongoRepository {
	return &NotificationActionMongoRepository{
		collection: db.Collection(database.NotificationActionsCollection),
	}
}

// Create creates a new notification action
func (r *NotificationActionMongoRepository) Create(action *types.NotificationActionRecord) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if action.ID == uuid.Nil {
		action.ID = uuid.New()
	}
	
	action.Timestamp = time.Now()

	_, err := r.collection.InsertOne(ctx, action)
	if err != nil {
		return fmt.Errorf("failed to create notification action: %w", err)
	}

	return nil
}

// GetByID retrieves a notification action by ID
func (r *NotificationActionMongoRepository) GetByID(id uuid.UUID) (*types.NotificationActionRecord, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var action types.NotificationActionRecord
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&action)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("notification action not found")
		}
		return nil, fmt.Errorf("failed to get notification action by ID: %w", err)
	}

	return &action, nil
}

// GetByNotificationID retrieves all actions for a notification
func (r *NotificationActionMongoRepository) GetByNotificationID(notificationID uuid.UUID) ([]*types.NotificationActionRecord, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{"notification_id": notificationID}
	opts := options.Find().SetSort(bson.D{{"timestamp", -1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to get notification actions: %w", err)
	}
	defer cursor.Close(ctx)

	var actions []*types.NotificationActionRecord
	for cursor.Next(ctx) {
		var action types.NotificationActionRecord
		if err := cursor.Decode(&action); err != nil {
			continue
		}
		actions = append(actions, &action)
	}

	return actions, nil
}

// GetByDeviceID retrieves all actions for a device
func (r *NotificationActionMongoRepository) GetByDeviceID(deviceID uuid.UUID) ([]*types.NotificationActionRecord, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{"device_id": deviceID}
	opts := options.Find().SetSort(bson.D{{"timestamp", -1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to get device actions: %w", err)
	}
	defer cursor.Close(ctx)

	var actions []*types.NotificationActionRecord
	for cursor.Next(ctx) {
		var action types.NotificationActionRecord
		if err := cursor.Decode(&action); err != nil {
			continue
		}
		actions = append(actions, &action)
	}

	return actions, nil
}

// GetByUserID retrieves all actions for a user's notifications
func (r *NotificationActionMongoRepository) GetByUserID(userID uuid.UUID, limit, offset int) ([]*types.NotificationActionRecord, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// This requires a lookup to notifications collection to filter by user_id
	pipeline := []bson.M{
		{
			"$lookup": bson.M{
				"from":         "notifications",
				"localField":   "notification_id",
				"foreignField": "_id",
				"as":           "notification",
			},
		},
		{
			"$match": bson.M{
				"notification.user_id": userID,
			},
		},
		{
			"$sort": bson.M{"timestamp": -1},
		},
		{
			"$skip": offset,
		},
		{
			"$limit": limit,
		},
	}

	cursor, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, fmt.Errorf("failed to get user actions: %w", err)
	}
	defer cursor.Close(ctx)

	var actions []*types.NotificationActionRecord
	for cursor.Next(ctx) {
		var action types.NotificationActionRecord
		if err := cursor.Decode(&action); err != nil {
			continue
		}
		actions = append(actions, &action)
	}

	return actions, nil
}

// Update updates a notification action
func (r *NotificationActionMongoRepository) Update(action *types.NotificationActionRecord) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"_id": action.ID}
	update := bson.M{"$set": action}

	result, err := r.collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to update notification action: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("notification action not found")
	}

	return nil
}

// Delete deletes a notification action
func (r *NotificationActionMongoRepository) Delete(id uuid.UUID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return fmt.Errorf("failed to delete notification action: %w", err)
	}

	if result.DeletedCount == 0 {
		return fmt.Errorf("notification action not found")
	}

	return nil
}

// DeleteByNotificationID deletes all actions for a notification
func (r *NotificationActionMongoRepository) DeleteByNotificationID(notificationID uuid.UUID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := r.collection.DeleteMany(ctx, bson.M{"notification_id": notificationID})
	if err != nil {
		return fmt.Errorf("failed to delete notification actions: %w", err)
	}

	return nil
}

// GetActionStats returns statistics about actions for a user
func (r *NotificationActionMongoRepository) GetActionStats(userID uuid.UUID, days int) (map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	startDate := time.Now().AddDate(0, 0, -days)
	
	pipeline := []bson.M{
		{
			"$lookup": bson.M{
				"from":         "notifications",
				"localField":   "notification_id",
				"foreignField": "_id",
				"as":           "notification",
			},
		},
		{
			"$match": bson.M{
				"notification.user_id": userID,
				"timestamp":            bson.M{"$gte": startDate},
			},
		},
		{
			"$group": bson.M{
				"_id": "$action_type",
				"count": bson.M{"$sum": 1},
			},
		},
	}

	cursor, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, fmt.Errorf("failed to get action stats: %w", err)
	}
	defer cursor.Close(ctx)

	stats := map[string]interface{}{
		"read":      0,
		"dismissed": 0,
		"clicked":   0,
		"total":     0,
	}

	total := 0
	for cursor.Next(ctx) {
		var result struct {
			ID    string `bson:"_id"`
			Count int    `bson:"count"`
		}
		if err := cursor.Decode(&result); err != nil {
			continue
		}
		stats[result.ID] = result.Count
		total += result.Count
	}

	stats["total"] = total
	stats["period_days"] = days
	stats["timestamp"] = time.Now()

	return stats, nil
}

// CleanupExpired removes expired notification actions (placeholder implementation)
func (r *NotificationActionMongoRepository) CleanupExpired() (int64, error) {
	// For now, we don't expire notification actions
	// This could be implemented to remove actions older than a certain period
	return 0, nil
}