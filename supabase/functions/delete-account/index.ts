// Deletes the account of whoever calls it (ADR 019, Apple's rule: an account made in the app can
// be deleted in the app). The platform checks the caller's token before this runs; the admin
// client then signs every session of that user out and deletes them, and their profile and designs
// go with them (`on delete cascade`). It never takes a user id from the request.
import { withSupabase } from 'npm:@supabase/server@1';

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Use POST' }, { status: 405 });
    }
    const userId = ctx.userClaims?.id;
    if (typeof userId !== 'string' || userId === '') {
      return Response.json({ error: 'No user in the token' }, { status: 401 });
    }
    // A deleted user's tokens stay valid until they expire: end every session first.
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const signOut = await ctx.supabaseAdmin.auth.admin.signOut(token, 'global');
    if (signOut.error !== null) {
      console.error('Could not sign the user out before deleting them', signOut.error);
      return Response.json({ error: 'Could not delete the account' }, { status: 500 });
    }
    const deleted = await ctx.supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleted.error !== null) {
      console.error('Could not delete the user', deleted.error);
      return Response.json({ error: 'Could not delete the account' }, { status: 500 });
    }
    return Response.json({ deleted: true });
  }),
};
