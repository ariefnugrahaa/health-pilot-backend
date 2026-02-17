"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Starting database seed...');
    // ============================================
    // Create Admin User
    // ============================================
    const adminPassword = await bcrypt_1.default.hash('Admin123!', 12);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@healthpilot.com' },
        update: {},
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
            update: {},
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
            websiteUrl: 'https://optimale.co.uk',
            supportedRegions: ['UK'],
            acceptsBloodTests: true,
            commissionRate: 0.15,
            subscriptionShare: 0.1,
            status: 'ACTIVE',
        },
        {
            name: 'Numan',
            slug: 'numan',
            description: "Men's health platform offering various treatments",
            websiteUrl: 'https://numan.com',
            supportedRegions: ['UK'],
            acceptsBloodTests: true,
            commissionRate: 0.12,
            subscriptionShare: 0.08,
            status: 'ACTIVE',
        },
        {
            name: 'Manual',
            slug: 'manual',
            description: 'Wellness platform for men',
            websiteUrl: 'https://manual.co',
            supportedRegions: ['UK'],
            acceptsBloodTests: true,
            commissionRate: 0.12,
            subscriptionShare: 0.08,
            status: 'ACTIVE',
        },
    ];
    for (const provider of providers) {
        await prisma.provider.upsert({
            where: { slug: provider.slug },
            update: {},
            create: provider,
        });
    }
    console.log(`✅ ${providers.length} providers created`);
    // ============================================
    // Create Sample Treatments
    // ============================================
    const optimale = await prisma.provider.findUnique({ where: { slug: 'optimale' } });
    const numan = await prisma.provider.findUnique({ where: { slug: 'numan' } });
    if (optimale) {
        const treatments = [
            {
                providerId: optimale.id,
                name: 'Testosterone Replacement Therapy',
                slug: 'optimale-trt',
                description: 'Comprehensive TRT program with ongoing monitoring',
                category: 'HORMONE_THERAPY',
                priceSubscription: 99.0,
                subscriptionFrequency: 'monthly',
                currency: 'GBP',
                minAge: 18,
                maxAge: 80,
                allowedGenders: ['MALE'],
                requiresBloodTest: true,
                isActive: true,
            },
            {
                providerId: optimale.id,
                name: 'Hormone Optimization Program',
                slug: 'optimale-hormone-optimization',
                description: 'Full hormone panel optimization',
                category: 'HORMONE_THERAPY',
                priceSubscription: 149.0,
                subscriptionFrequency: 'monthly',
                currency: 'GBP',
                minAge: 25,
                maxAge: 70,
                allowedGenders: ['MALE'],
                requiresBloodTest: true,
                isActive: true,
            },
        ];
        for (const treatment of treatments) {
            await prisma.treatment.upsert({
                where: { slug: treatment.slug },
                update: {},
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
                category: 'WEIGHT_MANAGEMENT',
                priceSubscription: 199.0,
                subscriptionFrequency: 'monthly',
                currency: 'GBP',
                minAge: 18,
                maxAge: 75,
                allowedGenders: ['MALE', 'FEMALE'],
                requiresBloodTest: false,
                isActive: true,
            },
            {
                providerId: numan.id,
                name: 'Hair Loss Treatment',
                slug: 'numan-hair-loss',
                description: 'Finasteride and minoxidil combination therapy',
                category: 'HAIR_HEALTH',
                priceSubscription: 24.0,
                subscriptionFrequency: 'monthly',
                currency: 'GBP',
                minAge: 18,
                maxAge: 65,
                allowedGenders: ['MALE'],
                requiresBloodTest: false,
                isActive: true,
            },
            {
                providerId: numan.id,
                name: 'ED Treatment',
                slug: 'numan-ed',
                description: 'Erectile dysfunction treatment with sildenafil or tadalafil',
                category: 'SEXUAL_HEALTH',
                priceOneTime: 29.0,
                currency: 'GBP',
                minAge: 18,
                maxAge: 80,
                allowedGenders: ['MALE'],
                requiresBloodTest: false,
                isActive: true,
            },
        ];
        for (const treatment of treatments) {
            await prisma.treatment.upsert({
                where: { slug: treatment.slug },
                update: {},
                create: treatment,
            });
        }
        console.log(`✅ Numan treatments created`);
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
        update: {},
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
    console.log(`✅ AI prompt versions created`);
    // ============================================
    // Create Lab Partner
    // ============================================
    await prisma.labPartner.upsert({
        where: { code: 'MEDICHECKS' },
        update: {},
        create: {
            name: 'Medichecks',
            code: 'MEDICHECKS',
            supportedRegions: ['UK'],
            isActive: true,
        },
    });
    console.log(`✅ Lab partners created`);
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
//# sourceMappingURL=seed.js.map