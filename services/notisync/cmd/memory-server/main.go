package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

// Simple structs for the mobile app
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type RegisterRequest struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

type AuthResponse struct {
	Token        string `json:"token"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expiresIn"`
}

type DeviceRegistration struct {
	Name        string `json:"name"`
	Platform    string `json:"platform"`
	DeviceToken string `json:"device_token"`
	Model       string `json:"model"`
	OSVersion   string `json:"os_version"`
}

type NotificationRequest struct {
	AppName     string      `json:"app_name"`
	Title       string      `json:"title"`
	Body        string      `json:"body"`
	Category    string      `json:"category"`
	Priority    int         `json:"priority"`
	Timestamp   string      `json:"timestamp"`
	PackageName string      `json:"package_name"`
	Extras      interface{} `json:"extras"`
}

type StoredNotification struct {
	ID        string      `json:"id"`
	UserID    string      `json:"user_id"`
	AppName   string      `json:"app_name"`
	Title     string      `json:"title"`
	Body      string      `json:"body"`
	Category  string      `json:"category"`
	Priority  int         `json:"priority"`
	CreatedAt time.Time   `json:"created_at"`
	Extras    interface{} `json:"extras"`
}

// In-memory storage with thread safety
var (
	users         = make(map[string]string)              // email -> password
	tokens        = make(map[string]string)              // token -> email
	devices       = make(map[string]DeviceRegistration)  // token -> device
	notifications = make(map[string]StoredNotification)  // id -> notification
	userNotifs    = make(map[string][]string)            // userID -> []notificationIDs
	mu            sync.RWMutex
)

func main() {
	r := mux.NewRouter()

	// Add CORS middleware
	r.Use(corsMiddleware)

	// Health check
	r.HandleFunc("/health", healthHandler).Methods("GET")

	// API routes
	api := r.PathPrefix("/api/v1").Subrouter()
	
	// Auth routes
	api.HandleFunc("/auth/register", registerHandler).Methods("POST")
	api.HandleFunc("/auth/login", loginHandler).Methods("POST")
	api.HandleFunc("/auth/devices", authMiddleware(registerDeviceHandler)).Methods("POST")
	
	// Notification routes
	api.HandleFunc("/notifications", authMiddleware(syncNotificationHandler)).Methods("POST")
	api.HandleFunc("/notifications/batch", authMiddleware(batchSyncHandler)).Methods("POST")
	api.HandleFunc("/notifications", authMiddleware(getNotificationsHandler)).Methods("GET")

	fmt.Println("In-Memory Server starting on :8080")
	fmt.Println("Using in-memory storage (MongoDB-like structure)")
	log.Fatal(http.ListenAndServe(":8080", r))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		next.ServeHTTP(w, r)
	})
}

func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		token := authHeader[7:] // Remove "Bearer "
		if _, exists := tokens[token]; !exists {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	notifCount := len(notifications)
	userCount := len(users)
	mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok", 
		"database": "in-memory",
		"notifications_stored": notifCount,
		"users_registered": userCount,
	})
}

func registerHandler(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	mu.Lock()
	if _, exists := users[req.Email]; exists {
		mu.Unlock()
		http.Error(w, "User already exists", http.StatusConflict)
		return
	}

	users[req.Email] = req.Password
	userID := uuid.New().String()
	userNotifs[userID] = []string{} // Initialize empty notification list
	mu.Unlock()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "User registered successfully",
		"user_id": userID,
	})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	mu.RLock()
	password, exists := users[req.Email]
	mu.RUnlock()

	if !exists || password != req.Password {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	token := uuid.New().String()
	
	mu.Lock()
	tokens[token] = req.Email
	mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		Token:        token,
		RefreshToken: uuid.New().String(),
		ExpiresIn:    86400, // 24 hours
	})
}

func registerDeviceHandler(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	token := authHeader[7:] // Remove "Bearer "

	var req DeviceRegistration
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	mu.Lock()
	devices[token] = req
	mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"device_id": uuid.New().String(),
		"message":   "Device registered successfully",
	})
}

func syncNotificationHandler(w http.ResponseWriter, r *http.Request) {
	var req NotificationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Create notification
	notifID := uuid.New().String()
	userID := uuid.New().String() // In production, get from token
	
	notification := StoredNotification{
		ID:        notifID,
		UserID:    userID,
		AppName:   req.AppName,
		Title:     req.Title,
		Body:      req.Body,
		Category:  req.Category,
		Priority:  req.Priority,
		CreatedAt: time.Now(),
		Extras:    req.Extras,
	}

	// Store notification
	mu.Lock()
	notifications[notifID] = notification
	if userNotifs[userID] == nil {
		userNotifs[userID] = []string{}
	}
	userNotifs[userID] = append(userNotifs[userID], notifID)
	mu.Unlock()

	fmt.Printf("Stored notification: %s - %s (ID: %s)\n", req.AppName, req.Title, notifID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"id":      notifID,
		"message": "Notification synced successfully to in-memory storage",
	})
}

func batchSyncHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Notifications []NotificationRequest `json:"notifications"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	synced := 0
	userID := uuid.New().String() // In production, get from token

	mu.Lock()
	if userNotifs[userID] == nil {
		userNotifs[userID] = []string{}
	}

	for _, notifReq := range req.Notifications {
		notifID := uuid.New().String()
		
		notification := StoredNotification{
			ID:        notifID,
			UserID:    userID,
			AppName:   notifReq.AppName,
			Title:     notifReq.Title,
			Body:      notifReq.Body,
			Category:  notifReq.Category,
			Priority:  notifReq.Priority,
			CreatedAt: time.Now(),
			Extras:    notifReq.Extras,
		}

		notifications[notifID] = notification
		userNotifs[userID] = append(userNotifs[userID], notifID)
		synced++
	}
	mu.Unlock()

	fmt.Printf("Batch sync: %d notifications stored in memory\n", synced)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"synced":  synced,
		"failed":  0,
	})
}

func getNotificationsHandler(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	notifCount := len(notifications)
	
	// Get recent notifications (last 10)
	recentNotifs := []StoredNotification{}
	count := 0
	for _, notif := range notifications {
		if count >= 10 {
			break
		}
		recentNotifs = append(recentNotifs, notif)
		count++
	}
	mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"notifications": recentNotifs,
		"total":         notifCount,
		"limit":         50,
		"offset":        0,
		"database":      "in-memory",
	})
}