import {
  authProblem,
  formProblem,
  MAX_PASSWORD_LENGTH,
  normalizeEmail,
  profileInitial,
} from './account';

describe('the sign-in form', () => {
  it('takes an email as typed, without spaces or capitals', () => {
    expect(normalizeEmail('  Pepo@Example.COM ')).toBe('pepo@example.com');
    expect(formProblem(' Pepo@Example.com ', 'secret12')).toBeNull();
  });

  it('refuses an email that is not one', () => {
    expect(formProblem('pepo', 'secret12')).toBe('emailInvalid');
    expect(formProblem('pepo@', 'secret12')).toBe('emailInvalid');
    expect(formProblem('', 'secret12')).toBe('emailInvalid');
  });

  it('asks for 8 characters at least, counting letters, not bytes', () => {
    expect(formProblem('a@b.co', 'seven77')).toBe('passwordShort');
    expect(formProblem('a@b.co', 'eight888')).toBeNull();
    expect(formProblem('a@b.co', 'ñandúñan')).toBeNull();
  });

  it('refuses a password longer than Supabase reads, in bytes', () => {
    expect(formProblem('a@b.co', 'a'.repeat(MAX_PASSWORD_LENGTH))).toBeNull();
    expect(formProblem('a@b.co', 'a'.repeat(MAX_PASSWORD_LENGTH + 1))).toBe('passwordLong');
    // Two bytes each in UTF-8.
    expect(formProblem('a@b.co', 'ñ'.repeat(37))).toBe('passwordLong');
  });
});

describe('the answers of Supabase Auth', () => {
  it('say what went wrong', () => {
    expect(authProblem({ code: 'invalid_credentials' })).toBe('wrongCredentials');
    expect(authProblem({ code: 'email_not_confirmed' })).toBe('notConfirmed');
    expect(authProblem({ code: 'over_email_send_rate_limit' })).toBe('tooManyEmails');
  });

  it('tell a lost connection from an unknown error', () => {
    expect(authProblem({ name: 'AuthRetryableFetchError' })).toBe('offline');
    expect(authProblem({ code: 'something_new' })).toBe('unknown');
    expect(authProblem({})).toBe('unknown');
  });
});

describe('profileInitial', () => {
  it("takes the athlete's name first, in capitals", () => {
    expect(profileInitial('  ana López', 'pepe@example.com')).toBe('A');
    expect(profileInitial('Ñandú', '')).toBe('Ñ');
  });

  it('falls back on the email, and on nothing', () => {
    expect(profileInitial('', 'pepe@example.com')).toBe('P');
    expect(profileInitial(' ', '')).toBeNull();
  });

  it('keeps a character outside the BMP whole', () => {
    expect(profileInitial('𝒜lba', '')).toBe('𝒜');
  });
});
