import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';

import { prisma } from '../../../utils/database.js';
import {
  asyncHandler,
  ValidationError,
  NotFoundError,
} from '../../middlewares/error.middleware.js';
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware.js';
import type {
  AuthenticatedRequest,
  ApiResponse,
  MatchingRuleOperator,
} from '../../../types/index.js';

const router = Router();

// ============================================
// Validation
// ============================================

const createRuleValidation = [
  body('treatmentId').isUUID().withMessage('Treatment ID must be a valid UUID'),
  body('name').isString().notEmpty().withMessage('Name is required'),
  body('field').isString().notEmpty().withMessage('Field path is required'),
  body('operator')
    .isIn([
      'EQUALS',
      'NOT_EQUALS',
      'GREATER_THAN',
      'LESS_THAN',
      'GREATER_THAN_OR_EQUALS',
      'LESS_THAN_OR_EQUALS',
      'CONTAINS',
      'NOT_CONTAINS',
      'IN',
      'NOT_IN',
      'BETWEEN',
      'IS_NULL',
      'IS_NOT_NULL',
    ])
    .withMessage('Invalid operator'),
  body('value').exists().withMessage('Value is required'),
  body('weight')
    .optional()
    .isFloat({ min: 0, max: 10 })
    .withMessage('Weight must be between 0 and 10'),
  body('isRequired').optional().isBoolean(),
  body('priority').optional().isInt({ min: 0 }),
];

const updateRuleValidation = [
  body('name').optional().isString().notEmpty(),
  body('field').optional().isString().notEmpty(),
  body('operator')
    .optional()
    .isIn([
      'EQUALS',
      'NOT_EQUALS',
      'GREATER_THAN',
      'LESS_THAN',
      'GREATER_THAN_OR_EQUALS',
      'LESS_THAN_OR_EQUALS',
      'CONTAINS',
      'NOT_CONTAINS',
      'IN',
      'NOT_IN',
      'BETWEEN',
      'IS_NULL',
      'IS_NOT_NULL',
    ]),
  body('value').optional(),
  body('weight').optional().isFloat({ min: 0, max: 10 }),
  body('isRequired').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
  body('priority').optional().isInt({ min: 0 }),
];

// ============================================
// Routes
// ============================================

/**
 * GET /matching-rules
 * List all matching rules (optionally filtered by treatment)
 */
