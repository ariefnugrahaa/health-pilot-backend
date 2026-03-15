# HealthPilot Backend

> **Health Treatment & Provider Matching Platform**

A med-tech distribution and orchestration platform that acts as a free entry point into modern, non-surgical health treatments. Users complete one health intake and optionally one blood test, then receive AI-driven treatment recommendations matched to qualified providers.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HealthPilot Backend                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   Express    │    │   Prisma     │    │    Redis     │                   │
│  │   API Layer  │───▶│   ORM        │───▶│   Cache      │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│         │                   │                   │                            │
│         ▼                   ▼                   ▼                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │  Middleware  │    │  PostgreSQL  │    │   BullMQ     │                   │
│  │  (Auth/Audit)│    │   Database   │    │   Queues     │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│         │                                       │                            │
│         ▼                                       ▼                            │
│  ┌──────────────┐                        ┌──────────────┐                   │
│  │   OpenAI     │                        │  Background  │                   │
│  │ AI Services  │                        │   Workers    │                   │
│  └──────────────┘                        └──────────────┘                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 📊 Database ERD (Entity Relationship Diagram)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    HealthPilot Database Schema                                       │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     users       │       │ user_preferences│       │ refresh_tokens  │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │──┐    │ id (PK)         │       │ id (PK)         │
│ email           │  │    │ user_id (FK)    │◄──────│ user_id (FK)    │◄──┐
│ password_hash   │  │    │ risk_tolerance  │       │ token           │   │
│ first_name      │  │    │ budget_sens.    │       │ expires_at      │   │
│ last_name       │  │    │ prefer_sub      │       │ is_revoked      │   │
│ date_of_birth   │  │    │ delivery_pref   │       │ created_at      │   │
│ gender          │  │    │ marketing_cons. │       └─────────────────┘   │
│ phone_number    │  │    │ data_research   │                             │
│ is_anonymous    │  │    │ created_at      │                             │
│ is_email_verif. │  │    │ updated_at      │                             │
│ status          │  │    └─────────────────┘                             │
│ role            │  │                                                     │
│ last_login_at   │  │                                                     │
│ created_at      │  │                                                     │
│ updated_at      │  │                                                     │
└─────────────────┘  │                                                     │
         │           │                                                     │
         │           └─────────────────────────────────────────────────────┘
         │
         │    ┌─────────────────┐       ┌─────────────────┐
         │    │ health_intakes  │       │   blood_tests   │
         │    ├─────────────────┤       ├─────────────────┤
         ├───▶│ id (PK)         │◄──────│ id (PK)         │
         │    │ user_id (FK)    │       │ user_id (FK)    │◄──────────────┐
         │    │ status          │       │ health_intake_id│               │
         │    │ version         │       │ lab_partner_id  │───────┐       │
         │    │ intake_data_enc │       │ status          │       │       │
         │    │ primary_goals   │       │ panel_type      │       │       │
         │    │ has_chronic     │       │ biomarkers_req  │       │       │
         │    │ taking_meds     │       │ results_encrypt │       │       │
         │    │ completed_at    │       │ ordered_at      │       │       │
         │    │ expires_at      │       │ sample_coll_at  │       │       │
         │    │ created_at      │       │ results_recv_at │       │       │
         │    │ updated_at      │       │ expires_at      │       │       │
         │    └─────────────────┘       │ created_at      │       │       │
         │             │                │ updated_at      │       │       │
         │             │                └─────────────────┘       │       │
         │             │                        │                 │       │
         │             │                        ▼                 │       │
         │             │                ┌─────────────────┐       │       │
         │             │                │biomarker_results│       │       │
         │             │                ├─────────────────┤       │       │
         │             │                │ id (PK)         │       │       │
         │             │                │ blood_test_id   │       │       │
         │             │                │ biomarker_id    │───┐   │       │
         │             │                │ value           │   │   │       │
         │             │                │ unit            │   │   │       │
         │             │                │ reference_min   │   │   │       │
         │             │                │ reference_max   │   │   │       │
         │             │                │ is_abnormal     │   │   │       │
         │             │                │ created_at      │   │   │       │
         │             │                └─────────────────┘   │   │       │
         │             │                                      │   │       │
         │             │                ┌─────────────────┐   │   │       │
         │             │                │   biomarkers    │◄──┘   │       │
         │             │                ├─────────────────┤       │       │
         │             │                │ id (PK)         │       │       │
         │             │                │ code            │       │       │
         │             │                │ name            │       │       │
         │             │                │ description     │       │       │
         │             │                │ unit            │       │       │
         │             │                │ category        │       │       │
         │             │                │ ref_min_male    │       │       │
         │             │                │ ref_max_male    │       │       │
         │             │                │ ref_min_female  │       │       │
         │             │                │ ref_max_female  │       │       │
         │             │                │ is_active       │       │       │
         │             │                │ created_at      │       │       │
         │             │                │ updated_at      │       │       │
         │             │                └─────────────────┘       │       │
         │             │                                          │       │
         │             │                ┌─────────────────┐       │       │
         │             │                │  lab_partners   │◄──────┘       │
         │             │                ├─────────────────┤               │
         │             │                │ id (PK)         │               │
         │             │                │ name            │               │
         │             │                │ code            │               │
         │             │                │ api_endpoint    │               │
         │             │                │ is_active       │               │
         │             │                │ supported_reg.  │               │
         │             │                │ created_at      │               │
         │             │                │ updated_at      │               │
         │             │                └─────────────────┘               │
         │             │                                                  │
         │             ▼                                                  │
         │    ┌─────────────────┐       ┌─────────────────┐              │
         │    │recommendations  │       │treatment_matches│              │
         │    ├─────────────────┤       ├─────────────────┤              │
         ├───▶│ id (PK)         │◄──────│ id (PK)         │              │
         │    │ user_id (FK)    │       │ recommendation  │              │
         │    │ health_intake_id│       │ treatment_id    │──────┐       │
         │    │ status          │       │ relevance_score │      │       │
         │    │ health_summary  │       │ match_reasons   │      │       │
         │    │ primary_recs    │       │ contraindic.    │      │       │
         │    │ ai_model_ver    │       │ is_eligible     │      │       │
         │    │ prompt_version  │       │ display_order   │      │       │
         │    │ tokens_used     │       │ created_at      │      │       │
         │    │ viewed_at       │       └─────────────────┘      │       │
         │    │ expires_at      │                                │       │
         │    │ created_at      │                                │       │
         │    │ updated_at      │                                │       │
         │    └─────────────────┘                                │       │
         │             │                                         │       │
         │             ▼                                         │       │
         │    ┌─────────────────┐       ┌─────────────────┐      │       │
         │    │provider_handoffs│       │   providers     │      │       │
         │    ├─────────────────┤       ├─────────────────┤      │       │
         └───▶│ id (PK)         │       │ id (PK)         │◄─────┼───────┘
              │ user_id (FK)    │       │ name            │      │
              │ provider_id     │──────▶│ slug            │      │
              │ recommendation  │       │ description     │      │
              │ status          │       │ logo_url        │      │
              │ handoff_data    │       │ website_url     │      │
              │ attribution_id  │       │ status          │      │
              │ initiated_at    │       │ registration_no │      │
              │ data_transfer   │       │ supported_reg.  │      │
              │ provider_recv   │       │ api_endpoint    │      │
              │ treatment_start │       │ webhook_url     │      │
              │ completed_at    │       │ accepts_blood   │      │
              │ created_at      │       │ commission_rate │      │
              │ updated_at      │       │ subscription_sh │      │
              └─────────────────┘       │ created_at      │      │
                      │                 │ updated_at      │      │
                      │                 └─────────────────┘      │
                      │                         │                │
                      ▼                         ▼                │
              ┌─────────────────┐       ┌─────────────────┐      │
              │attribution_evts │       │   treatments    │◄─────┘
              ├─────────────────┤       ├─────────────────┤
              │ id (PK)         │       │ id (PK)         │
              │ handoff_id (FK) │       │ provider_id(FK) │
              │ event_type      │       │ name            │
              │ revenue_amount  │       │ slug            │
              │ commission_amt  │       │ description     │
              │ currency        │       │ category        │
              │ metadata        │       │ price_one_time  │
              │ occurred_at     │       │ price_subscr.   │
              │ created_at      │       │ subscr_freq     │
              └─────────────────┘       │ currency        │
                                        │ min_age         │
                                        │ max_age         │
                                        │ allowed_genders │
                                        │ requires_blood  │
                                        │ is_active       │
                                        │ created_at      │
                                        │ updated_at      │
                                        └─────────────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    │                           │                           │
                    ▼                           ▼                           ▼
            ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
            │ matching_rules  │       │treatment_biomark│       │treatment_contra │
            ├─────────────────┤       ├─────────────────┤       ├─────────────────┤
            │ id (PK)         │       │ id (PK)         │       │ id (PK)         │
            │ treatment_id    │       │ treatment_id    │       │ treatment_id    │
            │ name            │       │ biomarker_id    │       │ condition       │
            │ description     │       │ is_required     │       │ severity        │
            │ field           │       │ min_value       │       │ description     │
            │ operator        │       │ max_value       │       │ created_at      │
            │ value           │       │ created_at      │       └─────────────────┘
            │ weight          │       └─────────────────┘
            │ is_required     │
            │ is_active       │       ┌─────────────────┐
            │ priority        │       │  audit_logs     │
            │ created_at      │       ├─────────────────┤
            │ updated_at      │       │ id (PK)         │
            └─────────────────┘       │ user_id (FK)    │
                                      │ action          │
                                      │ resource_type   │
                                      │ resource_id     │
                                      │ ip_address      │
                                      │ user_agent      │
                                      │ metadata        │
                                      │ created_at      │
                                      └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (via Docker)
