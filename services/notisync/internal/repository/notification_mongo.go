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

// NotificationMongoRepository handles notification operations with MongoDB
type NotificationMongoRepository struct {
	collection *mongo.Collection
}

// NewNotificationMongoRepository creates a new notification repository for MongoDB
func NewNotificationMongoRepository(db *database.MongoDB) *NotificationMongoRepository {
	return &NotificationMongoRepository{
		collection: db.Collection(database.NotificationsCollection),
	}
}

// Create creates a new notification
func (r *NotificationMongoRepository) Create(notification *types.Notification) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if notification.ID == uuid.Nil {
		notification.ID = uuid.New()
	}

	notification.SetDefaults()

	_, err := r.collection.InsertOne(ctx, notification)
	if err != nil {
		return fmt.Errorf("failed to create notification: %w", err)
	}

	return nil
}

// GetByID retrieves a notification by ID
func (r *NotificationMongoRepository) GetByID(id uuid.UUID) (*types.Notification, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var notification types.Notification
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&notification)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("notification not found")
		}
		return nil, fmt.Errorf("failed to get notification: %w", err)
	}

	return &notification, nil
}

// GetByUserID retrieves notifications for a user with pagination
func (r *NotificationMongoRepository) GetByUserID(userID uuid.UUID, limit, offset int) ([]*types.Notification, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"user_id": userID,
		"expires_at": bson.M{"$gt": time.Now()},
	}

	opts := options.Find().
		SetSort(bson.D{{"created_at", -1}}).
		SetLimit(int64(limit)).
		SetSkip(int64(offset))

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to get notifications: %w", err)
	}
	defer cursor.Close(ctx)

	var notifications []*types.Notification
	for cursor.Next(ctx) {
		var notification types.Notification
		if err := cursor.Decode(&notification); err != nil {
			continue
		}
		notifications = append(notifications, &notification)
	}

	return notifications, nil
}

// Update updates a notification
func (r *NotificationMongoRepository) Update(notification *types.Notification) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"_id": notification.ID}
	update := bson.M{"$set": notification}

	result, err := r.collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to update notification: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("notification not found")
	}

	return nil
}

// Delete deletes a notification
func (r *NotificationMongoRepository) Delete(id uuid.UUID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return fmt.Errorf("failed to delete notification: %w", err)
	}

	if result.DeletedCount == 0 {
		return fmt.Errorf("notification not found")
	}

	return nil
}

// UpdateStatus updates the read/dismissed status of a notification
func (r *NotificationMongoRepository) UpdateStatus(id uuid.UUID, status types.NotificationStatus) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var update bson.M
	switch status {
	case types.StatusRead:
		update = bson.M{"$set": bson.M{"is_read": true, "is_dismissed": false}}
	case types.StatusDismissed:
		update = bson.M{"$set": bson.M{"is_read": true, "is_dismissed": true}}
	case types.StatusUnread:
		update = bson.M{"$set": bson.M{"is_read": false, "is_dismissed": false}}
	default:
		return fmt.Errorf("invalid status: %s", status)
	}

	result, err := r.collection.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		return fmt.Errorf("failed to update notification status: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("notification not found")
	}

	return nil
}

// GetUnreadCount returns the count of unread notifications for a user
func (r *NotificationMongoRepository) GetUnreadCount(userID uuid.UUID) (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{
		"user_id": userID,
		"is_read": false,
		"expires_at": bson.M{"$gt": time.Now()},
	}

	count, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return 0, fmt.Errorf("failed to get unread count: %w", err)
	}

	return count, nil
}

// CleanupExpired removes expired notifications
func (r *NotificationMongoRepository) CleanupExpired() (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	filter := bson.M{
		"$or": []bson.M{
			{"expires_at": bson.M{"$lte": time.Now()}},
			{"created_at": bson.M{"$lt": time.Now().AddDate(0, 0, -7)}},
		},
	}

	result, err := r.collection.DeleteMany(ctx, filter)
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup expired notifications: %w", err)
	}

	return result.DeletedCount, nil
}

// Search searches notifications with filters
func (r *NotificationMongoRepository) Search(userID uuid.UUID, query string, category string, limit, offset int) ([]*types.Notification, int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"user_id": userID,
		"expires_at": bson.M{"$gt": time.Now()},
	}

	// Add text search if query provided
	if query != "" {
		filter["$or"] = []bson.M{
			{"title": bson.M{"$regex": query, "$options": "i"}},
			{"body": bson.M{"$regex": query, "$options": "i"}},
			{"app_name": bson.M{"$regex": query, "$options": "i"}},
		}
	}

	// Add category filter if provided
	if category != "" {
		filter["category"] = category
	}

	// Get total count
	totalCount, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count notifications: %w", err)
	}

	// Get notifications with pagination
	opts := options.Find().
		SetSort(bson.D{{"created_at", -1}}).
		SetLimit(int64(limit)).
		SetSkip(int64(offset))

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to search notifications: %w", err)
	}
	defer cursor.Close(ctx)

	var notifications []*types.Notification
	for cursor.Next(ctx) {
		var notification types.Notification
		if err := cursor.Decode(&notification); err != nil {
			continue
		}
		notifications = append(notifications, &notification)
	}

	return notifications, totalCount, nil
}

// GetStats returns notification statistics for a user
func (r *NotificationMongoRepository) GetStats(userID uuid.UUID, days int) (map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	startDate := time.Now().AddDate(0, 0, -days)
	
	pipeline := []bson.M{
		{
			"$match": bson.M{
				"user_id": userID,
				"created_at": bson.M{"$gte": startDate},
				"expires_at": bson.M{"$gt": time.Now()},
			},
		},
		{
			"$group": bson.M{
				"_id": nil,
				"total": bson.M{"$sum": 1},
				"read": bson.M{
					"$sum": bson.M{
						"$cond": []interface{}{
							"$is_read", 1, 0,
						},
					},
				},
				"unread": bson.M{
					"$sum": bson.M{
						"$cond": []interface{}{
							bson.M{"$eq": []interface{}{"$is_read", false}}, 1, 0,
						},
					},
				},
				"dismissed": bson.M{
					"$sum": bson.M{
						"$cond": []interface{}{
							"$is_dismissed", 1, 0,
						},
					},
				},
				"unique_apps": bson.M{"$addToSet": "$app_name"},
			},
		},
		{
			"$project": bson.M{
				"total": 1,
				"read": 1,
				"unread": 1,
				"dismissed": 1,
				"unique_apps": bson.M{"$size": "$unique_apps"},
			},
		},
	}

	cursor, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, fmt.Errorf("failed to get stats: %w", err)
	}
	defer cursor.Close(ctx)

	var result map[string]interface{}
	if cursor.Next(ctx) {
		if err := cursor.Decode(&result); err != nil {
			return nil, fmt.Errorf("failed to decode stats: %w", err)
		}
	} else {
		// No data found, return empty stats
		result = map[string]interface{}{
			"total": 0,
			"read": 0,
			"unread": 0,
			"dismissed": 0,
			"unique_apps": 0,
		}
	}

	result["period_days"] = days
	result["timestamp"] = time.Now()

	return result, nil
}