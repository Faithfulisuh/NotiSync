package database

import (
	"testing"

	"github.com/notisync/backend/internal/config"
)

func TestNewConnection(t *testing.T) {
	// Test with invalid configuration to ensure error handling works
	cfg := &config.DatabaseConfig{
		Host:     "invalid-host",
		Port:     5432,
		User:     "test",
		Password: "test",
		DBName:   "test",
		SSLMode:  "disable",
	}

	_, err := NewConnection(cfg)
	if err == nil {
		t.Error("Expected error with invalid database configuration")
	}
}

func TestDB_Health(t *testing.T) {
	// This test would require a real database connection
	// For now, we'll skip it in the test suite
	t.Skip("Health check test requires database connection")
}