# Implementation Plan

- [x] 1. Set up project structure and core interfaces

  - Create directory structure for backend services (notification, auth, websocket, classification)
  - Define Go module structure with shared types and interfaces
  - Set up database migration system and initial schema
  - Create Docker compose for local development environment

  - _Requirements: 6.1, 6.2_

- [x] 2. Implement database layer and core data models

  - Create PostgreSQL schema with all required tables (users, devices, notifications, user_rules, notification_actions)

  - Implement database connection pooling and configuration
  - Create data access layer with CRUD operations for all entities
  - Write unit tests for database operations
  - _Requirements: 5.1, 6.1, 7.4_

- [x] 3. Build authentication service

  - Implement user registration and login endpoints with JWT token generation
  - Create device registration and management functionality
  - Add password hashing and validation
  - Implement JWT middleware for request authentication

  - Write unit tests for authentication flows
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 4. Create notification data models and validation

  - Implement notification struct with validation rules
  - Create notification status tracking (read, dismissed, expired)
  - Add notification categorization enums (Work, Personal, Junk)
  - Implement notification expiration logic (7-day cleanup)
  - Write unit tests for notification model validation
  - _Requirements: 1.1, 2.1, 5.1, 5.4_

- [x] 5. Implement basic notification processing service

  - Create notification ingestion endpoint for mobile clients
  - Implement notification storage with automatic categorization
  - Add notification retrieval by user and device
  - Create notification action tracking (read, dismiss, click)
  - Write unit tests for notification processing logic

  - _Requirements: 1.1, 1.2, 1.3, 2.1, 5.1_

- [x] 6. Build Redis integration for real-time sync

  - Set up Redis connection and pub/sub configuration
  - Implement notification status caching in Redis
  - Create user device connection tracking in Redis
  - Add message queuing for offline devices
  - Write unit tests for Redis operations
  - _Requirements: 1.4, 7.1, 7.2, 7.3_

- [x] 7. Implement WebSocket service for real-time communication

  - Create WebSocket server with connection management
  - Implement user authentication for WebSocket connections
  - Add real-time notification broadcasting to connected devices
  - Create message queuing for offline device synchronization
  - Write unit tests for WebSocket connection handling
  - _Requirements: 1.1, 7.1, 7.2, 7.3, 7.5_

- [x] 8. Create user rules engine

  - Implement rule definition data structures (app filters, keyword filters, time-based)
  - Create rule evaluation engine for incoming notifications
  - Add rule priority and conflict resolution logic
  - Implement "always show OTP" and "mute promotional" rule types
  - Write unit tests for rule evaluation logic
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 9. Build classification service in Python

  - Create Python service with keyword-based categorization
  - Implement Work/Personal/Junk classification logic
  - Add learning mechanism for user feedback on categorization
  - Create REST API endpoints for classification requests
  - Write unit tests for classification algorithms
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 10. Implement notification history and search

  - Create notification history retrieval with pagination
  - Add search functionality by date, app, category, and content keywords
  - Implement automatic cleanup of notifications older than 7 days
  - Create history display with read/unread status indicators
  - Write unit tests for history and search operations

  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 11. Build daily digest generation



  - Create daily digest generation with notification counts by category
  - Implement top 5 important notifications selection based on user rules
  - Add digest statistics (total received, dismissed, acted upon)
  - Create "quiet day" message for days with minimal notifications
  - Write unit tests for digest generation logic
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_


- [x] 12. Create API Gateway and routing

  - Set up Go HTTP server with routing for all endpoints
  - Implement request/response middleware (logging, CORS, rate limiting)
  - Add API versioning and documentation
  - Create health check endpoints for all services
  - Write integration tests for API endpoints
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 13. Implement mobile app notification capture




  - Set up React Native project with notification permissions
  - Implement native notification listener for Android and iOS
  - Create notification data extraction and formatting
  - Add notification capture service with API integration
  - Write unit tests for notification capture functionality
  - _Requirements: 1.1, 6.1_

- [x] 14. Build mobile app notification display




  - Create notification list component with categorization
  - Implement notification action handlers (read, dismiss, click)
  - Add real-time WebSocket integration for sync updates
  - Create notification detail view with full content
  - Write unit tests for notification display components
  - _Requirements: 1.2, 1.3, 2.6, 7.1_

- [x] 15. Create mobile app user interface




  - Implement user authentication screens (login, register)
  - Create device management interface
  - Build notification rules configuration screens
  - Add notification history and search interface
  - Write unit tests for UI components



  - _Requirements: 3.1, 3.2, 3.3, 5.4, 6.2, 6.3_

- [x] 16. Implement web application notification display

  - Set up React/Next.js project with responsive design
  - Create notification dashboard with real-time updates
  - Implement notification interaction (read, dismiss, click)
  - Add WebSocket integration for cross-device sync
  - Write unit tests for web notification components
  - _Requirements: 1.2, 1.3, 2.6, 7.1_

