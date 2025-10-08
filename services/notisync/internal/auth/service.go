package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/repository"
	"github.com/notisync/backend/internal/types"
	"golang.org/x/crypto/bcrypt"
)

type Service struct {
	repos     *repository.InterfaceRepositories
	jwtSecret []byte
	jwtExpiry time.Duration
}

type Claims struct {
	UserID   uuid.UUID `json:"user_id"`
	Email    string    `json:"email"`
	DeviceID uuid.UUID `json:"device_id,omitempty"`
	jwt.RegisteredClaims
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type DeviceRegistrationRequest struct {
	DeviceName string           `json:"device_name" binding:"required"`
	DeviceType types.DeviceType `json:"device_type" binding:"required"`
	PushToken  *string          `json:"push_token,omitempty"`
}

type AuthResponse struct {
	Token        string       `json:"token"`
	RefreshToken string       `json:"refresh_token"`
	User         *types.User  `json:"user"`
	Device       *types.Device `json:"device,omitempty"`
	ExpiresAt    time.Time    `json:"expires_at"`
}

func NewService(repos *repository.InterfaceRepositories, cfg *config.JWTConfig) *Service {
	return &Service{
		repos:     repos,
		jwtSecret: []byte(cfg.Secret),
		jwtExpiry: time.Duration(cfg.ExpirationHours) * time.Hour,
	}
}

func (s *Service) Register(req *RegisterRequest) (*AuthResponse, error) {
	// Check if user already exists
	existingUser, err := s.repos.User.GetByEmail(req.Email)
	if err == nil && existingUser != nil {
		return nil, fmt.Errorf("user with email %s already exists", req.Email)
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// Create user
	user := &types.User{
		Email:        req.Email,
		PasswordHash: string(hashedPassword),
	}

	if err := s.repos.User.Create(user); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// Generate tokens
	token, refreshToken, expiresAt, err := s.generateTokens(user.ID, user.Email, uuid.Nil)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	// Remove password hash from response
	user.PasswordHash = ""

	return &AuthResponse{
		Token:        token,
		RefreshToken: refreshToken,
		User:         user,
		ExpiresAt:    expiresAt,
	}, nil
}

func (s *Service) Login(req *LoginRequest) (*AuthResponse, error) {
	// Get user by email
	user, err := s.repos.User.GetByEmail(req.Email)
	if err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	// Generate tokens
	token, refreshToken, expiresAt, err := s.generateTokens(user.ID, user.Email, uuid.Nil)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	// Remove password hash from response
	user.PasswordHash = ""

	return &AuthResponse{
		Token:        token,
		RefreshToken: refreshToken,
		User:         user,
		ExpiresAt:    expiresAt,
	}, nil
}

func (s *Service) RegisterDevice(userID uuid.UUID, req *DeviceRegistrationRequest) (*AuthResponse, error) {
	// Get user
	user, err := s.repos.User.GetByID(userID)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	// Create device
	device := &types.Device{
		UserID:     userID,
		DeviceName: req.DeviceName,
		DeviceType: req.DeviceType,
		PushToken:  req.PushToken,
	}

	if err := s.repos.Device.Create(device); err != nil {
		return nil, fmt.Errorf("failed to create device: %w", err)
	}

	// Generate tokens with device ID
	token, refreshToken, expiresAt, err := s.generateTokens(user.ID, user.Email, device.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	// Remove password hash from response
	user.PasswordHash = ""

	return &AuthResponse{
		Token:        token,
		RefreshToken: refreshToken,
		User:         user,
		Device:       device,
		ExpiresAt:    expiresAt,
	}, nil
}

func (s *Service) RefreshToken(tokenString string) (*AuthResponse, error) {
	// Parse and validate token
	claims, err := s.validateToken(tokenString)
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	// Get user
	user, err := s.repos.User.GetByID(claims.UserID)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	// Generate new tokens
	token, refreshToken, expiresAt, err := s.generateTokens(user.ID, user.Email, claims.DeviceID)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	// Remove password hash from response
	user.PasswordHash = ""

	var device *types.Device
	if claims.DeviceID != uuid.Nil {
		device, _ = s.repos.Device.GetByID(claims.DeviceID)
	}

	return &AuthResponse{
		Token:        token,
		RefreshToken: refreshToken,
		User:         user,
		Device:       device,
		ExpiresAt:    expiresAt,
	}, nil
}

func (s *Service) ValidateToken(tokenString string) (*Claims, error) {
	return s.validateToken(tokenString)
}

func (s *Service) generateTokens(userID uuid.UUID, email string, deviceID uuid.UUID) (string, string, time.Time, error) {
	expiresAt := time.Now().Add(s.jwtExpiry)

	// Create access token claims
	claims := &Claims{
		UserID:   userID,
		Email:    email,
		DeviceID: deviceID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "notisync",
			Subject:   userID.String(),
		},
	}

	// Generate access token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(s.jwtSecret)
	if err != nil {
		return "", "", time.Time{}, fmt.Errorf("failed to sign token: %w", err)
	}

	// Generate refresh token (longer expiry)
	refreshClaims := &Claims{
		UserID:   userID,
		Email:    email,
		DeviceID: deviceID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)), // 7 days
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "notisync",
			Subject:   userID.String(),
		},
	}

	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshTokenString, err := refreshToken.SignedString(s.jwtSecret)
	if err != nil {
		return "", "", time.Time{}, fmt.Errorf("failed to sign refresh token: %w", err)
	}

	return tokenString, refreshTokenString, expiresAt, nil
}

func (s *Service) validateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}