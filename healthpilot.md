# HealthPilot - Development Guidelines & AI Instructions

> **Project:** HealthPilot - Health Treatment & Provider Matching Platform  
> **Version:** 1.0.0  
> **Last Updated:** January 28, 2025

---

## 📋 Project Overview

**What is HealthPilot?**
A med-tech platform that acts as a free entry point into modern, non-surgical health treatments. Users complete one health intake and optionally one blood test, then receive AI-driven treatment recommendations matched to qualified providers.

**Tech Stack:**
- **Backend:** Node.js 20 + TypeScript 5.x + Express.js
- **Database:** PostgreSQL 16 + Prisma ORM
- **Cache/Queue:** Redis 7.x (ioredis) + BullMQ
- **AI:** Anthropic Claude Sonnet 4.5
- **Security:** Helmet, CORS, JWT, bcrypt
- **Testing:** Jest + Supertest
- **Infrastructure:** Docker + Docker Compose

**Critical Context:**
- Healthcare domain → HIPAA/GDPR compliance required
- Handles PHI (Protected Health Information) → encryption mandatory
- AI-powered but non-diagnostic → clear boundaries required
- Supply-side monetization → provider attribution tracking essential

---

## 🎯 Core Architecture Principles

### 1. SOLID Principles (Mandatory)

**Single Responsibility Principle:**
- Each class/module has ONE reason to change
- Separate data access, business logic, and presentation

**Open/Closed Principle:**
- Use interfaces and abstractions
- Extend functionality without modifying existing code

**Liskov Substitution:**
- Implementations must be swappable
- Follow interface contracts strictly

**Interface Segregation:**
- Small, focused interfaces
- Don't force unused method implementations

**Dependency Inversion:**
- Depend on abstractions (interfaces), not concrete classes
- Use dependency injection

### 2. TypeScript Strict Mode (Non-negotiable)

```typescript
// ✅ ALWAYS
function processData(data: UserData): Promise<Result> {
  // implementation
}

// ❌ NEVER
function processData(data: any): any {
  // implementation
}
```

**Rules:**
- NEVER use `any` (use `unknown` with type guards if needed)
- Always define explicit return types
- Use interfaces for all data structures
- Enable strict null checks

### 3. Healthcare Compliance

**PHI Data Handling:**
- Always encrypt PHI before storing in database
- Never log sensitive data (passwords, health data, PII)
- Implement audit trails for all PHI access
- Use separate anonymized data layer for analytics

**Data Categories:**
- **PHI:** Health intakes, blood test results, handoff data → ENCRYPT
- **PII:** Email, name → Protect, don't log
- **Non-sensitive:** Treatment definitions, provider info → Safe to cache

---

## 📁 Project Structure

```
src/
├── api/                          # API layer (routes, middlewares, validators)
├── services/                     # Business logic (SOLID services)
│   ├── ai/                      # Claude integration
│   ├── matching/                # Treatment matching engine
│   ├── bloodtest/               # Blood test processing
│   └── provider/                # Provider integrations
├── repositories/                # Data access layer (Prisma)
├── models/                      # Prisma models
├── jobs/                        # Background jobs (BullMQ)
├── utils/                       # Shared utilities
├── config/                      # Configuration
└── types/                       # TypeScript type definitions
```

---

## 🔒 Security & Compliance Rules

### 1. Encryption
```typescript
// ✅ Encrypt PHI before storage
const encrypted = await encryptionService.encrypt(healthData);
await prisma.healthIntake.create({ data: { intakeData: encrypted } });

// ❌ Never store unencrypted PHI
await prisma.healthIntake.create({ data: { intakeData: healthData } });
```

### 2. Audit Logging
```typescript
// ✅ Log all PHI access
await auditLogger.log({
  userId: user.id,
  action: 'READ_HEALTH_INTAKE',
  resourceId: intakeId,
  timestamp: new Date(),
  ipAddress: req.ip
});
```

### 3. Authentication & Authorization
- Use JWT with short expiration (1 hour)
- Support both anonymous and authenticated users
- Implement role-based access control (RBAC)
- Hash passwords with bcrypt (12 rounds minimum)

---

## 🎨 Code Style & Naming Conventions

### Naming Rules
```typescript
// Classes & Interfaces: PascalCase
class UserService { }
interface IUserRepository { }

// Functions & Variables: camelCase
const userName = 'John';
function getUserById(id: string) { }

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_CACHE_TTL = 3600;

// Files & Folders: kebab-case
user-service.ts
health-intake.controller.ts

// Enums: PascalCase (name), UPPER_CASE (values)
enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE'
}
```

### Code Patterns
```typescript
// ✅ Use async/await
async function fetchData(): Promise<Data> {
  const result = await api.get('/data');
  return result;
}

// ✅ Use destructuring
const { firstName, lastName } = user;

// ✅ Use template literals
const message = `Hello ${user.name}`;

// ✅ Use const/let, never var
const API_KEY = process.env.API_KEY;
let retryCount = 0;
```

---

## 🗄️ Database Guidelines

### Naming Conventions (PostgreSQL)
```sql
-- Tables: snake_case, plural
users
health_intakes
blood_tests

-- Columns: snake_case
user_id
created_at
is_active

-- Indexes: idx_{table}_{columns}
idx_users_email

-- Foreign Keys: fk_{table}_{referenced_table}
fk_health_intakes_users
```

