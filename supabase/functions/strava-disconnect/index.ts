// Disconnects the caller's Strava (ADR 020): revokes the tokens, which takes AllRun out of the
// athlete's Strava settings, and forgets them. If Strava can't be reached the connection stays, so
// that trying again can still revoke it.
import { withSupabase } from 'npm:@supabase/server@1';

import {
  deleteConnection,
  NOT_CONNECTED,
  readConnection,
  revokeToken,
  stravaApp,
} from '../_shared/strava.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Use POST' }, { status: 405 });
    }
    const userId = ctx.userClaims?.id;
    if (typeof userId !== 'string' || userId === '') {
      return Response.json({ error: 'No user in the token' }, { status: 401 });
    }
    try {
      const app = await stravaApp();
      const connection = await readConnection(app, ctx.supabaseAdmin, userId);
      if (connection !== null) {
        await revokeToken(app, connection.refreshToken);
        await deleteConnection(ctx.supabaseAdmin, userId);
      }
      return Response.json(NOT_CONNECTED);
    } catch (error) {
      console.error('Could not disconnect Strava', error);
      return Response.json({ error: 'Could not disconnect Strava' }, { status: 502 });
    }
  }),
};
