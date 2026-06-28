import { z } from 'zod';

/**
 * Cloud document-storage source a customer can import plan sets from (spec §10, P5-05). Imported
 * files run through the SAME validation + ingestion (incl. malware scan) as direct uploads — an
 * external source is not a trusted source (the caveat).
 */
export const CloudProvider = z.enum(['GOOGLE_DRIVE', 'DROPBOX', 'ONEDRIVE', 'S3']);
export type CloudProvider = z.infer<typeof CloudProvider>;