### Query Guidelines
```typescript
// ✅ Use Prisma for type safety
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: { healthIntakes: true }
});

// ✅ Use transactions for related ops
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: userData });
  await tx.userPreference.create({ data: { userId: user.id } });
});

// ❌ Never use raw SQL without parameterization
const users = await prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}`;
```

---

## 🌐 API Design Rules

### RESTful Conventions
```
GET    /api/v1/users              - List users
GET    /api/v1/users/:id          - Get user
POST   /api/v1/users              - Create user
PATCH  /api/v1/users/:id          - Update user (partial)
DELETE /api/v1/users/:id          - Delete user
```

### Response Format
```typescript
// Success
{
  "success": true,
  "data": { /* result */ },
  "meta": {
    "timestamp": "2025-01-28T10:00:00Z"
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": [{ "field": "email", "message": "Must be valid email" }]
  }
}
```

### Status Codes
- `200 OK` - Success (GET, PATCH)
- `201 Created` - Success (POST)
- `204 No Content` - Success (DELETE)
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Missing/invalid auth
- `403 Forbidden` - No permission
- `404 Not Found` - Resource not found
- `500 Internal Error` - Server error

---

## 🧪 Testing Requirements

### Coverage Targets
- Unit Tests: 80% minimum
- Integration Tests: Critical flows covered
- E2E Tests: P0 user journeys

### Test Structure (AAA Pattern)
```typescript
describe('UserService', () => {
  describe('registerUser', () => {
    it('should create user with valid data', async () => {
      // Arrange
      const userData = { email: 'test@example.com' };
      
      // Act
      const result = await userService.registerUser(userData);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.email).toBe(userData.email);
    });
  });
});
```

---

## 🤖 AI Integration (Claude)

### Key Principles
- **Use prompt caching** for 90% cost reduction
- **Version all prompts** for reproducibility
- **Validate all responses** with Zod schemas
- **Never expose raw AI output** to users without validation
- **Implement retry logic** with exponential backoff

### Boundaries
```typescript
// Claude's role:
// ✅ Analyze health data (educational)
// ✅ Suggest treatment pathways
// ✅ Explain biomarker results
// ✅ Generate "why this?" explanations

// Claude CANNOT:
// ❌ Diagnose conditions
// ❌ Prescribe treatments
// ❌ Override provider decisions
// ❌ Provide medical advice
```

---

## ⚠️ CRITICAL - NEVER DO THIS

1. ❌ **Never commit secrets to git**
2. ❌ **Never store PHI unencrypted**
3. ❌ **Never use `any` type in TypeScript**
4. ❌ **Never modify production DB directly** (use migrations)
5. ❌ **Never skip error handling**
6. ❌ **Never log sensitive data** (passwords, health info, PII)
7. ❌ **Never deploy without tests passing**
8. ❌ **Never use `SELECT *`** in queries

---

## 📚 Key Files Reference

### Must Read
- `prisma/schema.prisma` - Database schema & relationships
- `src/config/index.ts` - Application configuration
- `.env.example` - Required environment variables

### Business Logic Documents
- Review the original business plan PDF for:
  - User journey flows (P0 vs P1)
  - Treatment matching logic
  - Provider handoff requirements
  - Attribution rules
  - Data monetization strategy

---

## 🎯 Development Workflow

### Before Writing Code
1. Understand the business requirement
2. Check database schema for relevant tables
3. Identify which services need to be involved
4. Follow SOLID principles in design
5. Consider security/compliance implications

### Code Review Checklist
- [ ] SOLID principles followed
- [ ] TypeScript strict mode (no `any`)
- [ ] Error handling implemented
- [ ] Tests written and passing
- [ ] PHI data encrypted where applicable
- [ ] Audit logging for sensitive operations
- [ ] Documentation updated
- [ ] No secrets in code
- [ ] Code formatted (Prettier)

---

## 💡 AI Agent Instructions

When generating code for HealthPilot:

1. **Always prioritize:**
   - Type safety (TypeScript strict)
   - Security (encryption, audit logs)
   - SOLID principles
   - Error handling

2. **For new features:**
   - Check database schema first
   - Create interfaces before implementations
   - Use dependency injection
   - Write tests alongside code

3. **For database changes:**
   - Never modify existing migrations
   - Create new migrations with timestamps
   - Test rollback scenarios

4. **For AI integration:**
   - Use prompt caching patterns
   - Validate responses with schemas
   - Implement proper error handling
   - Track token usage

5. **For healthcare data:**
   - Encrypt before storage
   - Add audit logging
   - Sanitize logs
   - Follow data retention policies

---

## 📖 Additional Resources

- **SOLID Principles:** https://en.wikipedia.org/wiki/SOLID
- **TypeScript Best Practices:** https://www.typescriptlang.org/docs/handbook/
- **Prisma Documentation:** https://www.prisma.io/docs
- **HIPAA Compliance:** https://www.hhs.gov/hipaa/
- **GDPR Guidelines:** https://gdpr.eu/

---

**Last Updated:** January 28, 2025  
**Maintained by:** Development Team  
**Review Frequency:** Monthly