import { z } from 'zod';
import { ProjectType } from '../enums';

/**
 * Request body to create a project (spec §5.2 / §12.2). Validated on the client (the create
 * form) and, once it exists, by the API route handler — the same schema on both sides.
 */
export const CreateProjectRequest = z.object({
  name: z.string().trim().min(1, 'Project name is required'),
  client_name: z.string().trim().optional(),
  location_text: z.string().trim().optional(),
  project_type: ProjectType,
  /** Optional bid due date, ISO `YYYY-MM-DD`. */
  bid_due_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;
