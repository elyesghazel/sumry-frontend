import { describe, expect, it } from 'vitest';
import { createApi, type FetchLike } from '../../core';

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function fakeApi(status: number, response: unknown) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, ...init });
    return { ok: status < 400, status, text: async () => (response === undefined ? '' : JSON.stringify(response)) };
  };
  return { api: createApi({ baseUrl: 'https://sumry.test/', fetch }), calls };
}

describe('registration and account deletion', () => {
  it('reads the public config without a token', async () => {
    const { api, calls } = fakeApi(200, { registrationMode: 'invite' });
    await expect(api.config()).resolves.toEqual({ registrationMode: 'invite' });
    expect(calls[0].url).toBe('https://sumry.test/api/config');
    expect(calls[0].method).toBe('GET');
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it('sends the invite code with a signup', async () => {
    const { api, calls } = fakeApi(200, { id: 'u', username: 'sam', email: 'sam@example.com' });
    await api.register('sam', 'sam@example.com', 'correct horse battery', 'ABC-123');
    expect(JSON.parse(calls[0].body!)).toEqual({
      username: 'sam', email: 'sam@example.com', password: 'correct horse battery', inviteCode: 'ABC-123',
    });
  });

  it('sends a null invite code when there is none', async () => {
    const { api, calls } = fakeApi(200, { id: 'u', username: 'sam', email: 'sam@example.com' });
    await api.register('sam', 'sam@example.com', 'correct horse battery');
    expect(JSON.parse(calls[0].body!).inviteCode).toBeNull();
  });

  it('deletes the account with the password in the body', async () => {
    const { api, calls } = fakeApi(204, undefined);
    await expect(api.deleteMe('tok', 'secret')).resolves.toBeNull();
    expect(calls[0]).toMatchObject({ url: 'https://sumry.test/api/users/me', method: 'DELETE' });
    expect(calls[0].headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(calls[0].body!)).toEqual({ password: 'secret' });
  });

  it('surfaces a wrong password as an error', async () => {
    const { api } = fakeApi(401, { message: 'Password is incorrect' });
    await expect(api.deleteMe('tok', 'nope')).rejects.toThrow('Password is incorrect');
  });
});
