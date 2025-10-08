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

// DeviceMongoRepository handles device operations with MongoDB
type DeviceMongoRepository struct {
	collection *mongo.Collection
}

// NewDeviceMongoRepository creates a new device repository for MongoDB
func NewDeviceMongoRepository(db *database.MongoDB) *DeviceMongoRepository {
	return &DeviceMongoRepository{
		collection: db.Collection(database.DevicesCollection),
	}
}

// Create creates a new device
func (r *DeviceMongoRepository) Create(device *types.Device) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if device.ID == uuid.Nil {
		device.ID = uuid.New()
	}
	
	device.LastSeen = time.Now()
	device.CreatedAt = time.Now()

	_, err := r.collection.InsertOne(ctx, device)
	if err != nil {
		return fmt.Errorf("failed to create device: %w", err)
	}

	return nil
}

// GetByID retrieves a device by ID
func (r *DeviceMongoRepository) GetByID(id uuid.UUID) (*types.Device, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var device types.Device
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&device)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("device not found")
		}
		return nil, fmt.Errorf("failed to get device by ID: %w", err)
	}

	return &device, nil
}

// GetByUserID retrieves all devices for a user
func (r *DeviceMongoRepository) GetByUserID(userID uuid.UUID) ([]*types.Device, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{"user_id": userID}
	opts := options.Find().SetSort(bson.D{{"created_at", -1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to get devices by user ID: %w", err)
	}
	defer cursor.Close(ctx)

	var devices []*types.Device
	for cursor.Next(ctx) {
		var device types.Device
		if err := cursor.Decode(&device); err != nil {
			continue
		}
		devices = append(devices, &device)
	}

	return devices, nil
}

// Update updates a device
func (r *DeviceMongoRepository) Update(device *types.Device) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	device.LastSeen = time.Now()

	filter := bson.M{"_id": device.ID}
	update := bson.M{"$set": device}

	result, err := r.collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to update device: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("device not found")
	}

	return nil
}

// UpdateLastSeen updates the last seen timestamp for a device
func (r *DeviceMongoRepository) UpdateLastSeen(id uuid.UUID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"_id": id}
	update := bson.M{"$set": bson.M{"last_seen": time.Now()}}

	result, err := r.collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("failed to update device last seen: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("device not found")
	}

	return nil
}

// Delete deletes a device
func (r *DeviceMongoRepository) Delete(id uuid.UUID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return fmt.Errorf("failed to delete device: %w", err)
	}

	if result.DeletedCount == 0 {
		return fmt.Errorf("device not found")
	}

	return nil
}

// DeleteByUserID deletes all devices for a user
func (r *DeviceMongoRepository) DeleteByUserID(userID uuid.UUID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := r.collection.DeleteMany(ctx, bson.M{"user_id": userID})
	if err != nil {
		return fmt.Errorf("failed to delete devices by user ID: %w", err)
	}

	return nil
}

// List retrieves all devices with pagination
func (r *DeviceMongoRepository) List(limit, offset int) ([]*types.Device, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	opts := options.Find().
		SetSort(bson.D{{"created_at", -1}}).
		SetLimit(int64(limit)).
		SetSkip(int64(offset))

	cursor, err := r.collection.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to list devices: %w", err)
	}
	defer cursor.Close(ctx)

	var devices []*types.Device
	for cursor.Next(ctx) {
		var device types.Device
		if err := cursor.Decode(&device); err != nil {
			continue
		}
		devices = append(devices, &device)
	}

	return devices, nil
}

// Count returns the total number of devices
func (r *DeviceMongoRepository) Count() (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	count, err := r.collection.CountDocuments(ctx, bson.M{})
	if err != nil {
		return 0, fmt.Errorf("failed to count devices: %w", err)
	}

	return count, nil
}

// CountByUserID returns the number of devices for a user
func (r *DeviceMongoRepository) CountByUserID(userID uuid.UUID) (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	count, err := r.collection.CountDocuments(ctx, bson.M{"user_id": userID})
	if err != nil {
		return 0, fmt.Errorf("failed to count devices by user ID: %w", err)
	}

	return count, nil
}

// GetActiveDevices returns devices that have been seen recently
func (r *DeviceMongoRepository) GetActiveDevices(userID uuid.UUID, since time.Time) ([]*types.Device, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"user_id": userID,
		"last_seen": bson.M{"$gte": since},
	}
	opts := options.Find().SetSort(bson.D{{"last_seen", -1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to get active devices: %w", err)
	}
	defer cursor.Close(ctx)

	var devices []*types.Device
	for cursor.Next(ctx) {
		var device types.Device
		if err := cursor.Decode(&device); err != nil {
			continue
		}
		devices = append(devices, &device)
	}

	return devices, nil
}