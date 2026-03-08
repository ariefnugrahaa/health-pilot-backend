import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';

import { intakeFlowService } from '../../../services/intake-flow/intake-flow.service.js';
import {
  asyncHandler,
  ValidationError,
  NotFoundError,
} from '../../middlewares/error.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import type { ApiResponse, AuthenticatedRequest } from '../../../types/index.js';

const router = Router();
const OPTION_BASED_FIELD_TYPES = new Set(['SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX']);

const validateFieldOptionsForType = (typeRaw: unknown, options: unknown): void => {
  const type = String(typeRaw ?? '').toUpperCase();
  if (!OPTION_BASED_FIELD_TYPES.has(type)) {
    return;
  }

  if (!Array.isArray(options) || options.length === 0) {
    throw new Error(`Field type ${type} requires at least one option`);
  }

  for (const option of options) {
    if (!option || typeof option !== 'object') {
      throw new Error('Each option must be an object');
    }

    const typedOption = option as Record<string, unknown>;
    const value = String(typedOption.value ?? '').trim();
    const label = String(typedOption.label ?? '').trim();

    if (!value || !label) {
      throw new Error('Each option must include non-empty value and label');
    }
  }
};

const validateScoringConfig = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value !== 'object' || value === null) {
    throw new Error('Scoring config must be an object');
  }

  const typedValue = value as Record<string, unknown>;

  if (typedValue.domains !== undefined && !Array.isArray(typedValue.domains)) {
    throw new Error('Scoring domains must be an array');
  }

  if (typedValue.riskBuckets !== undefined && !Array.isArray(typedValue.riskBuckets)) {
    throw new Error('Risk buckets must be an array');
  }

  if (typedValue.bloodMarkerRules !== undefined && !Array.isArray(typedValue.bloodMarkerRules)) {
    throw new Error('Blood marker rules must be an array');
  }

  if (typedValue.rules !== undefined && !Array.isArray(typedValue.rules)) {
    throw new Error('Rules must be an array');
  }

  if (
    typedValue.outputMapping !== undefined &&
    typedValue.outputMapping !== null &&
    typeof typedValue.outputMapping !== 'object'
  ) {
    throw new Error('Output mapping must be an object');
  }

  return true;
};

// ============================================
// Validation Rules
// ============================================

const createIntakeFlowValidation = [
  body('name').isString().trim().isLength({ min: 1, max: 255 }).withMessage('Name is required'),
  body('description').optional().isString().trim().isLength({ max: 2000 }),
  body('assignedTo').optional().isString(),
  body('scoringConfig').optional({ nullable: true }).custom(validateScoringConfig),
];

const updateIntakeFlowValidation = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 255 }),
  body('description').optional().isString().trim().isLength({ max: 2000 }),
  body('status').optional().isIn(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']),
  body('assignedTo').optional().isString(),
  body('isDefault').optional().isBoolean(),
  body('scoringConfig').optional({ nullable: true }).custom(validateScoringConfig),
];

const createSectionValidation = [
  body('intakeFlowId').isUUID().withMessage('Valid intake flow ID is required'),
  body('title').isString().trim().isLength({ min: 1, max: 255 }).withMessage('Title is required'),
  body('description').optional().isString().trim().isLength({ max: 2000 }),
  body('order').isInt().withMessage('Order must be an integer'),
  body('isOptional').optional().isBoolean(),
];

const createFieldValidation = [
  body('sectionId').isUUID().withMessage('Valid section ID is required'),
  body('fieldKey')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Field key is required'),
  body('label').isString().trim().isLength({ min: 1, max: 255 }).withMessage('Label is required'),
  body('type').isIn([
    'TEXT',
    'NUMBER',
    'EMAIL',
    'DATE',
    'SELECT',
    'MULTI_SELECT',
    'RADIO',
    'CHECKBOX',
    'TEXTAREA',
    'PHONE',
    'BOOLEAN',
  ]),
  body('placeholder').optional().isString().trim(),
  body('helperText').optional().isString().trim(),
  body('isRequired').optional().isBoolean(),
  body('order').isInt().withMessage('Order must be an integer'),
  body('validationRules').optional().isObject(),
  body('options').custom((value, { req }) => {
    validateFieldOptionsForType(req.body.type, value);
    return true;
  }),
  body('dependsOnField').optional().isString(),
  body('dependsOnValue').optional().isString(),
];

