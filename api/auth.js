import { remote, setSession, cookies, protect, body, authenticate, json, failure, HttpError } from '../lib/backend.js';
export default async function handler(req, res) {
  try {
    protect(req, res, ['GET', 'POST', 'DELETE']);
    if (req.method === 'GET') {
      const { user } = await authenticate(req, res);
      return json(res, 200, { user: { id: user.id, email: user.email } });
    }
    if (req.method === 'DELETE') {
      const token = cookies(req).banca_access;
      if (token) {
        try { await remote('/auth/v1/logout?scope=local', { method: 'POST', token }); }
        catch (error) { if (![400, 401].includes(error.status)) throw error; }
      }
      setSession(res, null); return json(res, 200, { ok: true });
    }
    const input = await body(req);
    if (typeof input?.email !== 'string' || input.email.length > 254 || !input.email.includes('@') || typeof input.password !== 'string' || !input.password || input.password.length > 1024) throw new HttpError(400, 'Informe e-mail e senha válidos.');
    let session;
    try { session = await remote('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: input.email.trim(), password: input.password } }); }
    catch (error) { if ([400, 401].includes(error.status)) throw new HttpError(401, 'E-mail ou senha inválidos.'); throw error; }
    setSession(res, session);
    json(res, 200, { user: { id: session.user.id, email: session.user.email } });
  } catch (error) { failure(res, error); }
}
