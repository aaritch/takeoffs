import { applyBucketCors, verifyStorage } from './bootstrap';

/**
 * Storage setup CLI for the S3-compatible bucket (Cloudflare R2 in prod, MinIO locally).
 * Reads the same `S3_*` env the app runs on. Like db:migrate/db:seed, it does NOT load `.env`
 * itself — pass it in, e.g. `node --env-file=.env` or an env-aware shell.
 *
 *   pnpm --filter @takeoff/web storage:check                 # verify the bucket round-trip
 *   pnpm --filter @takeoff/web storage:setup-cors            # apply browser-upload CORS
 *   pnpm --filter @takeoff/web storage:setup-cors https://app.example.com  # extra origins
 *
 * Allowed CORS origins default to APP_BASE_URL (or NEXT_PUBLIC_APP_BASE_URL) plus
 * http://localhost:3000; any origins passed as args are added.
 */

function corsOrigins(extra: string[]): string[] {
  const base = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL;
  const origins = new Set<string>(['http://localhost:3000']);
  if (base) origins.add(base);
  for (const o of extra) origins.add(o);
  return [...origins];
}

async function check(): Promise<void> {
  const result = await verifyStorage();
  console.log(`bucket:   ${result.bucket}`);
  console.log(`endpoint: ${result.endpoint}`);
  for (const c of result.checks) {
    const mark = c.ok ? 'PASS' : 'FAIL';
    console.log(`  [${mark}] ${c.name} (${c.ms}ms)${c.detail ? ` — ${c.detail}` : ''}`);
  }
  if (!result.ok) {
    console.error('\nstorage check FAILED — see the failing step above.');
    process.exitCode = 1;
    return;
  }
  console.log('\nstorage check OK — bucket is reachable and presigned URLs work.');
}

async function setupCors(extra: string[]): Promise<void> {
  const origins = corsOrigins(extra);
  console.log('applying CORS for origins:');
  for (const o of origins) console.log(`  - ${o}`);
  try {
    const rules = await applyBucketCors(origins);
    console.log('\nbucket CORS now reports:');
    console.log(JSON.stringify(rules, null, 2));
  } catch (err) {
    // MinIO (local stand-in) doesn't implement the S3 CORS API — it's configured at the
    // server level instead. R2 and AWS S3 do implement it, so this only bites locally.
    if (err && typeof err === 'object' && (err as { Code?: string }).Code === 'NotImplemented') {
      console.error(
        '\nThis endpoint does not implement the S3 CORS API (PutBucketCors).\n' +
          'MinIO is likely the target — configure CORS at the MinIO server level instead.\n' +
          'Against Cloudflare R2 / AWS S3 this command works as-is.',
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'check':
      await check();
      break;
    case 'setup-cors':
      await setupCors(rest);
      break;
    default:
      console.error(`Unknown command: ${command ?? '(none)'}. Use "check" or "setup-cors".`);
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
