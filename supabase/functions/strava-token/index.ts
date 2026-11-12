// A valid Strava access token for the caller (ADR 020), or that Strava isn't connected. The stored
// one while it has more than an hour left, as Strava itself would answer; refreshed otherwise, or
// when the phone says Strava rejected it. Only this server rotates the refresh token, so the
// user's phones never invalidate each other's.
import { withSupabase } from 'npm:@supabase/server@1';
import { z } from 'npm:zod@4';

import {
  answerFor,
  deleteConnection,
  jsonBody,
  NOT_CONNECTED,
  readConnection,
  refreshConnection,
  STRAVA_FRESH_MS,
  StravaRefused,
  stravaApp,
} from '../_shared/strava.ts';

const requestSchema = z.object({
  // The access token Strava answered 401 to, which must not be given back.
  rejected: z.string().max(512).optional(),
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
      return Response.json({ error: 'Bad request' }, { status: 400 });
    }
    const { rejected } = parsed.data;
    try {
      const app = await stravaApp();
      const connection = await readConnection(app, ctx.supabaseAdmin, userId);
      if (connection === null) {
        return Response.json(NOT_CONNECTED);
      }
      const fresh = connection.expiresAt.getTime() - Date.now() > STRAVA_FRESH_MS;
      if (fresh && connection.accessToken !== rejected) {
        return Response.json(answerFor(connection));
      }
      try {
        return Response.json(
          answerFor(await refreshConnection(app, ctx.supabaseAdmin, userId, connection)),
        );
      } catch (error) {
        if (!(error instanceof StravaRefused)) {
          throw error;
        }
        // Another call may have rotated the refresh token since this one read it: its tokens
        // stand. If not, the athlete revoked AllRun in Strava's settings.
        const now = await readConnection(app, ctx.supabaseAdmin, userId);
        if (now !== null && now.storedRefreshToken !== connection.storedRefreshToken) {
          return Response.json(answerFor(now));
        }
        console.error('Strava refused the refresh token: the connection is gone', error);
        await deleteConnection(ctx.supabaseAdmin, userId);
        return Response.json(NOT_CONNECTED);
      }
    } catch (error) {
      console.error('Could not give a Strava access token', error);
      return Response.json({ error: 'Could not reach Strava' }, { status: 502 });
    }
  }),
};
