import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';
import { getDb } from '@/server/data/client';
import { accountsService } from '@/server/modules/accounts';

/**
 * The full (Node-runtime) auth instance. Adds the DB-touching callbacks on top of the edge-safe
 * config: on sign-in we just-in-time provision the user into our `users` table and stash their
 * id on the token; the session then carries `user.id`. JWT session strategy keeps it stateless
 * (serverless-friendly). `AUTH_SECRET` is read from the environment by Auth.js.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: 'jwt' },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, profile }) {
      if (account && profile?.email) {
        const user = await accountsService.provisionFromIdentity(getDb(), {
          email: profile.email,
          ...(typeof profile.name === 'string' ? { fullName: profile.name } : {}),
          ...(typeof profile.sub === 'string' ? { subject: profile.sub } : {}),
        });
        token.userId = user.id;
      }
      return token;
    },
    session({ session, token }) {
      const userId = token.userId;
      if (typeof userId === 'string') {
        session.user.id = userId;
      }
      return session;
    },
  },
});
