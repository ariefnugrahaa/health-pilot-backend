# User Dashboard API

## Overview

The Dashboard API provides aggregated data for the logged-in user experience. It combines profile information, health journey progress, active handoffs with providers, recent activity timeline, notifications, and quick stats into a unified response.

## Endpoints

### 1. Get Complete Dashboard

**GET** `/api/v1/dashboard`

Returns the complete dashboard data with all sections. Use this for the main dashboard page.

#### Request Headers
```
Authorization: Bearer <access_token>
```

#### Response
```json
{
  "success": true,
  "data": {
    "profile": {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "isEmailVerified": true,
      "profileCompleteness": 85,
      "memberSince": "2025-01-15T10:00:00Z",
      "lastActive": "2026-01-29T09:00:00Z"
    },
    "healthJourney": {
      "totalIntakes": 2,
      "completedIntakes": 1,
      "latestIntake": {
        "id": "uuid",
        "status": "COMPLETED",
        "completedAt": "2026-01-25T14:30:00Z",
        "createdAt": "2026-01-25T14:00:00Z",
        "primaryGoals": ["HORMONE_THERAPY", "WEIGHT_MANAGEMENT"]
      },
      "totalRecommendations": 1,
      "activeRecommendations": 1,
      "latestRecommendation": {
        "id": "uuid",
        "status": "GENERATED",
        "primaryRecommendations": ["TRT Therapy", "GLP-1 Treatment"],
        "treatmentMatchCount": 5,
        "createdAt": "2026-01-25T15:00:00Z",
        "expiresAt": "2026-02-25T15:00:00Z"
      },
      "bloodTests": {
        "totalTests": 1,
        "completedTests": 1,
        "pendingTests": 0,
        "latestTest": {
          "id": "uuid",
          "status": "COMPLETED",
          "panelType": "comprehensive",
          "resultsReceivedAt": "2026-01-26T10:00:00Z",
          "createdAt": "2026-01-24T09:00:00Z"
        }
      }
    },
    "activeHandoffs": [
      {
        "id": "uuid",
        "status": "DATA_TRANSFERRED",
        "providerName": "Optimal Health Clinic",
        "providerLogo": "https://example.com/logo.png",
        "createdAt": "2026-01-27T11:00:00Z",
        "lastUpdatedAt": "2026-01-28T09:00:00Z",
        "nextStep": "Waiting for provider to review your information."
      }
    ],
    "recentActivity": [
      {
        "id": "handoff-initiated-uuid",
        "type": "handoff_initiated",
        "title": "Provider Connection Initiated",
        "description": "You started connecting with Optimal Health Clinic.",
        "timestamp": "2026-01-27T11:00:00Z",
        "metadata": {
          "providerId": "uuid"
        }
      },
      {
        "id": "rec-generated-uuid",
        "type": "recommendation_generated",
        "title": "Recommendations Generated",
        "description": "5 treatment options were matched to your profile.",
        "timestamp": "2026-01-25T15:00:00Z"
      }
    ],
    "notifications": {
      "unreadCount": 2,
      "recentNotifications": [
        {
          "id": "uuid",
          "type": "blood_test_ready",
          "title": "Blood Test Results Ready",
          "isRead": false,
          "createdAt": "2026-01-26T10:30:00Z"
        }
      ]
    },
    "quickStats": {
      "daysAsUser": 14,
      "treatmentsExplored": 5,
      "providersContacted": 1,
      "bloodTestsCompleted": 1
    }
  },
  "meta": {
    "timestamp": "2026-01-29T09:45:00Z"
  }
}
```

### 2. Get Profile Summary

**GET** `/api/v1/dashboard/profile`

Returns only the user profile summary. Lightweight endpoint for header/nav components.