- Redis 7 (via Docker)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd health-pilot-backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start infrastructure (PostgreSQL + Redis)
docker-compose up -d postgres redis

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Seed the database
npm run prisma:seed

# Start development server
npm run dev
```

### Using Docker (Full Stack)

```bash
# Start all services
docker-compose up -d

# With development tools (pgAdmin, Redis Commander)
docker-compose --profile dev up -d

# View logs
docker-compose logs -f api
```

## 📁 Project Structure

```
health-pilot-backend/
├── src/
│   ├── api/                    # API Layer
│   │   ├── middlewares/        # Express middlewares
│   │   │   ├── auth.middleware.ts
│   │   │   ├── audit.middleware.ts
│   │   │   └── error.middleware.ts
│   │   └── routes/             # Route handlers
│   │       ├── auth.routes.ts
│   │       ├── health.routes.ts
│   │       ├── intake.routes.ts
│   │       ├── provider.routes.ts
│   │       ├── recommendation.routes.ts
│   │       └── user.routes.ts
│   ├── config/                 # Configuration
│   │   └── index.ts
│   ├── jobs/                   # Background jobs (BullMQ)
│   │   └── queue.ts
│   ├── repositories/           # Data access layer
│   │   ├── base.repository.ts
│   │   └── user.repository.ts
│   ├── services/               # Business logic
│   │   ├── ai/
│   │   │   ├── ai-provider.factory.ts
│   │   │   └── providers/
│   │   │       └── openai.provider.ts
│   │   └── cloudflare/
│   │       └── cloudflare.service.ts
│   ├── types/                  # TypeScript types
│   │   └── index.ts
│   ├── utils/                  # Utilities
│   │   ├── database.ts
│   │   ├── encryption.ts
│   │   ├── logger.ts
│   │   └── redis.ts
│   ├── __tests__/              # Tests
│   │   └── setup.ts
│   ├── app.ts                  # Express app setup
│   └── index.ts                # Entry point
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── seed.ts                 # Database seeding
├── docker/
│   └── postgres/
│       └── init.sql            # PostgreSQL initialization
├── .env.example                # Environment template
├── docker-compose.yml          # Docker services
├── Dockerfile                  # Production Docker image
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production/test) | development |
| `PORT` | Server port | 3000 |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | - |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | - |
| `JWT_EXPIRES_IN` | Access token expiry | 1h |
| `ENCRYPTION_KEY` | PHI encryption key (32 chars) | - |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | - |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | - |

