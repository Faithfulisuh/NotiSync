package repository

import (
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
	_ "github.com/lib/pq"
)

func setupTestDB(t *testing.T) *sql.DB {
	// This would typically use a test database or in-memory database
	// For now, we'll skip actual database tests and focus on the structure
	t.Skip("Database tests require test database setup")
	return nil
}

func TestUserRepository_Create(t *testing.T) {
	db := setupTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()

	repo := NewUserRepository(db)

	user := &types.User{
		Email:        "test@example.com",
		PasswordHash: "hashed_password",
	}

	err := repo.Create(user)
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Verify user was created with ID and timestamps
	if user.ID == uuid.Nil {
		t.Error("User ID should be set after creation")
	}

	if user.CreatedAt.IsZero() {
		t.Error("CreatedAt should be set after creation")
	}

	if user.UpdatedAt.IsZero() {
		t.Error("UpdatedAt should be set after creation")
	}
}

func TestUserRepository_GetByEmail(t *testing.T) {
	db := setupTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()

	repo := NewUserRepository(db)

	// Create a user first
	user := &types.User{
		Email:        "test@example.com",
		PasswordHash: "hashed_password",
	}

	err := repo.Create(user)
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Retrieve the user by email
	retrievedUser, err := repo.GetByEmail("test@example.com")
	if err != nil {
		t.Fatalf("Failed to get user by email: %v", err)
	}

	if retrievedUser.Email != user.Email {
		t.Errorf("Expected email %s, got %s", user.Email, retrievedUser.Email)
	}

	if retrievedUser.ID != user.ID {
		t.Errorf("Expected ID %s, got %s", user.ID, retrievedUser.ID)
	}
}

func TestUserRepository_Update(t *testing.T) {
	db := setupTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()

	repo := NewUserRepository(db)

	// Create a user first
	user := &types.User{
		Email:        "test@example.com",
		PasswordHash: "hashed_password",
	}

	err := repo.Create(user)
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Update the user
	originalUpdatedAt := user.UpdatedAt
	time.Sleep(time.Millisecond) // Ensure timestamp difference
	user.Email = "updated@example.com"

	err = repo.Update(user)
	if err != nil {
		t.Fatalf("Failed to update user: %v", err)
	}

	// Verify UpdatedAt was changed
	if !user.UpdatedAt.After(originalUpdatedAt) {
		t.Error("UpdatedAt should be updated after modification")
	}

	// Retrieve and verify the update
	retrievedUser, err := repo.GetByID(user.ID)
	if err != nil {
		t.Fatalf("Failed to get updated user: %v", err)
	}

	if retrievedUser.Email != "updated@example.com" {
		t.Errorf("Expected updated email, got %s", retrievedUser.Email)
	}
}

func TestUserRepository_Delete(t *testing.T) {
	db := setupTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()

	repo := NewUserRepository(db)

	// Create a user first
	user := &types.User{
		Email:        "test@example.com",
		PasswordHash: "hashed_password",
	}

	err := repo.Create(user)
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Delete the user
	err = repo.Delete(user.ID)
	if err != nil {
		t.Fatalf("Failed to delete user: %v", err)
	}

	// Verify user is deleted
	_, err = repo.GetByID(user.ID)
	if err == nil {
		t.Error("Expected error when getting deleted user")
	}
}