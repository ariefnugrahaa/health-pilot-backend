import logger from '../../utils/logger.js';
import { prisma } from '../../utils/database.js';
import { NotFoundError, ValidationError } from '../../api/middlewares/error.middleware.js';
import { FieldType as PrismaFieldType, Prisma } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface CreateIntakeFlowInput {
  name: string;
  description?: string;
  assignedTo?: string;
  scoringConfig?: IntakeFlowScoringConfig | null;
}

export interface UpdateIntakeFlowInput {
  name?: string;
  description?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  assignedTo?: string;
  isDefault?: boolean;
  scoringConfig?: IntakeFlowScoringConfig | null;
  publishedAt?: Date | null;
  archivedAt?: Date | null;
}

export interface IntakeFlowScoringDomain {
  id: string;
  name: string;
  weight: number;
  enabled: boolean;
}

export interface IntakeFlowRiskBucket {
  id: string;
  minScore: number;
  maxScore: number;
  label: string;
  color: string;
  description?: string;
}

export type IntakeFlowBloodMarkerOperator = '>' | '>=' | '<' | '<=' | '=';
export type IntakeFlowBloodMarkerActionType = 'ADD' | 'SUBTRACT' | 'SET';
export type IntakeFlowRuleJoinOperator = 'AND' | 'OR';
export type IntakeFlowRuleConditionType = 'TAG_EXISTS' | 'RISK_LEVEL' | 'DOMAIN_SCORE';
export type IntakeFlowRuleActionType = 'INCLUDE_PATHWAY' | 'EXCLUDE_PATHWAY' | 'ADD_TAG';

export interface IntakeFlowBloodMarkerRule {
  id: string;
  marker: string;
  operator: IntakeFlowBloodMarkerOperator;
  value: number;
  actionType: IntakeFlowBloodMarkerActionType;
  scoreModifier: number;
  targetDomainId: string;
}

export interface IntakeFlowRuleCondition {
  id: string;
  type: IntakeFlowRuleConditionType;
  value: string;
}

export interface IntakeFlowRuleAction {
  id: string;
  type: IntakeFlowRuleActionType;
  value: string;
}

export interface IntakeFlowActionRule {
  id: string;
  name: string;
  conditionOperator: IntakeFlowRuleJoinOperator;
  actionOperator: IntakeFlowRuleJoinOperator;
  conditions: IntakeFlowRuleCondition[];
  actions: IntakeFlowRuleAction[];
}

export interface IntakeFlowRecommendationPriorityItem {
  id: string;
  label: string;
  order: number;
}

export interface IntakeFlowRiskHeadlineMapping {
  id: string;
  riskBucketId: string;
  headline: string;
  summary: string;
}

export interface IntakeFlowTagSignalMapping {
  id: string;
  tag: string;
  insightParagraph: string;
}

export interface IntakeFlowOutputMappingConfig {
  recommendationPriority: IntakeFlowRecommendationPriorityItem[];
  riskHeadlineMappings: IntakeFlowRiskHeadlineMapping[];
  tagSignalMappings: IntakeFlowTagSignalMapping[];
}

export interface IntakeFlowScoringConfig {
  domains: IntakeFlowScoringDomain[];
  riskBuckets: IntakeFlowRiskBucket[];
  bloodMarkerRules?: IntakeFlowBloodMarkerRule[];
  rules?: IntakeFlowActionRule[];
  outputMapping?: IntakeFlowOutputMappingConfig | null;
}

export interface CreateSectionInput {
  intakeFlowId: string;
  title: string;
  description?: string;
  order: number;
  isOptional?: boolean;
}

export interface UpdateSectionInput {
  title?: string;
  description?: string;
  order?: number;
  isOptional?: boolean;
}

export interface CreateFieldInput {
  sectionId: string;
  fieldKey: string;
  label: string;
  type: string;
  placeholder?: string;
  helperText?: string;
  isRequired?: boolean;
  order: number;
  validationRules?: Record<string, unknown>;
  options?: Array<{ value: string; label: string; description?: string }>;
  dependsOnField?: string;
  dependsOnValue?: string;
}

export interface UpdateFieldInput {
  label?: string;
  type?: string;
  placeholder?: string;
  helperText?: string;
  isRequired?: boolean;
  order?: number;
  validationRules?: Record<string, unknown>;
  options?: Array<{ value: string; label: string; description?: string }>;
  dependsOnField?: string;
  dependsOnValue?: string;
}

