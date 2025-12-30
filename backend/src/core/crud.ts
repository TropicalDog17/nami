/**
 * Generic CRUD router builder
 * Reduces code duplication for standard CRUD endpoints
 */

import { Router, Request, Response, NextFunction } from 'express';
import { isAppError } from './errors';
import { asyncHandler } from './middleware';

/**
 * Generic entity with id
 */
export interface Entity {
  id: number | string;
}

/**
 * CRUD operations interface
 */
export interface CrudOperations<T extends Entity, CreateInput, UpdateInput> {
  findAll(): T[];
  findById(id: number | string): T | undefined;
  create(input: CreateInput): T;
  update(id: number | string, input: UpdateInput): T | undefined;
  delete(id: number | string): boolean;
}

/**
 * Configuration for CRUD router builder
 */
export interface CrudConfig<T extends Entity, CreateInput, UpdateInput> {
  basePath: string; // e.g., '/admin/types'
  resourceName: string; // e.g., 'Type'
  operations: CrudOperations<T, CreateInput, UpdateInput>;
  validateCreate?: (input: unknown) => CreateInput;
  validateUpdate?: (input: unknown) => UpdateInput;
}

/**
 * Create a standard CRUD router
 */
export function createCrudRouter<T extends Entity, CreateInput, UpdateInput>(
  config: CrudConfig<T, CreateInput, UpdateInput>
): Router {
  const router = Router();
  const { basePath, resourceName, operations, validateCreate, validateUpdate } = config;

  // GET all - List all entities
  router.get(basePath, asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
    const items = operations.findAll();
    res.json(items);
  }));

  // GET one - Get entity by ID
  router.get(
    `${basePath}/:id`,
    asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
      const id = parseId(req.params.id);
      const item = operations.findById(id);
      if (!item) {
        res.status(404).json({ error: `${resourceName} not found` });
        return;
      }
      res.json(item);
    })
  );

  // POST - Create new entity
  router.post(
    basePath,
    asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
      const input = validateCreate ? validateCreate(req.body) : (req.body as CreateInput);
      const created = operations.create(input);
      res.status(201).json(created);
    })
  );

  // PUT - Update entity
  router.put(
    `${basePath}/:id`,
    asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
      const id = parseId(req.params.id);
      const input = validateUpdate ? validateUpdate(req.body) : (req.body as UpdateInput);
      const updated = operations.update(id, input);
      if (!updated) {
        res.status(404).json({ error: `${resourceName} not found` });
        return;
      }
      res.json(updated);
    })
  );

  // DELETE - Delete entity
  router.delete(
    `${basePath}/:id`,
    asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
      const id = parseId(req.params.id);
      const ok = operations.delete(id);
      if (!ok) {
        res.status(404).json({ error: `${resourceName} not found` });
        return;
      }
      res.json({ deleted: 1 });
    })
  );

  return router;
}

/**
 * Parse ID as number or string
 */
function parseId(idParam: string): number | string {
  const numId = Number(idParam);
  return Number.isNaN(numId) ? idParam : numId;
}

/**
 * Simplified config for number-based ID entities (most common)
 */
export interface NumberIdCrudConfig<T extends Entity, CreateInput, UpdateInput>
  extends Omit<CrudConfig<T, CreateInput, UpdateInput>, 'operations'> {
  operations: Omit<CrudOperations<T, CreateInput, UpdateInput>, 'findById' | 'update' | 'delete'> & {
    findById(id: number): T | undefined;
    update(id: number, input: UpdateInput): T | undefined;
    delete(id: number): boolean;
  };
}

/**
 * Create CRUD router with number-based IDs
 */
export function createNumberIdCrudRouter<T extends Entity, CreateInput, UpdateInput>(
  config: NumberIdCrudConfig<T, CreateInput, UpdateInput>
): Router {
  const { operations, ...rest } = config;

  const adaptedOperations: CrudOperations<T, CreateInput, UpdateInput> = {
    findAll: operations.findAll,
    create: operations.create,
    findById: (id: number | string) => operations.findById(id as number),
    update: (id: number | string, input: UpdateInput) => operations.update(id as number, input),
    delete: (id: number | string) => operations.delete(id as number),
  };

  return createCrudRouter({ ...rest, operations: adaptedOperations });
}
