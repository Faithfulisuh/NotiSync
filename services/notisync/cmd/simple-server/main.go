package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

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

// Simple in-memory storage
var users = make(map[string]string) // email -> password
var tokens = make(map[string]string) // token -> email
var devices = make(map[string]DeviceRegistration) // token -> device

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

	fmt.Println("Server starting on :8080")
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
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func registerHandler(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if _, exists := users[req.Email]; exists {
		http.Error(w, "User already exists", http.StatusConflict)
		return
	}

	users[req.Email] = req.Password
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "User registered successfully",
		"user_id": uuid.New().String(),
	})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	password, exists := users[req.Email]
	if !exists || password != req.Password {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	token := uuid.New().String()
	tokens[token] = req.Email

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

	devices[token] = req

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

	// Simulate processing
	fmt.Printf("Received notification: %s - %s\n", req.AppName, req.Title)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"id":      uuid.New().String(),
		"message": "Notification synced successfully",
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

	fmt.Printf("Received %d notifications for batch sync\n", len(req.Notifications))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"synced":  len(req.Notifications),
		"failed":  0,
	})
}

func getNotificationsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"notifications": []interface{}{},
		"total":         0,
		"limit":         50,
		"offset":        0,
	})
}