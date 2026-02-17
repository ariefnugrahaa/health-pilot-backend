// ============================================
// Base Repository Interface (SOLID - DIP, ISP)
// ============================================

/**
 * Generic repository interface following Repository Pattern
 * This provides a consistent interface for data access across all entities
 */
export interface IBaseRepository<T, CreateDto, UpdateDto> {
  findById(id: string): Promise<T | null>;
  findAll(options?: FindAllOptions): Promise<PaginatedResult<T>>;
  create(data: CreateDto): Promise<T>;
  update(id: string, data: UpdateDto): Promise<T>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}

/**
 * Options for paginated queries
 */
export interface FindAllOptions {
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}

/**
 * Paginated result structure
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Default pagination values
 */
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Calculate pagination offset
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Calculate total pages
 */
export function calculateTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

/**
 * Normalize pagination options
 */
export function normalizePaginationOptions(options?: FindAllOptions): Required<
  Pick<FindAllOptions, 'page' | 'limit'>
> & {
  skip: number;
} {
  const page = Math.max(1, options?.page ?? DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, options?.limit ?? DEFAULT_LIMIT));
  const skip = calculateOffset(page, limit);

  return { page, limit, skip };
}
