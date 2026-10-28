import { authenticate, protect, body, remote, json, failure, HttpError } from '../lib/backend.js';
import { validateBackup } from '../src/ledger.js';
export default async function handler(req, res) {
  try {
    protect(req, res, ['GET', 'PUT']);
    const { user, token } = await authenticate(req, res);
    const filter = `user_id=eq.${encodeURIComponent(user.id)}`;
    if (req.method === 'GET') {
      const rows = await remote(`/rest/v1/bank_ledgers?${filter}&select=data,revision`, { token });
      return json(res, 200, { ...(rows[0] || { data: { version: 1, mobis: [], transactions: [] }, revision: 0 }), userId: user.id });
    }
    const input = await body(req);
    if (input?.userId !== user.id) throw new HttpError(409, 'A conta mudou em outra aba. Recarregue antes de salvar.');
    if (!Number.isSafeInteger(input?.revision) || input.revision < 0) throw new HttpError(400, 'Versão inválida.');
    let data; try { data = validateBackup(input.data); } catch { throw new HttpError(400, 'Registros da banca inválidos.'); }
    const revision = input.revision + 1;
    if (!Number.isSafeInteger(revision)) throw new HttpError(400, 'Versão inválida.');
    const rows = input.revision === 0
      ? await remote('/rest/v1/bank_ledgers', { token, method: 'POST', prefer: 'return=representation', body: { user_id: user.id, data, revision } })
      : await remote(`/rest/v1/bank_ledgers?${filter}&revision=eq.${input.revision}`, { token, method: 'PATCH', prefer: 'return=representation', body: { data, revision } });
    if (!rows?.length) throw new HttpError(409, 'Dados alterados em outra aba ou dispositivo. Recarregue antes de salvar.');
    json(res, 200, { revision });
  } catch (error) { failure(res, error); }
}