export interface IntakeFlowWithSections {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  isDefault: boolean;
  assignedTo: string | null;
  scoringConfig: IntakeFlowScoringConfig | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sections: Array<{
    id: string;
    title: string;
    description: string | null;
    order: number;
    isOptional: boolean;
    fields: Array<{
      id: string;
      fieldKey: string;
      label: string;
      type: string;
      placeholder: string | null;
      helperText: string | null;
      isRequired: boolean;
      order: number;
      validationRules: Record<string, unknown> | null;
      options: Array<{ value: string; label: string; description?: string }> | null;
      dependsOnField: string | null;
      dependsOnValue: string | null;
    }>;
  }>;
}

const VALID_FIELD_TYPES = [
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
  'BLOOD_TEST',
] as const;

type NormalizedFieldType = (typeof VALID_FIELD_TYPES)[number];

type NormalizedFieldOption = {
  value: string;
  label: string;
  description?: string;
};

const OPTION_REQUIRED_FIELD_TYPES = new Set<NormalizedFieldType>([
  'SELECT',
  'MULTI_SELECT',
  'RADIO',
  'CHECKBOX',
]);

const isValidFieldType = (fieldType: string): fieldType is NormalizedFieldType =>
  VALID_FIELD_TYPES.includes(fieldType as NormalizedFieldType);

const normalizeFieldType = (fieldType: string): NormalizedFieldType => {
  const normalizedType = fieldType.trim().toUpperCase();
  if (!isValidFieldType(normalizedType)) {
    throw new ValidationError(`Invalid field type: ${fieldType}`);
  }
  return normalizedType;
};

const normalizeFieldOptions = (options: unknown): NormalizedFieldOption[] | undefined => {
  if (options === undefined || options === null) {
    return undefined;
  }

  if (!Array.isArray(options)) {
    throw new ValidationError('Field options must be an array');
  }

  return options.map((option, index) => {
    if (typeof option !== 'object' || option === null) {
      throw new ValidationError(`Field option at index ${index} must be an object`);
    }

    const record = option as Record<string, unknown>;
    const value = String(record.value ?? '').trim();
    const label = String(record.label ?? '').trim();

    if (!value || !label) {
      throw new ValidationError(
        `Field option at index ${index} must include non-empty value and label`
      );
    }

    const description = typeof record.description === 'string' ? record.description : undefined;
    return {
      value,
      label,
      ...(description ? { description } : {}),
    };
  });
};

const parseStoredOptions = (
  options: Prisma.JsonValue | null
): NormalizedFieldOption[] | undefined => {
  if (options === null || options === undefined) {
    return undefined;
  }

  try {
    return normalizeFieldOptions(options);
  } catch {
    return undefined;
  }
};

const validateFieldOptions = (
  fieldType: NormalizedFieldType,
  options: NormalizedFieldOption[] | undefined
): void => {
  if (OPTION_REQUIRED_FIELD_TYPES.has(fieldType) && (!options || options.length === 0)) {
    throw new ValidationError(`Field type ${fieldType} requires at least one option`);
  }
};

