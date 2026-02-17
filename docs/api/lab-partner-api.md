# Lab Partner Integration API

## Overview

The Lab Partner Integration API enables ordering blood test kits from partner laboratories, tracking order status, and receiving results via webhooks. This is critical for the blood test flow in HealthPilot.

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Client    │────▶│  HealthPilot    │────▶│   Lab Partner   │
│   (User)    │     │   Backend       │     │   (Forth, etc)  │
└─────────────┘     └─────────────────┘     └─────────────────┘
                           │                        │
                           │   Webhook Callback     │
                           │◀───────────────────────│
```

### Adapter Pattern

The service uses an adapter pattern to support multiple lab partners:

- `MockLabPartnerAdapter` - Development/testing
- `ForthLabAdapter` - Forth.life integration
- Additional adapters can be registered for other partners

## Endpoints

### 1. List Available Lab Partners

**GET** `/api/v1/lab-partners`

Returns all available lab partners with pricing and coverage info.

#### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| region | string | Filter by supported region (e.g., "US", "UK") |

#### Response
```json
{
  "success": true,
  "data": [
    {
      "partnerId": "uuid",
      "partnerName": "Forth",
      "isAvailable": true,
      "estimatedTurnaround": 3,
      "pricing": {
        "targeted": 59,
        "goal-based": 119,
        "comprehensive": 249
      },
      "coverage": ["UK", "EU"]
    }
  ],
  "meta": {
    "timestamp": "2026-01-29T10:00:00Z"
  }
}
```

### 2. Get Lab Partner Details

**GET** `/api/v1/lab-partners/:id`

Returns details for a specific lab partner.

#### Response
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Forth",
    "code": "FORTH",
    "apiEndpoint": "https://api.forth.life",
    "supportedRegions": ["UK", "EU"],
    "isActive": true
  },
  "meta": {
    "timestamp": "2026-01-29T10:00:00Z"
  }
}
```

### 3. Order Test Kit

**POST** `/api/v1/lab-partners/:id/order`

Order a blood test kit from a specific lab partner.

#### Request Headers
```
Authorization: Bearer <access_token>
```

#### Request Body
```json
{
  "bloodTestId": "uuid",
  "shippingAddress": {
    "fullName": "John Doe",
    "addressLine1": "123 Main Street",
    "addressLine2": "Apt 4B",
    "city": "London",
    "state": "Greater London",
    "postalCode": "SW1A 1AA",
    "country": "UK",
    "phone": "+44 20 1234 5678"
  },
  "collectionPreference": "home"
}
```

#### Collection Preferences
| Value | Description |
|-------|-------------|
| `home` | At-home finger-prick kit |
| `clinic` | Visit a partner clinic |
| `mobile` | Mobile phlebotomist visit |

#### Response
```json
{
  "success": true,
  "data": {
    "success": true,
    "orderId": "FORTH-1706522400000",
    "labPartnerOrderId": "FORTH-1706522400000",
    "trackingNumber": "FORTH-TRK-1706522400000",
    "estimatedDelivery": "2026-01-31T10:00:00Z",
    "kitBarcode": "FORTH-KIT-1706522400000",
    "instructions": [
      "Fast for 10-12 hours before collection",
      "Use the finger-prick collection device",
      "Fill the collection tube to the indicated line",
      "Post using the pre-paid envelope"
    ]
  },
  "meta": {
    "timestamp": "2026-01-29T10:00:00Z"
  }
}
```

### 4. Check Order Status

**GET** `/api/v1/lab-partners/orders/:bloodTestId/status`

Check the status of a lab order.

#### Response
```json
{
  "success": true,
  "data": {
    "status": "PROCESSING",
    "trackingUrl": "https://forth.life/track/FORTH-123",
    "estimatedCompletion": "2026-02-01T10:00:00Z"
  },
  "meta": {
    "timestamp": "2026-01-29T10:00:00Z"
  }
}
```

### 5. Cancel Order

**POST** `/api/v1/lab-partners/orders/:bloodTestId/cancel`

Cancel a pending lab order (only if not yet collected).

#### Response
```json
{
  "success": true,
  "data": {
    "cancelled": true
  },
  "meta": {
    "timestamp": "2026-01-29T10:00:00Z"
  }
}
```

## Webhook Integration

Lab partners send status updates and results via webhooks.

### Webhook Endpoint

**POST** `/api/v1/lab-partners/webhooks/:partnerCode`

#### Headers
```
X-Lab-Signature: <hmac-signature>
Content-Type: application/json
```

### Webhook Payload Structure