#### Response
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "isEmailVerified": true,
    "profileCompleteness": 85,
    "memberSince": "2025-01-15T10:00:00Z",
    "lastActive": "2026-01-29T09:00:00Z"
  },
  "meta": {
    "timestamp": "2026-01-29T09:45:00Z"
  }
}
```

### 3. Get Health Journey

**GET** `/api/v1/dashboard/health-journey`

Returns the health journey summary (intakes, recommendations, blood tests).

#### Response
```json
{
  "success": true,
  "data": {
    "totalIntakes": 2,
    "completedIntakes": 1,
    "latestIntake": { ... },
    "totalRecommendations": 1,
    "activeRecommendations": 1,
    "latestRecommendation": { ... },
    "bloodTests": { ... }
  },
  "meta": {
    "timestamp": "2026-01-29T09:45:00Z"
  }
}
```

### 4. Get Active Handoffs

**GET** `/api/v1/dashboard/handoffs`

Returns list of in-progress provider connections.

#### Response
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "status": "DATA_TRANSFERRED",
      "providerName": "Optimal Health Clinic",
      "providerLogo": "https://example.com/logo.png",
      "createdAt": "2026-01-27T11:00:00Z",
      "lastUpdatedAt": "2026-01-28T09:00:00Z",
      "nextStep": "Waiting for provider to review your information."
    }
  ],
  "meta": {
    "timestamp": "2026-01-29T09:45:00Z"
  }
}
```

### 5. Get Recent Activity

**GET** `/api/v1/dashboard/activity`

Returns the recent activity timeline.

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | number | 10 | Number of activities to return (max: 50) |

#### Response
```json
{
  "success": true,
  "data": [
    {
      "id": "handoff-initiated-uuid",
      "type": "handoff_initiated",
      "title": "Provider Connection Initiated",
      "description": "You started connecting with Optimal Health Clinic.",
      "timestamp": "2026-01-27T11:00:00Z",
      "metadata": { "providerId": "uuid" }
    }
  ],
  "meta": {
    "timestamp": "2026-01-29T09:45:00Z"
  }
}
```

### 6. Get Quick Stats

**GET** `/api/v1/dashboard/stats`

Returns quick stats for dashboard widgets.

#### Response
```json
{
  "success": true,
  "data": {
    "daysAsUser": 14,
    "treatmentsExplored": 5,
    "providersContacted": 1,
    "bloodTestsCompleted": 1
  },
  "meta": {
    "timestamp": "2026-01-29T09:45:00Z"
  }
}
```

## Data Types

### Profile Completeness

The `profileCompleteness` field is a 0-100 percentage based on:
- Email (15%)
- First Name (15%)
- Last Name (15%)
- Date of Birth (15%)
- Gender (10%)
- Phone Number (15%)
- Email Verified (15%)

### Activity Types

| Type | Description |
|------|-------------|
| `intake_started` | User started a health intake |
| `intake_completed` | User completed a health intake |
| `recommendation_generated` | Treatment recommendations were generated |
| `recommendation_viewed` | User viewed recommendations |
| `blood_test_ordered` | User ordered a blood test |
| `blood_test_completed` | Blood test results are ready |
| `handoff_initiated` | User started connecting with a provider |
| `handoff_completed` | Provider connection completed |
| `account_updated` | User updated account info |

### Handoff Status Flow

```
INITIATED → DATA_TRANSFERRED → PROVIDER_RECEIVED → CONSULTATION_SCHEDULED → TREATMENT_STARTED → COMPLETED
```

Status values for active handoffs:
- `INITIATED` - Initial handoff created
- `DATA_TRANSFERRED` - User data sent to provider
- `PROVIDER_RECEIVED` - Provider acknowledged receipt
- `CONSULTATION_SCHEDULED` - Consultation is scheduled
- `TREATMENT_STARTED` - Treatment has begun

### Next Step Suggestions

The `nextStep` field provides user-friendly guidance based on handoff status:
- `INITIATED`: "Waiting for provider to review your information."
- `DATA_TRANSFERRED`: "Provider is processing your request."
- `PROVIDER_RECEIVED`: "Waiting for provider response."
- `CONSULTATION_SCHEDULED`: (Custom message)
- `TREATMENT_STARTED`: (Custom message)

## Error Responses

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 401 | UNAUTHORIZED | Missing or invalid authentication |
| 404 | NOT_FOUND | User not found |

## Usage Guidelines

1. **Full Dashboard**: Use `/dashboard` for the main dashboard page
2. **Profile Header**: Use `/dashboard/profile` for nav components
3. **Progress Tracking**: Use `/dashboard/health-journey` for progress indicators
4. **Notifications**: Check `notifications.unreadCount` for badge counts
5. **Activity Feed**: Use `/dashboard/activity` with pagination for infinite scroll
6. **Caching**: Consider caching dashboard data client-side for 30 seconds
