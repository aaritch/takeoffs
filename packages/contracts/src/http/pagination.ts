import { z } from 'zod';

/**
 * Cursor-based pagination is used for ALL list endpoints — never offset pagination on
 * large tables (spec §12.1). Query params arrive as strings, so `limit` is coerced.
 */
export const PaginationQuery = z.object({
  /** Opaque cursor returned by the previous page; omitted for the first page. */
  cursor: z.string().optional(),
  /** Page size, 1–100, default 20. */
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

/**
 * Builds the response schema for a paginated list of `item`. `next_cursor` is null on the
 * last page.
 *
 * @example
 * const ProjectPage = pageOf(Project);
 * type ProjectPage = z.infer<typeof ProjectPage>;
 */
export const pageOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    next_cursor: z.string().nullable(),
  });
