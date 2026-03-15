import { Router, Response } from 'express';
import { prisma } from '../../utils/database.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middlewares/error.middleware.js';
import {
    authenticate,
    requireAdmin,
} from '../middlewares/auth.middleware.js';
import type { AuthenticatedRequest, TreatmentCategory } from '../../types/index.js';

const router = Router();

function getRequiredParam(value: string | string[] | undefined, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new ValidationError(`Valid ${field} is required`);
    }

    return value;
}

// ============================================
// Admin Routes (Global Treatment Management)
// ============================================

/**
 * GET /treatments/admin/list
 * List all treatments across all providers (admin dashboard)
 */
router.get(
    '/admin/list',
    authenticate,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { status, category, search, providerId } = req.query as {
            status?: string;
            category?: string;
            search?: string;
            providerId?: string;
        };

        const where: any = {};

        // Filter by Status
        if (status && status !== 'All') {
            where.isActive = status === 'ACTIVE';
        }

        // Filter by Category
        if (category && category !== 'All') {
            where.category = category as TreatmentCategory;
        }

        // Filter by Provider
        if (providerId && providerId !== 'All') {
            where.providerId = providerId;
        }

        // Search by Name or Slug
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
            ];
        }

        const treatments = await prisma.treatment.findMany({
            where,
            select: {
                id: true,
                name: true,
                slug: true,
                category: true,
                isActive: true,
                priceOneTime: true,
                priceSubscription: true,
                currency: true,
                createdAt: true,
                updatedAt: true,
                provider: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                _count: {
                    select: { matchingRules: true },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        const response = {
            success: true,
            data: treatments,
            meta: { timestamp: new Date().toISOString() },
        };

        res.status(200).json(response);
    })
);

/**
 * GET /treatments/:id
 * Get single treatment detail (with rules and eligible providers)
 */
router.get(
    '/:id',
    authenticate,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const id = getRequiredParam(req.params.id, 'id');

        const [treatment, providers] = await Promise.all([
            prisma.treatment.findUnique({
                where: { id },
                include: {
                    provider: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    matchingRules: {
                        orderBy: { priority: 'asc' },
                    },
                    treatmentBiomarkers: {
                        include: {
                            biomarker: true,
                        },
                    },
                },
            }),
            prisma.provider.findMany({
                where: { status: 'ACTIVE' },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    status: true,
                    supportedRegions: true,
                },
                orderBy: { name: 'asc' },
            }),
        ]);

        if (!treatment) {
            throw new NotFoundError('Treatment');
        }

        const response = {
            success: true,
            data: {
                ...treatment,
                eligibleProviders: providers,
            },
            meta: { timestamp: new Date().toISOString() },
        };

        res.status(200).json(response);
    })
);

/**
 * POST /treatments
 * Create a new treatment (admin global create)
 */
router.post(
    '/',
    authenticate,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const {
            providerId,
            name,
            slug,
            description,
            category,
            supportedCategories,
            // Recommendation Settings
            includeInMatching,
            forceRankingOverride,
            // Solution Properties
            requiresBloodTest,
            injectionBased,
            prescriptionRequired,
            // Eligibility Overview
            requiresBiomarkers,
            minAge,
            maxAge,
            allowedGenders,
            additionalNotes,
            // Pricing
            priceOneTime,
            priceSubscription,
            subscriptionFrequency,
            currency,
            isActive,
        } = req.body;

        // Validate provider existence
        const provider = await prisma.provider.findUnique({
            where: { id: providerId },
        });
        if (!provider) {
            throw new ValidationError('Provider not found');
        }

        // Check slug uniqueness
        const existing = await prisma.treatment.findUnique({
            where: { slug },
        });
        if (existing) {
            throw new ValidationError('Treatment with this slug already exists');
        }

        const treatment = await prisma.treatment.create({
            data: {
                providerId,
                name,
                slug,
                description: description || null,
                category,
                supportedCategories: supportedCategories || null,
                // Recommendation Settings
                includeInMatching: includeInMatching !== undefined ? includeInMatching : true,
                forceRankingOverride: forceRankingOverride || null,
                // Solution Properties
                requiresBloodTest: requiresBloodTest || false,
                injectionBased: injectionBased || false,
                prescriptionRequired: prescriptionRequired || false,
                // Eligibility Overview
                requiresBiomarkers: requiresBiomarkers || false,
                minAge: minAge ? Number(minAge) : null,
                maxAge: maxAge ? Number(maxAge) : null,
                allowedGenders: allowedGenders || [],
                additionalNotes: additionalNotes || null,
                // Pricing
                priceOneTime: priceOneTime ? Number(priceOneTime) : null,
                priceSubscription: priceSubscription ? Number(priceSubscription) : null,
                subscriptionFrequency: subscriptionFrequency || null,
                currency: currency || 'GBP',
                isActive: isActive !== undefined ? isActive : true,
            },
        });

        const response = {
            success: true,
            data: treatment,
            meta: { timestamp: new Date().toISOString() },
        };

        res.status(201).json(response);
    })
);