// ============================================
// Intake Flow Routes
// ============================================

/**
 * GET /admin/intake-flows
 * List all intake flows with optional filters
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, assignedTo } = req.query;

    const filters: { status?: string; assignedTo?: string } = {};
    if (status) {
      filters.status = status as string;
    }
    if (assignedTo) {
      filters.assignedTo = assignedTo as string;
    }

    const intakeFlows = await intakeFlowService.getIntakeFlows(filters);

    const response: ApiResponse = {
      success: true,
      data: intakeFlows,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * GET /admin/intake-flows/:id
 * Get a single intake flow with all sections and fields
 */
router.get(
  '/:id',
  authenticate,
  param('id').isUUID(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { id } = req.params;
    const intakeFlow = await intakeFlowService.getIntakeFlow(id);

    const response: ApiResponse = {
      success: true,
      data: intakeFlow,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /admin/intake-flows
 * Create a new intake flow
 */
router.post(
  '/',
  authenticate,
  createIntakeFlowValidation,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const intakeFlow = await intakeFlowService.createIntakeFlow(req.body, userId);

    const response: ApiResponse = {
      success: true,
      data: intakeFlow,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * PATCH /admin/intake-flows/:id
 * Update an intake flow
 */
router.patch(
  '/:id',
  authenticate,
  param('id').isUUID(),
  updateIntakeFlowValidation,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const intakeFlow = await intakeFlowService.updateIntakeFlow(id, req.body, userId);

    const response: ApiResponse = {
      success: true,
      data: intakeFlow,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * DELETE /admin/intake-flows/:id
 * Delete an intake flow
 */
router.delete(
  '/:id',
  authenticate,
  param('id').isUUID(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { id } = req.params;
    await intakeFlowService.deleteIntakeFlow(id);

    const response: ApiResponse<null> = {
      success: true,
      data: null,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(204).json(response);
  })
);

/**
 * POST /admin/intake-flows/:id/publish
 * Publish an intake flow (set status to ACTIVE)
 */
router.post(
  '/:id/publish',
  authenticate,
  param('id').isUUID(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const intakeFlow = await intakeFlowService.publishIntakeFlow(id, userId);

    const response: ApiResponse = {
      success: true,
      data: intakeFlow,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /admin/intake-flows/:id/archive
 * Archive an intake flow
 */
router.post(
  '/:id/archive',
  authenticate,
  param('id').isUUID(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const intakeFlow = await intakeFlowService.archiveIntakeFlow(id, userId);

    const response: ApiResponse = {
      success: true,
      data: intakeFlow,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /admin/intake-flows/:id/set-default
 * Set an intake flow as the default
 */
router.post(
  '/:id/set-default',
  authenticate,
  param('id').isUUID(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      throw new NotFoundError('User');
    }

    const intakeFlow = await intakeFlowService.setDefaultIntakeFlow(id, userId);

    const response: ApiResponse = {
      success: true,
      data: intakeFlow,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

// ============================================
// Section Routes
// ============================================

/**
 * GET /admin/intake-flows/:flowId/sections
 * Get all sections for an intake flow
 */
router.get(
  '/:flowId/sections',
  authenticate,
  param('flowId').isUUID(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { flowId } = req.params;
    const sections = await intakeFlowService.getSections(flowId);

    const response: ApiResponse = {
      success: true,
      data: sections,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /admin/intake-flows/sections
 * Create a new section
 */
router.post(
  '/sections',
  authenticate,
  createSectionValidation,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const section = await intakeFlowService.createSection(req.body);

    const response: ApiResponse = {
      success: true,
      data: section,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * PATCH /admin/intake-flows/sections/:id
 * Update a section
 */
router.patch(
  '/sections/:id',
  authenticate,
  param('id').isUUID(),
  body('title').optional().isString().trim().isLength({ min: 1, max: 255 }),
  body('description').optional().isString().trim().isLength({ max: 2000 }),
  body('order').optional().isInt(),
  body('isOptional').optional().isBoolean(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { id } = req.params;
    const section = await intakeFlowService.updateSection(id, req.body);

    const response: ApiResponse = {
      success: true,
      data: section,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * DELETE /admin/intake-flows/sections/:id
 * Delete a section
 */
router.delete(
  '/sections/:id',
  authenticate,
  param('id').isUUID(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { id } = req.params;
    await intakeFlowService.deleteSection(id);

    const response: ApiResponse<null> = {
      success: true,
      data: null,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(204).json(response);
  })
);

/**
 * POST /admin/intake-flows/sections/reorder
 * Reorder sections
 */
router.post(
  '/sections/reorder',
  authenticate,
  body('sectionIds').isArray({ min: 1 }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { sectionIds } = req.body;
    await intakeFlowService.reorderSections(sectionIds);

    const response: ApiResponse<null> = {
      success: true,
      data: null,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

// ============================================
// Field Routes
// ============================================

/**
 * GET /admin/intake-flows/sections/:sectionId/fields
 * Get all fields for a section
 */
router.get(
  '/sections/:sectionId/fields',
  authenticate,
  param('sectionId').isUUID(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { sectionId } = req.params;
    const fields = await intakeFlowService.getFields(sectionId);

    const response: ApiResponse = {
      success: true,
      data: fields,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * POST /admin/intake-flows/fields
 * Create a new field
 */
router.post(
  '/fields',
  authenticate,
  createFieldValidation,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const field = await intakeFlowService.createField(req.body);

    const response: ApiResponse = {
      success: true,
      data: field,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(201).json(response);
  })
);

/**
 * PATCH /admin/intake-flows/fields/:id
 * Update a field
 */
router.patch(
  '/fields/:id',
  authenticate,
  param('id').isUUID(),
  body('label').optional().isString().trim().isLength({ min: 1, max: 255 }),
  body('type')
    .optional()
    .isIn([
      'TEXT',
      'NUMBER',
      'EMAIL',
      'DATE',
      'SELECT',
      'MULTI_SELECT',
      'RADIO',
      'CHECKBOX',
      'TEXTAREA',
      'PHONE',
      'BOOLEAN',
    ]),
  body('placeholder').optional().isString().trim(),
  body('helperText').optional().isString().trim(),
  body('isRequired').optional().isBoolean(),
  body('order').optional().isInt(),
  body('validationRules').optional().isObject(),
  body('options').optional().isArray(),
  body('dependsOnField').optional().isString(),
  body('dependsOnValue').optional().isString(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { id } = req.params;
    const field = await intakeFlowService.updateField(id, req.body);

    const response: ApiResponse = {
      success: true,
      data: field,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

/**
 * DELETE /admin/intake-flows/fields/:id
 * Delete a field
 */
router.delete(
  '/fields/:id',
  authenticate,
  param('id').isUUID(),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { id } = req.params;
    await intakeFlowService.deleteField(id);

    const response: ApiResponse<null> = {
      success: true,
      data: null,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(204).json(response);
  })
);

/**
 * POST /admin/intake-flows/fields/reorder
 * Reorder fields
 */
router.post(
  '/fields/reorder',
  authenticate,
  body('fieldIds').isArray({ min: 1 }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { fieldIds } = req.body;
    await intakeFlowService.reorderFields(fieldIds);

    const response: ApiResponse<null> = {
      success: true,
      data: null,
      meta: { timestamp: new Date().toISOString() },
    };

    res.status(200).json(response);
  })
);

export default router;
