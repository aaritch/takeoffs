import { SheetViewer } from '@/app/(app)/_components/viewer/sheet-viewer';

/** /sheets/{id} — the tiled deep-zoom viewer for a processed sheet (P1-06). */
export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SheetViewer sheetId={id} />;
}