const normalizeScoringConfig = (
  scoringConfig: unknown
): IntakeFlowScoringConfig | null | undefined => {
  if (scoringConfig === undefined) {
    return undefined;
  }

  if (scoringConfig === null) {
    return null;
  }

  if (typeof scoringConfig !== 'object' || scoringConfig === null) {
    throw new ValidationError('Scoring config must be an object');
  }

  const record = scoringConfig as Record<string, unknown>;
  const rawDomains = record.domains;
  const rawRiskBuckets = record.riskBuckets;
  const rawBloodMarkerRules = record.bloodMarkerRules;
  const rawRules = record.rules;
  const rawOutputMapping = record.outputMapping;

  if (rawDomains !== undefined && !Array.isArray(rawDomains)) {
    throw new ValidationError('Scoring domains must be an array');
  }

  if (rawRiskBuckets !== undefined && !Array.isArray(rawRiskBuckets)) {
    throw new ValidationError('Scoring risk buckets must be an array');
  }

  if (rawBloodMarkerRules !== undefined && !Array.isArray(rawBloodMarkerRules)) {
    throw new ValidationError('Blood marker rules must be an array');
  }

  if (rawRules !== undefined && !Array.isArray(rawRules)) {
    throw new ValidationError('Rules must be an array');
  }

  if (
    rawOutputMapping !== undefined &&
    rawOutputMapping !== null &&
    typeof rawOutputMapping !== 'object'
  ) {
    throw new ValidationError('Output mapping must be an object');
  }

  const domains = (rawDomains ?? []).map((domain, index) => {
    if (typeof domain !== 'object' || domain === null) {
      throw new ValidationError(`Scoring domain at index ${index} must be an object`);
    }

    const typedDomain = domain as Record<string, unknown>;
    const id = String(typedDomain.id ?? '').trim();
    const name = String(typedDomain.name ?? '').trim();
    const weight = Number(typedDomain.weight ?? 1);

    if (!id || !name) {
      throw new ValidationError(`Scoring domain at index ${index} must include id and name`);
    }

    if (!Number.isFinite(weight) || weight < 0) {
      throw new ValidationError(`Scoring domain at index ${index} must include a valid weight`);
    }

    return {
      id,
      name,
      weight,
      enabled: Boolean(typedDomain.enabled ?? true),
    };
  });

  const riskBuckets = (rawRiskBuckets ?? []).map((bucket, index) => {
    if (typeof bucket !== 'object' || bucket === null) {
      throw new ValidationError(`Risk bucket at index ${index} must be an object`);
    }

    const typedBucket = bucket as Record<string, unknown>;
    const id = String(typedBucket.id ?? '').trim();
    const label = String(typedBucket.label ?? '').trim();
    const color = String(typedBucket.color ?? '').trim();
    const minScore = Number(typedBucket.minScore ?? 0);
    const maxScore = Number(typedBucket.maxScore ?? 0);
    const description = String(typedBucket.description ?? '').trim();

    if (!id || !label || !color) {
      throw new ValidationError(`Risk bucket at index ${index} must include id, label, and color`);
    }

    if (!Number.isFinite(minScore) || !Number.isFinite(maxScore) || minScore > maxScore) {
      throw new ValidationError(`Risk bucket at index ${index} must include a valid score range`);
    }

    return {
      id,
      label,
      color,
      minScore,
      maxScore,
      ...(description ? { description } : {}),
    };
  });

  const bloodMarkerRules = (rawBloodMarkerRules ?? []).map((rule, index) => {
    if (typeof rule !== 'object' || rule === null) {
      throw new ValidationError(`Blood marker rule at index ${index} must be an object`);
    }

    const typedRule = rule as Record<string, unknown>;
    const id = String(typedRule.id ?? '').trim();
    const marker = String(typedRule.marker ?? '').trim();
    const operator = String(typedRule.operator ?? '').trim() as IntakeFlowBloodMarkerOperator;
    const value = Number(typedRule.value ?? 0);
    const actionType = String(typedRule.actionType ?? '').trim() as IntakeFlowBloodMarkerActionType;
    const scoreModifier = Number(typedRule.scoreModifier ?? 0);
    const targetDomainId = String(typedRule.targetDomainId ?? '').trim();

    if (!id || !marker || !targetDomainId) {
      throw new ValidationError(
        `Blood marker rule at index ${index} must include id, marker, and target domain`
      );
    }

    if (!['>', '>=', '<', '<=', '='].includes(operator)) {
      throw new ValidationError(`Blood marker rule at index ${index} has an invalid operator`);
    }

    if (!['ADD', 'SUBTRACT', 'SET'].includes(actionType)) {
      throw new ValidationError(`Blood marker rule at index ${index} has an invalid action type`);
    }

    if (!Number.isFinite(value) || !Number.isFinite(scoreModifier)) {
      throw new ValidationError(
        `Blood marker rule at index ${index} must include valid numeric values`
      );
    }

    return {
      id,
      marker,
      operator,
      value,
      actionType,
      scoreModifier,
      targetDomainId,
    };
  });

  const rules = (rawRules ?? []).map((rule, index) => {
    if (typeof rule !== 'object' || rule === null) {
      throw new ValidationError(`Rule at index ${index} must be an object`);
    }

    const typedRule = rule as Record<string, unknown>;
    const id = String(typedRule.id ?? '').trim();
    const name = String(typedRule.name ?? '').trim();
    const conditionOperator = String(
      typedRule.conditionOperator ?? 'AND'
    ).trim() as IntakeFlowRuleJoinOperator;
    const actionOperator = String(
      typedRule.actionOperator ?? 'AND'
    ).trim() as IntakeFlowRuleJoinOperator;
    const rawConditions = Array.isArray(typedRule.conditions) ? typedRule.conditions : [];
    const rawActions = Array.isArray(typedRule.actions) ? typedRule.actions : [];

    if (!id || !name) {
      throw new ValidationError(`Rule at index ${index} must include id and name`);
    }

    if (!['AND', 'OR'].includes(conditionOperator) || !['AND', 'OR'].includes(actionOperator)) {
      throw new ValidationError(`Rule at index ${index} must use valid join operators`);
    }

    const conditions = rawConditions.map((condition, conditionIndex) => {
      if (typeof condition !== 'object' || condition === null) {
        throw new ValidationError(
          `Condition ${conditionIndex + 1} in rule ${index + 1} must be an object`
        );
      }

      const typedCondition = condition as Record<string, unknown>;
      const conditionId = String(typedCondition.id ?? '').trim();
      const type = String(typedCondition.type ?? '').trim() as IntakeFlowRuleConditionType;
      const value = String(typedCondition.value ?? '').trim();

      if (!conditionId || !value) {
        throw new ValidationError(
          `Condition ${conditionIndex + 1} in rule ${index + 1} must include id and value`
        );
      }

      if (!['TAG_EXISTS', 'RISK_LEVEL', 'DOMAIN_SCORE'].includes(type)) {
        throw new ValidationError(
          `Condition ${conditionIndex + 1} in rule ${index + 1} has an invalid type`
        );
      }

      return {
        id: conditionId,
        type,
        value,
      };
    });

    const actions = rawActions.map((action, actionIndex) => {
      if (typeof action !== 'object' || action === null) {
        throw new ValidationError(
          `Action ${actionIndex + 1} in rule ${index + 1} must be an object`
        );
      }

      const typedAction = action as Record<string, unknown>;
      const actionId = String(typedAction.id ?? '').trim();
      const type = String(typedAction.type ?? '').trim() as IntakeFlowRuleActionType;
      const value = String(typedAction.value ?? '').trim();

      if (!actionId || !value) {
        throw new ValidationError(
          `Action ${actionIndex + 1} in rule ${index + 1} must include id and value`
        );
      }

      if (!['INCLUDE_PATHWAY', 'EXCLUDE_PATHWAY', 'ADD_TAG'].includes(type)) {
        throw new ValidationError(
          `Action ${actionIndex + 1} in rule ${index + 1} has an invalid type`
        );
      }

      return {
        id: actionId,
        type,
        value,
      };
    });

    return {
      id,
      name,
      conditionOperator,
      actionOperator,
      conditions,
      actions,
    };
  });

  const outputMappingRecord =
    rawOutputMapping && typeof rawOutputMapping === 'object'
      ? (rawOutputMapping as Record<string, unknown>)
      : null;

  const recommendationPriority = Array.isArray(outputMappingRecord?.recommendationPriority)
    ? outputMappingRecord.recommendationPriority.map((item, index) => {
        if (typeof item !== 'object' || item === null) {
          throw new ValidationError(
            `Recommendation priority item at index ${index} must be an object`
          );
        }

        const typedItem = item as Record<string, unknown>;
        const id = String(typedItem.id ?? '').trim();
        const label = String(typedItem.label ?? '').trim();
        const order = Number(typedItem.order ?? index);

        if (!id || !label || !Number.isFinite(order)) {
          throw new ValidationError(
            `Recommendation priority item at index ${index} must include id, label, and order`
          );
        }

        return {
          id,
          label,
          order,
        };
      })
    : [];

  const riskHeadlineMappings = Array.isArray(outputMappingRecord?.riskHeadlineMappings)
    ? outputMappingRecord.riskHeadlineMappings.map((item, index) => {
        if (typeof item !== 'object' || item === null) {
          throw new ValidationError(`Risk headline mapping at index ${index} must be an object`);
        }

        const typedItem = item as Record<string, unknown>;
        const id = String(typedItem.id ?? '').trim();
        const riskBucketId = String(typedItem.riskBucketId ?? '').trim();
        const headline = String(typedItem.headline ?? '').trim();
        const summary = String(typedItem.summary ?? '').trim();

        if (!id || !riskBucketId) {
          throw new ValidationError(
            `Risk headline mapping at index ${index} must include id and risk bucket`
          );
        }

        return {
          id,
          riskBucketId,
          headline,
          summary,
        };
      })
    : [];

  const tagSignalMappings = Array.isArray(outputMappingRecord?.tagSignalMappings)
    ? outputMappingRecord.tagSignalMappings.map((item, index) => {
        if (typeof item !== 'object' || item === null) {
          throw new ValidationError(`Tag signal mapping at index ${index} must be an object`);
        }

        const typedItem = item as Record<string, unknown>;
        const id = String(typedItem.id ?? '').trim();
        const tag = String(typedItem.tag ?? '').trim();
        const insightParagraph = String(typedItem.insightParagraph ?? '').trim();

        if (!id || !tag) {
          throw new ValidationError(`Tag signal mapping at index ${index} must include id and tag`);
        }

        return {
          id,
          tag,
          insightParagraph,
        };
      })
    : [];

  const outputMapping =
    outputMappingRecord === null
      ? undefined
      : {
          recommendationPriority,
          riskHeadlineMappings,
          tagSignalMappings,
        };

  return {
    domains,
    riskBuckets,
    ...(bloodMarkerRules.length > 0 ? { bloodMarkerRules } : {}),
    ...(rules.length > 0 ? { rules } : {}),
    ...(outputMapping !== undefined ? { outputMapping } : {}),
  };
};

