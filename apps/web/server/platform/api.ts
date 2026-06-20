import { NextResponse } from 'next/server';
import type { AuthContext } from '@takeoff/auth';
import type { ErrorEnvelope, FieldError } from '@takeoff/contracts';
import { auth } from '@/auth';
import { getDb } from '../data/client';
import { resolveAuthContext } from '../modules/accounts/auth-context';
import { ConditionError } from '../modules/conditions/errors';
import { MeasurementError } from '../modules/measurements/errors';
import { SourceFileError } from '../modules/source-files/errors';
import { withRequestContext } from './observability';

/**
 * Thin /v1 route-handler harness (P1-01): runs inside the observability request context, requires
 * an authenticated user, resolves the org to scope to, and maps domain errors onto the standard
 * ErrorEnvelope. The actual data work happens in services via withOrgScope.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: FieldError[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiActor {
  userId: string;
  orgId: string;
}

const HEADER_ORG = 'x-org-id';

/** Resolve which org the request acts in: the sole membership, or a validated `x-org-id`. */
function resolveOrg(request: Request, authCtx: AuthContext): string {
  const orgs = [...authCtx.membershipsByOrg.keys()];
  const requested = request.headers.get(HEADER_ORG);
  if (requested) {
    if (!authCtx.membershipsByOrg.has(requested)) {
      throw new ApiError(403, 'FORBIDDEN', 'You are not a member of that organization.');
    }
    return requested;
  }
  if (orgs.length === 1) return orgs[0]!;
  if (orgs.length === 0) throw new ApiError(403, 'FORBIDDEN', 'No organization membership.');
  throw new ApiError(
    400,
    'ORG_REQUIRED',
    `You belong to multiple orgs; set the ${HEADER_ORG} header.`,
  );
}

function envelope(code: string, message: string, details?: FieldError[]): ErrorEnvelope {
  return { code, message, ...(details && details.length ? { details } : {}) };
}

/** Map a known error to a status + envelope; rethrow anything unknown (→ 500 via withRequestContext). */
function mapError(err: unknown): { status: number; body: ErrorEnvelope } {
  if (err instanceof ApiError) {
    return { status: err.status, body: envelope(err.code, err.message, err.details) };
  }
  if (err instanceof SourceFileError) {
    const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'VALIDATION_FAILED' ? 400 : 422;
    return { status, body: envelope(err.code, err.message, err.details) };
  }
  if (err instanceof MeasurementError || err instanceof ConditionError) {
    return { status: err.code === 'NOT_FOUND' ? 404 : 400, body: envelope(err.code, err.message) };
  }
  throw err;
}

/** Wrap a /v1 handler: authenticate, resolve org, run, and convert domain errors to envelopes. */
export function apiHandler(
  request: Request,
  fn: (actor: ApiActor) => Promise<Response>,
): Promise<Response> {
  return withRequestContext(request, async () => {
    try {
      const session = await auth();
      const userId = session?.user?.id;
      if (!userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required.');
      const authCtx = await resolveAuthContext(getDb(), userId);
      const orgId = resolveOrg(request, authCtx);
      return await fn({ userId, orgId });
    } catch (err) {
      const { status, body } = mapError(err);
      return NextResponse.json(body, { status });
    }
  });
}

/** Parse + validate a JSON body with a Zod schema, or throw a 400 ApiError with field details. */
export async function parseBody<T>(
  request: Request,
  schema: {
    safeParse: (
      v: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } };
  },
): Promise<T> {
  const raw = await request.json().catch(() => undefined);
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details: FieldError[] = result.error.issues.map((i) => ({
      field: i.path.join('.') || '(body)',
      message: i.message,
    }));
    throw new ApiError(400, 'VALIDATION_FAILED', 'Request body is invalid.', details);
  }
  return result.data;
}
