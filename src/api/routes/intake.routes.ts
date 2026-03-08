import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { prisma } from '../../utils/database.js';
import { encryptionService } from '../../utils/encryption.js';
import logger from '../../utils/logger.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middlewares/error.middleware.js';
import { authenticate, optionalAuth } from '../middlewares/auth.middleware.js';
import { auditPhiAccess, auditPhiModification } from '../middlewares/audit.middleware.js';
import { AIProviderFactory } from '../../services/ai/ai-provider.factory.js';
import type { ApiResponse, AuthenticatedRequest, HealthIntakeData, AIAnalysisRequest } from '../../types/index.js';

const router = Router();

const mapFieldTypeToStepType = (fieldType: string): string => {
  const normalizedType = fieldType.toUpperCase();
  switch (normalizedType) {
    case 'TEXT':
      return 'text';
    case 'NUMBER':
      return 'number';
    case 'EMAIL':
      return 'email';
    case 'DATE':
      return 'date';
    case 'SELECT':
      return 'select';
    case 'MULTI_SELECT':
      return 'multi_select';
    case 'RADIO':
      return 'radio';
    case 'CHECKBOX':
      return 'checkbox';
    case 'TEXTAREA':
      return 'textarea';
    case 'PHONE':
      return 'phone';
    case 'BOOLEAN':
      return 'boolean';
    default:
      return 'text';
  }
};

const toStepOptions = (options: unknown): Array<{
  id: string;
  value: string;
  label: string;
  description?: string;
}> | undefined => {
  if (!Array.isArray(options)) {
    return undefined;
  }

  return options
    .filter((option): option is Record<string, unknown> => typeof option === 'object' && option !== null)
    .map((option, index) => {
      const value = String(option.value ?? `option_${index + 1}`);
      const label = String(option.label ?? value);
      const description = typeof option.description === 'string' ? option.description : undefined;
      return {
        id: `${value}_${index}`,
        value,
        label,
        ...(description ? { description } : {}),
      };
    });
};

// ============================================
// Validation Rules
// ============================================

const createIntakeValidation = [
  body('medicalHistory').optional().isObject(),
  body('familyHistory').optional().isObject(),
  body('symptoms').optional().isArray(),
  body('goals').optional().isArray(),
  body('lifestyle').optional().isObject(),
  body('preferences').optional().isObject(),
];

// ============================================
// Routes
// ============================================

/**
 * GET /intakes/config
 * Get dynamic intake configuration
 */
