import logger from '../../utils/logger.js';
import { prisma } from '../../utils/database.js';
import { NotFoundError, ValidationError } from '../../api/middlewares/error.middleware.js';
import type { Prisma } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface CreateIntakeFlowInput {
  name: string;
  description?: string;
  assignedTo?: string;
}

export interface UpdateIntakeFlowInput {
  name?: string;
  description?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  assignedTo?: string;
  isDefault?: boolean;
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
      throw new ValidationError(`Field option at index ${index} must include non-empty value and label`);
    }

    const description = typeof record.description === 'string' ? record.description : undefined;
    return {
      value,
      label,
      ...(description ? { description } : {}),
    };
  });
};

const parseStoredOptions = (options: Prisma.JsonValue | null): NormalizedFieldOption[] | undefined => {
  if (options === null || options === undefined) {
    return undefined;
  }

  try {
    return normalizeFieldOptions(options);
  } catch {
    return undefined;
  }
};

const validateFieldOptions = (fieldType: NormalizedFieldType, options: NormalizedFieldOption[] | undefined): void => {
  if (OPTION_REQUIRED_FIELD_TYPES.has(fieldType) && (!options || options.length === 0)) {
    throw new ValidationError(`Field type ${fieldType} requires at least one option`);
  }
};

// ============================================
// Service Interface
// ============================================

export interface IIntakeFlowService {
  // Intake Flow CRUD
  createIntakeFlow(input: CreateIntakeFlowInput, userId: string): Promise<IntakeFlowWithSections>;
  getIntakeFlow(id: string): Promise<IntakeFlowWithSections>;
  getIntakeFlows(filters?: { status?: string; assignedTo?: string }): Promise<IntakeFlowWithSections[]>;
  updateIntakeFlow(id: string, input: UpdateIntakeFlowInput, userId: string): Promise<IntakeFlowWithSections>;
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

  async createIntakeFlow(input: CreateIntakeFlowInput, userId: string): Promise<IntakeFlowWithSections> {
    logger.info('Creating intake flow', { name: input.name, userId });

    const intakeFlow = await prisma.intakeFlow.create({
      data: {
        name: input.name,
        description: input.description,
        assignedTo: input.assignedTo,
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

    return intakeFlow as IntakeFlowWithSections;
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

    return intakeFlow as IntakeFlowWithSections;
  }

  async getIntakeFlows(filters?: { status?: string; assignedTo?: string }): Promise<IntakeFlowWithSections[]> {
    const where: Prisma.IntakeFlowWhereInput = {};

    if (filters?.status) {
      where.status = filters.status as 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    }

    if (filters?.assignedTo) {
      where.assignedTo = filters.assignedTo;
    }

    const intakeFlows = await prisma.intakeFlow.findMany({
      where,
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

    return intakeFlows as IntakeFlowWithSections[];
  }

  async updateIntakeFlow(id: string, input: UpdateIntakeFlowInput, userId: string): Promise<IntakeFlowWithSections> {
    const updateData: Prisma.IntakeFlowUpdateInput = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.status !== undefined) updateData.status = input.status as 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    if (input.assignedTo !== undefined) updateData.assignedTo = input.assignedTo;
    if (input.isDefault !== undefined) updateData.isDefault = input.isDefault;
    updateData.lastUpdatedById = userId;

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

    return intakeFlow as IntakeFlowWithSections;
  }

  async deleteIntakeFlow(id: string): Promise<void> {
    await prisma.intakeFlow.delete({
      where: { id },
    });

    logger.info('Intake flow deleted', { id });
  }

  async publishIntakeFlow(id: string, userId: string): Promise<IntakeFlowWithSections> {
    return this.updateIntakeFlow(
      id,
      { status: 'ACTIVE', publishedAt: new Date() },
      userId
    );
  }

  async archiveIntakeFlow(id: string, userId: string): Promise<IntakeFlowWithSections> {
    return this.updateIntakeFlow(
      id,
      { status: 'ARCHIVED', archivedAt: new Date() },
      userId
    );
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
    logger.info('Creating intake flow section', { intakeFlowId: input.intakeFlowId, title: input.title });

    const section = await prisma.intakeFlowSection.create({
      data: {
        intakeFlowId: input.intakeFlowId,
        title: input.title,
        description: input.description,
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

    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.order !== undefined) updateData.order = input.order;
    if (input.isOptional !== undefined) updateData.isOptional = input.isOptional;

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
    logger.info('Creating intake flow field', { sectionId: input.sectionId, fieldKey: input.fieldKey });
    const normalizedType = normalizeFieldType(input.type);
    const normalizedOptions = normalizeFieldOptions(input.options);
    validateFieldOptions(normalizedType, normalizedOptions);

    const field = await prisma.intakeFlowField.create({
      data: {
        sectionId: input.sectionId,
        fieldKey: input.fieldKey,
        label: input.label,
        type: normalizedType,
        placeholder: input.placeholder,
        helperText: input.helperText,
        isRequired: input.isRequired ?? true,
        order: input.order,
        validationRules: input.validationRules as Prisma.InputJsonValue,
        options: normalizedOptions as Prisma.InputJsonValue,
        dependsOnField: input.dependsOnField,
        dependsOnValue: input.dependsOnValue,
      },
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

    const effectiveType = input.type ? normalizeFieldType(input.type) : normalizeFieldType(existingField.type);
    const normalizedOptions = input.options !== undefined ? normalizeFieldOptions(input.options) : undefined;
    const effectiveOptions = normalizedOptions ?? parseStoredOptions(existingField.options as Prisma.JsonValue | null);
    validateFieldOptions(effectiveType, effectiveOptions);

    const updateData: Prisma.IntakeFlowFieldUpdateInput = {};

    if (input.label !== undefined) updateData.label = input.label;
    if (input.type !== undefined) updateData.type = effectiveType;
    if (input.placeholder !== undefined) updateData.placeholder = input.placeholder;
    if (input.helperText !== undefined) updateData.helperText = input.helperText;
    if (input.isRequired !== undefined) updateData.isRequired = input.isRequired;
    if (input.order !== undefined) updateData.order = input.order;
    if (input.validationRules !== undefined) updateData.validationRules = input.validationRules as Prisma.InputJsonValue;
    if (input.options !== undefined) updateData.options = normalizedOptions as Prisma.InputJsonValue;
    if (input.dependsOnField !== undefined) updateData.dependsOnField = input.dependsOnField;
    if (input.dependsOnValue !== undefined) updateData.dependsOnValue = input.dependsOnValue;

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