```json
{
  "order_id": "FORTH-123",
  "internal_reference": "blood-test-uuid",
  "status": "results_ready",
  "collected_at": "2026-01-30T09:00:00Z",
  "completed_at": "2026-02-01T14:30:00Z",
  "biomarkers": [
    {
      "code": "TESTOSTERONE_TOTAL",
      "name": "Total Testosterone",
      "value": 450,
      "unit": "ng/dL",
      "ref_low": 300,
      "ref_high": 1000,
      "status": "normal"
    },
    {
      "code": "TSH",
      "name": "Thyroid Stimulating Hormone",
      "value": 5.2,
      "unit": "mIU/L",
      "ref_low": 0.4,
      "ref_high": 4.0,
      "status": "high"
    }
  ],
  "pdf_url": "https://forth.life/reports/abc123.pdf"
}
```

### Webhook Status Values

| Status | Description |
|--------|-------------|
| `sample_received` | Lab received the sample |
| `in_analysis` | Sample is being processed |
| `results_ready` | Results are available |
| `failed` | Test failed (retest needed) |
| `cancelled` | Order was cancelled |

### Webhook Response

```json
{
  "success": true,
  "received": true
}
```

## Blood Test Status Flow

```
PENDING → ORDERED → SAMPLE_COLLECTED → PROCESSING → COMPLETED
                                                  ↘ FAILED
                         ↘ CANCELLED
```

| Status | Description |
|--------|-------------|
| `PENDING` | Test created, not yet ordered |
| `ORDERED` | Kit ordered from lab partner |
| `SAMPLE_COLLECTED` | Lab received the sample |
| `PROCESSING` | Lab is analyzing the sample |
| `COMPLETED` | Results are ready |
| `FAILED` | Test failed, needs retest |
| `CANCELLED` | Order was cancelled |

## Data Flow

### 1. Kit Ordering Flow

```
1. User creates blood test (POST /blood-tests)
2. User selects lab partner
3. User provides shipping address
4. System calls lab partner API (POST /lab-partners/:id/order)
5. Lab partner returns order confirmation
6. Kit is shipped to user
```

### 2. Results Flow

```
1. User collects sample and posts to lab
2. Lab receives sample (webhook: sample_received)
3. Lab processes sample (webhook: in_analysis)
4. Lab completes analysis (webhook: results_ready)
5. System stores results encrypted
6. User notified results are ready
7. User views results and AI interpretation
```

## Error Handling

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 400 | VALIDATION_ERROR | Invalid request data |
| 401 | UNAUTHORIZED | Missing authentication |
| 404 | NOT_FOUND | Blood test or lab partner not found |
| 409 | CONFLICT | Cannot cancel (already collected) |

## Security Considerations

### Webhook Verification

All webhooks are verified using HMAC signatures:

```typescript
const isValid = crypto.timingSafeEqual(
  Buffer.from(signature),
  Buffer.from(expectedSignature)
);
```

### PHI Protection

- All results are encrypted before storage
- Shipping addresses are logged but not stored long-term
- Webhook payloads are validated before processing

### Environment Variables

```env
FORTH_API_ENDPOINT=https://api.forth.life
FORTH_API_KEY=your-api-key
FORTH_WEBHOOK_SECRET=your-webhook-secret
```

## Adding New Lab Partners

To add a new lab partner:

1. Create an adapter implementing `ILabPartnerAdapter`
2. Register in `LabPartnerService` constructor
3. Add configuration to environment variables
4. Create LabPartner record in database

```typescript
class NewLabAdapter implements ILabPartnerAdapter {
  readonly partnerCode = 'NEW_LAB';
  
  async orderKit(request: LabKitOrderRequest): Promise<LabOrderResponse> {
    // Implementation
  }
  
  // ... other methods
}

// Register
labPartnerService.registerAdapter(new NewLabAdapter());
```

## Testing

### Mock Lab Partner

For development, use the `MOCK_LAB` partner code:

```bash
# Create blood test
POST /api/v1/blood-tests
{
  "panelType": "comprehensive"
}

# Order from mock lab
POST /api/v1/lab-partners/MOCK_LAB/order
{
  "bloodTestId": "uuid",
  "shippingAddress": { ... }
}
```

### Simulating Webhook

```bash
curl -X POST http://localhost:3000/api/v1/lab-partners/webhooks/MOCK_LAB \
  -H "Content-Type: application/json" \
  -H "X-Lab-Signature: test" \
  -d '{
    "order_id": "MOCK-123",
    "internal_reference": "blood-test-uuid",
    "status": "results_ready",
    "biomarkers": [
      {
        "code": "TSH",
        "name": "TSH",
        "value": 2.5,
        "unit": "mIU/L",
        "ref_low": 0.4,
        "ref_high": 4.0,
        "status": "normal"
      }
    ]
  }'
```
