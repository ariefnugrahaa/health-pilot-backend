# "Why This?" Explanation API

## Overview

The "Why This?" feature provides comprehensive, AI-powered explanations for treatment recommendations. This builds trust and transparency by helping users understand exactly why a specific treatment was recommended for them.

## Endpoints

### 1. Get Full Explanation

**GET** `/api/v1/recommendations/:recommendationId/treatments/:treatmentId/explain`

Returns a comprehensive explanation including AI-generated content, personalized factors, and evidence support.

#### Request Headers
```
Authorization: Bearer <access_token>
```

#### Response
```json
{
  "success": true,
  "data": {
    "treatmentId": "uuid",
    "treatmentName": "TRT Therapy",
    "category": "HORMONE_THERAPY",
    "whyRecommended": [
      {
        "type": "goal_match",
        "title": "Hormone Optimization Goal",
        "description": "Your stated goal of hormone optimization aligns with this treatment approach.",
        "confidence": "high"
      },
      {
        "type": "symptom_match",
        "title": "Fatigue Symptoms",
        "description": "Addresses reported fatigue symptoms that may be related to hormone levels.",
        "confidence": "medium"
      },
      {
        "type": "biomarker_match",
        "title": "Testosterone Levels",
        "description": "Blood test results indicate testosterone levels below optimal range.",
        "confidence": "high"
      }
    ],
    "howItWorks": "Testosterone replacement therapy works by supplementing the body's natural hormone production. This approach aims to restore testosterone levels to an optimal range, which may support energy levels, muscle function, and overall well-being. Treatment protocols are typically individualized and monitored by healthcare providers to ensure safety and effectiveness.",
    "evidenceSupport": [
      "Hormone optimization has been studied in clinical settings for various health applications.",
      "Treatment protocols are typically based on established medical guidelines.",
      "Regular monitoring helps ensure treatment remains appropriate for individual needs."
    ],
    "personalizedFactors": [
      {
        "factor": "Age",
        "impact": "neutral",
        "description": "Your age (39) is within the typical range for this treatment."
      },
      {
        "factor": "Active Lifestyle",
        "impact": "positive",
        "description": "Your active lifestyle may complement this treatment approach."
      }
    ],
    "biomarkerInsights": [
      {
        "biomarkerCode": "TESTOSTERONE_TOTAL",
        "biomarkerName": "Total Testosterone",
        "relevance": "This biomarker is relevant to understanding how TRT Therapy may affect your health.",
        "currentStatus": "low",
        "howTreatmentHelps": "TRT Therapy may help address factors related to this biomarker."
      }
    ],
    "limitations": [
      "Results may vary based on individual health factors.",
      "This treatment may not be suitable for everyone.",
      "Blood testing is required before starting this treatment."
    ],
    "disclaimers": [
      "This information is for educational purposes only and is not medical advice.",
      "Always consult with a qualified healthcare provider before starting any treatment.",
      "Individual results may vary based on personal health factors.",
      "This platform does not diagnose conditions or prescribe treatments."
    ],
    "relatedAlternatives": [
      {
        "treatmentId": "uuid",
        "treatmentName": "HCG Therapy",
        "differentiator": "An alternative approach to hormone optimization that stimulates natural production."
      }
    ]
  },
  "meta": {
    "timestamp": "2026-01-29T09:00:00Z"
  }
}
```

### 2. Get Quick Explanation

**GET** `/api/v1/recommendations/:recommendationId/treatments/:treatmentId/explain/quick`

Returns a lightweight summary without making AI calls. Ideal for initial display or list views.

#### Request Headers
```
Authorization: Bearer <access_token>
```

#### Response
```json
{
  "success": true,
  "data": {
    "summary": "TRT Therapy was recommended based on 3 key factors from your health profile.",
    "keyReasons": [
      "Goal match: Hormone optimization aligns with your stated objectives",
      "Symptom match: Addresses reported fatigue symptoms",
      "Blood test eligibility: Your testosterone levels indicate suitability"
    ]
  },
  "meta": {
    "timestamp": "2026-01-29T09:00:00Z"
  }
}
```

### 3. Legacy Endpoint (Deprecated)

**POST** `/api/v1/recommendations/:recommendationId/explain`

> ⚠️ **Deprecated**: Use the GET endpoints above instead.

Kept for backward compatibility. Uses quick explanation internally.

#### Request Body
```json
{
  "treatmentId": "uuid"
}
```

## Data Types

### ExplanationReason

| Field | Type | Description |
|-------|------|-------------|
| type | enum | One of: `goal_match`, `symptom_match`, `biomarker_match`, `lifestyle_match`, `eligibility` |
| title | string | Short title for the reason |
| description | string | Detailed explanation |
| confidence | enum | One of: `high`, `medium`, `low` |

### PersonalizedFactor

| Field | Type | Description |
|-------|------|-------------|
| factor | string | Name of the factor (e.g., "Age", "Active Lifestyle") |
| impact | enum | One of: `positive`, `neutral`, `consideration` |
| description | string | How this factor relates to the treatment |

### BiomarkerInsight

| Field | Type | Description |
|-------|------|-------------|
| biomarkerCode | string | Code identifier (e.g., "TESTOSTERONE_TOTAL") |
| biomarkerName | string | Human-readable name |
| relevance | string | Why this biomarker matters for this treatment |
| currentStatus | enum | One of: `normal`, `low`, `high`, `abnormal` |
| howTreatmentHelps | string? | Optional explanation of treatment benefit |

### RelatedTreatment

| Field | Type | Description |
|-------|------|-------------|
| treatmentId | string | UUID of alternative treatment |
| treatmentName | string | Name of the treatment |
| differentiator | string | What makes this alternative different |

## Error Responses

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 401 | UNAUTHORIZED | Missing or invalid authentication |
| 404 | NOT_FOUND | Recommendation or treatment match not found |
| 403 | FORBIDDEN | User doesn't own the recommendation |

## Usage Guidelines

1. **Initial Display**: Use `/explain/quick` for initial treatment cards to minimize load time
2. **Detailed View**: Use `/explain` when user clicks "Why this?" or expands details
3. **Caching**: Full explanations can be cached client-side as they don't change frequently
4. **Blood Tests**: If user has completed blood tests, `biomarkerInsights` will be populated
5. **Alternatives**: `relatedAlternatives` shows other eligible treatments in the same category

## Compliance Notes

- All explanations include mandatory medical disclaimers
- Content is educational only - never diagnostic
- AI-generated content follows strict prompting guidelines
- Explanations are audited via PHI access logging
