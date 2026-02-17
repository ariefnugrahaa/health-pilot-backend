// Set test environment variables
process.env['NODE_ENV'] = 'test';
process.env['PORT'] = '3001';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/healthpilot_test';
process.env['REDIS_URL'] = 'redis://:test@localhost:6379';
process.env['JWT_SECRET'] = 'test-jwt-secret-minimum-32-characters-long';
process.env['JWT_EXPIRES_IN'] = '1h';
process.env['JWT_REFRESH_EXPIRES_IN'] = '7d';
process.env['ENCRYPTION_KEY'] = 'test-encryption-key-32-chars!!12';
process.env['ANTHROPIC_API_KEY'] = 'test-api-key';
process.env['ANTHROPIC_MODEL'] = 'claude-sonnet-4-20250514';
process.env['ANTHROPIC_MAX_TOKENS'] = '4096';