// ============================================
// Service Interface
// ============================================

export interface IIntakeFlowService {
  // Intake Flow CRUD
  createIntakeFlow(input: CreateIntakeFlowInput, userId: string): Promise<IntakeFlowWithSections>;
  getIntakeFlow(id: string): Promise<IntakeFlowWithSections>;
  getIntakeFlows(filters?: {
    status?: string;
    assignedTo?: string;
  }): Promise<IntakeFlowWithSections[]>;
  updateIntakeFlow(
    id: string,
    input: UpdateIntakeFlowInput,
    userId: string
  ): Promise<IntakeFlowWithSections>;
  deleteIntakeFlow(id: string): Promise<void>;
  publishIntakeFlow(id: string, userId: string): Promise<IntakeFlowWithSections>;
  archiveIntakeFlow(id: string, userId: string): Promise<IntakeFlowWithSections>;
  setDefaultIntakeFlow(id: string, userId: string): Promise<IntakeFlowWithSections>;

  // Section CRUD
  createSection(input: CreateSectionInput): Promise<unknown>;
  getSections(intakeFlowId: string): Promise<unknown[]>;
  updateSection(id: string, input: UpdateSectionInput): Promise<unknown>;
  deleteSection(id: string): Promise<void>;
  reorderSections(sectionIds: string[]): Promise<void>;

