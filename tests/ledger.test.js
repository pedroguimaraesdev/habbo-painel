import test from 'node:test';
import assert from 'node:assert/strict';
import { positive, transaction, summary, evolution, validateBackup, coinsToBRL, formatAmount, bankItem, initialBank, bankOverview } from '../src/ledger.js';
const input = { direction: 'in', kind: 'money', currency: 'BRL', amount: '10.25', date: '2026-10-28', description: 'Entrada' };
test('valores monetários usam centavos e rejeitam entradas inválidas', () => {
  assert.equal(positive('10.25'), 1025);
  assert.equal(positive('0.29'), 29);
  for (const value of ['', '-2', '0', '1.234', 'Infinity']) assert.throws(() => positive(value));
});
test('mobis preservam a avaliação e multiplicam pela quantidade', () => {
  const mobis = [{ id: 'trono', name: 'Trono', currency: 'COIN', price: 12500 }];
  const row = transaction({ ...input, kind: 'mobi', mobiId: 'trono', quantity: '3' }, mobis);
  mobis[0].price = 999;
  assert.equal(row.amount, 37500); assert.equal(row.currency, 'BRL'); assert.equal(row.mobiName, 'Trono');
  assert.throws(() => transaction({ ...input, kind: 'mobi', mobiId: 'missing', quantity: 1 }, mobis));
  assert.throws(() => transaction({ ...input, kind: 'mobi', mobiId: 'trono', quantity: 1.5 }, mobis));
});
test('saldos separam moedas de reais e descontam saídas', () => {
  const rows = [transaction(input, []), transaction({ ...input, direction: 'out', amount: '2' }, []), transaction({ ...input, currency: 'COIN', amount: '100' }, [])];
  assert.deepEqual(summary(rows, 'BRL'), { incoming: 1025, outgoing: 200, balance: 825 });
  assert.equal(summary(rows, 'COIN').balance, 10000);
});
test('evolução ordena datas, agrupa dias e permite saldo negativo', () => {
  const rows = [transaction(input, []), transaction({ ...input, date: '2026-10-27', direction: 'out', amount: '20' }, []), transaction({ ...input, amount: '1' }, [])];
  assert.deepEqual(evolution(rows, 'BRL'), [{ date: '2026-10-27', balance: -2000 }, { date: '2026-10-28', balance: -875 }]);
  assert.deepEqual(evolution([], 'COIN'), []);
});
test('backup rejeita valores inválidos, IDs duplicados e datas inexistentes', () => {
  const row = transaction(input, []); const data = { version: 1, mobis: [], transactions: [row] };
  assert.equal(validateBackup(data), data);
  assert.throws(() => validateBackup({ ...data, version: 2 }));
  assert.throws(() => validateBackup({ ...data, transactions: [row, row] }));
  assert.throws(() => validateBackup({ ...data, transactions: [{ ...row, amount: -1 }] }));
  assert.throws(() => validateBackup({ ...data, transactions: [{ ...row, date: '2026-02-30' }] }));
});
test('lançamentos rejeitam datas inexistentes e valores excessivos', () => {
  assert.throws(() => transaction({ ...input, date: '2026-02-30' }, []));
  assert.throws(() => transaction({ ...input, amount: '99999999999999999999' }, []));
});

