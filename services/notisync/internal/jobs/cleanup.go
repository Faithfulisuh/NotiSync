package jobs

import (
	"context"
	"log"
	"time"

	"github.com/notisync/backend/internal/repository"
)

type CleanupJob struct {
	repos *repository.InterfaceRepositories
}

func NewCleanupJob(repos *repository.InterfaceRepositories) *CleanupJob {
	return &CleanupJob{repos: repos}
}

// Start begins the cleanup job that runs periodically
func (j *CleanupJob) Start(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour) // Run every hour
	defer ticker.Stop()

	log.Println("Starting cleanup job")

	for {
		select {
		case <-ctx.Done():
			log.Println("Cleanup job stopped")
			return
		case <-ticker.C:
			j.cleanupExpiredNotifications()
		}
	}
}

func (j *CleanupJob) cleanupExpiredNotifications() {
	log.Println("Running cleanup of expired notifications")

	deletedCount, err := j.repos.Notification.CleanupExpired()
	if err != nil {
		log.Printf("Error cleaning up expired notifications: %v", err)
		return
	}

	if deletedCount > 0 {
		log.Printf("Cleaned up %d expired notifications", deletedCount)
	}
}