  // Field CRUD
  createField(input: CreateFieldInput): Promise<unknown>;
  getFields(sectionId: string): Promise<unknown[]>;
  updateField(id: string, input: UpdateFieldInput): Promise<unknown>;
  deleteField(id: string): Promise<void>;
  reorderFields(fieldIds: string[]): Promise<void>;
}

// ============================================
// Service Implementation
// ============================================

export class IntakeFlowService implements IIntakeFlowService {
  // ============================================
  // Intake Flow CRUD
  // ============================================

  async createIntakeFlow(
    input: CreateIntakeFlowInput,
    userId: string
  ): Promise<IntakeFlowWithSections> {
    logger.info('Creating intake flow', { name: input.name, userId });
    const normalizedScoringConfig = normalizeScoringConfig(input.scoringConfig);

    const intakeFlow = await prisma.intakeFlow.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        assignedTo: input.assignedTo ?? null,
        ...(normalizedScoringConfig !== undefined
          ? {
              scoringConfig:
                normalizedScoringConfig === null
                  ? Prisma.DbNull
                  : (normalizedScoringConfig as unknown as Prisma.InputJsonValue),
            }
          : {}),
        createdById: userId,
        status: 'DRAFT',
      },
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

    return intakeFlow as unknown as IntakeFlowWithSections;
  }

  async getIntakeFlow(id: string): Promise<IntakeFlowWithSections> {
    const intakeFlow = await prisma.intakeFlow.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: {
            fields: {
              orderBy: { order: 'asc' },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!intakeFlow) {
      throw new NotFoundError('Intake flow');
    }

    return intakeFlow as unknown as IntakeFlowWithSections;
  }

  async getIntakeFlows(filters?: {
    status?: string;
    assignedTo?: string;
  }): Promise<IntakeFlowWithSections[]> {
    const where: Prisma.IntakeFlowWhereInput = {};

    if (filters?.status) {
      where.status = filters.status as 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    }

    if (filters?.assignedTo) {
      where.assignedTo = filters.assignedTo;
    }

    const intakeFlows = await prisma.intakeFlow.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: {
            fields: {
              orderBy: { order: 'asc' },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return intakeFlows as unknown as IntakeFlowWithSections[];
  }

  async updateIntakeFlow(
    id: string,
    input: UpdateIntakeFlowInput,
    userId: string
  ): Promise<IntakeFlowWithSections> {
    const updateData: Prisma.IntakeFlowUpdateInput = {};
    const normalizedScoringConfig = normalizeScoringConfig(input.scoringConfig);

    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.status !== undefined) {
      updateData.status = input.status as 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    }
    if (input.assignedTo !== undefined) {
      updateData.assignedTo = input.assignedTo;
    }
    if (input.isDefault !== undefined) {
      updateData.isDefault = input.isDefault;
    }
    if (input.publishedAt !== undefined) {
      updateData.publishedAt = input.publishedAt;
    }
    if (input.archivedAt !== undefined) {
      updateData.archivedAt = input.archivedAt;
    }
    if (input.scoringConfig !== undefined) {
      updateData.scoringConfig =
        normalizedScoringConfig === null
          ? Prisma.DbNull
          : (normalizedScoringConfig as unknown as Prisma.InputJsonValue);
    }
    updateData.lastUpdatedBy = {
      connect: { id: userId },
    };

    const intakeFlow = await prisma.intakeFlow.update({
      where: { id },
      data: updateData,
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

    if (!intakeFlow) {
      throw new NotFoundError('Intake flow');
    }

    return intakeFlow as unknown as IntakeFlowWithSections;
  }

  async deleteIntakeFlow(id: string): Promise<void> {
    await prisma.intakeFlow.delete({
      where: { id },
    });

    logger.info('Intake flow deleted', { id });
  }

  async publishIntakeFlow(id: string, userId: string): Promise<IntakeFlowWithSections> {
    return this.updateIntakeFlow(id, { status: 'ACTIVE', publishedAt: new Date() }, userId);
  }

  async archiveIntakeFlow(id: string, userId: string): Promise<IntakeFlowWithSections> {
    return this.updateIntakeFlow(id, { status: 'ARCHIVED', archivedAt: new Date() }, userId);
  }

  async setDefaultIntakeFlow(id: string, userId: string): Promise<IntakeFlowWithSections> {
    await prisma.$transaction([
      prisma.intakeFlow.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      }),
      prisma.intakeFlow.update({
        where: { id },
        data: { isDefault: true, lastUpdatedById: userId },
      }),
    ]);

    return this.getIntakeFlow(id);
  }

  // ============================================
  // Section CRUD
  // ============================================

  async createSection(input: CreateSectionInput): Promise<unknown> {
    logger.info('Creating intake flow section', {
      intakeFlowId: input.intakeFlowId,
      title: input.title,
    });

    const section = await prisma.intakeFlowSection.create({
      data: {
        intakeFlowId: input.intakeFlowId,
        title: input.title,
        description: input.description ?? null,
        order: input.order,
        isOptional: input.isOptional ?? false,
      },
      include: {
        fields: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return section;
  }

  async getSections(intakeFlowId: string): Promise<unknown[]> {
    const sections = await prisma.intakeFlowSection.findMany({
      where: { intakeFlowId },
      orderBy: { order: 'asc' },
      include: {
        fields: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return sections;
  }

  async updateSection(id: string, input: UpdateSectionInput): Promise<unknown> {
    const updateData: Prisma.IntakeFlowSectionUpdateInput = {};

    if (input.title !== undefined) {
      updateData.title = input.title;
    }
    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.order !== undefined) {
      updateData.order = input.order;
    }
    if (input.isOptional !== undefined) {
      updateData.isOptional = input.isOptional;
    }

    const section = await prisma.intakeFlowSection.update({
      where: { id },
      data: updateData,
      include: {
        fields: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return section;
  }

  async deleteSection(id: string): Promise<void> {
    await prisma.intakeFlowSection.delete({
      where: { id },
    });

    logger.info('Intake flow section deleted', { id });
  }

  async reorderSections(sectionIds: string[]): Promise<void> {
    await prisma.$transaction(
      sectionIds.map((id, index) =>
        prisma.intakeFlowSection.update({
          where: { id },
          data: { order: index },
        })
      )
    );

    logger.info('Intake flow sections reordered', { count: sectionIds.length });
  }

  // ============================================
  // Field CRUD
  // ============================================

  async createField(input: CreateFieldInput): Promise<unknown> {
    logger.info('Creating intake flow field', {
      sectionId: input.sectionId,
      fieldKey: input.fieldKey,
    });
    const normalizedType = normalizeFieldType(input.type);
    const normalizedOptions = normalizeFieldOptions(input.options);
    validateFieldOptions(normalizedType, normalizedOptions);

    const createData: Prisma.IntakeFlowFieldUncheckedCreateInput = {
      sectionId: input.sectionId,
      fieldKey: input.fieldKey,
      label: input.label,
      type: normalizedType as PrismaFieldType,
      placeholder: input.placeholder ?? null,
      helperText: input.helperText ?? null,
      isRequired: input.isRequired ?? true,
      order: input.order,
      validationRules:
        input.validationRules !== undefined
          ? (input.validationRules as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      options:
        normalizedOptions !== undefined
          ? (normalizedOptions as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      dependsOnField: input.dependsOnField ?? null,
      dependsOnValue: input.dependsOnValue ?? null,
    };

    const field = await prisma.intakeFlowField.create({
      data: createData,
    });

    return field;
  }

  async getFields(sectionId: string): Promise<unknown[]> {
    const fields = await prisma.intakeFlowField.findMany({
      where: { sectionId },
      orderBy: { order: 'asc' },
    });

    return fields;
  }

  async updateField(id: string, input: UpdateFieldInput): Promise<unknown> {
    const existingField = await prisma.intakeFlowField.findUnique({
      where: { id },
      select: {
        type: true,
        options: true,
      },
    });

    if (!existingField) {
      throw new NotFoundError('Intake flow field');
    }

    const effectiveType = input.type
      ? normalizeFieldType(input.type)
      : normalizeFieldType(existingField.type);
    const normalizedOptions =
      input.options !== undefined ? normalizeFieldOptions(input.options) : undefined;
    const effectiveOptions =
      normalizedOptions ?? parseStoredOptions(existingField.options as Prisma.JsonValue | null);
    validateFieldOptions(effectiveType, effectiveOptions);

    const updateData: Prisma.IntakeFlowFieldUpdateInput = {};

    if (input.label !== undefined) {
      updateData.label = input.label;
    }
    if (input.type !== undefined) {
      updateData.type = effectiveType as PrismaFieldType;
    }
    if (input.placeholder !== undefined) {
      updateData.placeholder = input.placeholder;
    }
    if (input.helperText !== undefined) {
      updateData.helperText = input.helperText;
    }
    if (input.isRequired !== undefined) {
      updateData.isRequired = input.isRequired;
    }
    if (input.order !== undefined) {
      updateData.order = input.order;
    }
    if (input.validationRules !== undefined) {
      updateData.validationRules = input.validationRules as Prisma.InputJsonValue;
    }
    if (input.options !== undefined) {
      updateData.options = normalizedOptions as Prisma.InputJsonValue;
    }
    if (input.dependsOnField !== undefined) {
      updateData.dependsOnField = input.dependsOnField;
    }
    if (input.dependsOnValue !== undefined) {
      updateData.dependsOnValue = input.dependsOnValue;
    }

    const field = await prisma.intakeFlowField.update({
      where: { id },
      data: updateData,
    });

    return field;
  }

  async deleteField(id: string): Promise<void> {
    await prisma.intakeFlowField.delete({
      where: { id },
    });

    logger.info('Intake flow field deleted', { id });
  }

  async reorderFields(fieldIds: string[]): Promise<void> {
    await prisma.$transaction(
      fieldIds.map((id, index) =>
        prisma.intakeFlowField.update({
          where: { id },
          data: { order: index },
        })
      )
    );

    logger.info('Intake flow fields reordered', { count: fieldIds.length });
  }
}

// ============================================
// Singleton Instance
// ============================================

export const intakeFlowService = new IntakeFlowService();
export default intakeFlowService;
