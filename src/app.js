import { request } from './session.js';
import { positive, transaction, summary, evolution, validateBackup, formatAmount, initialBank, bankOverview, bankItem } from './ledger.js';
const $ = s => document.querySelector(s);
let revision = 0;
let saving = false;
let loggedIn = false;
let accountId = null;
let state = { version: 1, mobis: [], transactions: [] };
const message = text => { $('#message').textContent = text; };
let bankItems = [];
async function persist(next) {
  if (!loggedIn || saving) { message('Aguarde o salvamento atual antes de continuar.'); return false; }
  saving = true;
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try {
    const result = await request('/api/data', { method: 'PUT', body: JSON.stringify({ data: next, revision, userId: accountId }) });
    revision = result.revision; state = next; render(); updatePreviews(); return true;
  } catch (error) {
    if (error.status === 401) showLogin('Sua sessão expirou. Entre novamente.');
    else message(error.message);
    return false;
  } finally {
    saving = false;
    document.querySelectorAll('button').forEach(button => { button.disabled = false; });
    $('#add-bank-mobi').disabled = !state.mobis.length;
  }
}
const money = formatAmount;
const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR');
function cell(row, value, className = '') { const td = document.createElement('td'); td.textContent = value; td.className = className; row.append(td); }
function render() {
  const currency = $('#view-currency').value;
  const initial = initialBank(state.bank, currency);
  const totals = summary(state.transactions, currency, initial);
  const overview = bankOverview(state.bank, state.transactions);
  $('#overview-coins').textContent = money(overview.coins, 'COIN');
  $('#overview-reais').textContent = money(overview.reais, 'BRL');
  $('#overview-total-brl').textContent = money(overview.totalBRL, 'BRL');
  $('#overview-bank-name').textContent = state.bank?.name || 'Sua banca de apostas';
  $('#overview-bank-initial').textContent = state.bank
    ? `Capital inicial: ${money(initialBank(state.bank, 'COIN'), 'COIN')} + ${money(initialBank(state.bank, 'BRL'), 'BRL')} incluindo os mobis iniciais.`
    : 'Cadastre sua banca para definir o capital inicial.';
  $('#bank-form').elements.name.value = state.bank?.name || 'Minha banca';
  for (const unit of ['COIN', 'BRL']) $('#bank-form').elements[unit].value = (state.bank?.[unit] || 0) / 100;
  $('#bank-summary').textContent = state.bank ? `${state.bank.name} · Capital inicial: ${money(initialBank(state.bank, 'COIN'), 'COIN')} e ${money(initialBank(state.bank, 'BRL'), 'BRL')}` : 'Cadastre o capital inicial da sua banca.';
  for (const field of ['balance', 'incoming', 'outgoing']) $(`#${field}`).textContent = money(totals[field], currency);
  $('#movement-currency').value = currency;
  const filter = $('#filter').value;
  const rows = state.transactions.filter(t => t.currency === currency && (filter === 'all' || t.direction === filter)).sort((a, b) => b.date.localeCompare(a.date));
  $('#rows').replaceChildren();
  for (const t of rows) {
    const row = document.createElement('tr');
    cell(row, t.description || (t.kind === 'mobi' ? t.mobiName : 'Valor direto'));
    cell(row, dateLabel(t.date));
    cell(row, t.kind === 'mobi' ? `${t.quantity} × ${t.mobiName} (${money(t.amount / t.quantity, t.currency)}/un.)` : 'Valor direto');
    cell(row, `${t.direction === 'in' ? '+' : '−'} ${money(t.amount, t.currency)}`, t.direction === 'in' ? 'green' : 'red');
    const action = document.createElement('td'); const button = document.createElement('button');
    button.textContent = 'Excluir'; button.className = 'text-button';
    button.onclick = async () => { if (confirm('Excluir esta movimentação? O saldo será recalculado.')) await persist({ ...state, transactions: state.transactions.filter(item => item.id !== t.id) }); };
    action.append(button); row.append(action); $('#rows').append(row);
  }
  $('#empty').textContent = rows.length ? '' : 'Nenhuma movimentação nesta unidade. Comece registrando uma entrada.';
  $('#mobis').replaceChildren(); $('#mobi-select').replaceChildren();
  for (const m of state.mobis) {
    const option = new Option(`${m.name} · ${money(m.price, m.currency)}`, m.id); $('#mobi-select').append(option);
    const item = document.createElement('div'); item.className = 'mobi-item';
    const text = document.createElement('span'); text.textContent = `▧  ${m.name} · ${money(m.price, m.currency)}/un.`;
    const remove = document.createElement('button'); remove.className = 'text-button'; remove.textContent = 'Remover';
    remove.onclick = async () => { if (confirm('Remover este mobi do catálogo? O histórico será preservado.')) await persist({ ...state, mobis: state.mobis.filter(value => value.id !== m.id) }); };
    const edit = document.createElement('button'); edit.className = 'text-button'; edit.textContent = 'Editar';
    edit.onclick = () => { const form = $('#mobi-form'); for (const field of ['id', 'name', 'currency']) form.elements[field].value = m[field]; form.elements.price.value = m.price / 100; $('#mobi-submit').textContent = 'Salvar alterações'; $('#cancel-mobi').hidden = false; form.elements.name.focus(); updatePreviews(); };
    const actions = document.createElement('div'); actions.append(edit, remove);
    item.append(text, actions); $('#mobis').append(item);
  }
  if (!state.mobis.length) $('#mobis').textContent = 'Seu catálogo ainda está vazio.';
  refreshBankMobiOptions();
  renderBankItems();
  renderChart(currency);
}
function renderChart(currency) {
  const initial = initialBank(state.bank, currency);
  const points = evolution(state.transactions, currency, initial); const target = $('#chart'); target.replaceChildren();
  if (!points.length) { target.className = 'chart-empty'; target.textContent = `Banca inicial: ${money(initial, currency)}. Registre entradas e saídas para acompanhar a evolução.`; return; }
  target.className = '';
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 900 240'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Evolução da banca em ${currency === 'BRL' ? 'reais' : 'moedas'}`);
  const data = [{ date: points[0].date, balance: initial }, ...points];
  const min = Math.min(0, ...data.map(p => p.balance)); const max = Math.max(1, ...data.map(p => p.balance));
  const y = v => 190 - (v - min) / (max - min) * 160;
  for (let i = 0; i < 4; i++) {
    const value = min + (max - min) * i / 3; const line = document.createElementNS(ns, 'line');
    for (const [k,v] of Object.entries({x1: 260, x2: 880, y1: y(value), y2: y(value), stroke: '#283146'})) line.setAttribute(k,v);
    svg.append(line); const label = document.createElementNS(ns, 'text'); label.setAttribute('x', '0'); label.setAttribute('y', y(value) + 4); label.textContent = money(Math.round(value), currency); svg.append(label);
  }
  const path = document.createElementNS(ns, 'polyline'); path.setAttribute('points', data.map((p,i) => `${270 + i / (data.length - 1) * 600},${y(p.balance)}`).join(' ')); path.setAttribute('fill','none'); path.setAttribute('stroke','#a6e75a'); path.setAttribute('stroke-width','3'); svg.append(path);
  data.slice(1).forEach((p,i) => { const circle = document.createElementNS(ns, 'circle'); circle.setAttribute('cx',270 + (i+1)/(data.length-1)*600); circle.setAttribute('cy',y(p.balance)); circle.setAttribute('r','4'); circle.setAttribute('fill','#a6e75a'); const title = document.createElementNS(ns,'title'); title.textContent = `${dateLabel(p.date)}: ${money(p.balance,currency)}`; circle.append(title); svg.append(circle); });
  target.append(svg); const caption = document.createElement('p'); caption.className = 'chart-caption'; caption.textContent = `${dateLabel(points[0].date)} → ${dateLabel(points.at(-1).date)} · Saldo: ${money(points.at(-1).balance, currency)}`; target.append(caption);
}
function updateKind() {
  const mobi = $('#kind').value === 'mobi';
  for (const selector of ['[data-money]', '[data-mobi]']) document.querySelectorAll(selector).forEach(label => { const visible = selector === '[data-mobi]' ? mobi : !mobi; label.hidden = !visible; label.querySelector('input, select').disabled = !visible; });
}
function fillMobiValue() {
  const item = state.mobis.find(m => m.id === $('#mobi-select').value);
  const form = $('#entry-form');
  form.elements.unitPrice.value = item ? item.price / 100 : '';
  if (item) form.elements.currency.value = item.currency;
  updatePreviews();
}
$('#kind').onchange = () => { updateKind(); if ($('#kind').value === 'mobi') fillMobiValue(); updatePreviews(); };
$('#mobi-select').onchange = fillMobiValue;
$('#new-entry').onclick = () => { $('#entry-form').reset(); const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); $('#entry-form').elements.date.value = now.toISOString().slice(0,10); $('#form-error').textContent = ''; updateKind(); updatePreviews(); $('#entry-dialog').showModal(); };
$('#close-dialog').onclick = () => $('#entry-dialog').close();
$('#entry-form').onsubmit = async event => {
  event.preventDefault();
  try { const entry = transaction(Object.fromEntries(new FormData(event.target)), state.mobis); if (await persist({ ...state, transactions: [...state.transactions, entry] })) { $('#entry-dialog').close(); message('Movimentação salva.'); } }
  catch (error) { $('#form-error').textContent = error.message; }
};
$('#mobi-form').onsubmit = async event => {
  event.preventDefault();
  try { const values = Object.fromEntries(new FormData(event.target)); const name = values.name.trim(); if (!name) throw new Error('Informe o nome do mobi.'); const price = positive(values.price); if (!Number.isSafeInteger(price)) throw new Error('Valor fora do limite permitido.'); const mobi = { id: values.id || crypto.randomUUID(), name, currency: values.currency, price }; const mobis = values.id ? state.mobis.map(m => m.id === values.id ? mobi : m) : [...state.mobis, mobi]; if (await persist({ ...state, mobis })) { resetMobiForm(); message('Cadastro de mobi salvo. Os lançamentos anteriores foram preservados.'); } }
  catch (error) { message(error.message); }
};
function resetMobiForm() { $('#mobi-form').reset(); $('#mobi-form').elements.id.value = ''; $('#mobi-submit').textContent = 'Adicionar mobi'; $('#cancel-mobi').hidden = true; updatePreviews(); }
$('#cancel-mobi').onclick = resetMobiForm;
$('#bank-form').onsubmit = async event => {
  event.preventDefault();
  try {
    const values = Object.fromEntries(new FormData(event.target));
    const name = values.name.trim(); if (!name) throw new Error('Informe o nome da banca.');
    const bank = { name, items: structuredClone(bankItems) };
    for (const currency of ['COIN', 'BRL']) { bank[currency] = Number(values[currency]) === 0 ? 0 : positive(values[currency]); if (!Number.isSafeInteger(bank[currency])) throw new Error('Capital inicial fora do limite permitido.'); }
    validateBackup({ ...state, bank });
    if (state.bank && (JSON.stringify(bank.items) !== JSON.stringify(state.bank.items || []) || bank.COIN !== state.bank.COIN || bank.BRL !== state.bank.BRL) && !confirm('Alterar o capital inicial recalcula o saldo e o gráfico da banca. Confirmar?')) return;
    if (await persist({ ...state, bank })) {
      if (initialBank(bank, 'COIN') === 0 && initialBank(bank, 'BRL') > 0) $('#view-currency').value = 'BRL';
      else $('#view-currency').value = 'COIN';
      render(); location.hash = 'overview';
      message('Banca salva e exibida na página principal.');
    }
  } catch (error) { message(error.message); }
};
function showPage() {
  const requested = location.hash.slice(1) || 'overview';
  const page = ['overview', 'movements', 'bank', 'catalog'].includes(requested) ? requested : 'overview';
  document.querySelectorAll('[data-page]').forEach(section => { section.hidden = section.id !== page; });
  document.querySelectorAll('nav a').forEach(link => { const active = link.hash === `#${page}`; link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
}
window.addEventListener('hashchange', showPage);
showPage();
$('#view-currency').onchange = render; $('#filter').onchange = render;
$('#movement-currency').onchange = event => { $('#view-currency').value = event.target.value; render(); };
$('#export').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `banca-${new Date().toISOString().slice(0,10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
$('#import').onchange = async event => {
  try { const file = event.target.files[0]; if (!file) return; if (file.size > 5_000_000) throw new Error('O backup deve ter até 5 MB.'); const data = validateBackup(JSON.parse(await file.text())); if (confirm('Importar este backup substituirá os registros atuais. Deseja continuar?')) if (await persist(data)) { bankItems = structuredClone(state.bank?.items || []); renderBankItems(); message('Backup importado.'); } }
  catch (error) { message(`Não foi possível importar: ${error.message}`); }
  finally { event.target.value = ''; }
};
render();

function previewValue(value, currency, target) {
  const amount = Number(value);
  target.textContent = value !== '' && Number.isFinite(amount) && amount >= 0 ? money(Math.round(amount * 100), currency) : '';
}
function updatePreviews() {
  const bank = $('#bank-form').elements;
  previewValue(bank.COIN.value, 'COIN', $('#bank-conversion'));
  previewValue(bank.initialUnitPrice.value, bank.initialCurrency.value, $('#bank-mobi-conversion'));
  const mobi = $('#mobi-form').elements;
  previewValue(mobi.price.value, mobi.currency.value, $('#mobi-conversion'));
  const entry = $('#entry-form').elements;
  const isMobi = entry.kind.value === 'mobi';
  previewValue(isMobi ? entry.unitPrice.value : entry.amount.value, entry.currency.value, $('#entry-conversion'));
  const quantity = Number(entry.quantity.value);
  if (isMobi && entry.unitPrice.value !== '' && Number.isSafeInteger(quantity) && quantity > 0) {
    $('#entry-conversion').textContent += ` / un. · Total: ${money(Math.round(Number(entry.unitPrice.value) * 100) * quantity, entry.currency.value)}`;
  }
}
for (const id of ['bank-form', 'mobi-form', 'entry-form']) {
  document.getElementById(id).addEventListener('input', updatePreviews);
  document.getElementById(id).addEventListener('change', updatePreviews);
}
updatePreviews();

function refreshBankMobiOptions() {
  const select = $('#bank-mobi-select'); const selected = select.value;
  select.replaceChildren(new Option('Selecione um mobi', ''));
  for (const mobi of state.mobis) select.append(new Option(`${mobi.name} · ${money(mobi.price, mobi.currency)}`, mobi.id));
  if (state.mobis.some(m => m.id === selected)) select.value = selected;
  $('#add-bank-mobi').disabled = !state.mobis.length;
}
function renderBankItems() {
  const target = $('#bank-items'); target.replaceChildren();
  if (!bankItems.length) { target.textContent = 'Nenhum mobi na banca inicial.'; return; }
  for (const item of bankItems) {
    const row = document.createElement('div'); row.className = 'mobi-item';
    const label = document.createElement('span'); label.textContent = `${item.quantity} × ${item.name} · ${money(item.unitPrice, item.currency)}/un. · Total: ${money(item.quantity * item.unitPrice, item.currency)}`;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Remover da lista';
    remove.onclick = () => { bankItems = bankItems.filter(value => value.id !== item.id); renderBankItems(); };
    row.append(label, remove); target.append(row);
  }
}
$('#bank-mobi-select').onchange = event => {
  const mobi = state.mobis.find(item => item.id === event.target.value);
  const form = $('#bank-form').elements;
  form.initialUnitPrice.value = mobi ? mobi.price / 100 : '';
  if (mobi) form.initialCurrency.value = mobi.currency;
  updatePreviews();
};
$('#add-bank-mobi').onclick = () => {
  try {
    const form = $('#bank-form').elements;
    const item = bankItem({ mobiId: form.initialMobiId.value, quantity: form.initialQuantity.value, unitPrice: form.initialUnitPrice.value, currency: form.initialCurrency.value }, state.mobis);
    bankItems.push(item); renderBankItems();
    form.initialMobiId.value = ''; form.initialQuantity.value = '1'; form.initialUnitPrice.value = ''; updatePreviews();
    message('Mobi adicionado à lista. Clique em Salvar banca para confirmar.');
  } catch (error) { message(error.message); }
};

function showLogin(text = '') {
  loggedIn = false; accountId = null; state = { version: 1, mobis: [], transactions: [] }; bankItems = []; revision = 0;
  document.body.classList.remove('authenticated');
  $('#entry-dialog').close(); $('#entry-form').reset(); $('#bank-form').reset(); resetMobiForm(); render(); updatePreviews();
  $('#login-message').textContent = text; $('#message').textContent = '';
}
async function openAccount(user) {
  const result = await request('/api/data');
  if (result.userId !== user.id) throw new Error('A conta mudou em outra aba. Entre novamente.');
  accountId = user.id;
  state = validateBackup(result.data); revision = result.revision;
  bankItems = structuredClone(state.bank?.items || []);
  $('#account-email').textContent = user.email;
  $('#account-name').textContent = user.name || 'Conta conectada';
  $('#welcome-title').textContent = user.name ? `Olá, ${user.name}!` : 'Sua banca, sob controle.';
  loggedIn = true; render(); updatePreviews();
  $('#login-form').reset(); $('#login-message').textContent = '';
  document.body.classList.add('authenticated');
}
$('#login-form').onsubmit = async event => {
  event.preventDefault(); const button = $('#login-submit'); button.disabled = true; $('#login-message').textContent = 'Entrando…';
  try {
    const values = Object.fromEntries(new FormData(event.target));
    const { user } = await request('/api/auth', { method: 'POST', body: JSON.stringify(values) });
    await openAccount(user);
  } catch (error) { showLogin(error.message); }
  finally { button.disabled = false; }
};
$('#logout').onclick = async () => {
  if (saving) return;
  try { await request('/api/auth', { method: 'DELETE' }); showLogin('Você saiu da sua conta.'); }
  catch (error) { message(error.message); }
};
$('#legacy-backup').onclick = () => {
  try {
    const saved = localStorage.getItem('habbo-banca-v1');
    if (!saved) throw new Error('Nenhum registro da versão local foi encontrado neste navegador.');
    validateBackup(JSON.parse(saved));
    const url = URL.createObjectURL(new Blob([saved], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'banca-versao-local.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#login-message').textContent = 'Backup baixado. Entre na sua conta e use Importar backup.';
  } catch (error) { $('#login-message').textContent = error.message; }
};
try { const { user } = await request('/api/auth'); await openAccount(user); }
catch (error) { showLogin(error.status === 401 ? '' : error.message); }
