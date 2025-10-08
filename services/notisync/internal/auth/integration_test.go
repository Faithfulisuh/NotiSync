package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/notisync/backend/internal/config"
)

func TestAuthenticationFlow(t *testing.T) {
	// Skip integration test - requires full setup
	t.Skip("Integration test requires database setup")

	// This would test the full authentication flow:
	// 1. Register a new user
	// 2. Login with credentials
	// 3. Use token to access protected endpoint
	// 4. Refresh token
	// 5. Register device
	// 6. Remove device

	gin.SetMode(gin.TestMode)

	cfg := &config.Config{
		JWT: config.JWTConfig{
			Secret:         "test-secret",
			ExpirationHours: 1,
		},
	}

	// Setup test server
	router := gin.New()

	// Test user registration
	registerReq := RegisterRequest{
		Email:    "test@example.com",
		Password: "password123",
	}

	reqBody, _ := json.Marshal(registerReq)
	req := httptest.NewRequest("POST", "/auth/register", bytes.NewBuffer(reqBody))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("Expected status %d, got %d", http.StatusCreated, w.Code)
	}

	// Parse response to get token
	var registerResp AuthResponse
	if err := json.Unmarshal(w.Body.Bytes(), &registerResp); err != nil {
		t.Fatalf("Failed to parse register response: %v", err)
	}

	if registerResp.Token == "" {
		t.Error("Expected token in register response")
	}

	// Test login
	loginReq := LoginRequest{
		Email:    "test@example.com",
		Password: "password123",
	}

	reqBody, _ = json.Marshal(loginReq)
	req = httptest.NewRequest("POST", "/auth/login", bytes.NewBuffer(reqBody))
	req.Header.Set("Content-Type", "application/json")

	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
	}

	// Test protected endpoint access
	req = httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+registerResp.Token)

	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should succeed with valid token
	if w.Code == http.StatusUnauthorized {
		t.Error("Expected access to protected endpoint with valid token")
	}
}