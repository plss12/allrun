// Connects the caller's Strava (ADR 020): changes the code Strava's sign-in gave the phone for the
// athlete's tokens, keeps them encrypted and gives the phone its access token. The platform checks
// the caller's session before this runs; the user is always the session's, never the request's.
import { withSupabase } from 'npm:@supabase/server@1';
import { z } from 'npm:zod@4';

import {
  canReadActivities,
  exchangeCode,
  jsonBody,
  revokeToken,
  saveConnection,
  StravaRefused,
  stravaApp,
} from '../_shared/strava.ts';

const requestSchema = z.object({
  code: z.string().min(1).max(512),
  // The scopes Strava's sign-in brought back, as it lists them.
  scope: z.string().max(512),
});

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Use POST' }, { status: 405 });
    }
    const userId = ctx.userClaims?.id;
    if (typeof userId !== 'string' || userId === '') {
      return Response.json({ error: 'No user in the token' }, { status: 401 });
    }
    const parsed = requestSchema.safeParse(await jsonBody(request));
    if (!parsed.success) {
      return Response.json({ error: 'Send the code and the scope' }, { status: 400 });
    }
    const { code, scope } = parsed.data;
    try {
      const app = await stravaApp();
      const exchanged = await exchangeCode(app, code);
      if (!canReadActivities(scope)) {
        // Without activities there is nothing to show: no tokens are kept, nor left valid.
        await revokeToken(app, exchanged.refreshToken);
        return Response.json({ error: 'missingActivityScope' }, { status: 422 });
      }
      await saveConnection(app, ctx.supabaseAdmin, userId, exchanged, scope);
      return Response.json({
        connected: true,
        accessToken: exchanged.accessToken,
        expiresAt: exchanged.expiresAt.getTime(),
        athleteName: exchanged.athleteName,
        scope,
      });
    } catch (error) {
      if (error instanceof StravaRefused) {
        console.error('Strava refused the sign-in code', error);
        return Response.json({ error: 'refused' }, { status: 400 });
      }
      console.error('Could not connect Strava', error);
      return Response.json({ error: 'Could not connect Strava' }, { status: 502 });
    }
  }),
};
