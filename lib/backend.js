export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new HttpError(503, 'Configure SUPABASE_URL e SUPABASE_ANON_KEY no servidor.');
  if (!url.startsWith('https://')) throw new HttpError(503, 'SUPABASE_URL deve usar HTTPS.');
  return { url, key };
}
export async function remote(endpoint, { token, method = 'GET', body, prefer } = {}) {
  const { url, key } = config();
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (prefer) headers.Prefer = prefer;
  let response;
  try { response = await fetch(`${url}${endpoint}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) }); }
  catch { throw new HttpError(503, 'Serviço indisponível. Tente novamente.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 429) throw new HttpError(429, 'Muitas tentativas. Aguarde antes de tentar novamente.');
    if (response.status === 409) throw new HttpError(409, 'Dados alterados em outra aba ou dispositivo. Recarregue antes de salvar.');
    if (response.status >= 500) throw new HttpError(503, 'Serviço indisponível. Tente novamente.');
    throw new HttpError(response.status === 401 || response.status === 403 ? 401 : 400, 'Não foi possível concluir a solicitação.');
  }
  return data;
}
export function cookies(req) {
  const result = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('='); if (index < 0) continue;
    try { result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1)); } catch { /* Cookie inválido é ignorado. */ }
  }
  return result;
}
export function setSession(res, session) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : '';
  const suffix = `; Path=/; HttpOnly; SameSite=Strict${secure}`;
  res.setHeader('Set-Cookie', [
    `banca_access=${encodeURIComponent(session?.access_token || '')}; Max-Age=${session ? Math.min(session.expires_in || 3600, 3600) : 0}${suffix}`,
    `banca_refresh=${encodeURIComponent(session?.refresh_token || '')}; Max-Age=${session ? 604800 : 0}${suffix}`,
  ]);
}
export function protect(req, res, methods) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!methods.includes(req.method)) { res.setHeader('Allow', methods.join(', ')); throw new HttpError(405, 'Método não permitido.'); }
  if (req.method !== 'GET') {
    let origin; try { origin = new URL(req.headers.origin); } catch { throw new HttpError(403, 'Origem inválida.'); }
    if (origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol)) throw new HttpError(403, 'Origem inválida.');
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Origem inválida.');
  }
}
export async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Envie JSON.');
  if (req.body !== undefined) {
    if (Buffer.byteLength(typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) > 3_000_000) throw new HttpError(413, 'Dados excedem 3 MB.');
    try { return typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { throw new HttpError(400, 'JSON inválido.'); }
  }
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 3_000_000) throw new HttpError(413, 'Dados excedem 3 MB.'); }
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'JSON inválido.'); }
}
export async function authenticate(req, res) {
  const saved = cookies(req);
  if (saved.banca_access) {
    try { const user = await remote('/auth/v1/user', { token: saved.banca_access }); return { user, token: saved.banca_access }; }
    catch (error) { if (![400, 401].includes(error.status)) throw error; }
  }
  if (saved.banca_refresh) {
    try {
      const session = await remote('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: saved.banca_refresh } });
      const user = await remote('/auth/v1/user', { token: session.access_token });
      setSession(res, session); return { user, token: session.access_token };
    } catch (error) { if (![400, 401].includes(error.status)) throw error; }
  }
  setSession(res, null); throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
}
export function json(res, status, data) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); }
export function failure(res, error) { json(res, error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'Não foi possível concluir a solicitação.' }); }