- [x] 16.1. Implement SQLite local storage for mobile app





  - Replace AsyncStorage with SQLite database for persistent storage
  - Create notification, user, and sync queue tables
  - Implement CRUD operations for offline notification management
  - Add database migration system for schema updates
  - Write unit tests for database operations
  - _Requirements: 1.4, 5.1, 7.2, 7.3_

- [ ] 16.2. **PRIORITY: Implement Android cross-app notification capture**

  **Phase 1: Setup Native Android Module**
  - [ ] 16.2.1. Eject from Expo to bare React Native workflow
    - Run `npx expo eject` to get access to native Android code
    - Update build configuration for native modules
    - Test that existing functionality still works after ejection
  
  - [ ] 16.2.2. Create Android NotificationListenerService
    - Create `NotificationListenerService.java` in `android/app/src/main/java/`
    - Implement `onNotificationPosted()` and `onNotificationRemoved()` methods
    - Add notification data extraction (title, text, package name, timestamp)
    - Create notification filtering logic (exclude system notifications)
  
  - [ ] 16.2.3. Create React Native bridge module
    - Create `NotificationCaptureModule.java` to bridge Android service to React Native
    - Implement methods: `startListening()`, `stopListening()`, `requestPermission()`
    - Add event emitters to send captured notifications to React Native
    - Create TypeScript definitions for the native module
  
  **Phase 2: Permissions and Setup Flow**
  - [ ] 16.2.4. Implement notification access permission flow
    - Add `BIND_NOTIFICATION_LISTENER_SERVICE` permission to AndroidManifest.xml
    - Create permission check methods in native module
    - Implement deep link to Android notification access settings
    - Add permission status detection and user guidance
  
  - [ ] 16.2.5. Create setup wizard for notification access
    - Update NotificationSetup component with Android-specific steps
    - Add visual guide for enabling notification access in Android settings
    - Implement permission status checking and retry logic
    - Create fallback UI for devices that don't support notification access
  
  **Phase 3: Background Service Implementation**
  - [ ] 16.2.6. Create foreground service for 24/7 capture
    - Implement Android foreground service to keep notification listener active
    - Add persistent notification showing capture status
    - Create service lifecycle management (start/stop/restart)
    - Implement battery optimization whitelist guidance
  
  - [ ] 16.2.7. Add notification filtering and processing
    - Filter out system notifications (android, systemui packages)
    - Implement duplicate notification detection and removal
    - Add app-based filtering (allow/block specific apps)
    - Create notification priority detection and mapping
  
  **Phase 4: Integration with Existing System**
  - [ ] 16.2.8. Update notification capture service
    - Replace Expo notification listeners with native Android bridge
    - Integrate native captured notifications with existing storage system
    - Update notification data model to handle Android-specific fields
    - Maintain backward compatibility with existing notification handling
  
  - [ ] 16.2.9. Add Android-specific notification features
    - Extract notification actions (reply, dismiss, etc.)
    - Capture notification icons and images
    - Handle notification groups and bundled notifications
    - Add support for Android notification channels
  
  **Phase 5: Testing and Optimization**
  - [ ] 16.2.10. Implement comprehensive testing
    - Create test notifications from various apps (WhatsApp, Gmail, etc.)
    - Test notification capture during app backgrounding
    - Verify battery usage optimization
    - Test service restart after device reboot
  
  - [ ] 16.2.11. Add performance monitoring
    - Monitor memory usage of notification service
    - Track notification processing latency
    - Add error handling for service crashes
    - Implement automatic service recovery mechanisms
  
  **Phase 6: User Experience**
  - [ ] 16.2.12. Create notification access onboarding
    - Add step-by-step tutorial for enabling notification access
    - Create troubleshooting guide for common permission issues
    - Add visual indicators showing capture status
    - Implement notification access verification
  
  - [ ] 16.2.13. Add capture status monitoring
    - Show real-time notification capture count
    - Display last captured notification info
    - Add capture health indicators (service running, permissions granted)
    - Create notification capture logs for debugging
  
  _Requirements: 1.1, 1.4, Android-specific system integration_

- [x] 16.3. Implement background processing and rules engine




  - Create background task scheduler for notification processing
  - Implement offline rules evaluation and categorization
  - Add background notification prioritization logic
  - Create background cleanup for expired notifications
  - Write unit tests for background processing
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4_

- [x] 16.4. Implement background sync mechanism




  - Create background sync service with exponential backoff
  - Implement conflict resolution for offline actions
  - Add batch sync optimization for large notification sets
  - Create sync status tracking and error handling
  - Write unit tests for sync mechanisms
  - _Requirements: 1.4, 7.1, 7.2, 7.3, 7.4_

