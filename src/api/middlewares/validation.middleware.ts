import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

import { ValidationError as AppValidationError } from './error.middleware.js';

/**
 * Validate request using express-validator rules
 * Use this middleware after your validation rules array
 *
 * Example:
 * router.post('/users',
 *   [body('email').isEmail()],
 *   validateRequest,
 *   handler
 * )
 */
export function validateRequest(req: Request, _res: Response, next: NextFunction): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map((error) => ({
      field: 'path' in error ? error.path : 'unknown',
      message: error.msg as string,
    }));

    throw new AppValidationError(errorDetails[0]?.message || 'Validation failed', errorDetails);
  }

  next();
}

export default validateRequest;
