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

// UserRuleMongoRepository handles user rule operations with MongoDB
type UserRuleMongoRepository struct {
	collection *mongo.Collection
}

// NewUserRuleMongoRepository creates a new user rule repository for MongoDB
func NewUserRuleMongoRepository(db *database.MongoDB) *UserRuleMongoRepository {
	return &UserRuleMongoRepository{
		collection: db.Collection(database.UserRulesCollection),
	}
}

// Create creates a new user rule
func (r *UserRuleMongoRepository) Create(rule *types.UserRule) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if rule.ID == uuid.Nil {
		rule.ID = uuid.New()
	}
	
	rule.CreatedAt = time.Now()

	_, err := r.collection.InsertOne(ctx, rule)
	if err != nil {
		return fmt.Errorf("failed to create user rule: %w", err)
	}

	return nil
}

// GetByID retrieves a user rule by ID
func (r *UserRuleMongoRepository) GetByID(id uuid.UUID) (*types.UserRule, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var rule types.UserRule
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&rule)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("user rule not found")
		}
		return nil, fmt.Errorf("failed to get user rule by ID: %w", err)
	}

	return &rule, nil
}

// GetByUserID retrieves all rules for a user
func (r *UserRuleMongoRepository) GetByUserID(userID uuid.UUID) ([]*types.UserRule, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{"user_id": userID}
	opts := options.Find().SetSort(bson.D{{"created_at", -1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to get user rules: %w", err)
	}
	defer cursor.Close(ctx)

	var rules []*types.UserRule
	for cursor.Next(ctx) {
		var rule types.UserRule
		if err := cursor.Decode(&rule); err != nil {
			continue
		}
		rules = append(rules, &rule)
	}

	return rules, nil
}

// GetActiveByUserID retrieves all active rules for a user
func (r *UserRuleMongoRepository) GetActiveByUserID(userID uuid.UUID) ([]*types.UserRule, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"user_id":   userID,
		"is_active": true,
	}
	opts := options.Find().SetSort(bson.D{{"created_at", -1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to get active user rules: %w", err)
	}
	defer cursor.Close(ctx)

	var rules []*types.UserRule
	for cursor.Next(ctx) {
		var rule types.UserRule
		if err := cursor.Decode(&rule); err != nil {
			continue
		}
		rules = append(rules, &rule)
	}

	return rules, nil
}

// Update updates a user rule
func (r *UserRuleMongoRepository) Update(rule *types.UserRule) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"_id": rule.ID}
	update := bson.M{"$set": rule}

	result, err := r.collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to update user rule: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("user rule not found")
	}

	return nil
}

// Delete deletes a user rule
func (r *UserRuleMongoRepository) Delete(id uuid.UUID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return fmt.Errorf("failed to delete user rule: %w", err)
	}

	if result.DeletedCount == 0 {
		return fmt.Errorf("user rule not found")
	}

	return nil
}

// DeleteByUserID deletes all rules for a user
func (r *UserRuleMongoRepository) DeleteByUserID(userID uuid.UUID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := r.collection.DeleteMany(ctx, bson.M{"user_id": userID})
	if err != nil {
		return fmt.Errorf("failed to delete user rules: %w", err)
	}

	return nil
}

// ToggleActive toggles the active status of a rule
func (r *UserRuleMongoRepository) ToggleActive(id uuid.UUID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// First get the current rule to check its active status
	var rule types.UserRule
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&rule)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return fmt.Errorf("user rule not found")
		}
		return fmt.Errorf("failed to get user rule: %w", err)
	}

	// Toggle the active status
	filter := bson.M{"_id": id}
	update := bson.M{"$set": bson.M{"is_active": !rule.IsActive}}

	result, err := r.collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to toggle rule active status: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("user rule not found")
	}

	return nil
}