- [x] 16.5. Implement smart digest generation




  - Create morning digest generation with overnight notifications
  - Implement priority-based notification selection for digest
  - Add digest statistics and categorization summaries
  - Create digest display with actionable insights
  - Write unit tests for digest generation logic
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 16.6. Fix mobile app authentication flow


  - Update API service to use network-accessible backend URL
  - Implement proper token storage and management
  - Add authentication error handling and retry logic
  - Create device registration flow with backend integration
  - Write unit tests for authentication flows
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 16.7. **URGENT: Fix mobile app critical issues**

  - **Fix AsyncStorage display issue** - Replace "AsyncStorage" text with actual storage info on home screen quick stats
  - **Fix dashboard blinking issue** - Resolve UI flickering/blinking on dashboard screen
  - **Add notification capture logging** - Add visible logging/indicators to show when notifications are being captured
  - **Fix network connectivity** - Ensure mobile app can connect to backend server despite different IP addresses
  - **Add notification capture status indicator** - Show real-time status of notification capture service
  - _Requirements: 1.1, 1.4, 7.1_

- [ ] 16.8. **IMMEDIATE: Prepare for Android native development**

  - [ ] 16.8.1. **Backup current Expo project**
    - Create full backup of current working Expo project
    - Document current functionality and test results
    - Export APK build for reference
    - Save current configuration and dependencies
  
  - [ ] 16.8.2. **Research ejection impact**
    - Analyze which Expo features will be lost after ejection
    - Identify alternative solutions for Expo-specific functionality
    - Plan migration strategy for existing features
    - Document potential breaking changes
  
  - [ ] 16.8.3. **Setup development environment for native Android**
    - Install Android Studio and SDK tools
    - Setup Android emulator for testing
    - Configure React Native CLI and build tools
    - Test native module development workflow
  
  - [ ] 16.8.4. **Create proof of concept for NotificationListenerService**
    - Create minimal Android project with NotificationListenerService
    - Test notification access permissions on real device
    - Verify notification data extraction capabilities
    - Document Android version compatibility requirements
  
  _Requirements: 1.1, 1.4, Development environment setup_

- [ ] 16.8. Implement Expo push notifications

  - Set up Expo push notification configuration
  - Implement push notification token registration
  - Create push notification handling for background alerts
  - Add notification permission request flow
  - Write unit tests for push notification functionality
  - _Requirements: 1.1, 1.4, 7.1_

- [ ] 17. Build web application management interface

  - Create comprehensive notification history with advanced search
  - Implement user rules management with visual rule builder
  - Add daily digest display with interactive statistics
  - Create device management and security settings
  - Write unit tests for management interface components
  - _Requirements: 3.1, 3.2, 4.3, 5.2, 6.3_

- [ ] 18. Implement cross-device synchronization logic

  - Create notification action sync between mobile and web clients
  - Implement conflict resolution for simultaneous actions
  - Add offline queue management with automatic retry
  - Create sync status indicators in both mobile and web apps
  - Write integration tests for cross-device sync scenarios
  - _Requirements: 1.2, 1.3, 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 19. Add error handling and retry mechanisms

  - Implement exponential backoff retry logic for API calls
  - Add circuit breaker pattern for external service calls
  - Create graceful degradation for offline scenarios
  - Implement user-friendly error messages and recovery options
  - Write unit tests for error handling scenarios
  - _Requirements: 1.4, 7.2, 7.3_

- [ ] 20. Create comprehensive test suite

  - Write integration tests for complete notification flow (mobile → backend → web)
  - Add end-to-end tests for user authentication and device management
  - Create performance tests for WebSocket connections and notification throughput
  - Implement database integration tests with test containers
  - Add load testing scenarios for concurrent users
  - _Requirements: All requirements validation_

- [ ] 21. Implement security measures

  - Add input validation and sanitization for all API endpoints
  - Implement rate limiting for authentication and notification endpoints
  - Create audit logging for security-sensitive operations
  - Add HTTPS/TLS configuration for all services
  - Write security tests for authentication and authorization
  - _Requirements: 6.1, 6.4_

- [ ] 22. Set up monitoring and logging

  - Implement structured logging across all services
  - Add health check endpoints and monitoring dashboards
  - Create performance metrics collection (response times, error rates)
  - Set up alerting for critical system failures
  - Write tests for monitoring and alerting functionality
  - _Requirements: System reliability and maintenance_

- [ ] 23. Create deployment configuration

  - Set up Docker containers for all services
  - Create Kubernetes deployment manifests
  - Implement database migration scripts for production
  - Add environment-specific configuration management
  - Write deployment validation tests
  - _Requirements: Production readiness_

- [ ] 24. Integrate all components and perform system testing
  - Connect mobile app to backend services with full functionality
  - Integrate web app with complete feature set
  - Test complete user workflows from registration to daily digest
  - Validate all requirements with end-to-end scenarios
  - Perform final integration testing and bug fixes
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1-2.6, 3.1-3.6, 4.1-4.5, 5.1-5.5, 6.1-6.5, 7.1-7.5_
