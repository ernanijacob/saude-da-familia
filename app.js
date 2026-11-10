const APP_VERSION = '1.0.0';
const KEY = 'saude-familia-cloud-cache-v1';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fresh = () => ({ users: [], people: [], shifts: {}, medications: [], doses: {}, measurements: [], theme: 'light', family: 'Minha família' });
let db = (() => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return fresh(); } })();
let current = null, page = 'inicio', calDate = new Date(), authMode = 'login', medFilterPerson = '', measurementPerson = '', measurementMonth = todayISO().slice(0, 7);
const supabaseClient = window.supabase?.createClient && window.SUPABASE_URL?.startsWith('https://') && !window.SUPABASE_URL.includes('YOUR-PROJECT') && window.SUPABASE_ANON_KEY && !window.SUPABASE_ANON_KEY.includes('YOUR_')
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;
let familyId = null, familyInviteCode = '', syncQueue = Promise.resolve(), familyChannel = null;

function save() {
  localStorage.setItem(KEY, JSON.stringify({ ...db, users: [] }));
  if (!supabaseClient || !familyId || !current) return;
  const payload = { ...db, users: [] };
  syncQueue = syncQueue.then(async () => {
    const { error } = await supabaseClient.rpc('save_family_data', { p_data: payload });
    if (error) { console.error('Falha ao sincronizar dados:', error); toast('Não foi possível sincronizar. Verifique a conexão e tente novamente.'); }
  }).catch(error => { console.error('Falha ao sincronizar dados:', error); toast('Não foi possível sincronizar. Verifique a conexão e tente novamente.'); });
}
function toast(message) { const t = $('#toast'); t.textContent = message; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); }
function dateFmt(s) { return s ? new Date(`${s}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : ''; }
function personName(id) { return db.people.find(p => p.id === id)?.name || 'Pessoa removida'; }
function shortPersonName(id) { return Array.from(personName(id).trim()).slice(0, 2).join('').toLocaleUpperCase('pt-BR'); }
function personColor(id) { const color = db.people.find(p => p.id === id)?.color; return /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#dff0e8'; }
function personTextColor(id) { const hex = personColor(id).slice(1), r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#24352e' : '#ffffff'; }
function personColorStyle(id) { return `background-color:${personColor(id)};color:${personTextColor(id)}`; }
function sortByName(items) { return items.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })); }
function periodRank(period) { return ({ 'Manhã': 1, 'Tarde': 2, 'Noite': 3 })[period] || 0; }
function sortMedications(items) {
  return items.slice().sort((a, b) => personName(a.personId).localeCompare(personName(b.personId), 'pt-BR', { sensitivity: 'base' }) || periodRank(a.period) - periodRank(b.period) || (a.period || '').localeCompare(b.period || '', 'pt-BR', { sensitivity: 'base' }) || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}
function medicationIcon(period) { return ({ 'Manhã': '🌅', 'Tarde': '☀️', 'Noite': '☾' })[period] || '✳'; }
function medicationNameMarkup(m) {
  const name = `<b>${esc(m.name)}</b>`, instructions = String(m.instructions || '').trim();
  if (!instructions) return name;
  const id = esc(m.id);
  return `<span class="medication-name-wrap"><button type="button" class="medication-name-link" data-medication-hint="${id}" aria-expanded="false" aria-controls="medication-hint-${id}">${esc(m.name)}</button><span class="medication-hint" id="medication-hint-${id}" role="tooltip" hidden>${esc(instructions)}</span></span>`;
}
function closeMedicationHints() {
  $$('.medication-name-link[aria-expanded="true"]').forEach(button => { button.setAttribute('aria-expanded', 'false'); const hint = document.getElementById(button.getAttribute('aria-controls')); if (hint) hint.hidden = true; });
  document.querySelector('.medication-hint-mobile')?.remove();
}
function toggleMedicationHint(button) {
  const opening = button.getAttribute('aria-expanded') !== 'true';
  closeMedicationHints();
  if (!opening) return;
  const hint = document.getElementById(button.getAttribute('aria-controls'));
  if (!hint) return;
  button.setAttribute('aria-expanded', 'true');
  if (window.matchMedia('(max-width: 650px)').matches) {
    const popup = document.createElement('div'); popup.className = 'medication-hint-mobile'; popup.setAttribute('role', 'status');
    const text = document.createElement('span'); text.textContent = hint.textContent; popup.append(text);
    const close = document.createElement('button'); close.type = 'button'; close.setAttribute('aria-label', 'Fechar instruções'); close.textContent = '×'; close.onclick = event => { event.stopPropagation(); closeMedicationHints(); }; popup.append(close);
    document.body.append(popup);
  } else hint.hidden = false;
}
function isAdmin() { return current?.role === 'admin'; }

function setAuth() {
  const form = $('#auth-form'), input = form.querySelector('[name="name"]');
  $('#name-label').hidden = authMode === 'login'; input.required = authMode === 'register';
  $('#family-name-label').hidden = authMode === 'login'; $('#invite-code-label').hidden = authMode === 'login';
  form.querySelector('[name="familyName"]').required = authMode === 'register' && !form.querySelector('[name="inviteCode"]').value.trim();
  $('#auth-submit').textContent = authMode === 'register' ? 'Criar conta' : 'Entrar';
  $('#auth-toggle').textContent = authMode === 'register' ? 'Já tenho uma conta' : 'Criar uma conta';
  $('#forgot').hidden = authMode === 'register';
  form.querySelector('[name="password"]').autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
  $('#auth-help').textContent = authMode === 'register' ? 'Para compartilhar os dados, informe o código familiar que o administrador forneceu. Sem código, será criado um novo espaço e você será administrador.' : 'Entre com sua conta para acessar os dados sincronizados da família.';
}
$('#auth-toggle').onclick = () => { authMode = authMode === 'register' ? 'login' : 'register'; setAuth(); };
$('[name="inviteCode"]').oninput = () => { if (authMode === 'register') setAuth(); };
$('#forgot').onclick = async () => {
  if (!supabaseClient) { toast('Configure as credenciais do Supabase primeiro.'); return; }
  const email = $('#auth-form [name="email"]').value.trim(); if (!email) { toast('Informe seu e-mail no campo acima.'); return; }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
  toast(error ? `Não foi possível enviar o e-mail: ${error.message}` : 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.');
};
$('#auth-form').onsubmit = async (e) => {
  e.preventDefault(); const f = new FormData(e.currentTarget), name = String(f.get('name') || '').trim(), email = String(f.get('email')).trim().toLowerCase(), password = String(f.get('password'));
  if (!supabaseClient) { toast('Configure a URL e a chave pública do Supabase em supabase-config.js.'); return; }
  if (authMode === 'register') {
    const familyName = String(f.get('familyName') || '').trim(), inviteCode = String(f.get('inviteCode') || '').trim();
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { name, family_name: familyName, invite_code: inviteCode }, emailRedirectTo: location.href.split('#')[0] } });
    if (error) { toast(error.message); return; }
    if (data.session) await establishSession(data.session);
    else toast('Conta criada. Confirme seu e-mail e depois entre para ativar o acesso à família.');
  } else {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { toast('Não foi possível entrar. Confira o e-mail e a senha.'); return; }
    await establishSession(data.session);
  }
};
async function establishSession(session) {
  if (!session?.user) return;
  current = { id: session.user.id, email: session.user.email, name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Usuário', role: 'user' };
  const meta = session.user.user_metadata || {};
  const { data: contexts, error: contextError } = await supabaseClient.rpc('bootstrap_family', { p_family_name: meta.family_name || 'Minha família', p_invite_code: meta.invite_code || null });
  if (contextError) { toast(`Não foi possível abrir o espaço familiar: ${contextError.message}`); return; }
  const context = contexts?.[0]; familyId = context.family_id; db.family = context.family_name; current.role = context.member_role; familyInviteCode = context.invite_code || '';
  const [{ data: state, error: stateError }, { data: members, error: membersError }] = await Promise.all([
    supabaseClient.from('family_data').select('data').eq('family_id', familyId).single(),
    supabaseClient.rpc('list_family_members')
  ]);
  if (stateError) { toast(`Não foi possível carregar os dados: ${stateError.message}`); return; }
  db = { ...fresh(), ...(state?.data || {}), family: state?.data?.family || context.family_name, users: (membersError ? [] : members || []).map(m => ({ id: m.user_id, name: m.display_name, email: m.email, role: m.role })) };
  localStorage.setItem(KEY, JSON.stringify({ ...db, users: [] }));
  boot();
  if (familyChannel) await supabaseClient.removeChannel(familyChannel);
  familyChannel = supabaseClient.channel(`family-data-${familyId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'family_data', filter: `family_id=eq.${familyId}` }, payload => {
    if (!current || !payload.new?.data) return;
    db = { ...fresh(), ...payload.new.data, users: db.users };
    localStorage.setItem(KEY, JSON.stringify({ ...db, users: [] }));
    document.body.classList.toggle('dark', db.theme === 'dark'); render();
  }).subscribe();
  const { data: profile } = await supabaseClient.from('profiles').select('display_name').eq('id', current.id).maybeSingle();
  if (profile?.display_name) current.name = profile.display_name;
  $('#user-name').textContent = current.name; $('#user-avatar').textContent = current.name[0]?.toUpperCase() || 'U';
  $('#mobile-user-name').textContent = current.name; $('#mobile-user-avatar').textContent = current.name[0]?.toUpperCase() || 'U';
}
function boot() {
  if (!current) { $('#auth').classList.remove('hidden'); $('#app').classList.add('hidden'); if (!supabaseClient) $('#auth-help').textContent = 'Antes de usar, configure SUPABASE_URL e SUPABASE_ANON_KEY no arquivo supabase-config.js.'; return; }
  $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden');
  document.body.classList.toggle('dark', db.theme === 'dark');
  $('#user-name').textContent = current.name; $('#user-avatar').textContent = current.name[0]?.toUpperCase() || 'U';
  $('#user-role').textContent = isAdmin() ? 'Administrador' : 'Usuário'; $('#family-label').textContent = db.family || 'Minha família';
  $('#mobile-user-name').textContent = current.name; $('#mobile-user-avatar').textContent = current.name[0]?.toUpperCase() || 'U'; $('#mobile-user-role').textContent = isAdmin() ? 'Administrador' : 'Usuário';
  $('#today-label').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); render();
}
$('#logout').onclick = async () => { await supabaseClient?.auth.signOut(); current = null; familyId = null; boot(); };
$('#mobile-logout').onclick = () => $('#logout').click();
$('#theme-toggle').onclick = toggleTheme;
$$('[data-page]').forEach(b => b.onclick = () => go(b.dataset.page));
function go(p) {
  page = p; $$('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === p));
  $('#page-title').textContent = ({ inicio: 'Visão geral', escala: 'Escala de cuidadores', remedios: 'Remédios', medicoes: 'Medições', config: 'Configurações', sobre: 'Sobre' })[p]; render();
}
$('#quick-add').onclick = () => page === 'escala' ? shiftModal(todayISO()) : page === 'remedios' ? medModal() : page === 'medicoes' ? measureModal() : chooseAdd();
function chooseAdd() {
  modal('O que deseja registrar?', 'NOVO REGISTRO', `<label>Selecione uma opção<select name="action" required><option value="">Escolha uma opção</option><option value="shift">Escala de cuidadores</option><option value="medicine">Remédio</option><option value="measurement">Medição</option></select></label>`, f => {
    const action = f.get('action'); $('#modal').close();
    setTimeout(() => { if (action === 'shift') shiftModal(todayISO()); else if (action === 'medicine') medModal(); else if (action === 'measurement') measureModal(); }, 0);
    return false;
  });
  $('#modal-save').textContent = 'Continuar';
}
function render() {
  const content = $('#content');
  if (page === 'inicio') content.innerHTML = home();
  if (page === 'escala') content.innerHTML = calendarView();
  if (page === 'remedios') content.innerHTML = medsView();
  if (page === 'medicoes') content.innerHTML = measurementsView();
  if (page === 'sobre') content.innerHTML = aboutView();
  if (page === 'config') content.innerHTML = settingsView();
  bindContent();
}

function home() {
  const date = todayISO(), doses = db.doses[date] || [], medicines = sortMedications(db.medications.filter(m => !m.endDate || m.endDate >= date)), done = doses.filter(x => x.done).length, measures = db.measurements.filter(x => x.date === date), shifts = db.shifts[date] || {};
  return `<div class="welcome"><div><p class="eyebrow">${esc(db.family || 'MINHA FAMÍLIA').toUpperCase()}</p><h2>O cuidado fica mais leve junto.</h2><p>Um resumo da rotina de hoje para quem você ama.</p></div><button class="primary" onclick="document.querySelector('#quick-add').click()">＋ Novo registro</button></div>
  <div class="stats"><div class="stat"><div class="stat-label">Pessoas <span class="stat-icon">♥</span></div><div class="stat-value">${db.people.length}</div><div class="stat-foot">na família</div></div><div class="stat"><div class="stat-label">Turnos de hoje <span class="stat-icon">▦</span></div><div class="stat-value">${(shifts.day ? 1 : 0) + (shifts.night ? 1 : 0)}<small style="font-size:13px;color:var(--muted)"> / 2</small></div><div class="stat-foot">dia e noite preenchidos</div></div><div class="stat"><div class="stat-label">Doses tomadas <span class="stat-icon">✳</span></div><div class="stat-value">${done}<small style="font-size:13px;color:var(--muted)"> / ${medicines.length}</small></div><div class="stat-foot">registradas hoje</div></div><div class="stat"><div class="stat-label">Medições <span class="stat-icon">⌁</span></div><div class="stat-value">${measures.length}</div><div class="stat-foot">registradas hoje</div></div></div>
  <div class="grid-two"><section class="card"><div class="card-head"><div><h3>Quem está hoje</h3><p>${dateFmt(date)} · Hoje</p></div><button class="text-button" onclick="go('escala')">Ver escala →</button></div><div class="list-row"><span class="person-dot">☀</span><div class="row-main"><b>Turno do dia</b><small>${esc(shifts.day ? personName(shifts.day) : 'Ainda sem responsável')}</small></div><span class="badge">DIA</span></div><div class="list-row"><span class="person-dot green">☾</span><div class="row-main"><b>Turno da noite</b><small>${esc(shifts.night ? personName(shifts.night) : 'Ainda sem responsável')}</small></div><span class="badge">NOITE</span></div></section><section class="card"><div class="card-head"><div><h3>Medições de hoje</h3><p>Registros feitos hoje.</p></div><button class="text-button" onclick="go('medicoes')">Ver histórico →</button></div>${measures.slice().sort((a, b) => (b.time || '').localeCompare(a.time || '')).map(m => `<div class="list-row"><span class="person-dot green">⌁</span><div class="row-main"><b>${esc(personName(m.personId))} · ${m.type === 'bp' ? 'Pressão arterial' : 'Glicemia'}</b><small>${dateFmt(m.date)} · ${esc(m.time || '')}</small></div><b>${m.type === 'bp' ? `${m.sys}/${m.dia} mmHg` : `${m.value} mg/dL`}</b></div>`).join('') || '<div class="empty">Nenhuma medição registrada hoje.</div>'}</section></div>
  <div class="grid-two"><section class="card"><div class="card-head"><div><h3>Remédios de hoje</h3><p>Cuide de cada momento, no tempo certo.</p></div><button class="text-button" onclick="go('remedios')">Ver todos →</button></div>${medicines.length ? medicines.slice(0, 5).map(m => { const d = doses.find(x => x.medId === m.id), timing = [m.time, m.period].filter(Boolean).join(' · '); return `<div class="list-row"><span class="person-dot green">${medicationIcon(m.period)}</span><div class="row-main">${medicationNameMarkup(m)}<small>${esc(personName(m.personId))} · ${esc(m.dose)}${timing ? ' · ' + esc(timing) : ''}</small></div><button class="badge ${d?.done ? 'done' : 'due'}" onclick="toggleDose('${m.id}','${date}')">${d?.done ? '✓ Tomado' : 'Marcar tomado'}</button></div>`; }).join('') : '<div class="empty">Nenhum remédio cadastrado.</div>'}</section></div>`;
}

function calendarView() {
  const year = calDate.getFullYear(), month = calDate.getMonth(), first = new Date(year, month, 1), start = new Date(year, month, 1 - first.getDay()), weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  let cells = weekdays.map(d => `<div class="weekday">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, s = db.shifts[iso] || {};
    cells += `<div class="day ${d.getMonth() !== month ? 'out' : ''} ${iso === todayISO() ? 'today' : ''}" onclick="shiftModal('${iso}')"><div class="day-num">${d.getDate()}</div>${s.day ? `<div class="shift" style="${personColorStyle(s.day)}" title="Turno do dia: ${esc(personName(s.day))}" aria-label="Turno do dia: ${esc(personName(s.day))}">☀ <span class="shift-label-full">${esc(personName(s.day))}</span><span class="shift-label-short" aria-hidden="true">${esc(shortPersonName(s.day))}</span></div>` : ''}${s.night ? `<div class="shift night" style="${personColorStyle(s.night)}" title="Turno da noite: ${esc(personName(s.night))}" aria-label="Turno da noite: ${esc(personName(s.night))}">☾ <span class="shift-label-full">${esc(personName(s.night))}</span><span class="shift-label-short" aria-hidden="true">${esc(shortPersonName(s.night))}</span></div>` : ''}</div>`;
  }
  return `<div class="card"><div class="card-head"><div><h3>Calendário do cuidador</h3><p>Toque em um dia para organizar os turnos.</p></div><div class="calendar-toolbar"><button onclick="moveMonth(-1)">‹</button><strong>${new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calDate)}</strong><button onclick="moveMonth(1)">›</button></div></div><div class="calendar">${cells}</div><div class="setting-option"><small>☀ Turno do dia &nbsp;&nbsp; ☾ Turno da noite</small><button class="secondary" onclick="exportSchedule()">⇧ Exportar imagem</button></div></div>`;
}
function moveMonth(amount) { calDate.setMonth(calDate.getMonth() + amount); render(); }

function medFilterSelect(id) {
  return `<select id="${id}" style="width:auto;min-width:150px;margin:0;padding:8px 10px;font-size:12px" aria-label="Filtrar remédios por pessoa" onchange="setMedFilter(this.value)"><option value="">Todas as pessoas</option>${sortByName(db.people).map(p => `<option value="${p.id}" ${medFilterPerson === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
}
function medsView() {
  const meds = sortMedications(db.medications), filtered = medFilterPerson ? meds.filter(m => m.personId === medFilterPerson) : meds;
  const rows = filtered.map(m => `<tr><td><b>${esc(m.name)}</b><br><small class="muted">${esc(m.instructions || '')}</small></td><td>${esc(personName(m.personId))}</td><td>${esc(m.dose)}</td><td>${esc(m.time || '—')}<br><small>${esc(m.period || '')}</small>${m.continuous ? '<br><span class="badge done">Uso contínuo</span>' : ''}</td><td><button onclick="medModal('${m.id}')" title="Alterar remédio">Alterar</button> · <button onclick="deleteMedication('${m.id}')" title="Excluir">Excluir</button></td></tr>`).join('');
  const doses = db.doses[todayISO()] || [], noMatch = '<div class="empty">Nenhum remédio cadastrado para esta pessoa.</div>';
  const doseRows = filtered.map(m => { const done = doses.find(x => x.medId === m.id)?.done, nightStyle = m.period === 'Noite' ? ' style="color:#64748b;background:#e8edf3"' : '', timing = [m.time, m.period].filter(Boolean).join(' · '), meta = [personName(m.personId), timing].filter(Boolean).join(' · '); return `<div class="list-row"><span class="person-dot green"${nightStyle} title="${esc(m.period || 'Período não informado')}">${medicationIcon(m.period)}</span><div class="row-main"><div class="medication-title">${medicationNameMarkup(m)} · ${esc(m.dose)}</div><small>${esc(meta)}</small></div><button class="badge ${done ? 'done' : 'due'}" onclick="toggleDose('${m.id}','${todayISO()}')">${done ? '✓ Tomado' : 'Marcar tomado'}</button></div>`; }).join('');
  return `<div class="welcome"><div><p class="eyebrow">ROTINA DE CUIDADO</p><h2>Remédios com atenção e carinho.</h2><p>Marque as doses de hoje conforme forem tomadas.</p></div><button class="primary" onclick="medModal()">＋ Cadastrar remédio</button></div>
  <section class="card"><div class="card-head" style="flex-wrap:wrap"><div><h3>Doses de hoje</h3><p>${dateFmt(todayISO())}</p></div>${medFilterSelect('med-person-filter-today')}</div>${!meds.length ? '<div class="empty">Cadastre o primeiro remédio para começar o acompanhamento.</div>' : !filtered.length ? noMatch : doseRows}</section>
  <section class="card"><div class="card-head" style="flex-wrap:wrap"><h3>Lista de remédios cadastrados</h3><div class="med-table-actions" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px">${medFilterSelect('med-person-filter-table')}<button class="text-button" onclick="exportDaily()">⇧ Exportar resumo</button></div></div>${!meds.length ? '<div class="empty">Nenhum cadastro ainda.</div>' : !filtered.length ? noMatch : `<table class="table"><thead><tr><th>REMÉDIO</th><th>PESSOA</th><th>DOSE</th><th>HORÁRIO / PERÍODO</th><th>AÇÕES</th></tr></thead><tbody>${rows}</tbody></table>`}</section>`;
}
function setMedFilter(personId) { medFilterPerson = personId; render(); }

function measurementsView() {
  return `<div class="welcome"><div><p class="eyebrow">ACOMPANHAMENTO DE SAÚDE</p><h2>Pequenos registros, mais cuidado.</h2><p>Acompanhe a pressão arterial e a glicemia ao longo do tempo.</p></div><button class="primary" onclick="measureModal()">＋ Registrar medição</button></div><section class="card"><div class="card-head"><div><h3>Visão mensal</h3><p>Medições de ${esc(measurementMonthLabel())}</p></div><div class="measurement-filters"><label>Pessoa<select id="chart-person"><option value="" ${measurementPerson ? '' : 'selected'}>Todas as pessoas</option>${sortByName(db.people).map(p => `<option value="${p.id}" ${measurementPerson === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><label>Mês e ano<input id="chart-month" type="month" value="${esc(measurementMonth)}"></label></div></div><div class="chart-legend"><span><i class="legend-dot"></i> Pressão sistólica</span><span><i class="legend-dot blue"></i> Glicemia</span></div><div class="chart-wrap"><canvas id="measure-chart" role="img" aria-label="Gráfico mensal. Toque em um ponto para ver a medição."></canvas><div class="chart-tooltip" id="chart-tooltip" role="status" aria-live="polite" hidden></div></div><p class="chart-hint">Toque em um ponto do gráfico para ver o valor exato.</p></section><section class="card"><div class="card-head" style="flex-wrap:wrap"><div><h3>Histórico de medições</h3><p>Os registros mais recentes aparecem primeiro.</p></div><div class="med-table-actions" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px"><button class="secondary" onclick="exportMeasurementsImage()">▧ Exportar imagem</button><button class="secondary" onclick="exportMeasurementsPdf()">⇩ Exportar PDF</button></div></div>${filteredMeasurements().length ? `<table class="table"><thead><tr><th>DATA</th><th>PESSOA</th><th>TIPO</th><th>VALOR</th><th>OBSERVAÇÃO</th><th></th></tr></thead><tbody>${filteredMeasurements().map(m => `<tr><td>${dateFmt(m.date)}<br><small>${esc(m.time || '')}</small></td><td>${esc(personName(m.personId))}</td><td>${m.type === 'bp' ? 'Pressão' : 'Glicemia'}</td><td><b>${m.type === 'bp' ? `${m.sys}/${m.dia} mmHg` : `${m.value} mg/dL`}</b></td><td>${esc(m.note || '—')}</td><td><button onclick="measureModal('${m.id}')">Alterar</button> · <button onclick="deleteMeasurement('${m.id}')">Excluir</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhuma medição encontrada para os filtros selecionados.</div>'}<p class="tiny">Os gráficos servem para acompanhar registros e não substituem orientação de um profissional de saúde.</p></section>`;
}

function measurementMonthLabel() {
  const [year, month] = measurementMonth.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}
function filteredMeasurements() {
  return db.measurements.filter(m => (!measurementPerson || m.personId === measurementPerson) && (m.date || '').startsWith(measurementMonth)).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
}
function measurementReportRows() {
  return filteredMeasurements().map(m => ({
    date: `${dateFmt(m.date)}${m.time ? ' · ' + m.time : ''}`,
    person: personName(m.personId),
    type: m.type === 'bp' ? 'Pressão arterial' : 'Glicemia',
    value: m.type === 'bp' ? `${m.sys}/${m.dia} mmHg` : `${m.value} mg/dL`,
    note: m.note || '—'
  }));
}
function reportFilterLabel() {
  const personLabel = measurementPerson ? personName(measurementPerson) : 'Todas as pessoas';
  return `${personLabel} · ${measurementMonthLabel()}`;
}
function exportMeasurementsImage() {
  const rows = measurementReportRows(), chart = $('#measure-chart'), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  canvas.width = 1200; canvas.height = 500 + Math.max(rows.length, 1) * 58;
  ctx.fillStyle = '#f5f7f2'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#24352e'; ctx.font = 'bold 34px sans-serif'; ctx.fillText('Histórico de medições', 42, 54);
  ctx.fillStyle = '#77857e'; ctx.font = '18px sans-serif'; ctx.fillText(`${reportFilterLabel()}`, 42, 84);
  if (chart && chart.width && chart.height) ctx.drawImage(chart, 35, 105, 1130, 290);
  let y = 430; ctx.fillStyle = '#27735a'; ctx.font = 'bold 16px sans-serif'; ctx.fillText('DATA', 45, y); ctx.fillText('PESSOA', 235, y); ctx.fillText('TIPO', 460, y); ctx.fillText('VALOR', 690, y); ctx.fillText('OBSERVAÇÃO', 870, y); y += 16;
  if (!rows.length) { ctx.fillStyle = '#77857e'; ctx.font = '15px sans-serif'; ctx.fillText('Nenhuma medição registrada.', 45, y + 26); y += 45; }
  rows.forEach((row, index) => { y += 12; ctx.fillStyle = index % 2 ? '#ffffff' : '#edf1ea'; ctx.fillRect(35, y, 1130, 48); ctx.fillStyle = '#24352e'; ctx.font = '14px sans-serif'; ctx.fillText(row.date, 45, y + 29); ctx.fillText(row.person.slice(0, 24), 235, y + 29); ctx.fillText(row.type, 460, y + 29); ctx.font = 'bold 14px sans-serif'; ctx.fillText(row.value, 690, y + 29); ctx.font = '14px sans-serif'; ctx.fillText(row.note.slice(0, 35), 870, y + 29); y += 48; });
  y += 28; ctx.fillStyle = '#77857e'; ctx.font = '12px sans-serif'; ctx.fillText('Os gráficos ajudam a acompanhar os registros e não substituem orientação profissional.', 42, y);
  canvas.toBlob(blob => download(blob, `medicoes-${measurementMonth}.png`));
}
function exportMeasurementsPdf() {
  const popup = window.open('', '_blank');
  if (!popup) { toast('Permita a abertura da janela para exportar o PDF.'); return; }
  const rows = measurementReportRows(), chart = $('#measure-chart'), image = chart ? chart.toDataURL('image/png') : '';
  const tableRows = rows.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.person)}</td><td>${esc(r.type)}</td><td>${esc(r.value)}</td><td>${esc(r.note)}</td></tr>`).join('');
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de medições</title><style>body{font:12px Arial,sans-serif;color:#24352e;margin:28px}h1{font-size:24px;margin:0 0 6px}.sub{color:#66736b;margin-bottom:18px}img{display:block;width:100%;max-height:320px;object-fit:contain;margin:12px 0 20px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #dce3dc}th{color:#27735a;font-size:10px}footer{margin-top:20px;color:#66736b;font-size:10px}.no-print{margin:0 0 18px;padding:8px 14px}@media print{body{margin:12mm}.no-print{display:none}tr{break-inside:avoid}}</style></head><body><button class="no-print" onclick="window.print()">Imprimir ou salvar como PDF</button><h1>Histórico de medições</h1><div class="sub">${esc(reportFilterLabel())}</div>${image ? `<img alt="Gráfico mensal de medições" src="${image}">` : ''}<table><thead><tr><th>DATA</th><th>PESSOA</th><th>TIPO</th><th>VALOR</th><th>OBSERVAÇÃO</th></tr></thead><tbody>${tableRows || '<tr><td colspan="5">Nenhuma medição registrada.</td></tr>'}</tbody></table><footer>Os gráficos ajudam a acompanhar os registros e não substituem orientação profissional.</footer><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  popup.document.close();
}

function aboutView() {
  return `<section class="card"><div class="card-head"><div><p class="eyebrow">SOBRE O APLICATIVO</p><h3>Saúde da Família</h3><p>Organização familiar de cuidadores, remédios e medições de saúde.</p></div><img src="icon-saude.svg" alt="Ícone Saúde da Família" width="64" height="64" style="border-radius:18px"></div><div class="setting-option"><div><b>Nome do aplicativo</b><small>Saúde da Família</small></div></div><div class="setting-option"><div><b>Versão</b><small>${APP_VERSION}</small></div></div></section>`;
}

function settingsView() {
  return `<div class="welcome"><div><p class="eyebrow">PREFERÊNCIAS E DADOS</p><h2>Configurações</h2><p>Personalize o espaço e cuide dos dados da família.</p></div></div><div class="settings-grid"><section class="card"><div class="card-head"><h3>Aparência</h3></div><div class="setting-option"><div><b>Tema ${db.theme === 'dark' ? 'escuro' : 'claro'}</b><small>Escolha a aparência mais confortável.</small></div><button class="secondary" onclick="toggleTheme()">Alternar tema</button></div></section>
  <section class="card"><div class="card-head"><h3>Espaço familiar</h3></div><label>Nome da família<input id="family-input" value="${esc(db.family)}" ${!isAdmin() ? 'disabled' : ''}></label><button class="primary" onclick="saveFamily()" ${!isAdmin() ? 'disabled' : ''}>Salvar nome</button>${isAdmin() ? `<div class="setting-option"><div><b>Código de acesso</b><small>Compartilhe com familiares. Eles devem criar conta e informar este código.</small><code>${esc(familyInviteCode || 'Código indisponível')}</code></div><button class="secondary" onclick="addUser()">Copiar código</button></div>` : ''}</section>
  <section class="card"><div class="card-head"><div><h3>Pessoas da família</h3><p>As pessoas associadas a turnos, remédios e medições.</p></div><button class="secondary" onclick="personModal()" ${!isAdmin() ? 'disabled' : ''}>＋ Adicionar</button></div>${sortByName(db.people).map(p => `<div class="list-row"><span class="person-dot" style="${personColorStyle(p.id)}">${esc(p.name[0]?.toUpperCase())}</span><div class="row-main"><b>${esc(p.name)}</b><small>Membro da família</small></div><button class="text-button" ${!isAdmin() ? 'disabled' : ''} onclick="personModal('${p.id}')">Editar</button> · <button class="text-button" ${!isAdmin() ? 'disabled' : ''} onclick="deletePerson('${p.id}')">Excluir</button></div>`).join('') || '<div class="empty">Adicione alguém da família para começar.</div>'}</section>
  <section class="card"><div class="card-head"><div><h3>Contas e permissões</h3><p>Contas autenticadas pelo Supabase nesta família.</p></div></div>${sortByName(db.users).map(u => `<div class="list-row"><span class="person-dot green">${esc(u.name[0]?.toUpperCase())}</span><div class="row-main"><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div><button class="text-button" ${!isAdmin() ? 'disabled' : ''} onclick="userModal('${u.id}')">Editar</button><select ${!isAdmin() || u.id === current.id ? 'disabled' : ''} onchange="changeRole('${u.id}',this.value)" style="width:auto;margin:0"><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option><option value="user" ${u.role === 'user' ? 'selected' : ''}>Usuário</option></select></div>`).join('') || '<div class="empty">Nenhuma conta familiar encontrada.</div>'}<p class="tiny">Para adicionar alguém, compartilhe o código de acesso familiar acima. A pessoa deve criar a própria conta com seu e-mail.</p></section>
  <section class="card"><div class="card-head"><div><h3>Backup da família</h3><p>Exporte ou restaure os dados compartilhados em arquivo JSON.</p></div></div><p class="tiny">O backup contém pessoas, turnos, remédios e medições. Ele não inclui senhas ou tokens de autenticação.</p><div class="setting-actions"><button class="primary" onclick="exportBackup()">⇩ Exportar base completa</button><button class="secondary" onclick="document.querySelector('#import-file').click()">⇧ Importar backup</button><input id="import-file" type="file" accept="application/json,.json" hidden></div></section><section class="card"><div class="card-head"><h3>Sobre seus dados</h3></div><p class="tiny">Os dados da família são sincronizados no Supabase e protegidos por políticas de acesso por família. As senhas são gerenciadas pelo Supabase Auth. Mantenha o código de acesso familiar privado.</p></section></div>`;
}
function bindContent() { const select = $('#chart-person'), monthInput = $('#chart-month'); if (select) { select.value = measurementPerson; select.onchange = () => { measurementPerson = select.value; render(); }; } if (monthInput) { monthInput.value = measurementMonth; monthInput.onchange = () => { measurementMonth = monthInput.value || todayISO().slice(0, 7); render(); }; } if (select || monthInput) drawChart(); const input = $('#import-file'); if (input) input.onchange = importBackup; if (!window.medicationHintsBound) { document.addEventListener('click', event => { const button = event.target.closest('.medication-name-link'); if (button) { event.preventDefault(); event.stopPropagation(); toggleMedicationHint(button); return; } if (event.target.closest('.medication-hint-mobile')) return; if (!event.target.closest('.medication-name-wrap')) closeMedicationHints(); }, true); document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMedicationHints(); }); window.medicationHintsBound = true; } }

function modal(title, kicker, html, callback) {
  $('#modal').classList.remove('compact-modal');
  $('#modal-title').textContent = title; $('#modal-kicker').textContent = kicker; $('#modal-body').innerHTML = html; $('#modal-save').textContent = 'Salvar';
  $('#modal-form').onsubmit = e => { e.preventDefault(); if (callback(new FormData(e.currentTarget)) !== false) $('#modal').close(); };
  $('#modal').showModal();
}
function shiftModal(date) {
  const shifts = db.shifts[date] || {}, options = '<option value="">Sem responsável</option>' + sortByName(db.people).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  modal('Organizar turnos', 'ESCALA · ' + dateFmt(date), `<p class="muted">Quem estará responsável neste dia?</p><label>☀ Turno do dia<select name="day">${options}</select></label><label>☾ Turno da noite<select name="night">${options}</select></label><button type="button" class="text-button" onclick="deleteShift('${date}');document.querySelector('#modal').close()">Remover os dois turnos</button>`, f => { const day = f.get('day'), night = f.get('night'); if (day || night) db.shifts[date] = { day, night }; else delete db.shifts[date]; save(); render(); });
  $('#modal').classList.add('compact-modal');
  $('#modal-body [name=day]').value = shifts.day || ''; $('#modal-body [name=night]').value = shifts.night || '';
}
function medModal(id) {
  if (!db.people.length) { toast('Adicione uma pessoa da família nas configurações primeiro.'); return; }
  const existing = db.medications.find(m => m.id === id), m = existing || {};
  modal(existing ? 'Alterar remédio' : 'Cadastrar remédio', 'ROTINA DE REMÉDIOS', `<label>Nome do remédio<input name="name" required placeholder="Ex.: Vitamina D" value="${esc(m.name || '')}"></label><div class="form-grid"><label>Pessoa<select name="personId" required>${sortByName(db.people).map(p => `<option value="${p.id}" ${m.personId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><label>Dose<input name="dose" required placeholder="Ex.: 1 comprimido" value="${esc(m.dose || '')}"></label><label>Horário<input name="time" type="time" value="${esc(m.time || '')}"></label><label>Período (opcional)<select name="period"><option value="">Selecione um período</option><option ${m.period === 'Manhã' ? 'selected' : ''}>Manhã</option><option ${m.period === 'Tarde' ? 'selected' : ''}>Tarde</option><option ${m.period === 'Noite' ? 'selected' : ''}>Noite</option></select></label><label>Data final (opcional)<input id="med-end-date" name="endDate" type="date" value="${esc(m.endDate || '')}" ${m.continuous ? 'disabled' : ''}></label><label class="checkbox-label"><input id="med-continuous" name="continuous" type="checkbox" ${m.continuous ? 'checked' : ''}>Uso contínuo</label></div><label>Instruções<textarea name="instructions" rows="2" placeholder="Ex.: após o almoço">${esc(m.instructions || '')}</textarea></label>`, f => {
    const continuous = f.get('continuous') === 'on', record = { name: f.get('name').trim(), personId: f.get('personId'), dose: f.get('dose').trim(), time: f.get('time'), period: f.get('period'), endDate: continuous ? '' : f.get('endDate'), continuous, instructions: f.get('instructions').trim() };
    if (existing) Object.assign(existing, record); else db.medications.push({ id: uid(), ...record }); save(); render(); toast(existing ? 'Remédio atualizado.' : 'Remédio cadastrado.');
  });
  $('#med-continuous').onchange = e => { const end = $('#med-end-date'); end.disabled = e.target.checked; if (e.target.checked) end.value = ''; };
}
function measureModal(id) {
  if (!db.people.length) { toast('Adicione uma pessoa da família nas configurações primeiro.'); return; }
  const existing = db.measurements.find(m => m.id === id), m = existing || {}, type = m.type || 'bp';
  modal(existing ? 'Alterar medição' : 'Registrar medição', 'ACOMPANHAMENTO DE SAÚDE', `<label>Pessoa<select name="personId">${sortByName(db.people).map(p => `<option value="${p.id}" ${m.personId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><fieldset class="measure-type-field"><legend>Tipo de medição</legend><div class="measure-type-options"><label class="measure-type-option"><input type="radio" name="type" value="bp" ${type === 'bp' ? 'checked' : ''}><span>Pressão arterial</span></label><label class="measure-type-option"><input type="radio" name="type" value="glucose" ${type === 'glucose' ? 'checked' : ''}><span>Glicemia</span></label></div></fieldset><div id="measure-values"></div><div class="form-grid"><label>Data<input name="date" type="date" value="${esc(m.date || todayISO())}" required></label><label>Horário<input name="time" type="time" value="${esc(m.time || new Date().toTimeString().slice(0, 5))}"></label></div><label>Observação (opcional)<input name="note" value="${esc(m.note || '')}" placeholder="Ex.: antes do café da manhã"></label>`, f => {
    const newType = f.get('type'), record = { id: existing?.id || uid(), personId: f.get('personId'), type: newType, date: f.get('date'), time: f.get('time'), note: f.get('note').trim() };
    if (newType === 'bp') { record.sys = Number(f.get('sys')); record.dia = Number(f.get('dia')); if (!record.sys || !record.dia) { toast('Informe sistólica e diastólica.'); return false; } }
    else { record.value = Number(f.get('value')); if (!record.value) { toast('Informe o valor da glicemia.'); return false; } }
    if (existing) Object.assign(existing, record); else db.measurements.push(record); save(); render(); toast(existing ? 'Medição atualizada.' : 'Medição registrada.');
  });
  const update = () => {
    const selectedType = $('#modal-body [name="type"]:checked').value;
    $('#measure-values').innerHTML = selectedType === 'bp'
      ? `<div class="form-grid"><label>Sistólica (mmHg)<input name="sys" type="number" min="40" max="300" required placeholder="120" value="${selectedType === 'bp' ? esc(m.sys ?? '') : ''}"></label><label>Diastólica (mmHg)<input name="dia" type="number" min="20" max="200" required placeholder="80" value="${selectedType === 'bp' ? esc(m.dia ?? '') : ''}"></label></div>`
      : `<label>Glicemia (mg/dL)<input name="value" type="number" min="1" max="2000" required placeholder="95" value="${selectedType === 'glucose' ? esc(m.value ?? '') : ''}"></label>`;
  };
  $$('#modal-body [name="type"]').forEach(input => input.onchange = update); update();
}
function personModal(id) {
  if (!isAdmin()) { toast('Apenas um administrador pode gerenciar pessoas.'); return; }
  const existing = db.people.find(p => p.id === id);
  if (existing && !isAdmin()) { toast('Apenas um administrador pode editar pessoas.'); return; }
  const palette = ['#27735a', '#6496ae', '#bf7a50', '#8669a8', '#cf6981', '#81984b', '#397b8c'];
  const color = existing ? personColor(existing.id) : palette[db.people.length % palette.length];
  modal(existing ? 'Editar pessoa' : 'Adicionar pessoa', 'MEMBROS DA FAMÍLIA', `<label>Nome<input name="name" required placeholder="Nome da pessoa" value="${esc(existing?.name || '')}"></label><label>Cor<input name="color" type="color" value="${color}"></label>`, f => {
    const name = f.get('name').trim(), selectedColor = f.get('color'); if (existing) { existing.name = name; existing.color = selectedColor; } else db.people.push({ id: uid(), name, color: selectedColor });
    save(); render(); toast(existing ? 'Pessoa atualizada.' : 'Pessoa adicionada.');
  });
}
function userModal(id) {
  if (!isAdmin()) { toast('Apenas um administrador pode editar contas.'); return; }
  const existing = db.users.find(u => u.id === id); if (!existing) return;
  modal('Editar conta', 'CONTAS E PERMISSÕES', `<label>Nome<input name="name" required value="${esc(existing.name)}"></label><label>E-mail<input type="email" disabled value="${esc(existing.email)}"></label><label>Perfil<select name="role"><option value="admin" ${existing.role === 'admin' ? 'selected' : ''}>Administrador</option><option value="user" ${existing.role === 'user' ? 'selected' : ''}>Usuário</option></select></label>`, f => {
    const role = f.get('role');
    supabaseClient.rpc('update_family_member', { p_user_id: existing.id, p_name: f.get('name').trim(), p_role: role }).then(({ error }) => {
      if (error) { toast(error.message); return; }
      existing.name = f.get('name').trim(); existing.role = role;
      if (current.id === existing.id) { current.name = existing.name; current.role = role; $('#user-name').textContent = current.name; $('#user-avatar').textContent = current.name[0]?.toUpperCase() || 'U'; $('#user-role').textContent = isAdmin() ? 'Administrador' : 'Usuário'; $('#mobile-user-name').textContent = current.name; $('#mobile-user-avatar').textContent = current.name[0]?.toUpperCase() || 'U'; $('#mobile-user-role').textContent = isAdmin() ? 'Administrador' : 'Usuário'; }
      render(); toast('Conta atualizada.');
    });
  });
}

function toggleDose(id, date) { db.doses[date] ??= []; let d = db.doses[date].find(x => x.medId === id); if (!d) db.doses[date].push(d = { medId: id, done: false }); d.done = !d.done; save(); render(); }
function deleteShift(date) { delete db.shifts[date]; save(); render(); }
function deleteMedication(id) { if (!confirm('Excluir este remédio?')) return; db.medications = db.medications.filter(m => m.id !== id); Object.values(db.doses).forEach(a => { const i = a.findIndex(d => d.medId === id); if (i >= 0) a.splice(i, 1); }); save(); render(); toast('Remédio excluído.'); }
function deleteMeasurement(id) { if (!confirm('Excluir esta medição?')) return; db.measurements = db.measurements.filter(m => m.id !== id); save(); render(); }
function deletePerson(id) { if (!isAdmin()) { toast('Apenas um administrador pode excluir pessoas.'); return; } if (!confirm('Excluir esta pessoa? Registros históricos associados serão mantidos.')) return; db.people = db.people.filter(p => p.id !== id); if (medFilterPerson === id) medFilterPerson = ''; save(); render(); }
function changeRole(id, role) { if (!isAdmin()) { toast('Apenas um administrador pode alterar perfis.'); render(); return; } const user = db.users.find(u => u.id === id); if (user) supabaseClient.rpc('update_family_member', { p_user_id: id, p_name: user.name, p_role: role }).then(({ error }) => { if (error) { toast(error.message); render(); return; } user.role = role; if (current.id === id) current.role = role; $('#user-role').textContent = isAdmin() ? 'Administrador' : 'Usuário'; toast('Perfil atualizado.'); }); }
function addUser() { if (!isAdmin() || !familyInviteCode) { toast('Código de acesso familiar indisponível.'); return; } if (navigator.clipboard?.writeText) navigator.clipboard.writeText(familyInviteCode).then(() => toast('Código copiado. Compartilhe com o familiar.')).catch(() => prompt('Copie e compartilhe este código:', familyInviteCode)); else prompt('Copie e compartilhe este código:', familyInviteCode); }
function toggleTheme() { db.theme = db.theme === 'dark' ? 'light' : 'dark'; save(); document.body.classList.toggle('dark', db.theme === 'dark'); render(); }
function saveFamily() { if (!isAdmin()) return; db.family = $('#family-input').value.trim() || 'Minha família'; save(); $('#family-label').textContent = db.family; toast('Nome da família salvo.'); }

function download(blob, filename) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function exportBackup() { download(new Blob([JSON.stringify({ app: 'Saúde da Família', version: 2, exportedAt: new Date().toISOString(), data: { ...db, users: [] } }, null, 2)], { type: 'application/json' }), `saude-da-familia-backup-${todayISO()}.json`); toast('Backup completo exportado sem dados de autenticação.'); }
function importBackup(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const o = JSON.parse(reader.result), d = o.data; if ((o.app !== 'Lacos' && o.app !== 'Saúde da Família') || !d || !Array.isArray(d.people) || !Array.isArray(d.medications) || !Array.isArray(d.measurements) || !d.shifts) throw Error(); if (!confirm('Importar este backup para substituir os dados compartilhados desta família?')) return; db = { ...fresh(), ...d, users: db.users }; save(); toast('Backup importado e sincronizando com a família.'); render(); } catch { toast('Arquivo inválido ou não compatível com Saúde da Família.'); } e.target.value = ''; }; reader.readAsText(file); }

function exportSchedule() {
  const year = calDate.getFullYear(), month = calDate.getMonth(), label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calDate), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  canvas.width = 1200; canvas.height = 1200; ctx.fillStyle = '#f5f7f2'; ctx.fillRect(0, 0, 1200, 1200); ctx.fillStyle = '#24352e'; ctx.font = '700 42px sans-serif'; ctx.fillText('Calendário do cuidador', 55, 72); ctx.fillStyle = '#77857e'; ctx.font = '22px sans-serif'; ctx.fillText(label, 55, 110);
  const w = 156, h = 146, left = 55, top = 165; ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach((d, i) => { ctx.fillStyle = '#77857e'; ctx.font = '18px sans-serif'; ctx.fillText(d, left + i * w + 8, top); });
  const first = new Date(year, month, 1), start = new Date(year, month, 1 - first.getDay());
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const x = left + (i % 7) * w, y = top + 12 + Math.floor(i / 7) * h, iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, s = db.shifts[iso] || {}; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(x, y, w - 7, h - 7, 12); ctx.fill(); ctx.fillStyle = d.getMonth() === month ? '#24352e' : '#aeb6b0'; ctx.font = '20px sans-serif'; ctx.fillText(String(d.getDate()), x + 10, y + 28); ctx.font = '13px sans-serif'; if (s.day) { ctx.fillStyle = personColor(s.day); ctx.fillRect(x + 7, y + 40, w - 21, 30); ctx.fillStyle = personTextColor(s.day); ctx.fillText('☀ ' + personName(s.day).slice(0, 19), x + 12, y + 60); } if (s.night) { ctx.fillStyle = personColor(s.night); ctx.fillRect(x + 7, y + 77, w - 21, 30); ctx.fillStyle = personTextColor(s.night); ctx.fillText('☾ ' + personName(s.night).slice(0, 19), x + 12, y + 97); } }
  canvas.toBlob(blob => download(blob, `escala-${year}-${String(month + 1).padStart(2, '0')}.png`));
}
function exportDaily() {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'), meds = sortMedications(db.medications.filter(m => !medFilterPerson || m.personId === medFilterPerson));
  canvas.width = 800; canvas.height = Math.max(240, 170 + meds.length * 105); ctx.fillStyle = '#f5f7f2'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#24352e'; ctx.font = 'bold 32px sans-serif'; ctx.fillText('Rotina de cuidado', 40, 65); ctx.font = '18px sans-serif'; ctx.fillStyle = '#77857e'; ctx.fillText(dateFmt(todayISO()), 40, 100);
  let y = 155; meds.forEach(m => { const done = (db.doses[todayISO()] || []).find(d => d.medId === m.id)?.done; ctx.fillStyle = '#fff'; ctx.fillRect(35, y - 26, 730, 90); ctx.fillStyle = '#24352e'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(m.name, 55, y); ctx.font = '15px sans-serif'; ctx.fillStyle = '#77857e'; ctx.fillText(`${personName(m.personId)} · ${m.dose} · ${m.time || 'sem horário'}${m.period ? ' · ' + m.period : ''}`, 55, y + 28); ctx.fillStyle = done ? '#27735a' : '#9b593f'; ctx.fillText(done ? '✓ Tomado' : '○ Pendente', 590, y + 28); y += 105; });
  canvas.toBlob(blob => download(blob, `rotina-${todayISO()}.png`));
}
function drawChart() {
  const canvas = $('#measure-chart'); if (!canvas) return;
  const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  const ratio = devicePixelRatio || 1; canvas.width = rect.width * ratio; canvas.height = rect.height * ratio;
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  const w = rect.width, h = rect.height, pad = { l: 48, r: 50, t: 26, b: 32 }, plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
  const selected = measurementPerson, month = measurementMonth, data = db.measurements.filter(m => m.date?.startsWith(month) && (!selected || m.personId === selected));
  const tooltip = $('#chart-tooltip'); if (tooltip) tooltip.hidden = true;
  ctx.clearRect(0, 0, w, h); ctx.font = '11px sans-serif'; ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--line'); ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted');
  const niceMax = (values, fallback) => {
    if (!values.length) return fallback;
    const highest = Math.max(0, ...values.map(Number).filter(Number.isFinite));
    const raw = Math.max(highest * 1.15 / 4, 1), power = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map(n => n * power).find(n => n >= raw) || 10 * power;
    return Math.max(step * 4, step);
  };
  const bpMax = niceMax(data.filter(m => m.type === 'bp').map(m => m.sys), 200);
  const glucoseMax = niceMax(data.filter(m => m.type === 'glucose').map(m => m.value), 300);
  ctx.textAlign = 'left'; ctx.fillText('mmHg', 3, 13); ctx.textAlign = 'right'; ctx.fillText('mg/dL', w - 2, 13); ctx.textAlign = 'left';
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + plotH * i / 4, leftValue = Math.round(bpMax * (4 - i) / 4), rightValue = Math.round(glucoseMax * (4 - i) / 4);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillText(String(leftValue), 3, y + 4); ctx.textAlign = 'right'; ctx.fillText(String(rightValue), w - 2, y + 4); ctx.textAlign = 'left';
  }
  const [chartYear, chartMonth] = month.split('-').map(Number), days = new Date(chartYear, chartMonth, 0).getDate(), dayStep = Math.ceil(days / 8);
  for (let i = 1; i <= days; i += dayStep) ctx.fillText(String(i), pad.l + plotW * (i - 1) / Math.max(days - 1, 1) - 4, h - 8);
  const chartPoints = [];
  const plot = (arr, key, color, max, type) => {
    const sorted = arr.slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    if (!sorted.length) return;
    const pts = sorted.map(m => ({
      x: pad.l + plotW * (Number(m.date.slice(-2)) - 1) / Math.max(days - 1, 1),
      y: pad.t + plotH * (1 - Number(m[key]) / max),
      label: type === 'bp' ? `Pressão arterial: ${m.sys}/${m.dia} mmHg` : `Glicemia: ${m.value} mg/dL`,
      person: personName(m.personId), date: `${dateFmt(m.date)}${m.time ? ' · ' + m.time : ''}`, color
    }));
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    pts.forEach((point, i) => { if (!i) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); }); ctx.stroke();
    pts.forEach(point => { ctx.beginPath(); ctx.arc(point.x, point.y, 5, 0, Math.PI * 2); ctx.fill(); chartPoints.push(point); });
  };
  plot(data.filter(m => m.type === 'bp'), 'sys', '#27735a', bpMax, 'bp');
  plot(data.filter(m => m.type === 'glucose'), 'value', '#6496ae', glucoseMax, 'glucose');
  canvas.style.cursor = chartPoints.length ? 'pointer' : 'default';
  canvas.onclick = event => {
    if (!tooltip || !chartPoints.length) return;
    const bounds = canvas.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    const matches = chartPoints.map(p => ({ ...p, distance: Math.hypot(p.x - x, p.y - y) })).filter(p => p.distance <= 22).sort((a, b) => a.distance - b.distance).slice(0, 4);
    if (!matches.length) { tooltip.hidden = true; return; }
    tooltip.innerHTML = matches.map(p => `<div class="chart-tooltip-row"><span class="chart-tooltip-dot" style="background:${p.color}"></span><span><b>${esc(p.label)}</b><small>${esc(p.person)} · ${esc(p.date)}</small></span></div>`).join('');
    tooltip.hidden = false;
    const left = Math.max(8, Math.min(x, rect.width - tooltip.offsetWidth - 8));
    const top = Math.max(8, Math.min(y - tooltip.offsetHeight - 10, rect.height - tooltip.offsetHeight - 8));
    tooltip.style.left = `${left}px`; tooltip.style.top = `${top}px`;
  };
  if (!data.length) { ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted'); ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Sem medições neste mês', w / 2, h / 2); ctx.textAlign = 'left'; }
}

Object.assign(window, { go, setMedFilter, shiftModal, medModal, measureModal, moveMonth, toggleDose, deleteShift, deleteMedication, deleteMeasurement, deletePerson, changeRole, personModal, userModal, addUser, toggleTheme, saveFamily, exportBackup, exportSchedule, exportDaily, exportMeasurementsImage, exportMeasurementsPdf });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
async function initializeAuth() {
  authMode = 'login'; setAuth(); boot();
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) { toast(`Erro ao iniciar autenticação: ${error.message}`); return; }
  if (data.session) await establishSession(data.session);
  if (new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery') {
    const password = prompt('Digite a nova senha (mínimo 6 caracteres):');
    if (password && password.length >= 6) {
      const { error: updateError } = await supabaseClient.auth.updateUser({ password });
      toast(updateError ? `Não foi possível atualizar: ${updateError.message}` : 'Senha atualizada.');
    } else if (password) toast('A senha precisa ter pelo menos 6 caracteres.');
    history.replaceState(null, '', location.pathname + location.search);
  }
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { current = null; familyId = null; boot(); }
    if (event === 'PASSWORD_RECOVERY') setTimeout(async () => {
      const password = prompt('Digite a nova senha (mínimo 6 caracteres):');
      if (password && password.length >= 6) { const { error: updateError } = await supabaseClient.auth.updateUser({ password }); toast(updateError ? updateError.message : 'Senha atualizada.'); }
      else if (password) toast('A senha precisa ter pelo menos 6 caracteres.');
    }, 0);
  });
}
initializeAuth();
