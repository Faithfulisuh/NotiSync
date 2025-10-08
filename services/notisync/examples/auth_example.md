# Authentication API Examples

## User Registration

```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  },
  "expires_at": "2024-01-16T10:30:00Z"
}
```

## User Login

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

## Device Registration

```bash
curl -X POST http://localhost:8080/api/v1/devices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "device_name": "iPhone 15",
    "device_type": "mobile",
    "push_token": "fcm_token_here"
  }'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  },
  "device": {
    "id": "987fcdeb-51a2-43d7-8f9e-123456789abc",
    "user_id": "123e4567-e89b-12d3-a456-426614174000",
    "device_name": "iPhone 15",
    "device_type": "mobile",
    "push_token": "fcm_token_here",
    "last_seen": "2024-01-15T10:30:00Z",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "expires_at": "2024-01-16T10:30:00Z"
}
```

## Get User Devices

```bash
curl -X GET http://localhost:8080/api/v1/devices \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Remove Device

```bash
curl -X DELETE http://localhost:8080/api/v1/devices/987fcdeb-51a2-43d7-8f9e-123456789abc \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Refresh Token

```bash
curl -X POST http://localhost:8080/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "YOUR_REFRESH_TOKEN_HERE"
  }'
```

## Error Responses

### Invalid Credentials (401)
```json
{
  "error": "invalid credentials"
}
```

### User Already Exists (400)
```json
{
  "error": "user with email user@example.com already exists"
}
```

### Invalid Token (401)
```json
{
  "error": "Invalid token"
}
```

### Validation Error (400)
```json
{
  "error": "Key: 'RegisterRequest.Email' Error:Field validation for 'Email' failed on the 'email' tag"
}
```

## Security Features

- **Password Hashing**: Uses bcrypt with default cost (10)
- **JWT Tokens**: HS256 signing with configurable expiration
- **Refresh Tokens**: Longer-lived tokens (7 days) for token renewal
- **Device-Specific Tokens**: Tokens include device ID for device-specific access
- **Secure Headers**: Authorization header with Bearer token format
- **Input Validation**: Email format and password length validation
- **User Isolation**: Users can only access their own devices and data