package auth

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	AuthorizationHeader = "Authorization"
	BearerPrefix        = "Bearer "
	UserIDKey          = "user_id"
	DeviceIDKey        = "device_id"
	EmailKey           = "email"
)

func (s *Service) AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get token from Authorization header
		authHeader := c.GetHeader(AuthorizationHeader)
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		// Check Bearer prefix
		if !strings.HasPrefix(authHeader, BearerPrefix) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
			c.Abort()
			return
		}

		// Extract token
		tokenString := strings.TrimPrefix(authHeader, BearerPrefix)
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Token required"})
			c.Abort()
			return
		}

		// Validate token
		claims, err := s.ValidateToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		// Set user information in context
		c.Set(UserIDKey, claims.UserID)
		c.Set(EmailKey, claims.Email)
		if claims.DeviceID != uuid.Nil {
			c.Set(DeviceIDKey, claims.DeviceID)
		}

		c.Next()
	}
}

// GetUserID extracts user ID from gin context
func GetUserID(c *gin.Context) (uuid.UUID, error) {
	userID, exists := c.Get(UserIDKey)
	if !exists {
		return uuid.Nil, fmt.Errorf("user ID not found in context")
	}

	id, ok := userID.(uuid.UUID)
	if !ok {
		return uuid.Nil, fmt.Errorf("invalid user ID type")
	}

	return id, nil
}

// GetDeviceID extracts device ID from gin context
func GetDeviceID(c *gin.Context) (uuid.UUID, error) {
	deviceID, exists := c.Get(DeviceIDKey)
	if !exists {
		return uuid.Nil, fmt.Errorf("device ID not found in context")
	}

	id, ok := deviceID.(uuid.UUID)
	if !ok {
		return uuid.Nil, fmt.Errorf("invalid device ID type")
	}

	return id, nil
}

// GetEmail extracts email from gin context
func GetEmail(c *gin.Context) (string, error) {
	email, exists := c.Get(EmailKey)
	if !exists {
		return "", fmt.Errorf("email not found in context")
	}

	emailStr, ok := email.(string)
	if !ok {
		return "", fmt.Errorf("invalid email type")
	}

	return emailStr, nil
}