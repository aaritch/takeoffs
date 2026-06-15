import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge } from '@takeoff/ui';
import { Sidebar } from './_components/sidebar';

/**
 * Shell for the authenticated app: a top bar + sidebar nav around the routed content. Auth
 * gating and the real user menu land with the identity provider (rest of P0-05); for now the
 * top bar shows a clear "no auth yet" marker.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-layout">
      <header className="app-topbar">
        <Link href="/" className="app-brand">
          Takeoff Platform
        </Link>
        <Badge>Demo — sign-in coming soon</Badge>
      </header>
      <aside className="app-sidebar">
        <Sidebar />
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
