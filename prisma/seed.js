"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var bcrypt_1 = __importDefault(require("bcrypt"));
var prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var adminPassword, admin, testPassword, testUser, biomarkers, _i, biomarkers_1, biomarker, providers, _a, providers_1, provider, optimale, numan, treatments, _b, treatments_1, treatment, treatments, _c, treatments_2, treatment;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    console.log('🌱 Starting database seed...');
                    return [4 /*yield*/, bcrypt_1.default.hash('Admin123!', 12)];
                case 1:
                    adminPassword = _d.sent();
                    return [4 /*yield*/, prisma.user.upsert({
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
                        })];
                case 2:
                    admin = _d.sent();
                    console.log("\u2705 Admin user created: ".concat(admin.email));
                    return [4 /*yield*/, bcrypt_1.default.hash('Test123!', 12)];
                case 3:
                    testPassword = _d.sent();
                    return [4 /*yield*/, prisma.user.upsert({
                            where: { email: 'test@healthpilot.com' },
                            update: {},
                            create: {
                                email: 'test@healthpilot.com',
                                passwordHash: testPassword,
                                firstName: 'John',
                                lastName: 'Doe',
                                isAnonymous: false,
                                isEmailVerified: true,
                                status: 'ACTIVE',
                                role: 'USER',
                            },
                        })];
                case 4:
                    testUser = _d.sent();
                    console.log("\u2705 Test user created: ".concat(testUser.email));
                    biomarkers = [
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
                    _i = 0, biomarkers_1 = biomarkers;
                    _d.label = 5;
                case 5:
                    if (!(_i < biomarkers_1.length)) return [3 /*break*/, 8];
                    biomarker = biomarkers_1[_i];
                    return [4 /*yield*/, prisma.biomarker.upsert({
                            where: { code: biomarker.code },
                            update: {},
                            create: biomarker,
                        })];
                case 6:
                    _d.sent();
                    _d.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8:
                    console.log("\u2705 ".concat(biomarkers.length, " biomarkers created"));
                    providers = [
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
                    _a = 0, providers_1 = providers;
                    _d.label = 9;
                case 9:
                    if (!(_a < providers_1.length)) return [3 /*break*/, 12];
                    provider = providers_1[_a];
                    return [4 /*yield*/, prisma.provider.upsert({
                            where: { slug: provider.slug },
                            update: {},
                            create: provider,
                        })];
                case 10:
                    _d.sent();
                    _d.label = 11;
                case 11:
                    _a++;
                    return [3 /*break*/, 9];
                case 12:
                    console.log("\u2705 ".concat(providers.length, " providers created"));
                    return [4 /*yield*/, prisma.provider.findUnique({ where: { slug: 'optimale' } })];
                case 13:
                    optimale = _d.sent();
                    return [4 /*yield*/, prisma.provider.findUnique({ where: { slug: 'numan' } })];
                case 14:
                    numan = _d.sent();
                    if (!optimale) return [3 /*break*/, 19];
                    treatments = [
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
                    _b = 0, treatments_1 = treatments;
                    _d.label = 15;
                case 15:
                    if (!(_b < treatments_1.length)) return [3 /*break*/, 18];
                    treatment = treatments_1[_b];
                    return [4 /*yield*/, prisma.treatment.upsert({
                            where: { slug: treatment.slug },
                            update: {},
                            create: treatment,
                        })];
                case 16:
                    _d.sent();
                    _d.label = 17;
                case 17:
                    _b++;
                    return [3 /*break*/, 15];
                case 18:
                    console.log("\u2705 Optimale treatments created");
                    _d.label = 19;
                case 19:
                    if (!numan) return [3 /*break*/, 24];
                    treatments = [
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
                    _c = 0, treatments_2 = treatments;
                    _d.label = 20;
                case 20:
                    if (!(_c < treatments_2.length)) return [3 /*break*/, 23];
                    treatment = treatments_2[_c];
                    return [4 /*yield*/, prisma.treatment.upsert({
                            where: { slug: treatment.slug },
                            update: {},
                            create: treatment,
                        })];
                case 21:
                    _d.sent();
                    _d.label = 22;
                case 22:
                    _c++;
                    return [3 /*break*/, 20];
                case 23:
                    console.log("\u2705 Numan treatments created");
                    _d.label = 24;
                case 24: 
                // ============================================
                // Create AI Prompt Versions
                // ============================================
                return [4 /*yield*/, prisma.aIPromptVersion.upsert({
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
                            systemPrompt: "You are a health education assistant for HealthPilot. \nYou analyze health data and provide educational insights.\nYou do NOT diagnose or prescribe - all outputs are informational only.",
                            promptTemplate: "Analyze the following health data and provide educational insights:\n{{healthData}}\n\nProvide your response in JSON format with:\n- healthSummary: A clear overview\n- recommendations: Array of educational recommendations\n- warnings: Any values that warrant professional attention",
                            isActive: true,
                        },
                    })];
                case 25:
                    // ============================================
                    // Create AI Prompt Versions
                    // ============================================
                    _d.sent();
                    console.log("\u2705 AI prompt versions created");
                    // ============================================
                    // Create Lab Partner
                    // ============================================
                    return [4 /*yield*/, prisma.labPartner.upsert({
                            where: { code: 'MEDICHECKS' },
                            update: {},
                            create: {
                                name: 'Medichecks',
                                code: 'MEDICHECKS',
                                supportedRegions: ['UK'],
                                isActive: true,
                            },
                        })];
                case 26:
                    // ============================================
                    // Create Lab Partner
                    // ============================================
                    _d.sent();
                    console.log("\u2705 Lab partners created");
                    console.log('🎉 Database seed completed successfully!');
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .catch(function (e) {
    console.error('❌ Seed failed:', e);
    process.exit(1);
})
    .finally(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
