import { User, UserStatus, UserRole, Prisma } from '@prisma/client';
import { prisma } from '../utils/database.js';
import {
  IBaseRepository,
  FindAllOptions,
  PaginatedResult,
  normalizePaginationOptions,
  calculateTotalPages,
} from './base.repository.js';
import type { CreateUserDto, UpdateUserDto } from '../types/index.js';

// ============================================
// User Repository Interface (SOLID - ISP)
// ============================================
export interface IUserRepository extends IBaseRepository<User, CreateUserDto, UpdateUserDto> {
  findByEmail(email: string): Promise<User | null>;
  findByStatus(status: UserStatus, options?: FindAllOptions): Promise<PaginatedResult<User>>;
  updateLastLogin(id: string): Promise<void>;
  softDelete(id: string): Promise<void>;
}

// ============================================
// User Repository Implementation
// ============================================
export class UserRepository implements IUserRepository {
  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Find all users with pagination
   */
  async findAll(options?: FindAllOptions): Promise<PaginatedResult<User>> {
    const { page, limit, skip } = normalizePaginationOptions(options);

    const where: Prisma.UserWhereInput = {};

    // Apply filters
    if (options?.filters) {
      if (options.filters['status']) {
        where.status = options.filters['status'] as UserStatus;
      }
      if (options.filters['role']) {
        where.role = options.filters['role'] as UserRole;
      }
      if (options.filters['isAnonymous'] !== undefined) {
        where.isAnonymous = options.filters['isAnonymous'] as boolean;
      }
    }

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [options?.orderBy ?? 'createdAt']: options?.orderDirection ?? 'desc',
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: calculateTotalPages(total, limit),
      },
    };
  }

  /**
   * Find users by status
   */
  async findByStatus(status: UserStatus, options?: FindAllOptions): Promise<PaginatedResult<User>> {
    return this.findAll({
      ...options,
      filters: { ...options?.filters, status },
    });
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserDto): Promise<User> {
    return prisma.user.create({
      data: {
        email: data.email ?? null,
        passwordHash: data.password ?? null, // Note: Should be hashed before calling this
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        dateOfBirth: data.dateOfBirth ?? null,
        gender: data.gender ?? null,
        phoneNumber: data.phoneNumber ?? null,
        isAnonymous: !data.email,
      },
    });
  }

  /**
   * Update user
   */
  async update(id: string, data: UpdateUserDto): Promise<User> {
    // Build update data dynamically to avoid undefined values
    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) {
      updateData['firstName'] = data.firstName;
    }
    if (data.lastName !== undefined) {
      updateData['lastName'] = data.lastName;
    }
    if (data.dateOfBirth !== undefined) {
      updateData['dateOfBirth'] = data.dateOfBirth;
    }
    if (data.gender !== undefined) {
      updateData['gender'] = data.gender;
    }
    if (data.phoneNumber !== undefined) {
      updateData['phoneNumber'] = data.phoneNumber;
    }

    return prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Hard delete user (use with caution)
   */
  async delete(id: string): Promise<void> {
    await prisma.user.delete({
      where: { id },
    });
  }

  /**
   * Soft delete user (preferred method)
   */
  async softDelete(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: { status: 'DELETED' },
    });
  }

  /**
   * Check if user exists
   */
  async exists(id: string): Promise<boolean> {
    const count = await prisma.user.count({
      where: { id },
    });
    return count > 0;
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  /**
   * Find user with preferences
   */
  async findWithPreferences(id: string): Promise<(User & { userPreferences: unknown }) | null> {
    return prisma.user.findUnique({
      where: { id },
      include: { userPreferences: true },
    });
  }

  /**
   * Create anonymous user
   */
  async createAnonymous(): Promise<User> {
    return prisma.user.create({
      data: {
        isAnonymous: true,
        status: 'ACTIVE',
        role: 'USER',
      },
    });
  }

  /**
   * Convert anonymous user to registered
   */
  async convertToRegistered(
    id: string,
    data: { email: string; passwordHash: string; firstName?: string; lastName?: string }
  ): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        isAnonymous: false,
      },
    });
  }
}

// ============================================
// Singleton Instance
// ============================================
export const userRepository = new UserRepository();
export default userRepository;