router.get(
  '/config',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const activeFlow = await prisma.intakeFlow.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: [
        { isDefault: 'desc' },
        { updatedAt: 'desc' },
      ],
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: {
            fields: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!activeFlow || activeFlow.sections.length === 0) {
      throw new NotFoundError('Active intake flow');
    }

    const intakeConfig = {
      steps: activeFlow.sections.map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description ?? undefined,
        isOptional: section.isOptional,
        fields: section.fields.map((field) => ({
          id: field.fieldKey,
          type: mapFieldTypeToStepType(field.type),
          label: field.label,
          placeholder: field.placeholder ?? undefined,
          helperText: field.helperText ?? undefined,
          required: field.isRequired,
          options: toStepOptions(field.options),
          validation: field.validationRules,
          dependsOnField: field.dependsOnField ?? undefined,
          dependsOnValue: field.dependsOnValue ?? undefined,
        })),
      })),
    };

    const response: ApiResponse<typeof intakeConfig> = {
      success: true,
      data: intakeConfig,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /intakes
 * Create a new health intake
 */
router.post(
  '/',
  optionalAuth,
  createIntakeValidation,
  auditPhiModification('health_intake', 'CREATE'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // We can't rely on express-validator for the flat payload structure as it differs from HealthIntakeData
    // strict validation is skipped here in favor of manual processing below

    let userId = req.user?.userId;

    // Create anonymous user if not authenticated
    if (!userId) {
      const anonymousUser = await prisma.user.create({
        data: {
          isAnonymous: true,
          status: 'ACTIVE',
          role: 'USER',
        },
      });
      userId = anonymousUser.id;
    }

    const rawData = req.body;

    // Transform flat payload to structured HealthIntakeData
    // The frontend sends a flat object based on the wizard config

    // 1. Extract Biometrics & Demographics
    const height = Number(rawData.height);
    const weight = Number(rawData.weight);

    let dob: Date | undefined;
    if (rawData.dob) {
      const parsed = new Date(rawData.dob);
      if (!isNaN(parsed.getTime())) {
        dob = parsed;
      } else {
        logger.warn('Invalid DOB format received', { dob: rawData.dob });
      }
    }

    // Map gender to uppercase for Prisma Enum
    let gender: import('../../types/index.js').Gender | undefined;
    if (rawData.gender) {
      const g = rawData.gender.toUpperCase();
      if (['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'].includes(g)) {
        gender = g as import('../../types/index.js').Gender;
      }
    }

    // Update User demographics if available
    const userUpdateData: any = {};
    if (dob) userUpdateData.dateOfBirth = dob;
    if (gender) userUpdateData.gender = gender;

    if (userId && Object.keys(userUpdateData).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: userUpdateData
      });
    }

    // 2. Map Goals
    const goals: import('../../types/index.js').HealthGoal[] = [];
    if (rawData.goal) {
      goals.push({
        category: rawData.goal,
        description: 'Primary goal from intake',
        priority: 'high'
      });
    }

    // 3. Map Conditions (Medical History)
    const conditions: string[] = Array.isArray(rawData.condition_list)
      ? rawData.condition_list.filter((c: string) => c !== 'none')
      : [];

    // 4. Map Lifestyle
    const lifestyleFactors = Array.isArray(rawData.lifestyle_factors) ? rawData.lifestyle_factors : [];

    const bmi = (height && weight) ? weight / ((height / 100) * (height / 100)) : undefined;

    const intakeData: HealthIntakeData & { rawResponses?: Record<string, unknown> } = {
      biometrics: {
        height,
        weight,
        ...(bmi ? { bmi } : {})
      },
      goals,
      medicalHistory: {
        conditions,
        surgeries: [],
        allergies: [],
        currentMedications: [],
        hasChronicConditions: conditions.length > 0
      },
      familyHistory: { conditions: [] },
      symptoms: [], // Map if available in rawData
      lifestyle: {
        // Map specific factors if they imply these values, otherwise defaults
        exerciseFrequency: lifestyleFactors.includes('exercise') ? 'moderate' : 'none',
        sleepHours: lifestyleFactors.includes('sleep') ? 6 : 7, // Default placeholder
        stressLevel: lifestyleFactors.includes('stress') ? 'high' : 'moderate',
        dietType: lifestyleFactors.includes('diet') ? 'mixed' : 'standard',
        smokingStatus: 'never',
        alcoholConsumption: 'none'
      },
      preferences: rawData.preferences || {
        riskTolerance: 'medium',
        budgetSensitivity: 'medium',
        preferSubscription: false,
        deliveryPreference: 'home'
      }
    };
    intakeData.rawResponses = rawData as Record<string, unknown>;

    // Encrypt PHI data
    const encryptedData = encryptionService.encrypt(JSON.stringify(intakeData));

    // Extract non-sensitive metadata for querying
    const primaryGoals = intakeData.goals.map((g) => g.category);
    const hasChronicConditions = intakeData.medicalHistory.conditions.length > 0;
    const takingMedications = false; // Default for now as not in simple flow

    const intake = await prisma.healthIntake.create({
      data: {
        userId,
        status: 'DRAFT',
        intakeDataEncrypted: encryptedData,
        primaryGoals,
        hasChronicConditions,
        takingMedications,
      },
    });

    logger.info('Health intake created', { intakeId: intake.id, userId });

    const response: ApiResponse<{ id: string; status: string; createdAt: Date }> = {
      success: true,
      data: {
        id: intake.id,
        status: intake.status,
        createdAt: intake.createdAt,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * GET /intakes/:intakeId
 * Get health intake by ID
 * Supports both authenticated and anonymous users
 */
router.get(
  '/:intakeId',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { intakeId } = (req as AuthenticatedRequest & { params: { intakeId: string } }).params;
    const userId = req.user?.userId;

    // Build query - if authenticated, ensure user owns the intake
    // If anonymous, just find by ID (they have the ID from their session)
    const whereClause = userId
      ? { id: intakeId, userId }
      : { id: intakeId };

    const intake = await prisma.healthIntake.findFirst({
      where: whereClause,
      include: {
        recommendations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!intake) {
      throw new NotFoundError('Health intake');
    }

    // Decrypt PHI data
    const decryptedData = JSON.parse(
      encryptionService.decrypt(intake.intakeDataEncrypted)
    ) as HealthIntakeData;

    // Parse recommendation data if available
    let recommendationData = null;
    const latestRecommendation = intake.recommendations?.[0];
    if (latestRecommendation) {
      const decryptedRecommendation = JSON.parse(
        encryptionService.decrypt(latestRecommendation.healthSummaryEncrypted)
      );
      recommendationData = {
        id: latestRecommendation.id,
        content: decryptedRecommendation.summary,
        actions: decryptedRecommendation.recommendations,
        warnings: decryptedRecommendation.warnings,
        nextSteps: decryptedRecommendation.nextSteps,
      };
    }

    const response: ApiResponse<{
      id: string;
      status: string;
      data: HealthIntakeData;
      recommendation: typeof recommendationData;
      createdAt: Date;
      updatedAt: Date;
    }> = {
      success: true,
      data: {
        id: intake.id,
        status: intake.status,
        data: decryptedData,
        recommendation: recommendationData,
        createdAt: intake.createdAt,
        updatedAt: intake.updatedAt,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * PATCH /intakes/:intakeId
 * Update health intake
 */
router.patch(
  '/:intakeId',
  authenticate,
  createIntakeValidation,
  auditPhiModification('health_intake', 'UPDATE'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        'Validation failed',
        errors.array().map((e) => ({
          field: e.type === 'field' ? e.path : 'unknown',
          message: e.msg as string,
        }))
      );
    }

    const { intakeId } = (req as AuthenticatedRequest & { params: { intakeId: string } }).params;
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    // Find existing intake
    const existingIntake = await prisma.healthIntake.findFirst({
      where: {
        id: intakeId,
        userId,
      },
    });

    if (!existingIntake) {
      throw new NotFoundError('Health intake');
    }

    // Merge with existing data
    const existingData = JSON.parse(
      encryptionService.decrypt(existingIntake.intakeDataEncrypted)
    ) as HealthIntakeData;

    const newData = (req as AuthenticatedRequest & { body: Partial<HealthIntakeData> }).body;
    const mergedData: HealthIntakeData = {
      ...existingData,
      ...newData,
      medicalHistory: { ...existingData.medicalHistory, ...newData.medicalHistory },
      familyHistory: { ...existingData.familyHistory, ...newData.familyHistory },
      lifestyle: { ...existingData.lifestyle, ...newData.lifestyle },
      preferences: { ...existingData.preferences, ...newData.preferences },
    };

    // Encrypt updated data
    const encryptedData = encryptionService.encrypt(JSON.stringify(mergedData));

    // Update metadata
    const primaryGoals = mergedData.goals?.map((g) => g.category) ?? [];
    const hasChronicConditions = (mergedData.medicalHistory?.conditions?.length ?? 0) > 0;
    const takingMedications = (mergedData.medicalHistory?.currentMedications?.length ?? 0) > 0;

    const intake = await prisma.healthIntake.update({
      where: { id: intakeId },
      data: {
        intakeDataEncrypted: encryptedData,
        primaryGoals,
        hasChronicConditions,
        takingMedications,
        version: { increment: 1 },
      },
    });

    logger.info('Health intake updated', { intakeId: intake.id, userId });

    const response: ApiResponse<{ id: string; status: string; version: number; updatedAt: Date }> =
    {
      success: true,
      data: {
        id: intake.id,
        status: intake.status,
        version: intake.version,
        updatedAt: intake.updatedAt,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /intakes/:intakeId/complete
 * Mark intake as completed and generate AI health summary
 */
router.post(
  '/:intakeId/complete',
  optionalAuth,
  auditPhiModification('health_intake', 'UPDATE'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { intakeId } = (req as AuthenticatedRequest & { params: { intakeId: string } }).params;
    let userId = req.user?.userId;

    // For anonymous users, we'll allow completing the intake without userId validation
    // The intake should exist regardless of authentication

    // 1. Get intake with user data
    const intake = await prisma.healthIntake.findFirst({
      where: userId
        ? {
          id: intakeId,
          userId,
        }
        : {
          id: intakeId,
        },
      include: {
        user: true
      }
    });

    if (!intake) {
      throw new NotFoundError('Health intake');
    }

    // Ensure we have the correct user ID for subsequent operations
    if (!userId) {
      userId = intake.userId;
    }

    // 2. Decrypt intake data
    const decryptedData = JSON.parse(
      encryptionService.decrypt(intake.intakeDataEncrypted)
    ) as HealthIntakeData;

    // 3. Calculate user age from DOB
    let userAge: number | undefined;
    let userGender: import('../../types/index.js').Gender | undefined;

    if (intake.user?.dateOfBirth) {
      const today = new Date();
      const birthDate = new Date(intake.user.dateOfBirth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      userAge = age;
    }

    if (intake.user?.gender) {
      userGender = intake.user.gender;
    }

    // 4. Build AI request (only include defined properties)
    const aiRequest: AIAnalysisRequest = {
      intakeData: decryptedData,
    };

    // Only add optional fields if they have values
    if (userAge !== undefined) {
      aiRequest.userAge = userAge;
    }
    if (userGender !== undefined) {
      aiRequest.userGender = userGender;
    }

    // 5. Call AI provider to generate health summary
    let aiResponse: import('../../types/index.js').AIAnalysisResponse;
    try {
      const aiProvider = AIProviderFactory.getProvider();
      logger.info('Generating AI health summary', {
        intakeId,
        provider: aiProvider.getProviderName(),
      });

      aiResponse = await aiProvider.analyzeHealth(aiRequest);

      logger.info('AI health summary generated successfully', {
        intakeId,
        tokensUsed: aiResponse.tokensUsed,
        model: aiResponse.modelVersion,
      });
    } catch (error) {
      logger.error('Failed to generate AI health summary', {
        intakeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(
        `Failed to generate health summary: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // 5. Store AI-generated summary in Recommendation table
    logger.info('Creating recommendation record', { userId, intakeId });

    if (!userId) {
      throw new Error('User ID is missing when creating recommendation');
    }

    const recommendation = await prisma.recommendation.create({
      data: {
        user: { connect: { id: userId } },
        healthIntake: { connect: { id: intakeId } },
        status: 'GENERATED',
        healthSummaryEncrypted: encryptionService.encrypt(
          JSON.stringify({
            summary: aiResponse.healthSummary,
            recommendations: aiResponse.recommendations,
            warnings: aiResponse.warnings,
            nextSteps: aiResponse.nextSteps,
          })
        ),
        primaryRecommendations: aiResponse.recommendations.slice(0, 3),
        aiModelVersion: aiResponse.modelVersion,
        promptVersion: aiResponse.promptVersion,
        tokensUsed: aiResponse.tokensUsed,
      },
    });

    // 6. Update intake status to COMPLETED
    const updatedIntake = await prisma.healthIntake.update({
      where: { id: intakeId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    logger.info('Health intake completed with AI summary', {
      intakeId,
      userId,
      recommendationId: recommendation.id,
    });

    // 7. Return recommendation data to frontend
    const response: ApiResponse<{
      intakeId: string;
      status: string;
      completedAt: Date | null;
      recommendationId: string;
      healthSummary: string;
      recommendations: string[];
      warnings: string[];
      nextSteps?: typeof aiResponse.nextSteps;
    }> = {
      success: true,
      data: {
        intakeId: updatedIntake.id,
        status: updatedIntake.status,
        completedAt: updatedIntake.completedAt,
        recommendationId: recommendation.id,
        healthSummary: aiResponse.healthSummary,
        recommendations: aiResponse.recommendations,
        warnings: aiResponse.warnings,
        nextSteps: aiResponse.nextSteps,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /intakes
 * List user's health intakes
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const intakes = await prisma.healthIntake.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        primaryGoals: true,
        version: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const response: ApiResponse<typeof intakes> = {
      success: true,
      data: intakes,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

export default router;