test('valor e unidade do mobi podem ser ajustados na entrada ou saída sem mudar o cadastro', () => {
  const mobis = [{ id: 'trono', name: 'Trono', currency: 'COIN', price: 12500 }];
  for (const direction of ['in', 'out']) {
    const row = transaction({ ...input, direction, kind: 'mobi', mobiId: 'trono', quantity: '2', unitPrice: '35.50', currency: 'BRL' }, mobis);
    assert.equal(row.amount, 7100); assert.equal(row.unitPrice, 3550); assert.equal(row.currency, 'BRL');
    assert.equal(mobis[0].price, 12500); assert.equal(mobis[0].currency, 'COIN');
  }
  assert.throws(() => transaction({ ...input, kind: 'mobi', mobiId: 'trono', quantity: '2', unitPrice: '' }, mobis));
});
test('banca inicial soma ao saldo sem aumentar as entradas e integra a evolução', () => {
  const rows = [transaction(input, []), transaction({ ...input, direction: 'out', amount: '2' }, [])];
  assert.deepEqual(summary(rows, 'BRL', 10000), { incoming: 1025, outgoing: 200, balance: 10825 });
  assert.deepEqual(evolution(rows, 'BRL', 10000), [{ date: '2026-10-28', balance: 10825 }]);
  assert.equal(summary([], 'COIN', 50000).balance, 50000);
});
test('backups preservam cadastro da banca e aceitam registros da versão anterior', () => {
  const legacy = { version: 1, mobis: [], transactions: [transaction(input, [])] };
  assert.equal(validateBackup(legacy), legacy);
  const data = { ...legacy, bank: { name: 'Minha banca', COIN: 10000, BRL: 2000 } };
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data))), data);
  assert.throws(() => validateBackup({ ...data, bank: { ...data.bank, COIN: -1 } }));
});

test('conversão fixa usa 1000 moedas para 200 reais e arredonda centavos', () => {
  assert.equal(coinsToBRL(100000), 20000);
  assert.equal(coinsToBRL(100), 20);
  assert.equal(coinsToBRL(3), 1);
  assert.equal(coinsToBRL(0), 0);
  assert.equal(coinsToBRL(-100000), -20000);
});
test('todos os preços em moedas incluem o equivalente em reais', () => {
  const label = formatAmount(100000, 'COIN').replace(/\s/g, ' ');
  assert.equal(label, '1.000 moedas (R$ 200,00)');
  assert.equal(formatAmount(20000, 'BRL').replace(/\s/g, ' '), 'R$ 200,00');
});

test('mobis compõem banca inicial e total em reais sem duplicar entradas', () => {
  const catalog = [{ id: 'trono', name: 'Trono', currency: 'COIN', price: 50000 }];
  const item = bankItem({ mobiId: 'trono', quantity: '2', unitPrice: '400', currency: 'COIN' }, catalog);
  const bank = { name: 'Banca', COIN: 100000, BRL: 5000, items: [item] };
  assert.equal(initialBank(bank, 'COIN'), 180000);
  assert.equal(initialBank(bank, 'BRL'), 5000);
  assert.deepEqual(bankOverview(bank, []), { coins: 180000, reais: 5000, totalBRL: 41000 });
  assert.equal(summary([], 'COIN', initialBank(bank, 'COIN')).incoming, 0);
  const rows = [transaction({ ...input, direction: 'out', currency: 'COIN', amount: '100' }, [])];
  assert.equal(bankOverview(bank, rows).totalBRL, 39000);
  catalog[0].price = 1;
  assert.equal(item.unitPrice, 40000);
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify({ version: 1, bank, mobis: [], transactions: [] }))).bank, bank);
});
test('mobis iniciais aceitam reais e rejeitam quantidade e avaliação inválidas', () => {
  const catalog = [{ id: 'm', name: 'Mobi', currency: 'BRL', price: 1000 }];
  const item = bankItem({ mobiId: 'm', quantity: '3', unitPrice: '10', currency: 'BRL' }, catalog);
  const bank = { name: 'Banca', COIN: 0, BRL: 1000, items: [item] };
  assert.equal(bankOverview(bank, []).totalBRL, 4000);
  assert.equal(initialBank(undefined, 'COIN'), 0);
  for (const changes of [{ quantity: '1.5' }, { unitPrice: '-1' }, { mobiId: 'missing' }]) assert.throws(() => bankItem({ mobiId: 'm', quantity: '1', unitPrice: '10', currency: 'BRL', ...changes }, catalog));
  assert.throws(() => validateBackup({ version: 1, mobis: [], transactions: [], bank: { ...bank, items: [{ ...item, quantity: -1 }] } }));
});
