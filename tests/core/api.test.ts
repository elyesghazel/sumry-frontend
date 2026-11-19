import { describe, expect, it } from 'vitest';
import { checksCredentials, createApi, type FetchLike, type UnauthorizedInfo } from '../../core';

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

describe('401 handling', () => {
  function apiAnswering401(body: unknown) {
    const heard: { path: string; info: UnauthorizedInfo }[] = [];
    const fetch: FetchLike = async () => ({ ok: false, status: 401, text: async () => JSON.stringify(body) });
    const api = createApi({ baseUrl: 'https://sumry.test', fetch, onUnauthorized: (path, info) => heard.push({ path, info }) });
    return { api, heard };
  }

  it('reports the path, method, token and body before throwing', async () => {
    const { api, heard } = apiAnswering401({ error: 'Token missing, invalid or revoked' });
    await expect(api.accounts('tok')).rejects.toMatchObject({ status: 401 });
    expect(heard).toEqual([{
      path: '/api/users/accounts/',
      info: { method: 'GET', token: 'tok', body: { error: 'Token missing, invalid or revoked' } },
    }]);
  });

  it('reports a null token on a public call', async () => {
    const { api, heard } = apiAnswering401({ error: 'Invalid email or password' });
    await expect(api.login('a@example.com', 'x')).rejects.toThrow('Invalid email or password');
    expect(heard[0].info.token).toBeNull();
  });

  it('tells password checks apart from session calls', () => {
    expect(checksCredentials('/api/users/login', 'POST')).toBe(true);
    expect(checksCredentials('/api/users/register', 'POST')).toBe(true);
    expect(checksCredentials('/api/users/password-reset', 'POST')).toBe(true);
    expect(checksCredentials('/api/users/password', 'PUT')).toBe(true);
    expect(checksCredentials('/api/users/me', 'DELETE')).toBe(true);
    expect(checksCredentials('/api/users/me', 'GET')).toBe(false);
    expect(checksCredentials('/api/users/accounts/', 'GET')).toBe(false);
    expect(checksCredentials('/api/transactions/search?q=x', 'GET')).toBe(false);
  });
});
