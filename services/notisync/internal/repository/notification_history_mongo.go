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

// NotificationHistoryMongoRepository handles notification history operations with MongoDB
type NotificationHistoryMongoRepository struct {
	collection *mongo.Collection
}

// NewNotificationHistoryMongoRepository creates a new notification history repository for MongoDB
func NewNotificationHistoryMongoRepository(db *database.MongoDB) *NotificationHistoryMongoRepository {
	return &NotificationHistoryMongoRepository{
		collection: db.Collection(database.NotificationsCollection), // Use same collection as notifications
	}
}

// GetHistory retrieves notification history for a user with filters
func (r *NotificationHistoryMongoRepository) GetHistory(userID uuid.UUID, filters map[string]interface{}, limit, offset int) ([]*types.Notification, int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Build filter
	filter := bson.M{"user_id": userID}
	
	// Add date range filter (default to last 7 days)
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -7)
	
	if startDateFilter, ok := filters["start_date"].(time.Time); ok {
		startDate = startDateFilter
	}
	if endDateFilter, ok := filters["end_date"].(time.Time); ok {
		endDate = endDateFilter
	}
	
	filter["created_at"] = bson.M{
		"$gte": startDate,
		"$lte": endDate,
	}

	// Add other filters
	if category, ok := filters["category"].(string); ok && category != "" {
		filter["category"] = category
	}
	if appName, ok := filters["app_name"].(string); ok && appName != "" {
		filter["app_name"] = appName
	}
	if isRead, ok := filters["is_read"].(bool); ok {
		filter["is_read"] = isRead
	}
	if isDismissed, ok := filters["is_dismissed"].(bool); ok {
		filter["is_dismissed"] = isDismissed
	}
	if search, ok := filters["search"].(string); ok && search != "" {
		filter["$or"] = []bson.M{
			{"title": bson.M{"$regex": search, "$options": "i"}},
			{"body": bson.M{"$regex": search, "$options": "i"}},
			{"app_name": bson.M{"$regex": search, "$options": "i"}},
		}
	}

	// Get total count
	totalCount, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count history: %w", err)
	}

	// Get notifications with pagination
	opts := options.Find().
		SetSort(bson.D{{"created_at", -1}}).
		SetLimit(int64(limit)).
		SetSkip(int64(offset))

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get history: %w", err)
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

// SearchHistory searches notification history with text query
func (r *NotificationHistoryMongoRepository) SearchHistory(userID uuid.UUID, query string, limit, offset int) ([]*types.Notification, int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"user_id": userID,
		"created_at": bson.M{
			"$gte": time.Now().AddDate(0, 0, -7), // Last 7 days
		},
	}

	if query != "" {
		filter["$or"] = []bson.M{
			{"title": bson.M{"$regex": query, "$options": "i"}},
			{"body": bson.M{"$regex": query, "$options": "i"}},
			{"app_name": bson.M{"$regex": query, "$options": "i"}},
		}
	}

	// Get total count
	totalCount, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count search results: %w", err)
	}

	// Get notifications with pagination
	opts := options.Find().
		SetSort(bson.D{{"created_at", -1}}).
		SetLimit(int64(limit)).
		SetSkip(int64(offset))

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to search history: %w", err)
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

// GetHistoryStats returns statistics about notification history
func (r *NotificationHistoryMongoRepository) GetHistoryStats(userID uuid.UUID, days int) (map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	startDate := time.Now().AddDate(0, 0, -days)
	
	pipeline := []bson.M{
		{
			"$match": bson.M{
				"user_id": userID,
				"created_at": bson.M{"$gte": startDate},
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
				"categories": bson.M{
					"$push": "$category",
				},
				"apps": bson.M{
					"$addToSet": "$app_name",
				},
			},
		},
		{
			"$project": bson.M{
				"total":      1,
				"read":       1,
				"unread":     1,
				"dismissed":  1,
				"unique_apps": bson.M{"$size": "$apps"},
				"categories": 1,
			},
		},
	}

	cursor, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, fmt.Errorf("failed to get history stats: %w", err)
	}
	defer cursor.Close(ctx)

	var result map[string]interface{}
	if cursor.Next(ctx) {
		if err := cursor.Decode(&result); err != nil {
			return nil, fmt.Errorf("failed to decode history stats: %w", err)
		}
	} else {
		// No data found, return empty stats
		result = map[string]interface{}{
			"total":       0,
			"read":        0,
			"unread":      0,
			"dismissed":   0,
			"unique_apps": 0,
			"categories":  []string{},
		}
	}

	// Count categories
	if categories, ok := result["categories"].([]interface{}); ok {
		categoryCount := make(map[string]int)
		for _, cat := range categories {
			if catStr, ok := cat.(string); ok {
				categoryCount[catStr]++
			}
		}
		result["category_breakdown"] = categoryCount
	}

	result["period_days"] = days
	result["timestamp"] = time.Now()

	return result, nil
}

// GetAppBreakdown returns notification breakdown by app
func (r *NotificationHistoryMongoRepository) GetAppBreakdown(userID uuid.UUID, days int) ([]map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	startDate := time.Now().AddDate(0, 0, -days)
	
	pipeline := []bson.M{
		{
			"$match": bson.M{
				"user_id": userID,
				"created_at": bson.M{"$gte": startDate},
			},
		},
		{
			"$group": bson.M{
				"_id": "$app_name",
				"total": bson.M{"$sum": 1},
				"read": bson.M{
					"$sum": bson.M{
						"$cond": []interface{}{
							"$is_read", 1, 0,
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
			},
		},
		{
			"$sort": bson.M{"total": -1},
		},
		{
			"$limit": 20, // Top 20 apps
		},
	}

	cursor, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, fmt.Errorf("failed to get app breakdown: %w", err)
	}
	defer cursor.Close(ctx)

	var results []map[string]interface{}
	for cursor.Next(ctx) {
		var result map[string]interface{}
		if err := cursor.Decode(&result); err != nil {
			continue
		}
		results = append(results, result)
	}

	return results, nil
}

// CleanupExpired removes expired notifications from history
func (r *NotificationHistoryMongoRepository) CleanupExpired() (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Remove notifications older than 7 days
	cutoffDate := time.Now().AddDate(0, 0, -7)
	
	filter := bson.M{
		"created_at": bson.M{"$lt": cutoffDate},
	}

	result, err := r.collection.DeleteMany(ctx, filter)
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup expired history: %w", err)
	}

	return result.DeletedCount, nil
}

// GetDateRange returns the date range of available notifications for a user
func (r *NotificationHistoryMongoRepository) GetDateRange(userID uuid.UUID) (time.Time, time.Time, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{"user_id": userID}

	// Get earliest notification
	earliestOpts := options.FindOne().SetSort(bson.D{{"created_at", 1}})
	var earliest types.Notification
	err := r.collection.FindOne(ctx, filter, earliestOpts).Decode(&earliest)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return time.Time{}, time.Time{}, fmt.Errorf("no notifications found")
		}
		return time.Time{}, time.Time{}, fmt.Errorf("failed to get earliest notification: %w", err)
	}

	// Get latest notification
	latestOpts := options.FindOne().SetSort(bson.D{{"created_at", -1}})
	var latest types.Notification
	err = r.collection.FindOne(ctx, filter, latestOpts).Decode(&latest)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("failed to get latest notification: %w", err)
	}

	return earliest.CreatedAt, latest.CreatedAt, nil
}