import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge, Button, Stack } from '@takeoff/ui';
import { auth, signOut } from '@/auth';
import { Sidebar } from './_components/sidebar';

/**
 * Shell for the authenticated app: a top bar + sidebar nav around the routed content. Route
 * gating is handled by the middleware; here we surface the signed-in user (or a sign-in link
 * when auth isn't configured yet).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <div className="app-layout">
      <header className="app-topbar">
        <Link href="/" className="app-brand">
          Takeoff Platform
        </Link>
        {session?.user ? (
          <Stack direction="row" gap="sm" align="center">
            <span className="muted">{session.user.email ?? session.user.name}</span>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/' });
              }}
            >
              <Button variant="ghost" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </Stack>
        ) : (
          <Stack direction="row" gap="sm" align="center">
            <Badge>Demo — sign-in coming soon</Badge>
            <a href="/api/auth/signin">
              <Button variant="secondary" size="sm">
                Sign in
              </Button>
            </a>
          </Stack>
        )}
      </header>
      <aside className="app-sidebar">
        <Sidebar />
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
