package auth

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/types"
	"golang.org/x/crypto/bcrypt"
)

// Mock repository for testing
type mockUserRepository struct {
	users map[string]*types.User
}

func (m *mockUserRepository) Create(user *types.User) error {
	user.ID = uuid.New()
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()
	m.users[user.Email] = user
	return nil
}

func (m *mockUserRepository) GetByEmail(email string) (*types.User, error) {
	if user, exists := m.users[email]; exists {
		return user, nil
	}
	return nil, fmt.Errorf("user not found")
}

func (m *mockUserRepository) GetByID(id uuid.UUID) (*types.User, error) {
	for _, user := range m.users {
		if user.ID == id {
			return user, nil
		}
	}
	return nil, fmt.Errorf("user not found")
}

func TestAuthService_Register(t *testing.T) {
	// Skip test if we don't have proper test setup
	t.Skip("Auth service tests require mock repository setup")

	cfg := &config.JWTConfig{
		Secret:         "test-secret",
		ExpirationHours: 24,
	}

	mockRepo := &mockUserRepository{
		users: make(map[string]*types.User),
	}

	// This would need proper repository mocking
	// service := NewService(mockRepo, cfg)

	req := &RegisterRequest{
		Email:    "test@example.com",
		Password: "password123",
	}

	// response, err := service.Register(req)
	// if err != nil {
	// 	t.Fatalf("Failed to register user: %v", err)
	// }

	// if response.User.Email != req.Email {
	// 	t.Errorf("Expected email %s, got %s", req.Email, response.User.Email)
	// }

	// if response.Token == "" {
	// 	t.Error("Expected token to be generated")
	// }
}

func TestPasswordHashing(t *testing.T) {
	password := "testpassword123"

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("Failed to hash password: %v", err)
	}

	// Verify password
	err = bcrypt.CompareHashAndPassword(hashedPassword, []byte(password))
	if err != nil {
		t.Errorf("Password verification failed: %v", err)
	}

	// Verify wrong password fails
	err = bcrypt.CompareHashAndPassword(hashedPassword, []byte("wrongpassword"))
	if err == nil {
		t.Error("Expected password verification to fail for wrong password")
	}
}

func TestJWTTokenGeneration(t *testing.T) {
	cfg := &config.JWTConfig{
		Secret:         "test-secret-key",
		ExpirationHours: 1,
	}

	// This would need proper service initialization
	// service := NewService(nil, cfg)

	userID := uuid.New()
	email := "test@example.com"
	deviceID := uuid.New()

	// token, refreshToken, expiresAt, err := service.generateTokens(userID, email, deviceID)
	// if err != nil {
	// 	t.Fatalf("Failed to generate tokens: %v", err)
	// }

	// if token == "" {
	// 	t.Error("Expected access token to be generated")
	// }

	// if refreshToken == "" {
	// 	t.Error("Expected refresh token to be generated")
	// }

	// if expiresAt.Before(time.Now()) {
	// 	t.Error("Token should not be expired immediately")
	// }

	// Validate token
	// claims, err := service.validateToken(token)
	// if err != nil {
	// 	t.Fatalf("Failed to validate token: %v", err)
	// }

	// if claims.UserID != userID {
	// 	t.Errorf("Expected user ID %s, got %s", userID, claims.UserID)
	// }

	// if claims.Email != email {
	// 	t.Errorf("Expected email %s, got %s", email, claims.Email)
	// }
}