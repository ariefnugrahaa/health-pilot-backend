import crypto from 'crypto';
import dotenv from 'dotenv';
import {
  Gender,
  MatchingRuleOperator,
  Prisma,
  PrismaClient,
  ProviderRatingCategory,
  SupplementCategory,
  TreatmentCategory,
  TreatmentFeedbackOutcome,
} from '@prisma/client';
import bcrypt from 'bcrypt';

dotenv.config();

const prisma = new PrismaClient();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaAny = prisma as any;
const DEMO_NOW = new Date('2026-03-08T09:00:00.000Z');
const ENCRYPTION_SALT = 'healthpilot-salt';

const encryptionKey = process.env.ENCRYPTION_KEY ?? 'healthpilot-seed-encryption-key-32!!';
const derivedEncryptionKey = crypto.scryptSync(encryptionKey, ENCRYPTION_SALT, 32);

function encryptSeedValue(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedEncryptionKey, iv, {
    authTagLength: 16,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

function encryptSeedJson(value: unknown): string {
  return encryptSeedValue(JSON.stringify(value));
}

function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function daysFromDemoNow(days: number): Date {
  return new Date(DEMO_NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

type SeedFieldOption = {
  value: string;
  label: string;
  description?: string;
};

type SeedField = {
  fieldKey: string;
  label: string;
  type:
    | 'TEXT'
    | 'NUMBER'
    | 'EMAIL'
    | 'DATE'
    | 'SELECT'
    | 'MULTI_SELECT'
    | 'RADIO'
    | 'CHECKBOX'
    | 'TEXTAREA'
    | 'PHONE'
    | 'BOOLEAN'
    | 'BLOOD_TEST';
  placeholder?: string;
  helperText?: string;
  isRequired?: boolean;
  order: number;
  validationRules?: Record<string, unknown>;
  options?: SeedFieldOption[];
  dependsOnField?: string;
  dependsOnValue?: string;
};

type SeedSection = {
  title: string;
  description?: string;
  order: number;
  isOptional?: boolean;
  fields: SeedField[];
};

type SeedIntakeFlow = {
  name: string;
  legacyNames?: string[];
  description: string;
  status: 'DRAFT' | 'ACTIVE';
  isDefault: boolean;
  assignedTo: string;
  scoringConfig?: Record<string, unknown> | null;
  sections: SeedSection[];
};

function mapSeedSections(
  sections: SeedSection[]
): Prisma.IntakeFlowSectionCreateWithoutIntakeFlowInput[] {
  return sections.map((section) => ({
    title: section.title,
    description: section.description,
    order: section.order,
    isOptional: section.isOptional ?? false,
    fields: {
      create: section.fields.map((field) => ({
        fieldKey: field.fieldKey,
        label: field.label,
        type: field.type,
        placeholder: field.placeholder,
        helperText: field.helperText,
        isRequired: field.isRequired ?? true,
        order: field.order,
        validationRules: field.validationRules as Prisma.InputJsonValue | undefined,
        options: field.options as Prisma.InputJsonValue | undefined,
        dependsOnField: field.dependsOnField,
        dependsOnValue: field.dependsOnValue,
      })) as Prisma.IntakeFlowFieldCreateWithoutSectionInput[],
    },
  }));
}

async function syncSeedIntakeFlow(adminId: string, flow: SeedIntakeFlow): Promise<void> {
  const candidateNames = [flow.name, ...(flow.legacyNames ?? [])];
  const existing = await prisma.intakeFlow.findFirst({
    where: {
      assignedTo: flow.assignedTo,
      createdById: adminId,
      name: {
        in: candidateNames,
      },
    },
  });

  const baseData = {
    name: flow.name,
    description: flow.description,
    status: flow.status,
    version: 1,
    isDefault: flow.isDefault,
    assignedTo: flow.assignedTo,
    scoringConfig: (flow.scoringConfig as Prisma.InputJsonValue | null) ?? undefined,
    archivedAt: null,
    publishedAt: flow.status === 'ACTIVE' ? new Date() : null,
  };

  if (existing) {
    await prisma.intakeFlow.update({
      where: { id: existing.id },
      data: {
        ...baseData,
        lastUpdatedById: adminId,
        sections: {
          deleteMany: {},
          create: mapSeedSections(flow.sections),
        },
      },
    });
    console.log(`✅ Updated intake flow seed: ${flow.name}`);
    return;
  }

  await prisma.intakeFlow.create({
    data: {
      ...baseData,
      createdById: adminId,
      lastUpdatedById: adminId,
      sections: {
        create: mapSeedSections(flow.sections),
      },
    },
  });
  console.log(`✅ Created intake flow seed: ${flow.name}`);
}

async function upsertPlatformSetting(
  key: string,
  value: Prisma.InputJsonValue,
  description: string
): Promise<void> {
  await prisma.platformSetting.upsert({
    where: { key },
    update: {
      value,
      description,
    },
    create: {
      key,
      value,
      description,
    },
  });
}

async function syncTreatmentProviders(
  treatmentId: string,
  providers: Array<{ providerId: string; isPrimary?: boolean }>
): Promise<void> {
  await prisma.treatmentProvider.deleteMany({
    where: { treatmentId },
  });

  if (providers.length === 0) {
    return;
  }

  await prisma.treatmentProvider.createMany({
    data: providers.map((provider) => ({
      treatmentId,
      providerId: provider.providerId,
      isPrimary: provider.isPrimary ?? false,
    })),
  });
}

async function syncTreatmentBiomarkerRequirements(
  treatmentId: string,
  requirements: Array<{
    biomarkerId: string;
    isRequired?: boolean;
    minValue?: number | null;
    maxValue?: number | null;
  }>
): Promise<void> {
  await prisma.treatmentBiomarker.deleteMany({
    where: { treatmentId },
  });

  for (const requirement of requirements) {
    await prisma.treatmentBiomarker.create({
      data: {
        treatmentId,
        biomarkerId: requirement.biomarkerId,
        isRequired: requirement.isRequired ?? true,
        minValue: requirement.minValue ?? undefined,
        maxValue: requirement.maxValue ?? undefined,
      },
    });
  }
}

async function syncTreatmentContraindications(
  treatmentId: string,
  contraindications: Array<{
    condition: string;
    severity: string;
    description?: string;
  }>
): Promise<void> {
  await prisma.treatmentContraindication.deleteMany({
    where: { treatmentId },
  });

  if (contraindications.length === 0) {
    return;
  }

  await prisma.treatmentContraindication.createMany({
    data: contraindications.map((contraindication) => ({
      treatmentId,
      condition: contraindication.condition,
      severity: contraindication.severity,
      description: contraindication.description,
    })),
  });
}

async function syncMatchingRules(
  treatmentId: string,
  rules: Array<{
    name: string;
    description?: string;
    field: string;
    operator: MatchingRuleOperator;
    value: string;
    weight?: number;
    isRequired?: boolean;
    priority?: number;
    triggerSource?: string;
    evaluationTiming?: string;
    providerCapabilities?: string[];
    locationConstraints?: string[];
    availabilityStatus?: string;
    linkedTreatments?: string[];
    confidence?: string;
    explanation?: string;
    exclusionReasons?: string[];
  }>
): Promise<void> {
  await prisma.matchingRule.deleteMany({
    where: { treatmentId },
  });

  for (const rule of rules) {
    await prisma.matchingRule.create({
      data: {
        treatmentId,
        name: rule.name,
        description: rule.description,
        field: rule.field,
        operator: rule.operator,
        value: rule.value,
        weight: rule.weight ?? 1,
        isRequired: rule.isRequired ?? false,
        priority: rule.priority ?? 0,
        triggerSource: rule.triggerSource,
        evaluationTiming: rule.evaluationTiming,
        providerCapabilities: rule.providerCapabilities ?? [],
        locationConstraints: rule.locationConstraints ?? [],
        availabilityStatus: rule.availabilityStatus,
        linkedTreatments: rule.linkedTreatments ?? [],
        confidence: rule.confidence,
        explanation: rule.explanation,
        exclusionReasons: rule.exclusionReasons ?? [],
      },
    });
  }
}

async function clearDemoJourneyData(userIds: string[]): Promise<void> {
  const existingHandoffs = await prisma.providerHandoff.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const handoffIds = existingHandoffs.map((handoff) => handoff.id);

  const existingRecommendations = await prisma.recommendation.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const recommendationIds = existingRecommendations.map((recommendation) => recommendation.id);

  const existingBloodTests = await prisma.bloodTest.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const bloodTestIds = existingBloodTests.map((bloodTest) => bloodTest.id);

  const existingIntakes = await prisma.healthIntake.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const intakeIds = existingIntakes.map((intake) => intake.id);

  await prisma.providerRating.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.treatmentFeedback.deleteMany({
    where: { userId: { in: userIds } },
  });

  if (handoffIds.length > 0) {
    await prisma.attributionEvent.deleteMany({
      where: { handoffId: { in: handoffIds } },
    });
    await prisma.webhookLog.deleteMany({
      where: { handoffId: { in: handoffIds } },
    });
    await prisma.providerHandoff.deleteMany({
      where: { id: { in: handoffIds } },
    });
    await prismaAny.analyticsTreatmentOutcome.deleteMany({
      where: { handoffId: { in: handoffIds } },
    });
  }

  if (recommendationIds.length > 0) {
    await prisma.treatmentMatch.deleteMany({
      where: { recommendationId: { in: recommendationIds } },
    });
    await prismaAny.supplementMatch.deleteMany({
      where: { recommendationId: { in: recommendationIds } },
    });
    await prisma.recommendation.deleteMany({
      where: { id: { in: recommendationIds } },
    });
  }

  if (bloodTestIds.length > 0) {
    await prisma.biomarkerResult.deleteMany({
      where: { bloodTestId: { in: bloodTestIds } },
    });
    await prismaAny.bloodTestInterpretation.deleteMany({
      where: { bloodTestId: { in: bloodTestIds } },
    });
    await prismaAny.analyticsBloodTest.deleteMany({
      where: { bloodTestId: { in: bloodTestIds } },
    });
    await prisma.labBooking.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.bloodTest.deleteMany({
      where: { id: { in: bloodTestIds } },
    });
  }

  if (intakeIds.length > 0) {
    await prismaAny.analyticsHealthIntake.deleteMany({
      where: { intakeId: { in: intakeIds } },
    });
    await prisma.healthIntake.deleteMany({
      where: { id: { in: intakeIds } },
    });
  }

  await prisma.notification.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.auditLog.deleteMany({
    where: { userId: { in: userIds } },
  });
}

async function main(): Promise<void> {
  console.log('🌱 Starting database seed...');

  // ============================================
  // Create Admin User
  // ============================================
  const adminPassword = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@healthpilot.com' },
    update: {
      passwordHash: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      isAnonymous: false,
      isEmailVerified: true,
      status: 'ACTIVE',
      role: 'SUPER_ADMIN',
    },
    create: {
      email: 'admin@healthpilot.com',
      passwordHash: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      isAnonymous: false,
      isEmailVerified: true,
      status: 'ACTIVE',
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`✅ Admin user created: ${admin.email}`);

  // ============================================
  // Create Test Customer User
  // ============================================
  const testPassword = await bcrypt.hash('Test123!', 12);
  const testUser = await prisma.user.upsert({
    where: { email: 'test@healthpilot.com' },
    update: {
      passwordHash: testPassword,
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new Date('1990-06-15'),
      gender: 'MALE',
      phoneNumber: '+447700900101',
      isAnonymous: false,
      isEmailVerified: true,
      status: 'ACTIVE',
      role: 'USER',
    },
    create: {
      email: 'test@healthpilot.com',
      passwordHash: testPassword,
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new Date('1990-06-15'),
      gender: 'MALE',
      phoneNumber: '+447700900101',
      isAnonymous: false,
      isEmailVerified: true,
      status: 'ACTIVE',
      role: 'USER',
    },
  });
  console.log(`✅ Test user created: ${testUser.email}`);

  const johnSmith = await prisma.user.upsert({
    where: { email: 'johnsmith@gmail.com' },
    update: {
      passwordHash: testPassword,
      firstName: 'John',
      lastName: 'Smith',
      dateOfBirth: new Date('1985-02-20'),
      gender: 'MALE',
      phoneNumber: '+447700900102',
      isAnonymous: false,
      isEmailVerified: true,
      status: 'ACTIVE',
      role: 'USER',
    },
    create: {
      email: 'johnsmith@gmail.com',
      passwordHash: testPassword,
      firstName: 'John',
      lastName: 'Smith',
      dateOfBirth: new Date('1985-02-20'),
      gender: 'MALE',
      phoneNumber: '+447700900102',
      isAnonymous: false,
      isEmailVerified: true,
      status: 'ACTIVE',
      role: 'USER',
    },
  });

  const armandMaulani = await prisma.user.upsert({
    where: { email: 'armand.maulani@healthpilot.com' },
    update: {
      passwordHash: testPassword,
      firstName: 'Armand',
      lastName: 'Maulani',
      dateOfBirth: new Date('1992-11-05'),
      gender: 'MALE',
      phoneNumber: '+6281212345678',
      isAnonymous: false,
      isEmailVerified: true,
      status: 'ACTIVE',
      role: 'USER',
    },
    create: {
      email: 'armand.maulani@healthpilot.com',
      passwordHash: testPassword,
      firstName: 'Armand',
      lastName: 'Maulani',
      dateOfBirth: new Date('1992-11-05'),
      gender: 'MALE',
      phoneNumber: '+6281212345678',
      isAnonymous: false,
      isEmailVerified: true,
      status: 'ACTIVE',
      role: 'USER',
    },
  });

  const sarahChen = await prisma.user.upsert({
    where: { email: 'sarah.chen@healthpilot.com' },
    update: {
      passwordHash: testPassword,
      firstName: 'Sarah',
      lastName: 'Chen',
      dateOfBirth: new Date('1994-09-12'),
      gender: 'FEMALE',
      phoneNumber: '+12025550141',
      isAnonymous: false,
      isEmailVerified: true,
      status: 'ACTIVE',
      role: 'USER',
    },
    create: {
      email: 'sarah.chen@healthpilot.com',
      passwordHash: testPassword,
      firstName: 'Sarah',
      lastName: 'Chen',
      dateOfBirth: new Date('1994-09-12'),
      gender: 'FEMALE',
      phoneNumber: '+12025550141',
      isAnonymous: false,
      isEmailVerified: true,
      status: 'ACTIVE',
      role: 'USER',
    },
  });
  console.log('✅ Demo users created');

  // ============================================
  // Create Biomarkers
  // ============================================
  const biomarkers = [
    {
      code: 'TESTOSTERONE_TOTAL',
      name: 'Total Testosterone',
      description: 'Primary male sex hormone',
      unit: 'nmol/L',
      category: 'hormone',
      referenceMinMale: 8.64,
      referenceMaxMale: 29.0,
      referenceMinFemale: 0.29,
      referenceMaxFemale: 1.67,
    },
    {
      code: 'TESTOSTERONE_FREE',
      name: 'Free Testosterone',
      description: 'Unbound testosterone available for use',
      unit: 'pmol/L',
      category: 'hormone',
      referenceMinMale: 198,
      referenceMaxMale: 619,
      referenceMinFemale: 3.18,
      referenceMaxFemale: 14.28,
    },
    {
      code: 'ESTRADIOL',
      name: 'Estradiol (E2)',
      description: 'Primary female sex hormone',
      unit: 'pmol/L',
      category: 'hormone',
      referenceMinMale: 41,
      referenceMaxMale: 159,
      referenceMinFemale: 46,
      referenceMaxFemale: 607,
    },
    {
      code: 'TSH',
      name: 'Thyroid Stimulating Hormone',
      description: 'Regulates thyroid function',
      unit: 'mIU/L',
      category: 'thyroid',
      referenceMinMale: 0.27,
      referenceMaxMale: 4.2,
      referenceMinFemale: 0.27,
      referenceMaxFemale: 4.2,
    },
    {
      code: 'FREE_T4',
      name: 'Free Thyroxine (T4)',
      description: 'Active thyroid hormone',
      unit: 'pmol/L',
      category: 'thyroid',
      referenceMinMale: 12,
      referenceMaxMale: 22,
      referenceMinFemale: 12,
      referenceMaxFemale: 22,
    },
    {
      code: 'VITAMIN_D',
      name: 'Vitamin D (25-OH)',
      description: 'Essential for bone health and immunity',
      unit: 'nmol/L',
      category: 'vitamin',
      referenceMinMale: 50,
      referenceMaxMale: 175,
      referenceMinFemale: 50,
      referenceMaxFemale: 175,
    },
    {
      code: 'VITAMIN_B12',
      name: 'Vitamin B12',
      description: 'Essential for nerve function and blood cells',
      unit: 'pmol/L',
      category: 'vitamin',
      referenceMinMale: 145,
      referenceMaxMale: 569,
      referenceMinFemale: 145,
      referenceMaxFemale: 569,
    },
    {
      code: 'LDL',
      name: 'LDL Cholesterol',
      description: 'Low-density lipoprotein cholesterol marker',
      unit: 'mg/dL',
      category: 'cardiovascular',
      referenceMinMale: 0,
      referenceMaxMale: 100,
      referenceMinFemale: 0,
      referenceMaxFemale: 100,
    },
    {
      code: 'HDL',
      name: 'HDL Cholesterol',
      description: 'High-density lipoprotein cholesterol marker',
      unit: 'mg/dL',
      category: 'cardiovascular',
      referenceMinMale: 40,
      referenceMaxMale: 80,
      referenceMinFemale: 50,
      referenceMaxFemale: 90,
    },
    {
      code: 'FASTING_GLUCOSE',
      name: 'Fasting Glucose',
      description: 'Fasting blood sugar marker',
      unit: 'mg/dL',
      category: 'metabolic',
      referenceMinMale: 65,
      referenceMaxMale: 99,
      referenceMinFemale: 65,
      referenceMaxFemale: 99,
    },
    {
      code: 'CRP',
      name: 'C-Reactive Protein',
      description: 'General inflammatory marker',
      unit: 'mg/L',
      category: 'inflammation',
      referenceMinMale: 0,
      referenceMaxMale: 2,
      referenceMinFemale: 0,
      referenceMaxFemale: 2,
    },
    {
      code: 'IRON',
      name: 'Iron',
      description: 'Serum iron marker',
      unit: 'mcg/dL',
      category: 'mineral',
      referenceMinMale: 65,
      referenceMaxMale: 175,
      referenceMinFemale: 50,
      referenceMaxFemale: 170,
    },
    {
      code: 'VIT_D',
      name: 'Vitamin D',
      description: 'Alias marker used in blood analysis report views',
      unit: 'ng/mL',
      category: 'vitamin',
      referenceMinMale: 30,
      referenceMaxMale: 100,
      referenceMinFemale: 30,
      referenceMaxFemale: 100,
    },
    {
      code: 'FERRITIN',
      name: 'Ferritin',
      description: 'Iron storage protein',
      unit: 'ug/L',
      category: 'metabolic',
      referenceMinMale: 30,
      referenceMaxMale: 400,
      referenceMinFemale: 13,
      referenceMaxFemale: 150,
    },
    {
      code: 'HBA1C',
      name: 'HbA1c',
      description: 'Average blood sugar over 2-3 months',
      unit: 'mmol/mol',
      category: 'metabolic',
      referenceMinMale: 20,
      referenceMaxMale: 42,
      referenceMinFemale: 20,
      referenceMaxFemale: 42,
    },
    {
      code: 'CORTISOL',
      name: 'Cortisol',
      description: 'Stress hormone',
      unit: 'nmol/L',
      category: 'hormone',
      referenceMinMale: 166,
      referenceMaxMale: 507,
      referenceMinFemale: 166,
      referenceMaxFemale: 507,
    },
  ];

  for (const biomarker of biomarkers) {
    await prisma.biomarker.upsert({
      where: { code: biomarker.code },
      update: biomarker,
      create: biomarker,
    });
  }
  console.log(`✅ ${biomarkers.length} biomarkers created`);

  // ============================================
  // Create Sample Providers
  // ============================================
  const providers = [
    {
      name: 'Optimale',
      slug: 'optimale',
      description: 'UK-based testosterone replacement therapy clinic',
      businessName: 'Optimale Ltd',
      providerType: 'Telehealth Clinic',
      contactEmail: 'support@optimale.co.uk',
      contactPhone: '+44 20 7946 0101',
      registrationNumber: 'OPTM-TRT-001',
      websiteUrl: 'https://optimale.co.uk',
      affiliateLink: 'https://optimale.co.uk/healthpilot',
      supportedRegions: ['UK'],
      acceptsBloodTests: true,
      commissionRate: 0.15,
      subscriptionShare: 0.1,
      status: 'ACTIVE' as const,
    },
    {
      name: 'Numan',
      slug: 'numan',
      description: "Men's health platform offering various treatments",
      businessName: 'Numan Health',
      providerType: 'Digital Clinic',
      contactEmail: 'care@numan.com',
      contactPhone: '+44 20 7946 0202',
      registrationNumber: 'NUM-CARE-002',
      websiteUrl: 'https://numan.com',
      affiliateLink: 'https://numan.com/partners/healthpilot',
      supportedRegions: ['UK'],
      acceptsBloodTests: true,
      commissionRate: 0.12,
      subscriptionShare: 0.08,
      status: 'ACTIVE' as const,
    },
    {
      name: 'Manual',
      slug: 'manual',
      description: 'Wellness platform for men',
      businessName: 'Manual Health Ltd',
      providerType: 'Digital Clinic',
      contactEmail: 'support@manual.co',
      contactPhone: '+44 20 7946 0303',
      registrationNumber: 'MNL-HLT-003',
      websiteUrl: 'https://manual.co',
      affiliateLink: 'https://manual.co/healthpilot',
      supportedRegions: ['UK'],
      acceptsBloodTests: true,
      commissionRate: 0.12,
      subscriptionShare: 0.08,
      status: 'ACTIVE' as const,
    },
  ];

  for (const provider of providers) {
    await prisma.provider.upsert({
      where: { slug: provider.slug },
      update: provider,
      create: provider,
    });
  }
  console.log(`✅ ${providers.length} providers created`);

  // ============================================
  // Create Sample Treatments
  // ============================================
  const optimale = await prisma.provider.findUnique({ where: { slug: 'optimale' } });
  const numan = await prisma.provider.findUnique({ where: { slug: 'numan' } });
  const manual = await prisma.provider.findUnique({ where: { slug: 'manual' } });

  if (optimale) {
    const treatments = [
      {
        providerId: optimale.id,
        name: 'Testosterone Replacement Therapy',
        slug: 'optimale-trt',
        description: 'Comprehensive TRT program with ongoing monitoring',
        category: 'HORMONE_THERAPY' as TreatmentCategory,
        priceSubscription: 99.0,
        subscriptionFrequency: 'monthly',
        currency: 'GBP',
        minAge: 18,
        maxAge: 80,
        allowedGenders: ['MALE'] as Gender[],
        requiresBloodTest: true,
        isActive: true,
      },
      {
        providerId: optimale.id,
        name: 'Hormone Optimization Program',
        slug: 'optimale-hormone-optimization',
        description: 'Full hormone panel optimization',
        category: 'HORMONE_THERAPY' as TreatmentCategory,
        priceSubscription: 149.0,
        subscriptionFrequency: 'monthly',
        currency: 'GBP',
        minAge: 25,
        maxAge: 70,
        allowedGenders: ['MALE'] as Gender[],
        requiresBloodTest: true,
        isActive: true,
      },
    ];

    for (const treatment of treatments) {
      await prisma.treatment.upsert({
        where: { slug: treatment.slug },
        update: treatment,
        create: treatment,
      });
    }
    console.log(`✅ Optimale treatments created`);
  }

  if (numan) {
    const treatments = [
      {
        providerId: numan.id,
        name: 'Weight Loss Program',
        slug: 'numan-weight-loss',
        description: 'Medically supervised weight loss with GLP-1 medications',
        category: 'WEIGHT_MANAGEMENT' as TreatmentCategory,
        priceSubscription: 199.0,
        subscriptionFrequency: 'monthly',
        currency: 'GBP',
        minAge: 18,
        maxAge: 75,
        allowedGenders: ['MALE', 'FEMALE'] as Gender[],
        requiresBloodTest: false,
        isActive: true,
      },
      {
        providerId: numan.id,
        name: 'Hair Loss Treatment',
        slug: 'numan-hair-loss',
        description: 'Finasteride and minoxidil combination therapy',
        category: 'HAIR_HEALTH' as TreatmentCategory,
        priceSubscription: 24.0,
        subscriptionFrequency: 'monthly',
        currency: 'GBP',
        minAge: 18,
        maxAge: 65,
        allowedGenders: ['MALE'] as Gender[],
        requiresBloodTest: false,
        isActive: true,
      },
      {
        providerId: numan.id,
        name: 'ED Treatment',
        slug: 'numan-ed',
        description: 'Erectile dysfunction treatment with sildenafil or tadalafil',
        category: 'SEXUAL_HEALTH' as TreatmentCategory,
        priceOneTime: 29.0,
        currency: 'GBP',
        minAge: 18,
        maxAge: 80,
        allowedGenders: ['MALE'] as Gender[],
        requiresBloodTest: false,
        isActive: true,
      },
    ];

    for (const treatment of treatments) {
      await prisma.treatment.upsert({
        where: { slug: treatment.slug },
        update: treatment,
        create: treatment,
      });
    }
    console.log(`✅ Numan treatments created`);
  }

  if (manual) {
    const treatments = [
      {
        providerId: manual.id,
        name: 'Sleep Optimization Program',
        slug: 'manual-sleep-optimization',
        description: 'Digital sleep coaching with clinician oversight and targeted interventions.',
        category: 'SLEEP_OPTIMIZATION' as TreatmentCategory,
        priceSubscription: 59.0,
        subscriptionFrequency: 'monthly',
        currency: 'GBP',
        minAge: 18,
        maxAge: 75,
        allowedGenders: ['MALE', 'FEMALE'] as Gender[],
        requiresBloodTest: false,
        prescriptionRequired: false,
        isActive: true,
      },
      {
        providerId: manual.id,
        name: 'Longevity Foundations',
        slug: 'manual-longevity-foundations',
        description:
          'Preventive health optimization covering recovery, metabolic resilience, and long-term wellbeing.',
        category: 'LONGEVITY' as TreatmentCategory,
        priceSubscription: 89.0,
        subscriptionFrequency: 'monthly',
        currency: 'GBP',
        minAge: 25,
        maxAge: 80,
        allowedGenders: ['MALE', 'FEMALE'] as Gender[],
        requiresBloodTest: true,
        prescriptionRequired: false,
        isActive: true,
      },
    ];

    for (const treatment of treatments) {
      await prisma.treatment.upsert({
        where: { slug: treatment.slug },
        update: treatment,
        create: treatment,
      });
    }
    console.log(`✅ Manual treatments created`);
  }

  // ============================================
  // Create AI Prompt Versions
  // ============================================
  await prisma.aIPromptVersion.upsert({
    where: {
      name_version: {
        name: 'health_analysis',
        version: 'v1.0.0',
      },
    },
    update: {
      systemPrompt: `You are a health education assistant for HealthPilot.
You analyze health data and provide educational insights.
You do NOT diagnose or prescribe - all outputs are informational only.`,
      promptTemplate: `Analyze the following health data and provide educational insights:
{{healthData}}

Provide your response in JSON format with:
- healthSummary: A clear overview
- recommendations: Array of educational recommendations
- warnings: Any values that warrant professional attention`,
      isActive: true,
    },
    create: {
      name: 'health_analysis',
      version: 'v1.0.0',
      systemPrompt: `You are a health education assistant for HealthPilot. 
You analyze health data and provide educational insights.
You do NOT diagnose or prescribe - all outputs are informational only.`,
      promptTemplate: `Analyze the following health data and provide educational insights:
{{healthData}}

Provide your response in JSON format with:
- healthSummary: A clear overview
- recommendations: Array of educational recommendations
- warnings: Any values that warrant professional attention`,
      isActive: true,
    },
  });

  await prisma.aIPromptVersion.upsert({
    where: {
      name_version: {
        name: 'treatment_matching',
        version: 'v1.0.0',
      },
    },
    update: {
      systemPrompt:
        'Match treatments to health contexts conservatively, prioritizing safety, eligibility, and clear reasoning.',
      promptTemplate: `Rank the following treatment options for the user context below.
{{healthData}}
{{treatmentOptions}}

Return JSON with ranked matches, eligibility reasoning, and contraindications.`,
      isActive: true,
    },
    create: {
      name: 'treatment_matching',
      version: 'v1.0.0',
      systemPrompt:
        'Match treatments to health contexts conservatively, prioritizing safety, eligibility, and clear reasoning.',
      promptTemplate: `Rank the following treatment options for the user context below.
{{healthData}}
{{treatmentOptions}}

Return JSON with ranked matches, eligibility reasoning, and contraindications.`,
      isActive: true,
    },
  });

  await prisma.aIPromptVersion.upsert({
    where: {
      name_version: {
        name: 'blood_test_interpretation',
        version: 'v1.0.0',
      },
    },
    update: {
      systemPrompt:
        'Interpret blood test results in plain language, flag notable patterns, and suggest sensible next actions without diagnosing.',
      promptTemplate: `Interpret these blood results for a consumer health report:
{{bloodResults}}

Return JSON with summary, keyFindings, and recommendations.`,
      isActive: true,
    },
    create: {
      name: 'blood_test_interpretation',
      version: 'v1.0.0',
      systemPrompt:
        'Interpret blood test results in plain language, flag notable patterns, and suggest sensible next actions without diagnosing.',
      promptTemplate: `Interpret these blood results for a consumer health report:
{{bloodResults}}

Return JSON with summary, keyFindings, and recommendations.`,
      isActive: true,
    },
  });
  console.log(`✅ AI prompt versions created`);

  // ============================================
  // Create Lab Partners
  // ============================================
  await prisma.labPartner.upsert({
    where: { code: 'MEDICHECKS' },
    update: {
      name: 'Medichecks',
      code: 'MEDICHECKS',
      supportedRegions: ['UK'],
      isActive: true,
    },
    create: {
      name: 'Medichecks',
      code: 'MEDICHECKS',
      supportedRegions: ['UK'],
      isActive: true,
    },
  });

  await prisma.labPartner.upsert({
    where: { code: 'QUEST_DIAGNOSTICS' },
    update: {
      name: 'Quest Diagnostics',
      code: 'QUEST_DIAGNOSTICS',
      apiEndpoint: 'https://api.questdiagnostics.com/v1',
      supportedRegions: ['US'],
      isActive: true,
    },
    create: {
      name: 'Quest Diagnostics',
      code: 'QUEST_DIAGNOSTICS',
      apiEndpoint: 'https://api.questdiagnostics.com/v1',
      supportedRegions: ['US'],
      isActive: true,
    },
  });

  await prisma.labPartner.upsert({
    where: { code: 'LABCORP' },
    update: {
      name: 'LabCorp',
      code: 'LABCORP',
      apiEndpoint: 'https://api.labcorp.com/v1',
      supportedRegions: ['US'],
      isActive: true,
    },
    create: {
      name: 'LabCorp',
      code: 'LABCORP',
      apiEndpoint: 'https://api.labcorp.com/v1',
      supportedRegions: ['US'],
      isActive: true,
    },
  });
  console.log(`✅ Lab partners created`);

  // ============================================
  // Create Labs (Lab Locations)
  // ============================================
  const labsData = [
    {
      name: 'Quest Diagnostics - Manhattan',
      city: 'New York City',
      state: 'NY',
      address: '123 Broadway, Suite 400',
      serviceTypes: ['HOME_VISIT', 'ON_SITE'],
      resultTimeDays: 2,
      isActive: true,
      operatingDays: [
        {
          day: 'Monday',
          capacity: 10,
          timeSlots: [
            { start: '08:00', end: '12:00' },
            { start: '13:00', end: '17:00' },
          ],
        },
        {
          day: 'Tuesday',
          capacity: 10,
          timeSlots: [
            { start: '08:00', end: '12:00' },
            { start: '13:00', end: '17:00' },
          ],
        },
        {
          day: 'Wednesday',
          capacity: 10,
          timeSlots: [
            { start: '08:00', end: '12:00' },
            { start: '13:00', end: '17:00' },
          ],
        },
        {
          day: 'Thursday',
          capacity: 10,
          timeSlots: [
            { start: '08:00', end: '12:00' },
            { start: '13:00', end: '17:00' },
          ],
        },
        { day: 'Friday', capacity: 8, timeSlots: [{ start: '08:00', end: '12:00' }] },
      ],
      autoConfirmBooking: true,
      allowReschedule: true,
      cancellationWindowHours: 24,
      requireManualConfirmation: false,
    },
    {
      name: 'LabCorp - Brooklyn Heights',
      city: 'Brooklyn',
      state: 'NY',
      address: '456 Court Street, Floor 2',
      serviceTypes: ['ON_SITE'],
      resultTimeDays: 3,
      isActive: true,
      operatingDays: [
        { day: 'Monday', capacity: 15, timeSlots: [{ start: '09:00', end: '16:00' }] },
        { day: 'Wednesday', capacity: 15, timeSlots: [{ start: '09:00', end: '16:00' }] },
        { day: 'Friday', capacity: 12, timeSlots: [{ start: '09:00', end: '14:00' }] },
      ],
      autoConfirmBooking: true,
      allowReschedule: true,
      cancellationWindowHours: 48,
      requireManualConfirmation: false,
    },
    {
      name: 'Medichecks - London Clinic',
      city: 'London',
      state: 'UK',
      address: '50 Harley Street',
      serviceTypes: ['HOME_VISIT', 'ON_SITE'],
      resultTimeDays: 5,
      isActive: true,
      operatingDays: [
        { day: 'Monday', capacity: 8, timeSlots: [{ start: '10:00', end: '18:00' }] },
        { day: 'Tuesday', capacity: 8, timeSlots: [{ start: '10:00', end: '18:00' }] },
        { day: 'Wednesday', capacity: 8, timeSlots: [{ start: '10:00', end: '18:00' }] },
        { day: 'Thursday', capacity: 8, timeSlots: [{ start: '10:00', end: '18:00' }] },
        { day: 'Friday', capacity: 6, timeSlots: [{ start: '10:00', end: '15:00' }] },
      ],
      autoConfirmBooking: false,
      allowReschedule: true,
      cancellationWindowHours: 72,
      requireManualConfirmation: true,
    },
    {
      name: 'Quest Diagnostics - Los Angeles',
      city: 'Los Angeles',
      state: 'CA',
      address: '888 Sunset Blvd, Suite 200',
      serviceTypes: ['HOME_VISIT', 'ON_SITE'],
      resultTimeDays: 2,
      isActive: true,
      operatingDays: [
        {
          day: 'Monday',
          capacity: 20,
          timeSlots: [
            { start: '07:00', end: '12:00' },
            { start: '13:00', end: '18:00' },
          ],
        },
        {
          day: 'Tuesday',
          capacity: 20,
          timeSlots: [
            { start: '07:00', end: '12:00' },
            { start: '13:00', end: '18:00' },
          ],
        },
        {
          day: 'Wednesday',
          capacity: 20,
          timeSlots: [
            { start: '07:00', end: '12:00' },
            { start: '13:00', end: '18:00' },
          ],
        },
        {
          day: 'Thursday',
          capacity: 20,
          timeSlots: [
            { start: '07:00', end: '12:00' },
            { start: '13:00', end: '18:00' },
          ],
        },
        {
          day: 'Friday',
          capacity: 15,
          timeSlots: [
            { start: '07:00', end: '12:00' },
            { start: '13:00', end: '16:00' },
          ],
        },
        { day: 'Saturday', capacity: 10, timeSlots: [{ start: '08:00', end: '12:00' }] },
      ],
      autoConfirmBooking: true,
      allowReschedule: true,
      cancellationWindowHours: 24,
      requireManualConfirmation: false,
    },
    {
      name: 'BioReference - Miami',
      city: 'Miami',
      state: 'FL',
      address: '100 Biscayne Blvd, Floor 3',
      serviceTypes: ['ON_SITE'],
      resultTimeDays: 4,
      isActive: false,
      operatingDays: [
        { day: 'Monday', capacity: 12, timeSlots: [{ start: '08:00', end: '17:00' }] },
        { day: 'Wednesday', capacity: 12, timeSlots: [{ start: '08:00', end: '17:00' }] },
      ],
      autoConfirmBooking: true,
      allowReschedule: false,
      cancellationWindowHours: 24,
      requireManualConfirmation: false,
    },
  ];

  for (const labData of labsData) {
    const existingLab = await prisma.lab.findFirst({
      where: { name: labData.name },
      select: { id: true },
    });

    if (existingLab) {
      await prisma.lab.update({
        where: { id: existingLab.id },
        data: labData,
      });
      continue;
    }

    await prisma.lab.create({
      data: labData,
    });
  }
  console.log(`✅ ${labsData.length} lab locations created`);

  // ============================================
  // Create Demo Blood Test Orders
  // ============================================
  const questManhattan = await prisma.lab.findFirst({
    where: { name: 'Quest Diagnostics - Manhattan' },
    select: { id: true },
  });
  const labCorpBrooklyn = await prisma.lab.findFirst({
    where: { name: 'LabCorp - Brooklyn Heights' },
    select: { id: true },
  });
  const defaultLabPartner = await prisma.labPartner.findFirst({
    where: { code: 'QUEST_DIAGNOSTICS' },
    select: { id: true },
  });

  if (questManhattan && labCorpBrooklyn && defaultLabPartner) {
    const demoBookings = [
      {
        userId: johnSmith.id,
        labId: questManhattan.id,
        bookingDate: new Date('2026-02-12T12:00:00.000Z'),
        timeSlot: '1.00-2.00 PM',
        status: 'SCHEDULED',
        resultFileName: null,
        resultFileType: null,
        resultUploadedAt: null,
        resultReviewed: false,
        reviewedAt: null,
        adminNotes: null,
        bloodTestStatus: 'ORDERED' as const,
      },
      {
        userId: armandMaulani.id,
        labId: labCorpBrooklyn.id,
        bookingDate: new Date('2026-02-20T12:00:00.000Z'),
        timeSlot: '10.00-12.00 AM',
        status: 'COMPLETED',
        resultFileName: 'armand-results-feb-2026.pdf',
        resultFileType: 'application/pdf',
        resultUploadedAt: new Date('2026-02-21T09:00:00.000Z'),
        resultReviewed: false,
        reviewedAt: null,
        adminNotes: 'Upload received from provider portal.',
        bloodTestStatus: 'COMPLETED' as const,
      },
    ];

    for (const demoBooking of demoBookings) {
      let bloodTest = await prisma.bloodTest.findFirst({
        where: {
          userId: demoBooking.userId,
          sampleCollectedAt: demoBooking.bookingDate,
        },
        select: { id: true },
      });

      if (!bloodTest) {
        bloodTest = await prisma.bloodTest.create({
          data: {
            userId: demoBooking.userId,
            status: demoBooking.bloodTestStatus,
            panelType: 'comprehensive',
            biomarkersRequested: ['LDL', 'FASTING_GLUCOSE', 'CRP', 'IRON'],
            labPartnerId: defaultLabPartner.id,
            orderedAt: demoBooking.bookingDate,
            sampleCollectedAt: demoBooking.bookingDate,
            resultsReceivedAt: demoBooking.resultUploadedAt,
          },
          select: { id: true },
        });
      }

      const existingBooking = await prisma.labBooking.findFirst({
        where: {
          userId: demoBooking.userId,
          labId: demoBooking.labId,
          bookingDate: demoBooking.bookingDate,
          timeSlot: demoBooking.timeSlot,
        },
        select: { id: true },
      });

      const bookingPayload = {
        userId: demoBooking.userId,
        labId: demoBooking.labId,
        bloodTestId: bloodTest.id,
        bookingDate: demoBooking.bookingDate,
        timeSlot: demoBooking.timeSlot,
        status: demoBooking.status,
        resultFileName: demoBooking.resultFileName,
        resultFileType: demoBooking.resultFileType,
        resultUploadedAt: demoBooking.resultUploadedAt,
        resultReviewed: demoBooking.resultReviewed,
        reviewedAt: demoBooking.reviewedAt,
        adminNotes: demoBooking.adminNotes,
      };

      if (existingBooking) {
        await prisma.labBooking.update({
          where: { id: existingBooking.id },
          data: bookingPayload,
        });
      } else {
        await prisma.labBooking.create({
          data: bookingPayload,
        });
      }
    }
  }
  console.log('✅ Intermediate lab booking fixtures prepared');

  // ============================================
  // Create Intake Flow Templates
  // ============================================
  await syncSeedIntakeFlow(admin.id, {
    name: 'Basic Intake',
    legacyNames: ['Basic Intake Demo'],
    description:
      'A concise intake for new users covering goals, symptoms, lifestyle basics, blood test availability, and treatment preferences.',
    status: 'ACTIVE',
    isDefault: true,
    assignedTo: 'Basic Intake',
    scoringConfig: null,
    sections: [
      {
        title: 'Basic Information',
        description: 'Capture the core reason for the visit and the primary wellness objective.',
        order: 0,
        fields: [
          {
            fieldKey: 'visit_reason',
            label: 'What brings you here today?',
            type: 'TEXT',
            placeholder: 'Describe your main concern in a sentence or two',
            isRequired: true,
            order: 0,
          },
          {
            fieldKey: 'primary_goal',
            label: 'Primary health goal',
            type: 'RADIO',
            helperText: 'Choose the goal that best matches your visit.',
            isRequired: true,
            order: 1,
            validationRules: {
              choiceStyle: 'card-grid',
              columns: 2,
            },
            options: [
              { value: 'energy_vitality', label: 'Energy & Vitality' },
              { value: 'weight_management', label: 'Weight Management' },
              { value: 'hormone_balance', label: 'Hormone Balance' },
              { value: 'stress_resilience', label: 'Stress & Recovery' },
            ],
          },
          {
            fieldKey: 'concern_duration',
            label: 'How long has this been affecting you?',
            type: 'SELECT',
            isRequired: true,
            order: 2,
            options: [
              { value: 'under_1_month', label: 'Less than 1 month' },
              { value: '1_to_3_months', label: '1 to 3 months' },
              { value: '3_to_12_months', label: '3 to 12 months' },
              { value: 'over_1_year', label: 'More than 1 year' },
            ],
          },
        ],
      },
      {
        title: 'Symptoms & Concerns',
        description: 'Document the symptoms most relevant to the user’s current complaint.',
        order: 1,
        fields: [
          {
            fieldKey: 'top_symptoms',
            label: 'Which symptoms are most noticeable right now?',
            type: 'MULTI_SELECT',
            helperText: 'Select all that apply.',
            isRequired: false,
            order: 0,
            validationRules: {
              choiceStyle: 'card-grid',
              columns: 2,
            },
            options: [
              { value: 'fatigue', label: 'Fatigue' },
              { value: 'brain_fog', label: 'Brain Fog' },
              { value: 'poor_sleep', label: 'Poor Sleep' },
              { value: 'weight_gain', label: 'Weight Gain' },
              { value: 'low_mood', label: 'Low Mood' },
            ],
          },
          {
            fieldKey: 'energy_rating',
            label: 'Energy Level',
            helperText: 'Rate your average daily energy (1 = Constantly tired, 10 = Energised)',
            type: 'NUMBER',
            isRequired: true,
            order: 1,
            validationRules: {
              renderAs: 'slider',
              min: 1,
              max: 10,
              step: 1,
              leftLabel: 'Constantly tired (1)',
              rightLabel: 'Energised (10)',
              showValue: true,
            },
          },
          {
            fieldKey: 'appetite_pattern',
            label: 'How would you describe your appetite pattern?',
            type: 'SELECT',
            isRequired: false,
            order: 2,
            dependsOnField: 'primary_goal',
            dependsOnValue: 'weight_management',
            options: [
              { value: 'steady', label: 'Fairly steady' },
              { value: 'late_day_cravings', label: 'Cravings later in the day' },
              { value: 'irregular_meals', label: 'Irregular meals' },
              { value: 'stress_eating', label: 'Stress eating' },
            ],
          },
        ],
      },
      {
        title: 'Lifestyle Baseline',
        description:
          'Understand sleep, movement, and stress to support first-step recommendations.',
        order: 2,
        fields: [
          {
            fieldKey: 'sleep_hours',
            label: 'Average Sleep Duration (hours per night)',
            type: 'SELECT',
            isRequired: true,
            order: 0,
            options: [
              { value: '4', label: '4' },
              { value: '5', label: '5' },
              { value: '6', label: '6' },
              { value: '7', label: '7' },
              { value: '8', label: '8' },
              { value: '9', label: '9' },
              { value: '10', label: '10' },
            ],
          },
          {
            fieldKey: 'sleep_quality',
            label: 'Sleep Quality',
            helperText: 'Rate your overall sleep quality (1 = Very poor, 10 = Excellent)',
            type: 'NUMBER',
            isRequired: true,
            order: 1,
            validationRules: {
              renderAs: 'slider',
              min: 1,
              max: 10,
              step: 1,
              leftLabel: 'Very poor (1)',
              rightLabel: 'Excellent (10)',
              showValue: true,
            },
          },
          {
            fieldKey: 'exercise_frequency',
            label: 'Exercise Frequency',
            type: 'RADIO',
            isRequired: true,
            order: 2,
            validationRules: {
              choiceStyle: 'card-grid',
              columns: 3,
            },
            options: [
              { value: 'sedentary', label: 'Sedentary (No exercise)' },
              { value: '1_2_times', label: '1-2 times per week' },
              { value: '3_4_times', label: '3-4 times per week' },
              { value: '5_plus_times', label: '5+ times per week' },
              { value: 'daily', label: 'Daily' },
            ],
          },
          {
            fieldKey: 'stress_level',
            label: 'Stress Level',
            helperText: 'Rate your typical stress level (1 = Very relaxed, 10 = Highly stressed)',
            type: 'NUMBER',
            isRequired: true,
            order: 3,
            validationRules: {
              renderAs: 'slider',
              min: 1,
              max: 10,
              step: 1,
              leftLabel: 'Very relaxed (1)',
              rightLabel: 'Highly stressed (10)',
              showValue: true,
            },
          },
        ],
      },
      {
        title: 'Blood Test & Health Data',
        description:
          'Let users upload recent results or branch into blood-test ordering from the basic intake.',
        order: 3,
        isOptional: true,
        fields: [
          {
            fieldKey: 'basic_blood_test',
            label: 'Blood test & health data',
            type: 'BLOOD_TEST',
            helperText:
              'Upload recent blood test results for more accurate recommendations, or choose to order a test later.',
            isRequired: false,
            order: 0,
          },
        ],
      },
      {
        title: 'Treatment Preferences',
        description: 'Capture readiness and preferences for the next stage of care.',
        order: 4,
        isOptional: true,
        fields: [
          {
            fieldKey: 'care_approach',
            label: 'Preferred care approach',
            type: 'RADIO',
            isRequired: true,
            order: 0,
            options: [
              { value: 'lifestyle_first', label: 'Lifestyle-first plan' },
              { value: 'supplement_support', label: 'Supplements if appropriate' },
              { value: 'open_to_clinical', label: 'Open to clinical treatment' },
            ],
          },
          {
            fieldKey: 'open_to_lab_testing',
            label: 'Are you open to lab testing if needed?',
            type: 'RADIO',
            isRequired: true,
            order: 1,
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
          },
        ],
      },
    ],
  });

  await syncSeedIntakeFlow(admin.id, {
    name: 'Comprehensive Medical Intake',
    legacyNames: ['Comprehensive Medical Intake Demo'],
    description:
      'A broader medical intake for structured symptom review and weighted health-domain scoring.',
    status: 'ACTIVE',
    isDefault: false,
    assignedTo: 'Comprehensive Medical Intake',
    scoringConfig: {
      domains: [
        { id: 'metabolic', name: 'Metabolic', weight: 1, enabled: true },
        { id: 'hormonal', name: 'Hormonal', weight: 1, enabled: true },
        { id: 'cardiovascular', name: 'Cardiovascular', weight: 1, enabled: true },
      ],
      riskBuckets: [
        {
          id: 'low',
          minScore: 0,
          maxScore: 5,
          label: 'Low',
          color: '#10b981',
          description: 'Minimal health concerns',
        },
        {
          id: 'moderate',
          minScore: 6,
          maxScore: 15,
          label: 'Moderate',
          color: '#f59e0b',
          description: 'Monitor and follow up on key findings',
        },
        {
          id: 'high',
          minScore: 16,
          maxScore: 100,
          label: 'High',
          color: '#ef4444',
          description: 'Significant health concerns needing prompt review',
        },
      ],
    },
    sections: [
      {
        title: 'Chief Concerns',
        description: 'Start with the primary health focus and dominant symptoms.',
        order: 0,
        fields: [
          {
            fieldKey: 'care_focus',
            label: 'Which area is your main focus right now?',
            type: 'RADIO',
            isRequired: true,
            order: 0,
            options: [
              { value: 'metabolic', label: 'Metabolic health' },
              { value: 'hormonal', label: 'Hormonal balance' },
              { value: 'cardiovascular', label: 'Cardiovascular health' },
              { value: 'general', label: 'General wellness' },
            ],
          },
          {
            fieldKey: 'dominant_symptoms',
            label: 'Which symptoms are affecting daily life most?',
            type: 'MULTI_SELECT',
            isRequired: false,
            order: 1,
            options: [
              { value: 'fatigue', label: 'Fatigue' },
              { value: 'cravings', label: 'Sugar or carb cravings' },
              { value: 'poor_recovery', label: 'Poor recovery after exercise' },
              { value: 'palpitations', label: 'Palpitations' },
              { value: 'poor_focus', label: 'Poor focus' },
            ],
          },
          {
            fieldKey: 'metabolic_trigger_pattern',
            label: 'Which pattern fits your metabolic concern best?',
            type: 'SELECT',
            isRequired: false,
            order: 2,
            dependsOnField: 'care_focus',
            dependsOnValue: 'metabolic',
            options: [
              { value: 'late_day_hunger', label: 'Late-day hunger or cravings' },
              { value: 'energy_crash', label: 'Energy crash after meals' },
              { value: 'weight_plateau', label: 'Weight plateau despite effort' },
            ],
          },
          {
            fieldKey: 'hormonal_pattern',
            label: 'Which hormonal pattern sounds most familiar?',
            type: 'SELECT',
            isRequired: false,
            order: 3,
            dependsOnField: 'care_focus',
            dependsOnValue: 'hormonal',
            options: [
              { value: 'low_libido', label: 'Low libido or low drive' },
              { value: 'cycle_irregularity', label: 'Cycle irregularity or PMS changes' },
              { value: 'sleep_recovery', label: 'Poor sleep and recovery' },
            ],
          },
          {
            fieldKey: 'cardio_pattern',
            label: 'What is most concerning about cardiovascular health?',
            type: 'SELECT',
            isRequired: false,
            order: 4,
            dependsOnField: 'care_focus',
            dependsOnValue: 'cardiovascular',
            options: [
              { value: 'family_history', label: 'Family history' },
              { value: 'bp_trend', label: 'Blood pressure trend' },
              { value: 'cholesterol_concern', label: 'Cholesterol concern' },
            ],
          },
        ],
      },
      {
        title: 'Metabolic Review',
        description: 'Screen meal patterns, cravings, body-composition trends, and family history.',
        order: 1,
        fields: [
          {
            fieldKey: 'meal_structure',
            label: 'How structured are your meals on most weekdays?',
            type: 'SELECT',
            isRequired: true,
            order: 0,
            options: [
              { value: 'regular', label: 'Regular meal times' },
              { value: 'somewhat_irregular', label: 'Somewhat irregular' },
              { value: 'very_irregular', label: 'Very irregular' },
            ],
          },
          {
            fieldKey: 'waist_change',
            label: 'Have you noticed an increase in waist size over the last 6 months?',
            type: 'RADIO',
            isRequired: false,
            order: 1,
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
              { value: 'unsure', label: 'Unsure' },
            ],
          },
          {
            fieldKey: 'family_metabolic_history',
            label: 'Family history relevant to metabolic health',
            type: 'MULTI_SELECT',
            isRequired: false,
            order: 2,
            options: [
              { value: 'type_2_diabetes', label: 'Type 2 diabetes' },
              { value: 'high_cholesterol', label: 'High cholesterol' },
              { value: 'obesity', label: 'Obesity' },
              { value: 'none', label: 'None known' },
            ],
          },
        ],
      },
      {
        title: 'Hormonal & Recovery',
        description:
          'Assess recovery, sleep quality, and symptom patterns that may reflect hormone imbalance.',
        order: 2,
        fields: [
          {
            fieldKey: 'sleep_quality',
            label: 'How restorative is your sleep?',
            type: 'RADIO',
            isRequired: true,
            order: 0,
            options: [
              { value: 'poor', label: 'Poor' },
              { value: 'fair', label: 'Fair' },
              { value: 'good', label: 'Good' },
            ],
          },
          {
            fieldKey: 'afternoon_crash',
            label: 'Do you experience an afternoon energy crash?',
            type: 'RADIO',
            isRequired: false,
            order: 1,
            options: [
              { value: 'often', label: 'Often' },
              { value: 'sometimes', label: 'Sometimes' },
              { value: 'rarely', label: 'Rarely' },
            ],
          },
          {
            fieldKey: 'stress_recovery',
            label: 'How quickly do you recover from stress or intense weeks?',
            type: 'SELECT',
            isRequired: false,
            order: 2,
            options: [
              { value: 'quickly', label: 'Quickly' },
              { value: 'moderately', label: 'Moderately' },
              { value: 'slowly', label: 'Slowly' },
            ],
          },
        ],
      },
      {
        title: 'Cardiovascular & Habits',
        description: 'Review blood pressure history, movement, and smoking exposure.',
        order: 3,
        fields: [
          {
            fieldKey: 'known_blood_pressure',
            label: 'Do you know your usual blood pressure range?',
            type: 'SELECT',
            isRequired: false,
            order: 0,
            options: [
              { value: 'normal', label: 'Usually normal' },
              { value: 'borderline', label: 'Borderline elevated' },
              { value: 'high', label: 'Usually high' },
              { value: 'unknown', label: 'I do not know' },
            ],
          },
          {
            fieldKey: 'weekly_cardio',
            label: 'Cardio or brisk activity sessions per week',
            type: 'SELECT',
            isRequired: true,
            order: 1,
            options: [
              { value: '0', label: '0' },
              { value: '1_2', label: '1 to 2' },
              { value: '3_4', label: '3 to 4' },
              { value: '5_plus', label: '5+' },
            ],
          },
          {
            fieldKey: 'smoking_status',
            label: 'Smoking status',
            type: 'RADIO',
            isRequired: true,
            order: 2,
            options: [
              { value: 'never', label: 'Never' },
              { value: 'former', label: 'Former smoker' },
              { value: 'current', label: 'Current smoker' },
            ],
          },
        ],
      },
    ],
  });

  await syncSeedIntakeFlow(admin.id, {
    name: 'Blood-Enhanced Intake',
    legacyNames: ['Blood-Enhanced Intake Demo'],
    description:
      'A lab-informed intake that combines symptom review, blood marker scoring, care rules, and output mapping.',
    status: 'ACTIVE',
    isDefault: false,
    assignedTo: 'Blood-Enhanced Intake',
    scoringConfig: {
      domains: [
        { id: 'metabolic', name: 'Metabolic', weight: 1, enabled: true },
        { id: 'hormonal', name: 'Hormonal', weight: 1, enabled: true },
        { id: 'cardiovascular', name: 'Cardiovascular', weight: 1, enabled: true },
      ],
      riskBuckets: [
        {
          id: 'low',
          minScore: 0,
          maxScore: 5,
          label: 'Low',
          color: '#10b981',
          description: 'Minimal health concerns',
        },
        {
          id: 'moderate',
          minScore: 6,
          maxScore: 15,
          label: 'Moderate',
          color: '#f59e0b',
          description: 'Some findings need follow-up',
        },
        {
          id: 'high',
          minScore: 16,
          maxScore: 100,
          label: 'High',
          color: '#ef4444',
          description: 'Prompt review recommended',
        },
      ],
      bloodMarkerRules: [
        {
          id: 'blood_marker_hba1c',
          marker: 'HbA1c',
          operator: '>',
          value: 6.5,
          actionType: 'ADD',
          scoreModifier: 6,
          targetDomainId: 'metabolic',
        },
        {
          id: 'blood_marker_ldl',
          marker: 'LDL-C',
          operator: '>',
          value: 160,
          actionType: 'ADD',
          scoreModifier: 5,
          targetDomainId: 'cardiovascular',
        },
        {
          id: 'blood_marker_tsh',
          marker: 'TSH',
          operator: '>',
          value: 4.2,
          actionType: 'ADD',
          scoreModifier: 4,
          targetDomainId: 'hormonal',
        },
      ],
      rules: [
        {
          id: 'rule_high_risk_metabolic',
          name: 'Rule 1',
          conditionOperator: 'AND',
          actionOperator: 'AND',
          conditions: [
            { id: 'condition_tag_metabolic', type: 'TAG_EXISTS', value: 'high-risk-metabolic' },
          ],
          actions: [
            {
              id: 'action_include_diabetes',
              type: 'INCLUDE_PATHWAY',
              value: 'Diabetes Management',
            },
          ],
        },
        {
          id: 'rule_high_risk_cardio',
          name: 'Rule 2',
          conditionOperator: 'AND',
          actionOperator: 'AND',
          conditions: [{ id: 'condition_risk_high', type: 'RISK_LEVEL', value: 'high' }],
          actions: [
            { id: 'action_add_tag', type: 'ADD_TAG', value: 'needs-clinical-review' },
            {
              id: 'action_include_cardio',
              type: 'INCLUDE_PATHWAY',
              value: 'Cardiometabolic Review',
            },
          ],
        },
      ],
      outputMapping: {
        recommendationPriority: [
          { id: 'priority_lifestyle', label: 'Lifestyle Advice', order: 0 },
          { id: 'priority_supplements', label: 'Supplement Suggestion', order: 1 },
          { id: 'priority_clinical', label: 'Clinical Treatment', order: 2 },
          { id: 'priority_retest', label: 'Blood Retest', order: 3 },
        ],
        riskHeadlineMappings: [
          {
            id: 'headline_low',
            riskBucketId: 'low',
            headline: 'Your current markers are in a reassuring range',
            summary: 'Maintain the daily habits that are supporting these results.',
          },
          {
            id: 'headline_moderate',
            riskBucketId: 'moderate',
            headline: 'A few markers deserve closer attention',
            summary: 'A targeted plan can usually improve these trends over the next review cycle.',
          },
          {
            id: 'headline_high',
            riskBucketId: 'high',
            headline: 'Several markers need timely follow-up',
            summary: 'Clinical review and a structured care pathway are recommended.',
          },
        ],
        tagSignalMappings: [
          {
            id: 'tag_signal_metabolic',
            tag: 'high-risk-metabolic',
            insightParagraph:
              'Your glucose-regulation markers suggest that insulin resistance or sustained glycaemic load may be contributing to symptoms.',
          },
          {
            id: 'tag_signal_hormonal',
            tag: 'hormonal-strain',
            insightParagraph:
              'Hormonal markers suggest recovery, thyroid, or stress-axis support should be prioritized in the next plan.',
          },
        ],
      },
    },
    sections: [
      {
        title: 'Blood Test Context',
        description: 'Understand what lab data is available and how current it is.',
        order: 0,
        fields: [
          {
            fieldKey: 'recent_labs_available',
            label: 'Do you have blood test results from the last 6 months?',
            type: 'RADIO',
            isRequired: true,
            order: 0,
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
          },
          {
            fieldKey: 'lab_source',
            label: 'Where were those labs completed?',
            type: 'SELECT',
            isRequired: false,
            order: 1,
            dependsOnField: 'recent_labs_available',
            dependsOnValue: 'yes',
            options: [
              { value: 'gp_or_primary_care', label: 'GP / primary care' },
              { value: 'private_lab', label: 'Private lab' },
              { value: 'at_home_kit', label: 'At-home kit' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            fieldKey: 'last_lab_timing',
            label: 'When was your most recent blood draw?',
            type: 'SELECT',
            isRequired: true,
            order: 2,
            options: [
              { value: 'under_1_month', label: 'Within the last month' },
              { value: '1_to_3_months', label: '1 to 3 months ago' },
              { value: '3_to_6_months', label: '3 to 6 months ago' },
              { value: 'over_6_months', label: 'More than 6 months ago' },
            ],
          },
        ],
      },
      {
        title: 'Marker Entry & Symptoms',
        description: 'Combine key marker knowledge with the symptom picture.',
        order: 1,
        fields: [
          {
            fieldKey: 'known_marker_concerns',
            label: 'Which markers have previously been flagged?',
            type: 'MULTI_SELECT',
            isRequired: false,
            order: 0,
            options: [
              { value: 'hba1c', label: 'HbA1c / glucose markers' },
              { value: 'ldl', label: 'LDL or cholesterol markers' },
              { value: 'tsh', label: 'TSH / thyroid markers' },
              { value: 'crp', label: 'CRP / inflammation markers' },
              { value: 'none', label: 'None known' },
            ],
          },
          {
            fieldKey: 'fatigue_pattern',
            label: 'When is fatigue most noticeable?',
            type: 'SELECT',
            isRequired: false,
            order: 1,
            options: [
              { value: 'morning', label: 'Mostly in the morning' },
              { value: 'afternoon', label: 'Mostly in the afternoon' },
              { value: 'all_day', label: 'All day' },
              { value: 'not_a_major_issue', label: 'Not a major issue' },
            ],
          },
          {
            fieldKey: 'known_hba1c',
            label: 'Do you know your last HbA1c result?',
            type: 'RADIO',
            isRequired: false,
            order: 2,
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
          },
          {
            fieldKey: 'hba1c_value',
            label: 'Last HbA1c value',
            type: 'NUMBER',
            placeholder: 'e.g. 5.8',
            isRequired: false,
            order: 3,
            dependsOnField: 'known_hba1c',
            dependsOnValue: 'yes',
            validationRules: { min: 3, max: 15 },
          },
        ],
      },
      {
        title: 'Clinical Context',
        description: 'Add context that can shape interpretation and pathway rules.',
        order: 2,
        fields: [
          {
            fieldKey: 'family_history',
            label: 'Relevant family history',
            type: 'MULTI_SELECT',
            isRequired: false,
            order: 0,
            options: [
              { value: 'diabetes', label: 'Diabetes' },
              { value: 'cardiovascular_disease', label: 'Cardiovascular disease' },
              { value: 'thyroid_disease', label: 'Thyroid disease' },
              { value: 'none_known', label: 'None known' },
            ],
          },
          {
            fieldKey: 'current_medications',
            label: 'Current medications or supplements',
            type: 'TEXTAREA',
            placeholder:
              'List anything relevant to glucose, thyroid, blood pressure, or cholesterol',
            isRequired: false,
            order: 1,
          },
          {
            fieldKey: 'care_priority',
            label: 'Which outcome matters most after reviewing your labs?',
            type: 'RADIO',
            isRequired: true,
            order: 2,
            options: [
              { value: 'reduce_risk', label: 'Reduce long-term risk' },
              { value: 'improve_energy', label: 'Improve day-to-day energy' },
              { value: 'weight_and_metabolic', label: 'Support weight and metabolic health' },
              { value: 'clarify_next_steps', label: 'Get clear next steps' },
            ],
          },
        ],
      },
      {
        title: 'Recommendation Preferences',
        description: 'Capture follow-up preferences for pathway and report generation.',
        order: 3,
        isOptional: true,
        fields: [
          {
            fieldKey: 'followup_preference',
            label: 'Preferred next step if follow-up is advised',
            type: 'RADIO',
            isRequired: false,
            order: 0,
            options: [
              { value: 'digital_plan', label: 'Digital care plan' },
              { value: 'provider_visit', label: 'Provider consultation' },
              { value: 'retest_first', label: 'Repeat labs first' },
            ],
          },
          {
            fieldKey: 'repeat_labs_willingness',
            label: 'Willingness to repeat labs in the next 8 to 12 weeks',
            type: 'RADIO',
            isRequired: false,
            order: 1,
            options: [
              { value: 'very_open', label: 'Very open' },
              { value: 'maybe', label: 'Maybe' },
              { value: 'not_now', label: 'Not right now' },
            ],
          },
        ],
      },
    ],
  });

  // ============================================
  // Seed Settings, Provider Ops, and Catalog Relations
  // ============================================
  await upsertPlatformSetting(
    'system',
    toJsonValue({
      matchingRulesEnabled: true,
      bloodTestAllowUpload: true,
      bloodTestAllowOrder: true,
    }),
    'System configuration and feature flags'
  );

  await upsertPlatformSetting(
    'landing_page',
    toJsonValue({
      beforeLogin: {
        hero: {
          headline: 'Personalised health guidance, matched to your goals and your data',
          subtext:
            'Start with a guided intake or connect blood work to receive structured next steps, treatment pathways, and supplement support.',
        },
        guidedHealthCheck: {
          title: 'Start Guided Health Check',
          description:
            'Answer a concise health intake to surface likely focus areas, practical next steps, and provider pathways.',
          ctaButtonLabel: 'Begin Intake',
          showRecommendedBadge: true,
        },
        fullBloodTest: {
          title: 'Blood Test Analysis',
          description:
            'Upload existing blood work or book through HealthPilot to combine lab data with symptoms and goals.',
          ctaButtonLabel: 'Analyze Blood Test',
          showRecommendedBadge: true,
        },
        infoBanner: {
          enabled: true,
          description: 'You can start now and add blood tests later if needed.',
        },
        trustHighlights: [
          {
            icon: 'medical',
            title: 'Education, not diagnosis',
            description:
              'Insights are supportive and should be reviewed with a clinician when needed.',
          },
          {
            icon: 'encrypted',
            title: 'Encrypted by default',
            description: 'Health records and AI summaries are stored using encrypted fields.',
          },
          {
            icon: 'payment',
            title: 'Free to start',
            description: 'Users can complete the intake before deciding on any follow-up services.',
          },
        ],
      },
      afterLogin: {
        hero: {
          headline: 'Continue from where your health journey left off',
          subtext:
            'Review prior recommendations, upload fresh labs, or start a new intake to refresh your care pathway.',
        },
        guidedHealthCheck: {
          title: 'Start New Intake',
          description:
            'Capture updated symptoms, goals, and lifestyle data to refresh your health summary.',
          ctaButtonLabel: 'Start New Intake',
          showRecommendedBadge: true,
        },
        fullBloodTest: {
          title: 'Upload or Order Blood Tests',
          description:
            'Bring in recent blood work or schedule a new draw to enrich your recommendation quality.',
          ctaButtonLabel: 'Manage Blood Tests',
          showRecommendedBadge: true,
        },
        infoBanner: {
          enabled: true,
          description:
            'Returning users can continue existing journeys or start a fresh intake anytime.',
        },
        trustHighlights: [
          {
            icon: 'medical',
            title: 'Care pathways stay explainable',
            description: 'Recommendations show why a treatment or supplement was suggested.',
          },
          {
            icon: 'encrypted',
            title: 'Your data stays private',
            description: 'Sensitive records are encrypted before being stored or shared.',
          },
          {
            icon: 'payment',
            title: 'Choose follow-up on your terms',
            description:
              'Only proceed to labs, supplements, or providers when it makes sense for you.',
          },
        ],
      },
    }),
    'Landing page content and configuration'
  );

  await upsertPlatformSetting(
    'legal',
    toJsonValue({
      disclaimer:
        'HealthPilot provides educational guidance and care navigation only. It does not provide emergency care or replace licensed medical advice.',
      privacyPolicyVersion: '2026.03',
      termsVersion: '2026.03',
      hipaaNoticeEnabled: true,
    }),
    'Legal copy and policy metadata'
  );

  await prisma.userPreference.upsert({
    where: { userId: testUser.id },
    update: {
      riskTolerance: 'medium',
      budgetSensitivity: 'medium',
      preferSubscription: false,
      deliveryPreference: 'home',
      communicationChannel: 'email',
      marketingConsent: true,
      dataResearchConsent: true,
    },
    create: {
      userId: testUser.id,
      riskTolerance: 'medium',
      budgetSensitivity: 'medium',
      preferSubscription: false,
      deliveryPreference: 'home',
      communicationChannel: 'email',
      marketingConsent: true,
      dataResearchConsent: true,
    },
  });

  await prisma.userPreference.upsert({
    where: { userId: johnSmith.id },
    update: {
      riskTolerance: 'low',
      budgetSensitivity: 'low',
      preferSubscription: true,
      deliveryPreference: 'clinic',
      communicationChannel: 'email',
      marketingConsent: false,
      dataResearchConsent: true,
    },
    create: {
      userId: johnSmith.id,
      riskTolerance: 'low',
      budgetSensitivity: 'low',
      preferSubscription: true,
      deliveryPreference: 'clinic',
      communicationChannel: 'email',
      marketingConsent: false,
      dataResearchConsent: true,
    },
  });

  await prisma.userPreference.upsert({
    where: { userId: armandMaulani.id },
    update: {
      riskTolerance: 'medium',
      budgetSensitivity: 'high',
      preferSubscription: true,
      deliveryPreference: 'home',
      communicationChannel: 'email',
      marketingConsent: true,
      dataResearchConsent: true,
    },
    create: {
      userId: armandMaulani.id,
      riskTolerance: 'medium',
      budgetSensitivity: 'high',
      preferSubscription: true,
      deliveryPreference: 'home',
      communicationChannel: 'email',
      marketingConsent: true,
      dataResearchConsent: true,
    },
  });

  await prisma.userPreference.upsert({
    where: { userId: sarahChen.id },
    update: {
      riskTolerance: 'low',
      budgetSensitivity: 'medium',
      preferSubscription: false,
      deliveryPreference: 'pharmacy',
      communicationChannel: 'email',
      marketingConsent: false,
      dataResearchConsent: true,
    },
    create: {
      userId: sarahChen.id,
      riskTolerance: 'low',
      budgetSensitivity: 'medium',
      preferSubscription: false,
      deliveryPreference: 'pharmacy',
      communicationChannel: 'email',
      marketingConsent: false,
      dataResearchConsent: true,
    },
  });

  const providersBySlug = Object.fromEntries(
    (
      await prisma.provider.findMany({
        where: { slug: { in: ['optimale', 'numan', 'manual'] } },
        select: { id: true, slug: true, name: true },
      })
    ).map((provider) => [provider.slug, provider])
  );

  const treatmentsBySlug = Object.fromEntries(
    (
      await prisma.treatment.findMany({
        where: {
          slug: {
            in: [
              'optimale-trt',
              'optimale-hormone-optimization',
              'numan-weight-loss',
              'numan-hair-loss',
              'numan-ed',
              'manual-sleep-optimization',
              'manual-longevity-foundations',
            ],
          },
        },
        select: { id: true, slug: true, providerId: true, category: true, name: true },
      })
    ).map((treatment) => [treatment.slug, treatment])
  );

  const biomarkersByCode = Object.fromEntries(
    (
      await prisma.biomarker.findMany({
        where: {
          code: {
            in: [
              'TESTOSTERONE_TOTAL',
              'FREE_T4',
              'TSH',
              'HBA1C',
              'FASTING_GLUCOSE',
              'LDL',
              'HDL',
              'CRP',
              'IRON',
              'VIT_D',
              'VITAMIN_D',
            ],
          },
        },
        select: { id: true, code: true },
      })
    ).map((biomarker) => [biomarker.code, biomarker])
  );

  await syncTreatmentProviders(treatmentsBySlug['optimale-trt'].id, [
    { providerId: providersBySlug.optimale.id, isPrimary: true },
  ]);
  await syncTreatmentProviders(treatmentsBySlug['optimale-hormone-optimization'].id, [
    { providerId: providersBySlug.optimale.id, isPrimary: true },
  ]);
  await syncTreatmentProviders(treatmentsBySlug['numan-weight-loss'].id, [
    { providerId: providersBySlug.numan.id, isPrimary: true },
  ]);
  await syncTreatmentProviders(treatmentsBySlug['numan-hair-loss'].id, [
    { providerId: providersBySlug.numan.id, isPrimary: true },
  ]);
  await syncTreatmentProviders(treatmentsBySlug['numan-ed'].id, [
    { providerId: providersBySlug.numan.id, isPrimary: true },
  ]);
  await syncTreatmentProviders(treatmentsBySlug['manual-sleep-optimization'].id, [
    { providerId: providersBySlug.manual.id, isPrimary: true },
  ]);
  await syncTreatmentProviders(treatmentsBySlug['manual-longevity-foundations'].id, [
    { providerId: providersBySlug.manual.id, isPrimary: true },
  ]);

  await syncTreatmentBiomarkerRequirements(treatmentsBySlug['optimale-trt'].id, [
    {
      biomarkerId: biomarkersByCode.TESTOSTERONE_TOTAL.id,
      isRequired: true,
      minValue: 0,
      maxValue: 12,
    },
    {
      biomarkerId: biomarkersByCode.TSH.id,
      isRequired: false,
      minValue: 0.2,
      maxValue: 5,
    },
  ]);
  await syncTreatmentBiomarkerRequirements(treatmentsBySlug['manual-longevity-foundations'].id, [
    {
      biomarkerId: biomarkersByCode.VITAMIN_D.id,
      isRequired: false,
      minValue: 50,
      maxValue: 180,
    },
    {
      biomarkerId: biomarkersByCode.CRP.id,
      isRequired: false,
      minValue: 0,
      maxValue: 3,
    },
  ]);
  await syncTreatmentBiomarkerRequirements(treatmentsBySlug['numan-weight-loss'].id, [
    {
      biomarkerId: biomarkersByCode.HBA1C.id,
      isRequired: false,
      minValue: 0,
      maxValue: 7,
    },
    {
      biomarkerId: biomarkersByCode.FASTING_GLUCOSE.id,
      isRequired: false,
      minValue: 0,
      maxValue: 110,
    },
  ]);
  await syncTreatmentBiomarkerRequirements(treatmentsBySlug['manual-sleep-optimization'].id, [
    {
      biomarkerId: biomarkersByCode.TSH.id,
      isRequired: false,
      minValue: 0.2,
      maxValue: 5,
    },
    {
      biomarkerId: biomarkersByCode.IRON.id,
      isRequired: false,
      minValue: 40,
      maxValue: 175,
    },
  ]);

  await syncTreatmentContraindications(treatmentsBySlug['optimale-trt'].id, [
    {
      condition: 'prostate_cancer_history',
      severity: 'absolute',
      description: 'Requires specialist review before TRT can be considered.',
    },
    {
      condition: 'untreated_sleep_apnea',
      severity: 'relative',
      description: 'Sleep apnea should be addressed before or alongside treatment.',
    },
  ]);
  await syncTreatmentContraindications(treatmentsBySlug['numan-weight-loss'].id, [
    {
      condition: 'pregnancy',
      severity: 'absolute',
      description: 'Weight-loss medications should not be started during pregnancy.',
    },
    {
      condition: 'history_of_pancreatitis',
      severity: 'relative',
      description: 'Requires additional review before GLP-1-style treatment.',
    },
  ]);
  await syncTreatmentContraindications(treatmentsBySlug['manual-sleep-optimization'].id, [
    {
      condition: 'untreated_severe_depression',
      severity: 'relative',
      description:
        'Requires closer clinician review when sleep issues are part of a wider mental-health picture.',
    },
  ]);

  await syncMatchingRules(treatmentsBySlug['optimale-trt'].id, [
    {
      name: 'Low testosterone blood marker',
      description: 'Supports TRT when testosterone is below the desired range.',
      field: 'blood.TESTOSTERONE_TOTAL',
      operator: MatchingRuleOperator.LESS_THAN,
      value: '12',
      weight: 0.7,
      isRequired: false,
      priority: 10,
      triggerSource: 'Both',
      evaluationTiming: 'Immediate',
      providerCapabilities: ['TRT', 'Hormone review'],
      confidence: 'High',
      explanation: 'Low testosterone strengthens relevance for TRT review.',
    },
    {
      name: 'Low libido symptom cluster',
      description: 'Matches users reporting low libido or poor recovery.',
      field: 'intake.symptoms.0.name',
      operator: MatchingRuleOperator.CONTAINS,
      value: 'libido',
      weight: 0.3,
      priority: 5,
      triggerSource: 'Guided intake',
      evaluationTiming: 'Deferred',
      confidence: 'Medium',
    },
  ]);

  await syncMatchingRules(treatmentsBySlug['numan-weight-loss'].id, [
    {
      name: 'Metabolic goal alignment',
      description: 'Prioritize weight-management pathways for metabolic goals.',
      field: 'intake.goals.0.category',
      operator: MatchingRuleOperator.CONTAINS,
      value: 'weight_management',
      weight: 0.6,
      isRequired: false,
      priority: 9,
      triggerSource: 'Guided intake',
      evaluationTiming: 'Immediate',
      providerCapabilities: ['Weight management', 'GLP-1 review'],
      confidence: 'High',
    },
    {
      name: 'Elevated HbA1c signal',
      description: 'Higher glycaemic markers increase relevance for metabolic intervention.',
      field: 'blood.HBA1C',
      operator: MatchingRuleOperator.GREATER_THAN_OR_EQUALS,
      value: '5.7',
      weight: 0.4,
      priority: 7,
      triggerSource: 'Blood test',
      evaluationTiming: 'Immediate',
      confidence: 'Medium',
    },
  ]);

  await syncMatchingRules(treatmentsBySlug['manual-sleep-optimization'].id, [
    {
      name: 'Sleep concern match',
      description: 'Users with poor sleep quality are strong matches for sleep optimization.',
      field: 'intake.lifestyle.sleepHours',
      operator: MatchingRuleOperator.LESS_THAN,
      value: '7',
      weight: 0.7,
      priority: 8,
      triggerSource: 'Guided intake',
      evaluationTiming: 'Immediate',
      providerCapabilities: ['Sleep coaching'],
      confidence: 'High',
    },
    {
      name: 'Stress and recovery need',
      description: 'High stress increases the relevance of a recovery-focused plan.',
      field: 'intake.lifestyle.stressLevel',
      operator: MatchingRuleOperator.EQUALS,
      value: 'high',
      weight: 0.3,
      priority: 6,
      triggerSource: 'Guided intake',
      evaluationTiming: 'Immediate',
      confidence: 'Medium',
    },
  ]);

  await prisma.providerAdmin.upsert({
    where: { email: 'ops@optimale.co.uk' },
    update: {
      providerId: providersBySlug.optimale.id,
      name: 'Optimale Operations',
      isActive: true,
    },
    create: {
      providerId: providersBySlug.optimale.id,
      email: 'ops@optimale.co.uk',
      name: 'Optimale Operations',
      isActive: true,
    },
  });

  await prisma.providerAdmin.upsert({
    where: { email: 'ops@numan.com' },
    update: {
      providerId: providersBySlug.numan.id,
      name: 'Numan Care Ops',
      isActive: true,
    },
    create: {
      providerId: providersBySlug.numan.id,
      email: 'ops@numan.com',
      name: 'Numan Care Ops',
      isActive: true,
    },
  });

  await prisma.providerAdmin.upsert({
    where: { email: 'ops@manual.co' },
    update: {
      providerId: providersBySlug.manual.id,
      name: 'Manual Clinical Ops',
      isActive: true,
    },
    create: {
      providerId: providersBySlug.manual.id,
      email: 'ops@manual.co',
      name: 'Manual Clinical Ops',
      isActive: true,
    },
  });

  await prisma.providerInvite.upsert({
    where: { token: 'seed-optimale-provider-invite' },
    update: {
      email: 'ops@optimale.co.uk',
      expiresAt: daysFromDemoNow(30),
      usedAt: daysFromDemoNow(-45),
      createdById: admin.id,
      isReusable: false,
      notes: 'Seeded invite for Optimale demo onboarding',
      providerId: providersBySlug.optimale.id,
    },
    create: {
      email: 'ops@optimale.co.uk',
      token: 'seed-optimale-provider-invite',
      expiresAt: daysFromDemoNow(30),
      usedAt: daysFromDemoNow(-45),
      createdById: admin.id,
      isReusable: false,
      notes: 'Seeded invite for Optimale demo onboarding',
      providerId: providersBySlug.optimale.id,
    },
  });

  await prisma.providerInvite.upsert({
    where: { token: 'seed-manual-provider-invite' },
    update: {
      email: 'partnerships@manual.co',
      expiresAt: daysFromDemoNow(21),
      usedAt: null,
      createdById: admin.id,
      isReusable: true,
      notes: 'Reusable demo invite for provider onboarding.',
      providerId: providersBySlug.manual.id,
    },
    create: {
      email: 'partnerships@manual.co',
      token: 'seed-manual-provider-invite',
      expiresAt: daysFromDemoNow(21),
      usedAt: null,
      createdById: admin.id,
      isReusable: true,
      notes: 'Reusable demo invite for provider onboarding.',
      providerId: providersBySlug.manual.id,
    },
  });

  const providerWebhooks = [
    {
      providerId: providersBySlug.optimale.id,
      eventType: 'handoff',
      url: 'https://optimale.co.uk/api/webhooks/healthpilot/handoff',
      secret: 'optimale-seed-handoff-secret',
    },
    {
      providerId: providersBySlug.numan.id,
      eventType: 'status_update',
      url: 'https://numan.com/api/webhooks/healthpilot/status',
      secret: 'numan-seed-status-secret',
    },
    {
      providerId: providersBySlug.manual.id,
      eventType: 'result',
      url: 'https://manual.co/api/webhooks/healthpilot/results',
      secret: 'manual-seed-result-secret',
    },
  ];

  for (const webhook of providerWebhooks) {
    await prisma.providerWebhook.upsert({
      where: {
        providerId_eventType: {
          providerId: webhook.providerId,
          eventType: webhook.eventType,
        },
      },
      update: {
        url: webhook.url,
        secret: webhook.secret,
        headers: toJsonValue({ 'X-HealthPilot-Source': 'seed' }),
        isActive: true,
        retryCount: 3,
        timeoutMs: 30000,
        failureCount: 0,
      },
      create: {
        providerId: webhook.providerId,
        eventType: webhook.eventType,
        url: webhook.url,
        secret: webhook.secret,
        headers: toJsonValue({ 'X-HealthPilot-Source': 'seed' }),
        isActive: true,
        retryCount: 3,
        timeoutMs: 30000,
        failureCount: 0,
      },
    });
  }

  const supplements = [
    {
      name: 'Vitamin D3 + K2',
      slug: 'vitamin-d3-k2',
      description: 'Daily vitamin D support for low sun exposure, recovery, and immune resilience.',
      category: SupplementCategory.VITAMIN,
      evidenceLevel: 'strong',
      primaryBenefits: ['Vitamin D repletion', 'Bone support', 'Immune support'],
      recommendedDosage: '2000',
      dosageUnit: 'IU',
      frequency: 'daily',
      targetSymptoms: ['fatigue', 'poor_recovery', 'low_mood'],
      targetGoals: ['energy_vitality', 'longevity', 'general_wellness'],
      targetBiomarkers: ['VITAMIN_D', 'VIT_D'],
      minAge: 18,
      maxAge: 80,
      allowedGenders: ['MALE', 'FEMALE'],
      contraindications: ['hypercalcemia'],
      interactions: ['thiazide_diuretics'],
      sideEffects: ['digestive_upset'],
      safetyNotes: 'Take with food. Review dose if already supplementing aggressively.',
      affiliateLinks: toJsonValue({
        amazon: 'https://example.com/amazon/vitamin-d3-k2',
        iherb: 'https://example.com/iherb/vitamin-d3-k2',
      }),
      averagePrice: 18.5,
      currency: 'GBP',
      isActive: true,
    },
    {
      name: 'Magnesium Glycinate',
      slug: 'magnesium-glycinate',
      description:
        'Well-tolerated magnesium for sleep quality, stress support, and muscle recovery.',
      category: SupplementCategory.MINERAL,
      evidenceLevel: 'moderate',
      primaryBenefits: ['Sleep support', 'Stress support', 'Recovery'],
      recommendedDosage: '300',
      dosageUnit: 'mg',
      frequency: 'nightly',
      targetSymptoms: ['poor_sleep', 'stress', 'muscle_tension'],
      targetGoals: ['sleep', 'stress_resilience', 'recovery'],
      targetBiomarkers: ['CRP'],
      minAge: 18,
      maxAge: 80,
      allowedGenders: ['MALE', 'FEMALE'],
      contraindications: ['advanced_kidney_disease'],
      interactions: ['quinolone_antibiotics'],
      sideEffects: ['loose_stools'],
      safetyNotes: 'Best taken in the evening. Lower the dose if stools become loose.',
      affiliateLinks: toJsonValue({
        amazon: 'https://example.com/amazon/magnesium-glycinate',
      }),
      averagePrice: 16.0,
      currency: 'GBP',
      isActive: true,
    },
    {
      name: 'Omega-3 Fish Oil',
      slug: 'omega-3-fish-oil',
      description: 'EPA/DHA support for triglycerides, inflammation balance, and recovery.',
      category: SupplementCategory.OMEGA,
      evidenceLevel: 'strong',
      primaryBenefits: ['Cardiometabolic support', 'Inflammation balance'],
      recommendedDosage: '2000',
      dosageUnit: 'mg',
      frequency: 'daily',
      targetSymptoms: ['poor_recovery', 'joint_stiffness'],
      targetGoals: ['cardiovascular_health', 'longevity', 'general_wellness'],
      targetBiomarkers: ['LDL', 'CRP'],
      minAge: 18,
      maxAge: 80,
      allowedGenders: ['MALE', 'FEMALE'],
      contraindications: ['fish_allergy'],
      interactions: ['blood_thinners'],
      sideEffects: ['fishy_aftertaste'],
      safetyNotes: 'Take with meals. Review if taking anticoagulants.',
      affiliateLinks: toJsonValue({
        amazon: 'https://example.com/amazon/omega-3-fish-oil',
      }),
      averagePrice: 22.0,
      currency: 'GBP',
      isActive: true,
    },
    {
      name: 'Berberine Complex',
      slug: 'berberine-complex',
      description: 'Metabolic support supplement often used for glucose and appetite regulation.',
      category: SupplementCategory.HERB,
      evidenceLevel: 'moderate',
      primaryBenefits: ['Metabolic support', 'Blood sugar support'],
      recommendedDosage: '500',
      dosageUnit: 'mg',
      frequency: 'twice_daily',
      targetSymptoms: ['cravings', 'energy_crash', 'weight_gain'],
      targetGoals: ['weight_management', 'metabolic_health'],
      targetBiomarkers: ['HBA1C', 'FASTING_GLUCOSE'],
      minAge: 18,
      maxAge: 75,
      allowedGenders: ['MALE', 'FEMALE'],
      contraindications: ['pregnancy'],
      interactions: ['metformin', 'cyclosporine'],
      sideEffects: ['digestive_upset'],
      safetyNotes: 'Use cautiously alongside glucose-lowering medication.',
      affiliateLinks: toJsonValue({
        iherb: 'https://example.com/iherb/berberine-complex',
      }),
      averagePrice: 24.0,
      currency: 'GBP',
      isActive: true,
    },
    {
      name: 'Ashwagandha Extract',
      slug: 'ashwagandha-extract',
      description: 'Adaptogen support for perceived stress, resilience, and recovery.',
      category: SupplementCategory.ADAPTOGEN,
      evidenceLevel: 'moderate',
      primaryBenefits: ['Stress resilience', 'Recovery support'],
      recommendedDosage: '600',
      dosageUnit: 'mg',
      frequency: 'daily',
      targetSymptoms: ['stress', 'poor_sleep', 'fatigue'],
      targetGoals: ['stress_resilience', 'sleep', 'energy_vitality'],
      targetBiomarkers: ['CORTISOL'],
      minAge: 18,
      maxAge: 70,
      allowedGenders: ['MALE', 'FEMALE'],
      contraindications: ['pregnancy', 'hyperthyroidism'],
      interactions: ['sedatives'],
      sideEffects: ['drowsiness', 'digestive_upset'],
      safetyNotes: 'Consider evening use if it feels calming. Review thyroid history before use.',
      affiliateLinks: toJsonValue({
        amazon: 'https://example.com/amazon/ashwagandha-extract',
      }),
      averagePrice: 19.0,
      currency: 'GBP',
      isActive: true,
    },
  ];

  for (const supplement of supplements) {
    await prismaAny.supplement.upsert({
      where: { slug: supplement.slug },
      update: supplement,
      create: supplement,
    });
  }

  console.log('✅ Settings, provider operations, treatment logic, and supplements seeded');

  // ============================================
  // Seed Demo Journeys Across Features
  // ============================================
  const demoUserIds = [testUser.id, johnSmith.id, armandMaulani.id, sarahChen.id];
  await clearDemoJourneyData(demoUserIds);

  const labPartnersByCode = Object.fromEntries(
    (
      await prisma.labPartner.findMany({
        where: { code: { in: ['QUEST_DIAGNOSTICS', 'LABCORP', 'MEDICHECKS'] } },
        select: { id: true, code: true },
      })
    ).map((partner) => [partner.code, partner])
  );

  const labsByName = Object.fromEntries(
    (
      await prisma.lab.findMany({
        where: {
          name: {
            in: [
              'Quest Diagnostics - Manhattan',
              'LabCorp - Brooklyn Heights',
              'Medichecks - London Clinic',
            ],
          },
        },
        select: { id: true, name: true },
      })
    ).map((lab) => [lab.name, lab])
  );

  const supplementsBySlug = Object.fromEntries(
    (
      await prismaAny.supplement.findMany({
        where: {
          slug: {
            in: [
              'vitamin-d3-k2',
              'magnesium-glycinate',
              'omega-3-fish-oil',
              'berberine-complex',
              'ashwagandha-extract',
            ],
          },
        },
        select: { id: true, slug: true, name: true },
      })
    ).map((supplement: { id: string; slug: string; name: string }) => [supplement.slug, supplement])
  );

  const testUserIntakeData = {
    medicalHistory: {
      conditions: ['seasonal_allergies'],
      surgeries: [],
      allergies: ['penicillin'],
      currentMedications: [],
      hasChronicConditions: false,
    },
    familyHistory: {
      conditions: [{ condition: 'high_cholesterol', relation: 'father' }],
    },
    symptoms: [
      {
        name: 'fatigue',
        category: 'energy',
        severity: 'moderate',
        duration: '6 months',
        frequency: 'most days',
      },
      {
        name: 'brain_fog',
        category: 'cognitive',
        severity: 'mild',
        duration: '3 months',
        frequency: 'several times per week',
      },
    ],
    biometrics: {
      height: 178,
      weight: 89,
      bmi: 28.1,
    },
    goals: [
      {
        category: 'weight_management',
        description: 'Reduce body fat and improve energy',
        priority: 'high',
      },
      {
        category: 'energy_vitality',
        description: 'Feel less drained in the afternoon',
        priority: 'medium',
      },
    ],
    lifestyle: {
      smokingStatus: 'never',
      alcoholConsumption: 'occasional',
      exerciseFrequency: 'light',
      dietType: 'omnivore',
      sleepHours: 6.5,
      stressLevel: 'moderate',
    },
    preferences: {
      riskTolerance: 'medium',
      budgetSensitivity: 'medium',
      preferSubscription: false,
      deliveryPreference: 'home',
    },
  };

  const johnSmithIntakeData = {
    medicalHistory: {
      conditions: ['low_testosterone'],
      surgeries: [{ name: 'ACL repair', year: 2016 }],
      allergies: [],
      currentMedications: [{ name: 'Vitamin D', dosage: '2000 IU', frequency: 'daily' }],
      hasChronicConditions: true,
    },
    familyHistory: {
      conditions: [
        { condition: 'type_2_diabetes', relation: 'father' },
        { condition: 'heart_disease', relation: 'grandfather' },
      ],
    },
    symptoms: [
      {
        name: 'low_libido',
        category: 'hormonal',
        severity: 'moderate',
        duration: '12 months',
        frequency: 'most days',
      },
      {
        name: 'poor_recovery',
        category: 'recovery',
        severity: 'moderate',
        duration: '8 months',
        frequency: 'after workouts',
      },
    ],
    biometrics: {
      height: 183,
      weight: 96,
      bmi: 28.7,
    },
    goals: [
      {
        category: 'hormone_balance',
        description: 'Improve hormones and recovery',
        priority: 'high',
      },
      { category: 'energy_vitality', description: 'Improve training recovery', priority: 'medium' },
    ],
    lifestyle: {
      smokingStatus: 'former',
      alcoholConsumption: 'occasional',
      exerciseFrequency: 'active',
      dietType: 'high_protein',
      sleepHours: 6,
      stressLevel: 'high',
    },
    preferences: {
      riskTolerance: 'low',
      budgetSensitivity: 'low',
      preferSubscription: true,
      deliveryPreference: 'clinic',
    },
  };

  const armandIntakeData = {
    medicalHistory: {
      conditions: ['pre_diabetes'],
      surgeries: [],
      allergies: [],
      currentMedications: [{ name: 'Metformin', dosage: '500 mg', frequency: 'once daily' }],
      hasChronicConditions: true,
    },
    familyHistory: {
      conditions: [{ condition: 'type_2_diabetes', relation: 'mother' }],
    },
    symptoms: [
      {
        name: 'cravings',
        category: 'metabolic',
        severity: 'moderate',
        duration: '9 months',
        frequency: 'daily',
      },
      {
        name: 'energy_crash',
        category: 'metabolic',
        severity: 'moderate',
        duration: '6 months',
        frequency: 'after lunch',
      },
    ],
    biometrics: {
      height: 175,
      weight: 101,
      bmi: 33.0,
    },
    goals: [
      {
        category: 'weight_management',
        description: 'Lose weight and improve glucose control',
        priority: 'high',
      },
      {
        category: 'metabolic_health',
        description: 'Reduce blood sugar volatility',
        priority: 'high',
      },
    ],
    lifestyle: {
      smokingStatus: 'never',
      alcoholConsumption: 'none',
      exerciseFrequency: 'light',
      dietType: 'omnivore',
      sleepHours: 5.5,
      stressLevel: 'high',
    },
    preferences: {
      riskTolerance: 'medium',
      budgetSensitivity: 'high',
      preferSubscription: true,
      deliveryPreference: 'home',
    },
  };

  const sarahIntakeData = {
    medicalHistory: {
      conditions: ['insomnia'],
      surgeries: [],
      allergies: ['shellfish'],
      currentMedications: [],
      hasChronicConditions: true,
    },
    familyHistory: {
      conditions: [{ condition: 'thyroid_disease', relation: 'mother' }],
    },
    symptoms: [
      {
        name: 'poor_sleep',
        category: 'sleep',
        severity: 'severe',
        duration: '14 months',
        frequency: 'nightly',
      },
      {
        name: 'stress',
        category: 'stress',
        severity: 'moderate',
        duration: '10 months',
        frequency: 'most days',
      },
    ],
    biometrics: {
      height: 167,
      weight: 69,
      bmi: 24.7,
    },
    goals: [
      {
        category: 'sleep',
        description: 'Sleep through the night more consistently',
        priority: 'high',
      },
      {
        category: 'stress_resilience',
        description: 'Recover better from work stress',
        priority: 'high',
      },
    ],
    lifestyle: {
      smokingStatus: 'never',
      alcoholConsumption: 'occasional',
      exerciseFrequency: 'moderate',
      dietType: 'pescatarian',
      sleepHours: 5,
      stressLevel: 'high',
    },
    preferences: {
      riskTolerance: 'low',
      budgetSensitivity: 'medium',
      preferSubscription: false,
      deliveryPreference: 'pharmacy',
    },
  };

  const testUserIntake = await prisma.healthIntake.create({
    data: {
      userId: testUser.id,
      status: 'COMPLETED',
      version: 1,
      intakeDataEncrypted: encryptSeedJson(testUserIntakeData),
      primaryGoals: ['weight_management', 'energy_vitality'],
      hasChronicConditions: false,
      takingMedications: false,
      completedAt: daysFromDemoNow(-21),
      expiresAt: daysFromDemoNow(150),
      createdAt: daysFromDemoNow(-22),
    },
  });

  const johnSmithIntake = await prisma.healthIntake.create({
    data: {
      userId: johnSmith.id,
      status: 'COMPLETED',
      version: 1,
      intakeDataEncrypted: encryptSeedJson(johnSmithIntakeData),
      primaryGoals: ['hormone_balance', 'energy_vitality'],
      hasChronicConditions: true,
      takingMedications: true,
      completedAt: daysFromDemoNow(-14),
      expiresAt: daysFromDemoNow(120),
      createdAt: daysFromDemoNow(-15),
    },
  });

  const armandIntake = await prisma.healthIntake.create({
    data: {
      userId: armandMaulani.id,
      status: 'COMPLETED',
      version: 1,
      intakeDataEncrypted: encryptSeedJson(armandIntakeData),
      primaryGoals: ['weight_management', 'metabolic_health'],
      hasChronicConditions: true,
      takingMedications: true,
      completedAt: daysFromDemoNow(-10),
      expiresAt: daysFromDemoNow(120),
      createdAt: daysFromDemoNow(-11),
    },
  });

  const sarahIntake = await prisma.healthIntake.create({
    data: {
      userId: sarahChen.id,
      status: 'COMPLETED',
      version: 1,
      intakeDataEncrypted: encryptSeedJson(sarahIntakeData),
      primaryGoals: ['sleep', 'stress_resilience'],
      hasChronicConditions: true,
      takingMedications: false,
      completedAt: daysFromDemoNow(-6),
      expiresAt: daysFromDemoNow(120),
      createdAt: daysFromDemoNow(-7),
    },
  });

  const johnSmithBloodResults = [
    {
      biomarkerCode: 'TESTOSTERONE_TOTAL',
      value: 8.2,
      unit: 'nmol/L',
      referenceMin: 8.64,
      referenceMax: 29.0,
      isAbnormal: true,
    },
    {
      biomarkerCode: 'TSH',
      value: 3.8,
      unit: 'mIU/L',
      referenceMin: 0.27,
      referenceMax: 4.2,
      isAbnormal: false,
    },
    {
      biomarkerCode: 'VITAMIN_D',
      value: 44,
      unit: 'nmol/L',
      referenceMin: 50,
      referenceMax: 175,
      isAbnormal: true,
    },
    {
      biomarkerCode: 'CRP',
      value: 1.2,
      unit: 'mg/L',
      referenceMin: 0,
      referenceMax: 2,
      isAbnormal: false,
    },
  ];

  const armandBloodResults = [
    {
      biomarkerCode: 'HBA1C',
      value: 6.1,
      unit: 'mmol/mol',
      referenceMin: 20,
      referenceMax: 42,
      isAbnormal: true,
    },
    {
      biomarkerCode: 'FASTING_GLUCOSE',
      value: 108,
      unit: 'mg/dL',
      referenceMin: 65,
      referenceMax: 99,
      isAbnormal: true,
    },
    {
      biomarkerCode: 'LDL',
      value: 164,
      unit: 'mg/dL',
      referenceMin: 0,
      referenceMax: 100,
      isAbnormal: true,
    },
    {
      biomarkerCode: 'HDL',
      value: 42,
      unit: 'mg/dL',
      referenceMin: 40,
      referenceMax: 80,
      isAbnormal: false,
    },
  ];

  const sarahBloodResults = [
    {
      biomarkerCode: 'TSH',
      value: 4.6,
      unit: 'mIU/L',
      referenceMin: 0.27,
      referenceMax: 4.2,
      isAbnormal: true,
    },
    {
      biomarkerCode: 'IRON',
      value: 48,
      unit: 'mcg/dL',
      referenceMin: 50,
      referenceMax: 170,
      isAbnormal: true,
    },
    {
      biomarkerCode: 'VIT_D',
      value: 28,
      unit: 'ng/mL',
      referenceMin: 30,
      referenceMax: 100,
      isAbnormal: true,
    },
  ];

  const johnSmithBloodTest = await prisma.bloodTest.create({
    data: {
      userId: johnSmith.id,
      healthIntakeId: johnSmithIntake.id,
      labPartnerId: labPartnersByCode.QUEST_DIAGNOSTICS.id,
      status: 'COMPLETED',
      panelType: 'comprehensive',
      biomarkersRequested: johnSmithBloodResults.map((result) => result.biomarkerCode),
      resultsEncrypted: encryptSeedJson(johnSmithBloodResults),
      orderedAt: daysFromDemoNow(-18),
      sampleCollectedAt: daysFromDemoNow(-16),
      resultsReceivedAt: daysFromDemoNow(-14),
      expiresAt: daysFromDemoNow(180),
      createdAt: daysFromDemoNow(-18),
    },
  });

  const armandBloodTest = await prisma.bloodTest.create({
    data: {
      userId: armandMaulani.id,
      healthIntakeId: armandIntake.id,
      labPartnerId: labPartnersByCode.LABCORP.id,
      status: 'COMPLETED',
      panelType: 'goal-based',
      biomarkersRequested: armandBloodResults.map((result) => result.biomarkerCode),
      resultsEncrypted: encryptSeedJson(armandBloodResults),
      orderedAt: daysFromDemoNow(-13),
      sampleCollectedAt: daysFromDemoNow(-12),
      resultsReceivedAt: daysFromDemoNow(-10),
      expiresAt: daysFromDemoNow(180),
      createdAt: daysFromDemoNow(-13),
    },
  });

  const sarahBloodTest = await prisma.bloodTest.create({
    data: {
      userId: sarahChen.id,
      healthIntakeId: sarahIntake.id,
      labPartnerId: labPartnersByCode.MEDICHECKS.id,
      status: 'COMPLETED',
      panelType: 'targeted',
      biomarkersRequested: sarahBloodResults.map((result) => result.biomarkerCode),
      resultsEncrypted: encryptSeedJson(sarahBloodResults),
      orderedAt: daysFromDemoNow(-9),
      sampleCollectedAt: daysFromDemoNow(-8),
      resultsReceivedAt: daysFromDemoNow(-6),
      expiresAt: daysFromDemoNow(180),
      createdAt: daysFromDemoNow(-9),
    },
  });

  for (const result of johnSmithBloodResults) {
    await prisma.biomarkerResult.create({
      data: {
        bloodTestId: johnSmithBloodTest.id,
        biomarkerId: biomarkersByCode[result.biomarkerCode].id,
        value: result.value,
        unit: result.unit,
        referenceMin: result.referenceMin,
        referenceMax: result.referenceMax,
        isAbnormal: result.isAbnormal,
      },
    });
  }

  for (const result of armandBloodResults) {
    await prisma.biomarkerResult.create({
      data: {
        bloodTestId: armandBloodTest.id,
        biomarkerId: biomarkersByCode[result.biomarkerCode].id,
        value: result.value,
        unit: result.unit,
        referenceMin: result.referenceMin,
        referenceMax: result.referenceMax,
        isAbnormal: result.isAbnormal,
      },
    });
  }

  for (const result of sarahBloodResults) {
    await prisma.biomarkerResult.create({
      data: {
        bloodTestId: sarahBloodTest.id,
        biomarkerId: biomarkersByCode[result.biomarkerCode].id,
        value: result.value,
        unit: result.unit,
        referenceMin: result.referenceMin,
        referenceMax: result.referenceMax,
        isAbnormal: result.isAbnormal,
      },
    });
  }

  await prisma.labBooking.create({
    data: {
      labId: labsByName['Quest Diagnostics - Manhattan'].id,
      userId: johnSmith.id,
      bloodTestId: johnSmithBloodTest.id,
      bookingDate: daysFromDemoNow(-16),
      timeSlot: '08:00-10:00 AM',
      status: 'COMPLETED',
      resultFileName: 'john-smith-bloodwork.pdf',
      resultFileType: 'application/pdf',
      resultUploadedAt: daysFromDemoNow(-14),
      resultReviewed: true,
      reviewedAt: daysFromDemoNow(-13),
      adminNotes: 'Results reviewed and linked to hormone pathway recommendation.',
    },
  });

  await prisma.labBooking.create({
    data: {
      labId: labsByName['LabCorp - Brooklyn Heights'].id,
      userId: armandMaulani.id,
      bloodTestId: armandBloodTest.id,
      bookingDate: daysFromDemoNow(-12),
      timeSlot: '10:00-12:00 AM',
      status: 'COMPLETED',
      resultFileName: 'armand-metabolic-panel.pdf',
      resultFileType: 'application/pdf',
      resultUploadedAt: daysFromDemoNow(-10),
      resultReviewed: true,
      reviewedAt: daysFromDemoNow(-9),
      adminNotes: 'Metabolic panel received and marked for follow-up.',
    },
  });

  await prisma.labBooking.create({
    data: {
      labId: labsByName['Medichecks - London Clinic'].id,
      userId: sarahChen.id,
      bloodTestId: sarahBloodTest.id,
      bookingDate: daysFromDemoNow(-8),
      timeSlot: '10:00-12:00 AM',
      status: 'COMPLETED',
      resultFileName: 'sarah-sleep-panel.pdf',
      resultFileType: 'application/pdf',
      resultUploadedAt: daysFromDemoNow(-6),
      resultReviewed: true,
      reviewedAt: daysFromDemoNow(-5),
      adminNotes: 'Sleep-focused panel completed with low iron and borderline thyroid markers.',
    },
  });

  await prismaAny.bloodTestInterpretation.create({
    data: {
      bloodTestId: johnSmithBloodTest.id,
      summaryEncrypted: encryptSeedValue(
        'Low testosterone and low vitamin D stand out as the main findings. These align with recovery and libido complaints.'
      ),
      findingsEncrypted: encryptSeedJson([
        'Total testosterone is below the target range for this male reference interval.',
        'Vitamin D is below optimal and may be contributing to low energy and recovery.',
      ]),
      actionsEncrypted: encryptSeedJson([
        'Review hormonal treatment suitability with a clinician.',
        'Correct vitamin D insufficiency and repeat labs in 8 to 12 weeks.',
      ]),
      tokensUsed: 914,
      modelVersion: 'demo-seed-v1',
      promptVersion: 'blood_test_interpretation@v1.0.0',
      createdAt: daysFromDemoNow(-14),
    },
  });

  await prismaAny.bloodTestInterpretation.create({
    data: {
      bloodTestId: armandBloodTest.id,
      summaryEncrypted: encryptSeedValue(
        'Metabolic markers suggest early glucose dysregulation with elevated LDL, supporting a structured weight-management plan.'
      ),
      findingsEncrypted: encryptSeedJson([
        'HbA1c and fasting glucose are above the preferred range.',
        'LDL cholesterol is elevated and should be addressed alongside weight management.',
      ]),
      actionsEncrypted: encryptSeedJson([
        'Start a structured metabolic support plan.',
        'Repeat glucose and lipid markers after initial intervention.',
      ]),
      tokensUsed: 1022,
      modelVersion: 'demo-seed-v1',
      promptVersion: 'blood_test_interpretation@v1.0.0',
      createdAt: daysFromDemoNow(-10),
    },
  });

  await prismaAny.bloodTestInterpretation.create({
    data: {
      bloodTestId: sarahBloodTest.id,
      summaryEncrypted: encryptSeedValue(
        'Low iron, low vitamin D, and mildly elevated TSH may be reinforcing sleep disruption and poor recovery.'
      ),
      findingsEncrypted: encryptSeedJson([
        'Iron and vitamin D are both below target ranges.',
        'TSH is slightly above the preferred range and worth rechecking.',
      ]),
      actionsEncrypted: encryptSeedJson([
        'Support sleep and recovery while investigating nutritional contributors.',
        'Repeat thyroid and iron studies after targeted support.',
      ]),
      tokensUsed: 801,
      modelVersion: 'demo-seed-v1',
      promptVersion: 'blood_test_interpretation@v1.0.0',
      createdAt: daysFromDemoNow(-6),
    },
  });

  const testUserRecommendation = await prisma.recommendation.create({
    data: {
      userId: testUser.id,
      healthIntakeId: testUserIntake.id,
      status: 'VIEWED',
      healthSummaryEncrypted: encryptSeedJson({
        summary:
          'Your intake suggests that energy dips and weight-management friction are the main focus areas right now.',
        recommendations: [
          'Stabilize meal structure and protein intake during the first half of the day.',
          'Increase weekly movement consistency before escalating to medication-based options.',
          'Consider metabolic-support supplements if symptoms continue.',
        ],
        warnings: [
          'If fatigue worsens quickly, review blood work and sleep quality with a clinician.',
        ],
        nextSteps: [
          { title: 'Improve sleep schedule', effort: 'medium' },
          { title: 'Track appetite and cravings for 2 weeks', effort: 'low' },
        ],
      }),
      primaryRecommendations: [
        'Stabilize meal structure and protein intake',
        'Increase weekly movement consistency',
        'Consider metabolic-support supplements',
      ],
      aiModelVersion: 'seed-demo-v1',
      promptVersion: 'health_analysis@v1.0.0',
      tokensUsed: 1260,
      viewedAt: daysFromDemoNow(-20),
      expiresAt: daysFromDemoNow(90),
      createdAt: daysFromDemoNow(-21),
    },
  });

  const johnSmithRecommendation = await prisma.recommendation.create({
    data: {
      userId: johnSmith.id,
      healthIntakeId: johnSmithIntake.id,
      status: 'VIEWED',
      healthSummaryEncrypted: encryptSeedJson({
        summary:
          'Your symptoms and blood work point most strongly toward a hormone and recovery pathway, with vitamin D repletion as a parallel step.',
        recommendations: [
          'Review TRT eligibility with a specialist provider.',
          'Correct low vitamin D and retest during follow-up.',
          'Address sleep and stress load to improve recovery outcomes.',
        ],
        warnings: ['Untreated sleep apnea should be ruled out before escalating TRT.'],
        nextSteps: [
          { title: 'Book provider consultation', effort: 'medium' },
          { title: 'Repeat hormone labs in 8-12 weeks', effort: 'medium' },
        ],
      }),
      primaryRecommendations: [
        'Review TRT eligibility with a specialist provider',
        'Correct low vitamin D',
        'Address sleep and stress load',
      ],
      aiModelVersion: 'seed-demo-v1',
      promptVersion: 'health_analysis@v1.0.0',
      tokensUsed: 1438,
      viewedAt: daysFromDemoNow(-13),
      expiresAt: daysFromDemoNow(90),
      createdAt: daysFromDemoNow(-14),
    },
  });

  const armandRecommendation = await prisma.recommendation.create({
    data: {
      userId: armandMaulani.id,
      healthIntakeId: armandIntake.id,
      status: 'GENERATED',
      healthSummaryEncrypted: encryptSeedJson({
        summary:
          'Your intake and labs show a strong metabolic pattern, especially around glucose regulation, cravings, and LDL cholesterol.',
        recommendations: [
          'Start a structured weight-management pathway with nutrition and medical review.',
          'Target glucose stability before widening the treatment plan.',
          'Use repeat blood tests to verify progress over the next quarter.',
        ],
        warnings: [
          'Elevated LDL should be reviewed if there is a strong family cardiovascular history.',
        ],
        nextSteps: [
          { title: 'Review weight-management options', effort: 'medium' },
          { title: 'Reduce high-glycaemic meals', effort: 'medium' },
        ],
      }),
      primaryRecommendations: [
        'Start a structured weight-management pathway',
        'Target glucose stability',
        'Repeat blood tests in the next quarter',
      ],
      aiModelVersion: 'seed-demo-v1',
      promptVersion: 'health_analysis@v1.0.0',
      tokensUsed: 1515,
      expiresAt: daysFromDemoNow(90),
      createdAt: daysFromDemoNow(-10),
    },
  });

  const sarahRecommendation = await prisma.recommendation.create({
    data: {
      userId: sarahChen.id,
      healthIntakeId: sarahIntake.id,
      status: 'VIEWED',
      healthSummaryEncrypted: encryptSeedJson({
        summary:
          'Sleep disruption appears to be the main issue, and your blood markers suggest recovery and nutrient status need attention too.',
        recommendations: [
          'Start a sleep-optimization pathway with a consistent routine and clinician-guided review.',
          'Correct iron and vitamin D status before interpreting energy changes.',
          'Repeat thyroid testing if symptoms persist after initial support.',
        ],
        warnings: ['Persistent insomnia with worsening mood should be reviewed clinically.'],
        nextSteps: [
          { title: 'Begin sleep coaching pathway', effort: 'low' },
          { title: 'Start iron and vitamin D support', effort: 'low' },
        ],
      }),
      primaryRecommendations: [
        'Start a sleep-optimization pathway',
        'Correct iron and vitamin D status',
        'Repeat thyroid testing if symptoms persist',
      ],
      aiModelVersion: 'seed-demo-v1',
      promptVersion: 'health_analysis@v1.0.0',
      tokensUsed: 1182,
      viewedAt: daysFromDemoNow(-5),
      expiresAt: daysFromDemoNow(90),
      createdAt: daysFromDemoNow(-6),
    },
  });

  await prisma.treatmentMatch.createMany({
    data: [
      {
        recommendationId: testUserRecommendation.id,
        treatmentId: treatmentsBySlug['numan-weight-loss'].id,
        relevanceScore: 0.86,
        matchReasons: [
          'Primary goal is weight management',
          'Symptoms suggest metabolic support would help',
        ],
        contraindications: [],
        isEligible: true,
        displayOrder: 0,
      },
      {
        recommendationId: testUserRecommendation.id,
        treatmentId: treatmentsBySlug['manual-sleep-optimization'].id,
        relevanceScore: 0.54,
        matchReasons: ['Sleep quality is limiting energy'],
        contraindications: [],
        isEligible: true,
        displayOrder: 1,
      },
      {
        recommendationId: johnSmithRecommendation.id,
        treatmentId: treatmentsBySlug['optimale-trt'].id,
        relevanceScore: 0.94,
        matchReasons: ['Low testosterone blood marker', 'Symptoms align with hormone support'],
        contraindications: ['Review sleep apnea history before initiation'],
        isEligible: true,
        displayOrder: 0,
      },
      {
        recommendationId: johnSmithRecommendation.id,
        treatmentId: treatmentsBySlug['manual-longevity-foundations'].id,
        relevanceScore: 0.58,
        matchReasons: ['Recovery and preventive optimization are relevant'],
        contraindications: [],
        isEligible: true,
        displayOrder: 1,
      },
      {
        recommendationId: armandRecommendation.id,
        treatmentId: treatmentsBySlug['numan-weight-loss'].id,
        relevanceScore: 0.93,
        matchReasons: ['Metabolic goal and elevated glucose markers strongly align'],
        contraindications: [],
        isEligible: true,
        displayOrder: 0,
      },
      {
        recommendationId: armandRecommendation.id,
        treatmentId: treatmentsBySlug['manual-longevity-foundations'].id,
        relevanceScore: 0.49,
        matchReasons: ['Would complement long-term cardiometabolic prevention'],
        contraindications: [],
        isEligible: true,
        displayOrder: 1,
      },
      {
        recommendationId: sarahRecommendation.id,
        treatmentId: treatmentsBySlug['manual-sleep-optimization'].id,
        relevanceScore: 0.91,
        matchReasons: ['Sleep disruption is the top concern', 'Stress load is high'],
        contraindications: [],
        isEligible: true,
        displayOrder: 0,
      },
      {
        recommendationId: sarahRecommendation.id,
        treatmentId: treatmentsBySlug['manual-longevity-foundations'].id,
        relevanceScore: 0.42,
        matchReasons: ['Recovery and preventive follow-up would be helpful after sleep improves'],
        contraindications: [],
        isEligible: true,
        displayOrder: 1,
      },
    ],
  });

  await prismaAny.supplementMatch.createMany({
    data: [
      {
        recommendationId: testUserRecommendation.id,
        supplementId: supplementsBySlug['berberine-complex'].id,
        matchScore: 87,
        matchReason: 'Metabolic support aligns with cravings and weight-management goals.',
        priority: 1,
        personalizedDosage: '500 mg twice daily with meals',
        expectedBenefit: 'May help smooth glucose variability and appetite.',
        status: 'VIEWED',
        viewedAt: daysFromDemoNow(-20),
      },
      {
        recommendationId: testUserRecommendation.id,
        supplementId: supplementsBySlug['magnesium-glycinate'].id,
        matchScore: 68,
        matchReason: 'Sleep support may indirectly improve appetite regulation and energy.',
        priority: 2,
        personalizedDosage: '300 mg in the evening',
        expectedBenefit: 'Supports sleep quality and recovery.',
        status: 'SUGGESTED',
      },
      {
        recommendationId: johnSmithRecommendation.id,
        supplementId: supplementsBySlug['vitamin-d3-k2'].id,
        matchScore: 92,
        matchReason: 'Low vitamin D and low energy make repletion highly relevant.',
        priority: 1,
        personalizedDosage: '2000 IU daily with fat-containing meal',
        expectedBenefit: 'May improve vitamin D status and support recovery.',
        status: 'VIEWED',
        viewedAt: daysFromDemoNow(-13),
      },
      {
        recommendationId: johnSmithRecommendation.id,
        supplementId: supplementsBySlug['omega-3-fish-oil'].id,
        matchScore: 61,
        matchReason: 'Supports recovery and cardiometabolic maintenance during a hormone pathway.',
        priority: 2,
        personalizedDosage: '2 g combined EPA/DHA daily',
        expectedBenefit: 'Supports lipid profile and inflammation balance.',
        status: 'SUGGESTED',
      },
      {
        recommendationId: armandRecommendation.id,
        supplementId: supplementsBySlug['berberine-complex'].id,
        matchScore: 90,
        matchReason: 'Raised HbA1c and fasting glucose strongly align with berberine support.',
        priority: 1,
        personalizedDosage: '500 mg twice daily before larger meals',
        expectedBenefit: 'May support glucose control during metabolic intervention.',
        status: 'VIEWED',
        viewedAt: daysFromDemoNow(-9),
      },
      {
        recommendationId: armandRecommendation.id,
        supplementId: supplementsBySlug['omega-3-fish-oil'].id,
        matchScore: 73,
        matchReason: 'Elevated LDL adds relevance for lipid-focused support.',
        priority: 2,
        personalizedDosage: '2 g daily',
        expectedBenefit: 'Supports a healthier lipid profile.',
        status: 'SUGGESTED',
      },
      {
        recommendationId: sarahRecommendation.id,
        supplementId: supplementsBySlug['magnesium-glycinate'].id,
        matchScore: 89,
        matchReason: 'Sleep disruption and stress make magnesium a strong fit.',
        priority: 1,
        personalizedDosage: '300 mg nightly',
        expectedBenefit: 'Supports relaxation and sleep quality.',
        status: 'VIEWED',
        viewedAt: daysFromDemoNow(-5),
      },
      {
        recommendationId: sarahRecommendation.id,
        supplementId: supplementsBySlug['vitamin-d3-k2'].id,
        matchScore: 84,
        matchReason: 'Low vitamin D supports repletion as part of the recovery plan.',
        priority: 2,
        personalizedDosage: '2000 IU daily',
        expectedBenefit: 'Supports energy, mood, and immune function.',
        status: 'SUGGESTED',
      },
    ],
  });

  const johnSmithHandoff = await prisma.providerHandoff.create({
    data: {
      userId: johnSmith.id,
      providerId: providersBySlug.optimale.id,
      recommendationId: johnSmithRecommendation.id,
      status: 'TREATMENT_STARTED',
      handoffDataEncrypted: encryptSeedJson({
        userId: johnSmith.id,
        intakeData: johnSmithIntakeData,
        recommendationId: johnSmithRecommendation.id,
        selectedTreatmentId: treatmentsBySlug['optimale-trt'].id,
        consentTimestamp: daysFromDemoNow(-12).toISOString(),
      }),
      attributionId: crypto.randomUUID(),
      initiatedAt: daysFromDemoNow(-12),
      dataTransferredAt: daysFromDemoNow(-12),
      providerReceivedAt: daysFromDemoNow(-11),
      treatmentStartedAt: daysFromDemoNow(-7),
      createdAt: daysFromDemoNow(-12),
    },
  });

  const armandHandoff = await prisma.providerHandoff.create({
    data: {
      userId: armandMaulani.id,
      providerId: providersBySlug.numan.id,
      recommendationId: armandRecommendation.id,
      status: 'CONSULTATION_SCHEDULED',
      handoffDataEncrypted: encryptSeedJson({
        userId: armandMaulani.id,
        intakeData: armandIntakeData,
        recommendationId: armandRecommendation.id,
        selectedTreatmentId: treatmentsBySlug['numan-weight-loss'].id,
        consentTimestamp: daysFromDemoNow(-8).toISOString(),
      }),
      attributionId: crypto.randomUUID(),
      initiatedAt: daysFromDemoNow(-8),
      dataTransferredAt: daysFromDemoNow(-8),
      providerReceivedAt: daysFromDemoNow(-7),
      createdAt: daysFromDemoNow(-8),
    },
  });

  const sarahHandoff = await prisma.providerHandoff.create({
    data: {
      userId: sarahChen.id,
      providerId: providersBySlug.manual.id,
      recommendationId: sarahRecommendation.id,
      status: 'PROVIDER_RECEIVED',
      handoffDataEncrypted: encryptSeedJson({
        userId: sarahChen.id,
        intakeData: sarahIntakeData,
        recommendationId: sarahRecommendation.id,
        selectedTreatmentId: treatmentsBySlug['manual-sleep-optimization'].id,
        consentTimestamp: daysFromDemoNow(-4).toISOString(),
      }),
      attributionId: crypto.randomUUID(),
      initiatedAt: daysFromDemoNow(-4),
      dataTransferredAt: daysFromDemoNow(-4),
      providerReceivedAt: daysFromDemoNow(-3),
      createdAt: daysFromDemoNow(-4),
    },
  });

  await prisma.attributionEvent.createMany({
    data: [
      {
        handoffId: johnSmithHandoff.id,
        eventType: 'lead_received',
        currency: 'GBP',
        occurredAt: daysFromDemoNow(-11),
        metadata: toJsonValue({ source: 'seed', stage: 'provider_received' }),
      },
      {
        handoffId: johnSmithHandoff.id,
        eventType: 'treatment_started',
        revenueAmount: 99,
        commissionAmount: 14.85,
        currency: 'GBP',
        occurredAt: daysFromDemoNow(-7),
        metadata: toJsonValue({ source: 'seed', subscriptionFrequency: 'monthly' }),
      },
      {
        handoffId: armandHandoff.id,
        eventType: 'lead_received',
        currency: 'GBP',
        occurredAt: daysFromDemoNow(-7),
        metadata: toJsonValue({ source: 'seed', stage: 'provider_received' }),
      },
      {
        handoffId: sarahHandoff.id,
        eventType: 'lead_received',
        currency: 'GBP',
        occurredAt: daysFromDemoNow(-3),
        metadata: toJsonValue({ source: 'seed', stage: 'provider_received' }),
      },
    ],
  });

  await prismaAny.analyticsHealthIntake.createMany({
    data: [
      {
        intakeId: testUserIntake.id,
        ageBucket: '35-44',
        gender: 'MALE',
        region: 'UK',
        primaryGoals: ['weight_management', 'energy_vitality'],
        symptomCategories: ['energy', 'cognitive'],
        hasChronicConditions: false,
        takingMedications: false,
        exerciseLevel: 'light',
        stressLevel: 'moderate',
        sleepQuality: 'fair',
        dietType: 'omnivore',
        riskTolerance: 'medium',
        budgetSensitivity: 'medium',
        preferSubscription: false,
        intakeCompletedAt: daysFromDemoNow(-21),
      },
      {
        intakeId: johnSmithIntake.id,
        ageBucket: '35-44',
        gender: 'MALE',
        region: 'UK',
        primaryGoals: ['hormone_balance', 'energy_vitality'],
        symptomCategories: ['hormonal', 'recovery'],
        hasChronicConditions: true,
        takingMedications: true,
        exerciseLevel: 'active',
        stressLevel: 'high',
        sleepQuality: 'poor',
        dietType: 'high_protein',
        riskTolerance: 'low',
        budgetSensitivity: 'low',
        preferSubscription: true,
        intakeCompletedAt: daysFromDemoNow(-14),
      },
      {
        intakeId: armandIntake.id,
        ageBucket: '25-34',
        gender: 'MALE',
        region: 'ID',
        primaryGoals: ['weight_management', 'metabolic_health'],
        symptomCategories: ['metabolic'],
        hasChronicConditions: true,
        takingMedications: true,
        exerciseLevel: 'light',
        stressLevel: 'high',
        sleepQuality: 'poor',
        dietType: 'omnivore',
        riskTolerance: 'medium',
        budgetSensitivity: 'high',
        preferSubscription: true,
        intakeCompletedAt: daysFromDemoNow(-10),
      },
      {
        intakeId: sarahIntake.id,
        ageBucket: '25-34',
        gender: 'FEMALE',
        region: 'UK',
        primaryGoals: ['sleep', 'stress_resilience'],
        symptomCategories: ['sleep', 'stress'],
        hasChronicConditions: true,
        takingMedications: false,
        exerciseLevel: 'moderate',
        stressLevel: 'high',
        sleepQuality: 'poor',
        dietType: 'pescatarian',
        riskTolerance: 'low',
        budgetSensitivity: 'medium',
        preferSubscription: false,
        intakeCompletedAt: daysFromDemoNow(-6),
      },
    ],
  });

  await prismaAny.analyticsBloodTest.createMany({
    data: [
      {
        bloodTestId: johnSmithBloodTest.id,
        panelType: 'comprehensive',
        labPartnerCode: 'QUEST_DIAGNOSTICS',
        region: 'UK',
        biomarkerFlags: toJsonValue({
          TESTOSTERONE_TOTAL: 'low',
          TSH: 'normal',
          VITAMIN_D: 'low',
          CRP: 'normal',
        }),
        abnormalCount: 2,
        totalBiomarkers: 4,
        ageBucket: '35-44',
        gender: 'MALE',
        resultsReceivedAt: daysFromDemoNow(-14),
      },
      {
        bloodTestId: armandBloodTest.id,
        panelType: 'goal-based',
        labPartnerCode: 'LABCORP',
        region: 'ID',
        biomarkerFlags: toJsonValue({
          HBA1C: 'high',
          FASTING_GLUCOSE: 'high',
          LDL: 'high',
          HDL: 'normal',
        }),
        abnormalCount: 3,
        totalBiomarkers: 4,
        ageBucket: '25-34',
        gender: 'MALE',
        resultsReceivedAt: daysFromDemoNow(-10),
      },
      {
        bloodTestId: sarahBloodTest.id,
        panelType: 'targeted',
        labPartnerCode: 'MEDICHECKS',
        region: 'UK',
        biomarkerFlags: toJsonValue({
          TSH: 'high',
          IRON: 'low',
          VIT_D: 'low',
        }),
        abnormalCount: 3,
        totalBiomarkers: 3,
        ageBucket: '25-34',
        gender: 'FEMALE',
        resultsReceivedAt: daysFromDemoNow(-6),
      },
    ],
  });

  await prismaAny.analyticsTreatmentOutcome.createMany({
    data: [
      {
        handoffId: johnSmithHandoff.id,
        providerId: providersBySlug.optimale.id,
        treatmentId: treatmentsBySlug['optimale-trt'].id,
        treatmentCategory: String(treatmentsBySlug['optimale-trt'].category),
        handoffStatus: 'TREATMENT_STARTED',
        convertedToTreatment: true,
        subscriptionActive: true,
        daysToConversion: 5,
        subscriptionMonths: 1,
        revenueGenerated: 99,
        commissionGenerated: 14.85,
        ageBucket: '35-44',
        gender: 'MALE',
        region: 'UK',
        handoffInitiatedAt: daysFromDemoNow(-12),
        lastUpdatedAt: daysFromDemoNow(-7),
      },
      {
        handoffId: armandHandoff.id,
        providerId: providersBySlug.numan.id,
        treatmentId: treatmentsBySlug['numan-weight-loss'].id,
        treatmentCategory: String(treatmentsBySlug['numan-weight-loss'].category),
        handoffStatus: 'CONSULTATION_SCHEDULED',
        convertedToTreatment: false,
        subscriptionActive: null,
        daysToConversion: null,
        subscriptionMonths: null,
        revenueGenerated: 0,
        commissionGenerated: 0,
        ageBucket: '25-34',
        gender: 'MALE',
        region: 'ID',
        handoffInitiatedAt: daysFromDemoNow(-8),
        lastUpdatedAt: daysFromDemoNow(-7),
      },
      {
        handoffId: sarahHandoff.id,
        providerId: providersBySlug.manual.id,
        treatmentId: treatmentsBySlug['manual-sleep-optimization'].id,
        treatmentCategory: String(treatmentsBySlug['manual-sleep-optimization'].category),
        handoffStatus: 'PROVIDER_RECEIVED',
        convertedToTreatment: false,
        subscriptionActive: null,
        daysToConversion: null,
        subscriptionMonths: null,
        revenueGenerated: 0,
        commissionGenerated: 0,
        ageBucket: '25-34',
        gender: 'FEMALE',
        region: 'UK',
        handoffInitiatedAt: daysFromDemoNow(-4),
        lastUpdatedAt: daysFromDemoNow(-3),
      },
    ],
  });

  const providerRatings = [
    {
      userId: johnSmith.id,
      providerId: providersBySlug.optimale.id,
      handoffId: johnSmithHandoff.id,
      category: ProviderRatingCategory.OVERALL,
      rating: 5,
      reviewTitle: 'Confident and efficient start',
      reviewText: 'The onboarding and review process was clear, fast, and professional.',
      wouldRecommend: true,
      isVerified: true,
      createdAt: daysFromDemoNow(-5),
    },
    {
      userId: johnSmith.id,
      providerId: providersBySlug.optimale.id,
      handoffId: johnSmithHandoff.id,
      category: ProviderRatingCategory.COMMUNICATION,
      rating: 4,
      reviewTitle: 'Good communication',
      reviewText: 'Follow-up was timely and expectations were set well.',
      wouldRecommend: true,
      isVerified: true,
      createdAt: daysFromDemoNow(-5),
    },
    {
      userId: armandMaulani.id,
      providerId: providersBySlug.numan.id,
      handoffId: armandHandoff.id,
      category: ProviderRatingCategory.OVERALL,
      rating: 4,
      reviewTitle: 'Strong initial consultation',
      reviewText: 'The team explained the plan clearly and scheduled follow-up promptly.',
      wouldRecommend: true,
      isVerified: true,
      createdAt: daysFromDemoNow(-2),
    },
    {
      userId: sarahChen.id,
      providerId: providersBySlug.manual.id,
      handoffId: sarahHandoff.id,
      category: ProviderRatingCategory.OVERALL,
      rating: 5,
      reviewTitle: 'Thoughtful sleep intake review',
      reviewText: 'The provider response felt personalized and practical.',
      wouldRecommend: true,
      isVerified: true,
      createdAt: daysFromDemoNow(-1),
    },
  ];

  for (const rating of providerRatings) {
    await prisma.providerRating.create({
      data: {
        ...rating,
        isPublic: true,
        helpfulCount: 0,
        reportedCount: 0,
        moderationStatus: 'APPROVED',
        moderatedAt: DEMO_NOW,
        moderatedBy: admin.email,
      },
    });
  }

  const treatmentFeedback = [
    {
      userId: johnSmith.id,
      treatmentId: treatmentsBySlug['optimale-trt'].id,
      providerId: providersBySlug.optimale.id,
      handoffId: johnSmithHandoff.id,
      outcome: TreatmentFeedbackOutcome.GOOD,
      effectivenessRating: 4,
      sideEffectsRating: 2,
      easeOfUseRating: 4,
      feedbackText: 'Early energy and recovery improvements without significant downside so far.',
      symptomsImproved: ['poor_recovery', 'low_libido'],
      symptomsUnchanged: [],
      symptomsWorsened: [],
      sideEffectsExperienced: ['mild_acne'],
      durationWeeks: 6,
      wouldContinue: true,
      wouldRecommend: true,
      isAnonymous: false,
      isPublic: true,
      moderationStatus: 'APPROVED',
      moderatedAt: DEMO_NOW,
      moderatedBy: admin.email,
      createdAt: daysFromDemoNow(-1),
    },
    {
      userId: armandMaulani.id,
      treatmentId: treatmentsBySlug['numan-weight-loss'].id,
      providerId: providersBySlug.numan.id,
      handoffId: armandHandoff.id,
      outcome: TreatmentFeedbackOutcome.GOOD,
      effectivenessRating: 4,
      sideEffectsRating: 3,
      easeOfUseRating: 4,
      feedbackText: 'Appetite control improved quickly and the plan feels sustainable.',
      symptomsImproved: ['cravings', 'energy_crash'],
      symptomsUnchanged: [],
      symptomsWorsened: [],
      sideEffectsExperienced: ['mild_nausea'],
      durationWeeks: 4,
      wouldContinue: true,
      wouldRecommend: true,
      isAnonymous: false,
      isPublic: true,
      moderationStatus: 'APPROVED',
      moderatedAt: DEMO_NOW,
      moderatedBy: admin.email,
      createdAt: DEMO_NOW,
    },
    {
      userId: sarahChen.id,
      treatmentId: treatmentsBySlug['manual-sleep-optimization'].id,
      providerId: providersBySlug.manual.id,
      handoffId: sarahHandoff.id,
      outcome: TreatmentFeedbackOutcome.EXCELLENT,
      effectivenessRating: 5,
      sideEffectsRating: 1,
      easeOfUseRating: 5,
      feedbackText: 'The sleep plan was easy to follow and noticeably improved sleep continuity.',
      symptomsImproved: ['poor_sleep', 'stress'],
      symptomsUnchanged: [],
      symptomsWorsened: [],
      sideEffectsExperienced: [],
      durationWeeks: 5,
      wouldContinue: true,
      wouldRecommend: true,
      isAnonymous: false,
      isPublic: true,
      moderationStatus: 'APPROVED',
      moderatedAt: DEMO_NOW,
      moderatedBy: admin.email,
      createdAt: DEMO_NOW,
    },
  ];

  for (const feedback of treatmentFeedback) {
    await prisma.treatmentFeedback.create({
      data: feedback,
    });
  }

  await prisma.providerRatingSummary.upsert({
    where: { providerId: providersBySlug.optimale.id },
    update: {
      overallRating: 5,
      communicationRating: 4,
      professionalismRating: 5,
      totalReviews: 2,
      fiveStarCount: 1,
      fourStarCount: 1,
      threeStarCount: 0,
      twoStarCount: 0,
      oneStarCount: 0,
      recommendationRate: 1,
      lastCalculatedAt: DEMO_NOW,
    },
    create: {
      providerId: providersBySlug.optimale.id,
      overallRating: 5,
      communicationRating: 4,
      professionalismRating: 5,
      totalReviews: 2,
      fiveStarCount: 1,
      fourStarCount: 1,
      threeStarCount: 0,
      twoStarCount: 0,
      oneStarCount: 0,
      recommendationRate: 1,
      lastCalculatedAt: DEMO_NOW,
    },
  });

  await prisma.providerRatingSummary.upsert({
    where: { providerId: providersBySlug.numan.id },
    update: {
      overallRating: 4,
      totalReviews: 1,
      fiveStarCount: 0,
      fourStarCount: 1,
      threeStarCount: 0,
      twoStarCount: 0,
      oneStarCount: 0,
      recommendationRate: 1,
      lastCalculatedAt: DEMO_NOW,
    },
    create: {
      providerId: providersBySlug.numan.id,
      overallRating: 4,
      totalReviews: 1,
      fiveStarCount: 0,
      fourStarCount: 1,
      threeStarCount: 0,
      twoStarCount: 0,
      oneStarCount: 0,
      recommendationRate: 1,
      lastCalculatedAt: DEMO_NOW,
    },
  });

  await prisma.providerRatingSummary.upsert({
    where: { providerId: providersBySlug.manual.id },
    update: {
      overallRating: 5,
      totalReviews: 1,
      fiveStarCount: 1,
      fourStarCount: 0,
      threeStarCount: 0,
      twoStarCount: 0,
      oneStarCount: 0,
      recommendationRate: 1,
      lastCalculatedAt: DEMO_NOW,
    },
    create: {
      providerId: providersBySlug.manual.id,
      overallRating: 5,
      totalReviews: 1,
      fiveStarCount: 1,
      fourStarCount: 0,
      threeStarCount: 0,
      twoStarCount: 0,
      oneStarCount: 0,
      recommendationRate: 1,
      lastCalculatedAt: DEMO_NOW,
    },
  });

  await prisma.treatmentFeedbackSummary.upsert({
    where: { treatmentId: treatmentsBySlug['optimale-trt'].id },
    update: {
      providerId: providersBySlug.optimale.id,
      avgEffectiveness: 4,
      avgSideEffects: 2,
      avgEaseOfUse: 4,
      totalFeedback: 1,
      excellentCount: 0,
      goodCount: 1,
      neutralCount: 0,
      disappointingCount: 0,
      poorCount: 0,
      continuationRate: 1,
      recommendationRate: 1,
      commonImprovements: ['poor_recovery', 'low_libido'],
      commonSideEffects: ['mild_acne'],
      lastCalculatedAt: DEMO_NOW,
    },
    create: {
      treatmentId: treatmentsBySlug['optimale-trt'].id,
      providerId: providersBySlug.optimale.id,
      avgEffectiveness: 4,
      avgSideEffects: 2,
      avgEaseOfUse: 4,
      totalFeedback: 1,
      excellentCount: 0,
      goodCount: 1,
      neutralCount: 0,
      disappointingCount: 0,
      poorCount: 0,
      continuationRate: 1,
      recommendationRate: 1,
      commonImprovements: ['poor_recovery', 'low_libido'],
      commonSideEffects: ['mild_acne'],
      lastCalculatedAt: DEMO_NOW,
    },
  });

  await prisma.treatmentFeedbackSummary.upsert({
    where: { treatmentId: treatmentsBySlug['numan-weight-loss'].id },
    update: {
      providerId: providersBySlug.numan.id,
      avgEffectiveness: 4,
      avgSideEffects: 3,
      avgEaseOfUse: 4,
      totalFeedback: 1,
      excellentCount: 0,
      goodCount: 1,
      neutralCount: 0,
      disappointingCount: 0,
      poorCount: 0,
      continuationRate: 1,
      recommendationRate: 1,
      commonImprovements: ['cravings', 'energy_crash'],
      commonSideEffects: ['mild_nausea'],
      lastCalculatedAt: DEMO_NOW,
    },
    create: {
      treatmentId: treatmentsBySlug['numan-weight-loss'].id,
      providerId: providersBySlug.numan.id,
      avgEffectiveness: 4,
      avgSideEffects: 3,
      avgEaseOfUse: 4,
      totalFeedback: 1,
      excellentCount: 0,
      goodCount: 1,
      neutralCount: 0,
      disappointingCount: 0,
      poorCount: 0,
      continuationRate: 1,
      recommendationRate: 1,
      commonImprovements: ['cravings', 'energy_crash'],
      commonSideEffects: ['mild_nausea'],
      lastCalculatedAt: DEMO_NOW,
    },
  });

  await prisma.treatmentFeedbackSummary.upsert({
    where: { treatmentId: treatmentsBySlug['manual-sleep-optimization'].id },
    update: {
      providerId: providersBySlug.manual.id,
      avgEffectiveness: 5,
      avgSideEffects: 1,
      avgEaseOfUse: 5,
      totalFeedback: 1,
      excellentCount: 1,
      goodCount: 0,
      neutralCount: 0,
      disappointingCount: 0,
      poorCount: 0,
      continuationRate: 1,
      recommendationRate: 1,
      commonImprovements: ['poor_sleep', 'stress'],
      commonSideEffects: [],
      lastCalculatedAt: DEMO_NOW,
    },
    create: {
      treatmentId: treatmentsBySlug['manual-sleep-optimization'].id,
      providerId: providersBySlug.manual.id,
      avgEffectiveness: 5,
      avgSideEffects: 1,
      avgEaseOfUse: 5,
      totalFeedback: 1,
      excellentCount: 1,
      goodCount: 0,
      neutralCount: 0,
      disappointingCount: 0,
      poorCount: 0,
      continuationRate: 1,
      recommendationRate: 1,
      commonImprovements: ['poor_sleep', 'stress'],
      commonSideEffects: [],
      lastCalculatedAt: DEMO_NOW,
    },
  });

  await prismaAny.providerAnalyticsSnapshot.upsert({
    where: {
      providerId_snapshotDate: {
        providerId: providersBySlug.optimale.id,
        snapshotDate: new Date('2026-03-08'),
      },
    },
    update: {
      totalHandoffs: 1,
      convertedHandoffs: 1,
      conversionRate: 1,
      activeSubscriptions: 1,
      churnedSubscriptions: 0,
      retentionRate: 1,
      totalRevenue: 99,
      totalCommission: 14.85,
      avgRevenuePerHandoff: 99,
      conversionRank: 95,
      retentionRank: 92,
      revenueRank: 90,
    },
    create: {
      providerId: providersBySlug.optimale.id,
      snapshotDate: new Date('2026-03-08'),
      totalHandoffs: 1,
      convertedHandoffs: 1,
      conversionRate: 1,
      activeSubscriptions: 1,
      churnedSubscriptions: 0,
      retentionRate: 1,
      totalRevenue: 99,
      totalCommission: 14.85,
      avgRevenuePerHandoff: 99,
      conversionRank: 95,
      retentionRank: 92,
      revenueRank: 90,
    },
  });

  await prismaAny.providerAnalyticsSnapshot.upsert({
    where: {
      providerId_snapshotDate: {
        providerId: providersBySlug.numan.id,
        snapshotDate: new Date('2026-03-08'),
      },
    },
    update: {
      totalHandoffs: 1,
      convertedHandoffs: 0,
      conversionRate: 0,
      activeSubscriptions: 0,
      churnedSubscriptions: 0,
      retentionRate: null,
      totalRevenue: 0,
      totalCommission: 0,
      avgRevenuePerHandoff: 0,
      conversionRank: 52,
      retentionRank: null,
      revenueRank: 45,
    },
    create: {
      providerId: providersBySlug.numan.id,
      snapshotDate: new Date('2026-03-08'),
      totalHandoffs: 1,
      convertedHandoffs: 0,
      conversionRate: 0,
      activeSubscriptions: 0,
      churnedSubscriptions: 0,
      retentionRate: null,
      totalRevenue: 0,
      totalCommission: 0,
      avgRevenuePerHandoff: 0,
      conversionRank: 52,
      retentionRank: null,
      revenueRank: 45,
    },
  });

  await prismaAny.providerAnalyticsSnapshot.upsert({
    where: {
      providerId_snapshotDate: {
        providerId: providersBySlug.manual.id,
        snapshotDate: new Date('2026-03-08'),
      },
    },
    update: {
      totalHandoffs: 1,
      convertedHandoffs: 0,
      conversionRate: 0,
      activeSubscriptions: 0,
      churnedSubscriptions: 0,
      retentionRate: null,
      totalRevenue: 0,
      totalCommission: 0,
      avgRevenuePerHandoff: 0,
      conversionRank: 50,
      retentionRank: null,
      revenueRank: 44,
    },
    create: {
      providerId: providersBySlug.manual.id,
      snapshotDate: new Date('2026-03-08'),
      totalHandoffs: 1,
      convertedHandoffs: 0,
      conversionRate: 0,
      activeSubscriptions: 0,
      churnedSubscriptions: 0,
      retentionRate: null,
      totalRevenue: 0,
      totalCommission: 0,
      avgRevenuePerHandoff: 0,
      conversionRank: 50,
      retentionRank: null,
      revenueRank: 44,
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: testUser.id,
        channel: 'email',
        type: 'welcome',
        title: 'Welcome to HealthPilot',
        body: 'Your account is ready. You can start a guided intake or return later.',
        priority: 'normal',
        status: 'SENT',
        sentAt: daysFromDemoNow(-30),
      },
      {
        userId: johnSmith.id,
        channel: 'in_app',
        type: 'recommendation_ready',
        title: 'Your health recommendations are ready',
        body: 'Your hormone and recovery summary is ready to review.',
        data: toJsonValue({ recommendationId: johnSmithRecommendation.id }),
        priority: 'high',
        status: 'READ',
        sentAt: daysFromDemoNow(-13),
        readAt: daysFromDemoNow(-12),
      },
      {
        userId: armandMaulani.id,
        channel: 'email',
        type: 'blood_test_results_ready',
        title: 'Your blood test results are ready',
        body: 'Your metabolic panel has been processed and added to your account.',
        data: toJsonValue({ bloodTestId: armandBloodTest.id }),
        priority: 'high',
        status: 'SENT',
        sentAt: daysFromDemoNow(-9),
      },
      {
        userId: sarahChen.id,
        channel: 'in_app',
        type: 'provider_handoff_update',
        title: 'A provider has received your handoff',
        body: 'Manual has received your sleep-optimization handoff and will review it shortly.',
        data: toJsonValue({ handoffId: sarahHandoff.id }),
        priority: 'normal',
        status: 'PENDING',
        scheduledFor: daysFromDemoNow(1),
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        userId: admin.id,
        action: 'READ',
        resourceType: 'health_intake',
        resourceId: johnSmithIntake.id,
        ipAddress: '127.0.0.1',
        userAgent: 'seed-script',
        metadata: toJsonValue({ reason: 'seeded_admin_review' }),
        createdAt: daysFromDemoNow(-13),
      },
      {
        userId: admin.id,
        action: 'UPDATE',
        resourceType: 'blood_test',
        resourceId: armandBloodTest.id,
        ipAddress: '127.0.0.1',
        userAgent: 'seed-script',
        metadata: toJsonValue({ reason: 'seeded_result_review' }),
        createdAt: daysFromDemoNow(-9),
      },
      {
        userId: admin.id,
        action: 'HANDOFF',
        resourceType: 'provider_handoff',
        resourceId: johnSmithHandoff.id,
        ipAddress: '127.0.0.1',
        userAgent: 'seed-script',
        metadata: toJsonValue({ provider: providersBySlug.optimale.name }),
        createdAt: daysFromDemoNow(-12),
      },
    ],
  });

  const seededWebhookTargets = await prisma.providerWebhook.findMany({
    where: {
      providerId: {
        in: [providersBySlug.optimale.id, providersBySlug.numan.id, providersBySlug.manual.id],
      },
    },
    select: { id: true, providerId: true, eventType: true },
  });

  await prisma.webhookLog.deleteMany({
    where: { webhookId: { in: seededWebhookTargets.map((webhook) => webhook.id) } },
  });

  const webhookByProviderAndType = Object.fromEntries(
    seededWebhookTargets.map((webhook) => [`${webhook.providerId}:${webhook.eventType}`, webhook])
  );

  await prisma.webhookLog.createMany({
    data: [
      {
        webhookId: webhookByProviderAndType[`${providersBySlug.optimale.id}:handoff`].id,
        handoffId: johnSmithHandoff.id,
        requestPayload: toJsonValue({
          handoffId: johnSmithHandoff.id,
          provider: providersBySlug.optimale.name,
        }),
        responseStatus: 200,
        responseBody: '{"received":true}',
        duration: 412,
        attempt: 1,
      },
      {
        webhookId: webhookByProviderAndType[`${providersBySlug.numan.id}:status_update`].id,
        handoffId: armandHandoff.id,
        requestPayload: toJsonValue({
          handoffId: armandHandoff.id,
          status: 'CONSULTATION_SCHEDULED',
        }),
        responseStatus: 200,
        responseBody: '{"updated":true}',
        duration: 365,
        attempt: 1,
      },
      {
        webhookId: webhookByProviderAndType[`${providersBySlug.manual.id}:result`].id,
        handoffId: sarahHandoff.id,
        requestPayload: toJsonValue({ handoffId: sarahHandoff.id, note: 'provider_received' }),
        responseStatus: 202,
        responseBody: '{"queued":true}',
        duration: 298,
        attempt: 1,
      },
    ],
  });

  console.log(
    '✅ End-to-end demo journeys seeded for intake, blood tests, recommendations, handoffs, analytics, and feedback'
  );

  console.log('🎉 Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