router.get(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { treatmentId, isActive } = req.query as { treatmentId?: string; isActive?: string };

    const where: Record<string, unknown> = {};
    if (treatmentId) {
      where['treatmentId'] = treatmentId;
    }
    if (isActive !== undefined) {
      where['isActive'] = isActive === 'true';
    }

    const rules = await prisma.matchingRule.findMany({
      where,
      include: {
        treatment: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: [{ treatmentId: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
    });

    const response: ApiResponse<typeof rules> = {
      success: true,
      data: rules,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /matching-rules/:ruleId
 * Get a single matching rule
 */
router.get(
  '/:ruleId',
  authenticate,
  requireAdmin,
  [param('ruleId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { ruleId } = req.params as { ruleId: string };

    const rule = await prisma.matchingRule.findUnique({
      where: { id: ruleId },
      include: {
        treatment: {
          select: { id: true, name: true, slug: true, category: true },
        },
      },
    });

    if (!rule) {
      throw new NotFoundError('Matching rule');
    }

    const response: ApiResponse<typeof rule> = {
      success: true,
      data: rule,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /matching-rules
 * Create a new matching rule
 */
router.post(
  '/',
  authenticate,
  requireAdmin,
  createRuleValidation,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        'Validation failed',
        errors.array().map((e) => ({
          field: 'param' in e ? String(e.param) : 'unknown',
          message: e.msg as string,
        }))
      );
    }

    const {
      treatmentId,
      name,
      description,
      field,
      operator,
      value,
      weight = 1.0,
      isRequired = false,
      priority = 0,
    } = req.body as {
      treatmentId: string;
      name: string;
      description?: string;
      field: string;
      operator: MatchingRuleOperator;
      value: unknown;
      weight?: number;
      isRequired?: boolean;
      priority?: number;
    };

    // Verify treatment exists
    const treatment = await prisma.treatment.findUnique({
      where: { id: treatmentId },
    });

    if (!treatment) {
      throw new NotFoundError('Treatment');
    }

    // Create the rule
    const rule = await prisma.matchingRule.create({
      data: {
        treatmentId,
        name,
        description: description ?? null,
        field,
        operator,
        value: JSON.stringify(value),
        weight,
        isRequired,
        isActive: true,
        priority,
      },
    });

    const response: ApiResponse<typeof rule> = {
      success: true,
      data: rule,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * PATCH /matching-rules/:ruleId
 * Update a matching rule
 */
router.patch(
  '/:ruleId',
  authenticate,
  requireAdmin,
  [param('ruleId').isUUID(), ...updateRuleValidation],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        'Validation failed',
        errors.array().map((e) => ({
          field: 'param' in e ? String(e.param) : 'unknown',
          message: e.msg as string,
        }))
      );
    }

    const { ruleId } = req.params as { ruleId: string };

    // Verify rule exists
    const existingRule = await prisma.matchingRule.findUnique({
      where: { id: ruleId },
    });

    if (!existingRule) {
      throw new NotFoundError('Matching rule');
    }

    const { name, description, field, operator, value, weight, isRequired, isActive, priority } =
      req.body as {
        name?: string;
        description?: string;
        field?: string;
        operator?: MatchingRuleOperator;
        value?: unknown;
        weight?: number;
        isRequired?: boolean;
        isActive?: boolean;
        priority?: number;
      };

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      updateData['name'] = name;
    }
    if (description !== undefined) {
      updateData['description'] = description;
    }
    if (field !== undefined) {
      updateData['field'] = field;
    }
    if (operator !== undefined) {
      updateData['operator'] = operator;
    }
    if (value !== undefined) {
      updateData['value'] = JSON.stringify(value);
    }
    if (weight !== undefined) {
      updateData['weight'] = weight;
    }
    if (isRequired !== undefined) {
      updateData['isRequired'] = isRequired;
    }
    if (isActive !== undefined) {
      updateData['isActive'] = isActive;
    }
    if (priority !== undefined) {
      updateData['priority'] = priority;
    }

    const rule = await prisma.matchingRule.update({
      where: { id: ruleId },
      data: updateData,
    });

    const response: ApiResponse<typeof rule> = {
      success: true,
      data: rule,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * DELETE /matching-rules/:ruleId
 * Delete a matching rule
 */
router.delete(
  '/:ruleId',
  authenticate,
  requireAdmin,
  [param('ruleId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { ruleId } = req.params as { ruleId: string };

    // Verify rule exists
    const existingRule = await prisma.matchingRule.findUnique({
      where: { id: ruleId },
    });

    if (!existingRule) {
      throw new NotFoundError('Matching rule');
    }

    await prisma.matchingRule.delete({
      where: { id: ruleId },
    });

    res.status(204).send();
  })
);

/**
 * POST /matching-rules/bulk
 * Create multiple rules for a treatment at once
 */
router.post(
  '/bulk',
  authenticate,
  requireAdmin,
  [
    body('treatmentId').isUUID(),
    body('rules').isArray({ min: 1 }).withMessage('At least one rule is required'),
    body('rules.*.name').isString().notEmpty(),
    body('rules.*.field').isString().notEmpty(),
    body('rules.*.operator').isIn([
      'EQUALS',
      'NOT_EQUALS',
      'GREATER_THAN',
      'LESS_THAN',
      'GREATER_THAN_OR_EQUALS',
      'LESS_THAN_OR_EQUALS',
      'CONTAINS',
      'NOT_CONTAINS',
      'IN',
      'NOT_IN',
      'BETWEEN',
      'IS_NULL',
      'IS_NOT_NULL',
    ]),
    body('rules.*.value').exists(),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        'Validation failed',
        errors.array().map((e) => ({
          field: 'param' in e ? String(e.param) : 'unknown',
          message: e.msg as string,
        }))
      );
    }

    const { treatmentId, rules } = req.body as {
      treatmentId: string;
      rules: Array<{
        name: string;
        description?: string;
        field: string;
        operator: MatchingRuleOperator;
        value: unknown;
        weight?: number;
        isRequired?: boolean;
        priority?: number;
      }>;
    };

    // Verify treatment exists
    const treatment = await prisma.treatment.findUnique({
      where: { id: treatmentId },
    });

    if (!treatment) {
      throw new NotFoundError('Treatment');
    }

    // Create all rules in a transaction
    const createdRules = await prisma.$transaction(
      rules.map((rule, index) =>
        prisma.matchingRule.create({
          data: {
            treatmentId,
            name: rule.name,
            description: rule.description ?? null,
            field: rule.field,
            operator: rule.operator,
            value: JSON.stringify(rule.value),
            weight: rule.weight ?? 1.0,
            isRequired: rule.isRequired ?? false,
            isActive: true,
            priority: rule.priority ?? index,
          },
        })
      )
    );

    const response: ApiResponse<typeof createdRules> = {
      success: true,
      data: createdRules,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * GET /matching-rules/treatment/:treatmentId/preview
 * Preview how rules would evaluate for sample data
 */
router.post(
  '/treatment/:treatmentId/preview',
  authenticate,
  requireAdmin,
  [param('treatmentId').isUUID()],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { treatmentId } = req.params as { treatmentId: string };
    const sampleContext = req.body as Record<string, unknown>;

    // Get all active rules for this treatment
    const rules = await prisma.matchingRule.findMany({
      where: {
        treatmentId,
        isActive: true,
      },
      orderBy: { priority: 'desc' },
    });

    // Evaluate each rule (simplified - for preview)
    const evaluations = rules.map((rule) => {
      // Parse the stored value
      let ruleValue: unknown;
      try {
        ruleValue = JSON.parse(rule.value);
      } catch {
        ruleValue = rule.value;
      }

      // Get context value (simplified path resolution)
      const contextValue = sampleContext[rule.field];

      // Simple evaluation for preview
      let result = false;
      try {
        switch (rule.operator) {
          case 'EQUALS':
            result = contextValue === ruleValue;
            break;
          case 'NOT_EQUALS':
            result = contextValue !== ruleValue;
            break;
          case 'GREATER_THAN':
            result = Number(contextValue) > Number(ruleValue);
            break;
          case 'LESS_THAN':
            result = Number(contextValue) < Number(ruleValue);
            break;
          case 'CONTAINS':
            result = String(contextValue).includes(String(ruleValue));
            break;
          case 'IN':
            result = Array.isArray(ruleValue) && ruleValue.includes(contextValue);
            break;
          case 'IS_NULL':
            result = contextValue === null || contextValue === undefined;
            break;
          case 'IS_NOT_NULL':
            result = contextValue !== null && contextValue !== undefined;
            break;
          default:
            result = false;
        }
      } catch {
        result = false;
      }

      return {
        ruleId: rule.id,
        ruleName: rule.name,
        field: rule.field,
        operator: rule.operator,
        expectedValue: ruleValue,
        actualValue: contextValue,
        passed: result,
        isRequired: rule.isRequired,
        weight: Number(rule.weight),
      };
    });

    // Calculate overall result
    const requiredRules = evaluations.filter((e) => e.isRequired);
    const allRequiredPassed = requiredRules.every((e) => e.passed);
    const totalWeight = evaluations.reduce((sum, e) => sum + (e.passed ? e.weight : 0), 0);
    const maxWeight = evaluations.reduce((sum, e) => sum + e.weight, 0);
    const score = maxWeight > 0 ? totalWeight / maxWeight : 0;

    const response: ApiResponse<{
      isEligible: boolean;
      score: number;
      evaluations: typeof evaluations;
    }> = {
      success: true,
      data: {
        isEligible: allRequiredPassed,
        score: Math.round(score * 10000) / 10000,
        evaluations,
      },
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

export default router;
