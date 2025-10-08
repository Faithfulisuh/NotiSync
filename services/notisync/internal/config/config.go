package config

import (
	"os"
	"strconv"
)

type Config struct {
	Database DatabaseConfig
	Redis    RedisConfig
	JWT      JWTConfig
	Server   ServerConfig
}

type DatabaseConfig struct {
	Host     string // For MongoDB Atlas, this will be the full connection string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string // Not used for MongoDB but kept for compatibility
	URI      string // Alternative: full MongoDB URI
}

type RedisConfig struct {
	Host     string
	Port     int
	Password string
	DB       int
}

type JWTConfig struct {
	Secret         string
	ExpirationHours int
}

type ServerConfig struct {
	Environment string
	LogLevel    string
}

func Load() (*Config, error) {
	dbPort, _ := strconv.Atoi(getEnv("DB_PORT", "27017")) // MongoDB default port
	redisPort, _ := strconv.Atoi(getEnv("REDIS_PORT", "6379"))
	redisDB, _ := strconv.Atoi(getEnv("REDIS_DB", "0"))
	jwtExpiration, _ := strconv.Atoi(getEnv("JWT_EXPIRATION_HOURS", "24"))

	return &Config{
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     dbPort,
			User:     getEnv("DB_USER", ""),
			Password: getEnv("DB_PASSWORD", ""),
			DBName:   getEnv("DB_NAME", "notisync"),
			SSLMode:  getEnv("DB_SSL_MODE", "disable"),
			URI:      getEnv("MONGODB_URI", ""), // Full MongoDB Atlas URI
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     redisPort,
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       redisDB,
		},
		JWT: JWTConfig{
			Secret:         getEnv("JWT_SECRET", "your-secret-key"),
			ExpirationHours: jwtExpiration,
		},
		Server: ServerConfig{
			Environment: getEnv("ENVIRONMENT", "development"),
			LogLevel:    getEnv("LOG_LEVEL", "info"),
		},
	}, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}