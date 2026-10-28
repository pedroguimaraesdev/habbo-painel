export const currencies = ['COIN', 'BRL'];
// Valores internos em centésimos de moeda e centavos de real.
export const BRL_PER_COIN = 200 / 1000;
export function coinsToBRL(amount) {
  return Math.round(amount * BRL_PER_COIN);
}
export function formatAmount(amount, currency) {
  const reais = value => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (currency === 'BRL') return reais(amount);
  return `${(amount / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} moedas (${reais(coinsToBRL(amount))})`;
}
export function positive(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || Math.round(number * 100) !== number * 100 && Math.abs(Math.round(number * 100) - number * 100) > 1e-7) throw new Error('Informe um valor positivo com até duas casas decimais.');
  return Math.round(number * 100);
}
export function transaction(input, mobis) {
  if (!['in', 'out'].includes(input.direction) || !['money', 'mobi'].includes(input.kind)) throw new Error('Movimentação inválida.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || new Date(`${input.date}T12:00:00Z`).toISOString().slice(0, 10) !== input.date) throw new Error('Data inválida.');
  const item = input.kind === 'mobi' ? mobis.find(m => m.id === input.mobiId) : null;
  if (input.kind === 'mobi' && !item) throw new Error('Cadastre e selecione um mobi.');
  const currency = item ? (input.currency || item.currency) : input.currency;
  if (!currencies.includes(currency)) throw new Error('Unidade inválida.');
  const quantity = item ? Number(input.quantity) : 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Quantidade deve ser um inteiro positivo.');
  const unitPrice = item ? (input.unitPrice === undefined ? item.price : positive(input.unitPrice)) : null;
  const amount = item ? unitPrice * quantity : positive(input.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Valor fora do limite permitido.');
  return { id: crypto.randomUUID(), direction: input.direction, kind: input.kind, date: input.date, currency, amount, quantity, mobiId: item?.id ?? null, mobiName: item?.name ?? '', ...(item ? { unitPrice } : {}), description: String(input.description || '').trim().slice(0, 200) };
}
export function summary(rows, currency, initial = 0) {
  const list = rows.filter(t => t.currency === currency);
  const incoming = list.filter(t => t.direction === 'in').reduce((s, t) => s + t.amount, 0);
  const outgoing = list.filter(t => t.direction === 'out').reduce((s, t) => s + t.amount, 0);
  return { incoming, outgoing, balance: initial + incoming - outgoing };
}
export function evolution(rows, currency, initial = 0) {
  const daily = new Map();
  for (const t of rows.filter(t => t.currency === currency)) daily.set(t.date, (daily.get(t.date) || 0) + (t.direction === 'in' ? t.amount : -t.amount));
  let balance = initial;
  return [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, balance: balance += amount }));
}
export function initialBank(bank, currency) {
  return (bank?.[currency] || 0) + (bank?.items || [])
    .filter(item => item.currency === currency)
    .reduce((total, item) => total + item.unitPrice * item.quantity, 0);
}
export function bankOverview(bank, rows) {
  const coins = summary(rows, 'COIN', initialBank(bank, 'COIN')).balance;
  const reais = summary(rows, 'BRL', initialBank(bank, 'BRL')).balance;
  return { coins, reais, totalBRL: reais + coinsToBRL(coins) };
}
export function bankItem(input, mobis) {
  const mobi = mobis.find(item => item.id === input.mobiId);
  if (!mobi) throw new Error('Selecione um mobi cadastrado.');
  const quantity = Number(input.quantity);
  const unitPrice = positive(input.unitPrice);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(quantity * unitPrice) || !currencies.includes(input.currency)) throw new Error('Quantidade ou valor do mobi inválido.');
  return { id: crypto.randomUUID(), mobiId: mobi.id, name: mobi.name, quantity, unitPrice, currency: input.currency };
}
function validateBankItems(items) {
  if (!Array.isArray(items)) throw new Error('Mobis da banca inválidos.');
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || ids.has(item.id) || typeof item.mobiId !== 'string' || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 || !currencies.includes(item.currency) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.unitPrice) || item.unitPrice <= 0 || !Number.isSafeInteger(item.quantity * item.unitPrice)) throw new Error('Mobi da banca inválido.');
    ids.add(item.id);
  }
}
export function validateBackup(data) {
  if (data?.version !== 1 || !Array.isArray(data.mobis) || !Array.isArray(data.transactions)) throw new Error('Backup inválido.');
  if (data.bank !== undefined) {
    const b = data.bank;
    if (!b || typeof b.name !== 'string' || !b.name.trim() || b.name.length > 80 || ![b.COIN, b.BRL].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Cadastro de banca inválido.');
    if (b.items !== undefined) validateBankItems(b.items);
    for (const currency of currencies) if (!Number.isSafeInteger(initialBank(b, currency))) throw new Error('Capital inicial fora do limite permitido.');
  }
  const ids = new Set();
  for (const m of data.mobis) {
    if (!m || typeof m.id !== 'string' || ids.has(m.id) || typeof m.name !== 'string' || !m.name.trim() || m.name.length > 80 || !currencies.includes(m.currency) || !Number.isSafeInteger(m.price) || m.price <= 0) throw new Error('Cadastro de mobi inválido.');
    ids.add(m.id);
  }
  ids.clear();
  for (const t of data.transactions) {
    if (!t || typeof t.id !== 'string' || ids.has(t.id) || !['in', 'out'].includes(t.direction) || !['money', 'mobi'].includes(t.kind) || !currencies.includes(t.currency) || !Number.isSafeInteger(t.amount) || t.amount <= 0 || typeof t.description !== 'string' || t.description.length > 200 || typeof t.mobiName !== 'string' || !Number.isSafeInteger(t.quantity) || t.quantity < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !Number.isFinite(Date.parse(t.date)) || new Date(t.date).toISOString().slice(0, 10) !== t.date) throw new Error('Lançamento inválido no backup.');
    ids.add(t.id);
  }
  return data;
}
