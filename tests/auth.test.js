import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import auth from '../api/auth.js';
import data from '../api/data.js';
import { setSession } from '../lib/backend.js';
const originalFetch = globalThis.fetch;
const oldURL = process.env.SUPABASE_URL; const oldKey = process.env.SUPABASE_ANON_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (oldURL === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldURL;
  if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = oldKey;
});
function setup(responses) {
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_ANON_KEY = 'public-test-key';
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, ...options }); const response = responses.shift(); assert.ok(response, 'Chamada externa inesperada'); return new Response(JSON.stringify(response.body), { status: response.status || 200 }); };
  return calls;
}
function req(method, values = {}) { return { method, headers: { host: 'painel.test', origin: 'https://painel.test', 'content-type': 'application/json' }, ...values }; }
function res() { return { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(value) { this.data = JSON.parse(value); } }; }
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'conta@example.com' };
const session = { user, access_token: 'access-test', refresh_token: 'refresh-test', expires_in: 3600 };
const empty = { version: 1, mobis: [], transactions: [] };
test('API rejeita usuário anônimo sem consultar banco', async () => {
  const calls = setup([]); const response = res(); await data(req('GET'), response);
  assert.equal(response.statusCode, 401); assert.equal(calls.length, 0); assert.equal(response.headers['Cache-Control'], 'no-store');
});
test('login define cookies HttpOnly e não retorna tokens no JSON', async () => {
  const calls = setup([{ body: session }]); const response = res(); await auth(req('POST', { body: { email: user.email, password: 'senha-de-teste' } }), response);
  assert.equal(response.statusCode, 200); assert.deepEqual(response.data, { user });
  assert.match(calls[0].url, /grant_type=password/);
  for (const cookie of response.headers['Set-Cookie']) { assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); }
  assert.ok(!JSON.stringify(response.data).includes('access-test'));
});
test('produção marca cookies como Secure', () => {
  const prior = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try { const response = res(); setSession(response, session); assert.ok(response.headers['Set-Cookie'].every(cookie => cookie.includes('; Secure'))); }
  finally { if (prior === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prior; }
});
test('senha incorreta retorna erro genérico', async () => {
  setup([{ status: 400, body: { error_description: 'informação privada' } }]); const response = res();
  await auth(req('POST', { body: { email: user.email, password: 'incorreta' } }), response);
  assert.equal(response.statusCode, 401); assert.equal(response.data.error, 'E-mail ou senha inválidos.');
});
test('login e gravação bloqueiam origem externa e origem ausente', async () => {
  const calls = setup([]);
  for (const handler of [auth, data]) for (const origin of ['https://outro.test', undefined]) {
    const request = req(handler === auth ? 'POST' : 'PUT'); request.headers.origin = origin;
    const response = res(); await handler(request, response); assert.equal(response.statusCode, 403);
  }
  assert.equal(calls.length, 0);
});
test('sessão expirada é renovada pelo refresh token', async () => {
  const calls = setup([{ status: 401, body: {} }, { body: session }, { body: user }]); const response = res();
  await auth(req('GET', { headers: { cookie: 'banca_access=expired; banca_refresh=refresh-test' } }), response);
  assert.equal(response.statusCode, 200); assert.match(calls[1].url, /grant_type=refresh_token/); assert.deepEqual(response.data, { user });
});
test('leitura usa identidade validada no servidor e token do usuário', async () => {
  const calls = setup([{ body: user }, { body: [{ data: empty, revision: 4 }] }]); const response = res();
  await data(req('GET', { headers: { cookie: 'banca_access=access-test' }, body: { user_id: 'outra-conta' } }), response);
  assert.equal(response.statusCode, 200); assert.ok(calls[1].url.includes(user.id));
  assert.equal(calls[1].headers.Authorization, 'Bearer access-test'); assert.deepEqual(response.data, { data: empty, revision: 4, userId: user.id });
});
test('gravação ignora user_id enviado e salva para dono da sessão', async () => {
  const calls = setup([{ body: user }, { body: [{ revision: 1 }] }]); const request = req('PUT', { body: { data: empty, revision: 0, userId: user.id, user_id: 'outra-conta' } }); request.headers.cookie = 'banca_access=access-test';
  const response = res(); await data(request, response);
  assert.equal(response.statusCode, 200); assert.equal(JSON.parse(calls[1].body).user_id, user.id); assert.equal(response.data.revision, 1);
});
test('alteração concorrente não sobrescreve registros mais recentes', async () => {
  const calls = setup([{ body: user }, { body: [] }]); const request = req('PUT', { body: { data: empty, revision: 4, userId: user.id } }); request.headers.cookie = 'banca_access=access-test';
  const response = res(); await data(request, response); assert.equal(response.statusCode, 409); assert.match(calls[1].url, /revision=eq.4/);
});
test('API rejeita backup inválido antes de gravar', async () => {
  const calls = setup([{ body: user }]); const request = req('PUT', { body: { data: { version: 50 }, revision: 0, userId: user.id } }); request.headers.cookie = 'banca_access=access-test';
  const response = res(); await data(request, response); assert.equal(response.statusCode, 400); assert.equal(calls.length, 1);
});
test('logout revoga sessão e limpa cookies', async () => {
  const calls = setup([{ body: {} }]); const request = req('DELETE'); request.headers.cookie = 'banca_access=access-test'; const response = res();
  await auth(request, response); assert.equal(response.statusCode, 200); assert.match(calls[0].url, /logout/);
  assert.ok(response.headers['Set-Cookie'].every(cookie => cookie.includes('Max-Age=0')));
});
test('limite do provedor retorna mensagem sem informações internas', async () => {
  setup([{ status: 429, body: { message: 'internal' } }]); const response = res();
  await auth(req('POST', { body: { email: user.email, password: 'senha' } }), response);
  assert.equal(response.statusCode, 429); assert.ok(!response.data.error.includes('internal'));
});
test('configuração ausente impede login e métodos inválidos são rejeitados', async () => {
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
  const response = res(); await auth(req('POST', { body: { email: user.email, password: 'senha' } }), response); assert.equal(response.statusCode, 503);
  const invalid = res(); await data(req('POST'), invalid); assert.equal(invalid.statusCode, 405);
});

test('troca de conta entre abas impede salvar registros da conta anterior', async () => {
  const calls = setup([{ body: user }]); const request = req('PUT', { body: { data: empty, revision: 0, userId: 'outra-conta' } }); request.headers.cookie = 'banca_access=access-test';
  const response = res(); await data(request, response); assert.equal(response.statusCode, 409); assert.equal(calls.length, 1);
});

test('login e consulta de sessão retornam nome dos metadados sem expor outros campos', async () => {
  const namedUser = { ...user, user_metadata: { full_name: '  Pedro  ', internal: 'privado' } };
  setup([{ body: { ...session, user: namedUser } }]);
  const login = res();
  await auth(req('POST', { body: { email: user.email, password: 'senha-de-teste' } }), login);
  assert.deepEqual(login.data, { user: { ...user, name: 'Pedro' } });
  setup([{ body: namedUser }]);
  const current = res();
  await auth(req('GET', { headers: { cookie: 'banca_access=access-test' } }), current);
  assert.deepEqual(current.data, login.data);
});

test('nome aceita campo alternativo e ignora metadados de tipo inválido', async () => {
  for (const [metadata, name] of [[{ full_name: 123, name: 'Ana' }, 'Ana'], [{ full_name: ' ', name: {} }, undefined]]) {
    setup([{ body: { ...user, user_metadata: metadata } }]);
    const response = res();
    await auth(req('GET', { headers: { cookie: 'banca_access=access-test' } }), response);
    assert.deepEqual(response.data.user, { ...user, ...(name ? { name } : {}) });
  }
});
