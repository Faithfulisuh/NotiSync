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

// UserMongoRepository handles user operations with MongoDB
type UserMongoRepository struct {
	collection *mongo.Collection
}

// NewUserMongoRepository creates a new user repository for MongoDB
func NewUserMongoRepository(db *database.MongoDB) *UserMongoRepository {
	return &UserMongoRepository{
		collection: db.Collection(database.UsersCollection),
	}
}

// Create creates a new user
func (r *UserMongoRepository) Create(user *types.User) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if user.ID == uuid.Nil {
		user.ID = uuid.New()
	}
	
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()

	// Check if user already exists
	existingUser, err := r.GetByEmail(user.Email)
	if err == nil && existingUser != nil {
		return fmt.Errorf("user with email %s already exists", user.Email)
	}

	// Create unique index on email if it doesn't exist
	indexModel := mongo.IndexModel{
		Keys:    bson.D{{"email", 1}},
		Options: options.Index().SetUnique(true),
	}
	_, err = r.collection.Indexes().CreateOne(ctx, indexModel)
	if err != nil {
		// Index might already exist, continue
	}

	_, err = r.collection.InsertOne(ctx, user)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return fmt.Errorf("user with email %s already exists", user.Email)
		}
		return fmt.Errorf("failed to create user: %w", err)
	}

	return nil
}

// GetByID retrieves a user by ID
func (r *UserMongoRepository) GetByID(id uuid.UUID) (*types.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user types.User
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get user by ID: %w", err)
	}

	return &user, nil
}

// GetByEmail retrieves a user by email
func (r *UserMongoRepository) GetByEmail(email string) (*types.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user types.User
	err := r.collection.FindOne(ctx, bson.M{"email": email}).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get user by email: %w", err)
	}

	return &user, nil
}

// Update updates a user
func (r *UserMongoRepository) Update(user *types.User) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	user.UpdatedAt = time.Now()

	filter := bson.M{"_id": user.ID}
	update := bson.M{"$set": user}

	result, err := r.collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("user not found")
	}

	return nil
}

// Delete deletes a user
func (r *UserMongoRepository) Delete(id uuid.UUID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}

	if result.DeletedCount == 0 {
		return fmt.Errorf("user not found")
	}

	return nil
}

// List retrieves all users with pagination
func (r *UserMongoRepository) List(limit, offset int) ([]*types.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	opts := options.Find().
		SetSort(bson.D{{"created_at", -1}}).
		SetLimit(int64(limit)).
		SetSkip(int64(offset))

	cursor, err := r.collection.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}
	defer cursor.Close(ctx)

	var users []*types.User
	for cursor.Next(ctx) {
		var user types.User
		if err := cursor.Decode(&user); err != nil {
			continue
		}
		// Don't return password hash
		user.PasswordHash = ""
		users = append(users, &user)
	}

	return users, nil
}

// Count returns the total number of users
func (r *UserMongoRepository) Count() (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	count, err := r.collection.CountDocuments(ctx, bson.M{})
	if err != nil {
		return 0, fmt.Errorf("failed to count users: %w", err)
	}

	return count, nil
}