/**
 * PATCH /treatments/:id
 * Update treatment
 */
router.patch(
    '/:id',
    authenticate,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const id = getRequiredParam(req.params.id, 'id');
        const updateData = req.body;

        // Remove immutable fields or handle separately if needed
        delete updateData.id;
        delete updateData.createdAt;
        delete updateData.updatedAt;

        const treatment = await prisma.treatment.update({
            where: { id },
            data: updateData,
        });

        const response = {
            success: true,
            data: treatment,
            meta: { timestamp: new Date().toISOString() },
        };

        res.status(200).json(response);
    })
);

/**
 * DELETE /treatments/:id
 * Delete treatment (or soft delete via isActive = false if preferred)
 */
router.delete(
    '/:id',
    authenticate,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const id = getRequiredParam(req.params.id, 'id');

        // Check if it has related data that prevents deletion?
        // For now, we allow deletion as cascade is configured in schema for some relations,
        // but schema says `onDelete: Cascade` for matchingRules? need to check schema.
        // Provider -> Treatment has cascade. Treatment -> MatchingRule?

        await prisma.treatment.delete({
            where: { id },
        });

        res.status(204).send();
    })
);

// ============================================
// Matching Rule Routes
// ============================================

/**
 * POST /treatments/:id/rules
 * Create a new matching rule for a treatment
 */
router.post(
    '/:id/rules',
    authenticate,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const id = getRequiredParam(req.params.id, 'id');
        const {
            name,
            description,
            field,
            operator,
            value,
            weight,
            isRequired,
            isActive,
            priority,
            // New fields
            triggerSource,
            evaluationTiming,
            providerCapabilities,
            locationConstraints,
            availabilityStatus,
            linkedTreatments,
            confidence,
            explanation,
            exclusionReasons,
        } = req.body;

        const treatment = await prisma.treatment.findUnique({
            where: { id },
        });
        if (!treatment) {
            throw new NotFoundError('Treatment');
        }

        const rule = await prisma.matchingRule.create({
            data: {
                treatmentId: id,
                name,
                description,
                field: field || 'custom',
                operator: operator || 'EQUALS',
                value: value || '{}',
                weight: weight !== undefined ? weight : 1.0,
                isRequired: isRequired || false,
                isActive: isActive !== undefined ? isActive : true,
                priority: priority || 0,
                // New fields
                triggerSource,
                evaluationTiming,
                providerCapabilities: providerCapabilities || [],
                locationConstraints: locationConstraints || [],
                availabilityStatus,
                linkedTreatments: linkedTreatments || [],
                confidence,
                explanation,
                exclusionReasons: exclusionReasons || [],
            },
        });

        const response = {
            success: true,
            data: rule,
            meta: { timestamp: new Date().toISOString() },
        };

        res.status(201).json(response);
    })
);

/**
 * PATCH /treatments/:id/rules/:ruleId
 * Update a matching rule
 */
router.patch(
    '/:id/rules/:ruleId',
    authenticate,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const id = getRequiredParam(req.params.id, 'id');
        const ruleId = getRequiredParam(req.params.ruleId, 'ruleId');
        const updateData = req.body;

        // Verify ownership/existence
        const existingRule = await prisma.matchingRule.findFirst({
            where: { id: ruleId, treatmentId: id }
        });

        if (!existingRule) {
            throw new NotFoundError('Matching Rule');
        }

        delete updateData.id;
        delete updateData.treatmentId;
        delete updateData.createdAt;
        delete updateData.updatedAt;

        const rule = await prisma.matchingRule.update({
            where: { id: ruleId },
            data: updateData,
        });

        const response = {
            success: true,
            data: rule,
            meta: { timestamp: new Date().toISOString() },
        };

        res.status(200).json(response);
    })
);

/**
 * DELETE /treatments/:id/rules/:ruleId
 * Delete a matching rule
 */
router.delete(
    '/:id/rules/:ruleId',
    authenticate,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const id = getRequiredParam(req.params.id, 'id');
        const ruleId = getRequiredParam(req.params.ruleId, 'ruleId');

        // Verify existence and link to treatment
        const rule = await prisma.matchingRule.findFirst({
            where: {
                id: ruleId,
                treatmentId: id,
            },
        });

        if (!rule) {
            throw new NotFoundError('Matching Rule');
        }

        await prisma.matchingRule.delete({
            where: { id: ruleId },
        });

        res.status(204).send();
    })
);

export default router;