## 📚 API Documentation

### Authentication

```bash
# Register
POST /api/v1/auth/register
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}

# Login
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

# Anonymous Session
POST /api/v1/auth/anonymous

# Refresh Token
POST /api/v1/auth/refresh
{
  "refreshToken": "..."
}
```

### Health Intake

```bash
# Create Intake
POST /api/v1/intakes
Authorization: Bearer <token>
{
  "medicalHistory": {...},
  "symptoms": [...],
  "goals": [...],
  "lifestyle": {...}
}

# Get Intake
GET /api/v1/intakes/:intakeId
Authorization: Bearer <token>

# Complete Intake
POST /api/v1/intakes/:intakeId/complete
Authorization: Bearer <token>
```

### Recommendations

```bash
# Generate Recommendations
POST /api/v1/recommendations/generate
Authorization: Bearer <token>
{
  "intakeId": "..."
}

# Get Recommendation
GET /api/v1/recommendations/:recommendationId
Authorization: Bearer <token>

# Get Explanation ("Why this?")
POST /api/v1/recommendations/:recommendationId/explain
Authorization: Bearer <token>
{
  "treatmentId": "..."
}
```

### Providers

```bash
# List Providers
GET /api/v1/providers

# Get Provider
GET /api/v1/providers/:slug

# Get Provider Treatments
GET /api/v1/providers/:slug/treatments
```

## 🔒 Security & Compliance

### HIPAA/GDPR Compliance

- **PHI Encryption**: All Protected Health Information is encrypted at rest using AES-256-GCM
- **Audit Logging**: All PHI access is logged for compliance
- **Data Minimization**: Only necessary data is collected and stored
- **Consent Management**: User consent is tracked for data processing

### Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: Request throttling
- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt with 12 rounds
- **Input Validation**: express-validator

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## 🛠️ Development

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors |
| `npm run format` | Format code with Prettier |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run database migrations |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run prisma:seed` | Seed the database |

### Code Style

- **TypeScript Strict Mode**: No `any` types allowed
- **SOLID Principles**: Dependency injection, interface segregation
- **Repository Pattern**: Data access abstraction
- **Error Handling**: Custom error classes with proper HTTP codes

## 📈 Monitoring

### Health Checks

```bash
# Basic health check
GET /health

# Liveness probe (Kubernetes)
GET /health/live

# Readiness probe (Kubernetes)
GET /health/ready

# Detailed health (development)
GET /health/detailed
```

## 🤝 Contributing

1. Follow the coding standards in `.kilocode/rules/healthpilot.md`
2. Write tests for new features
3. Ensure all tests pass before submitting PR
4. Update documentation as needed

## 📄 License

UNLICENSED - Proprietary

---

**HealthPilot** - Making modern health treatments accessible to everyone.
