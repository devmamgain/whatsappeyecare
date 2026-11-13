(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const state = { status: '', when: 'upcoming', q: '', doctors: [], appointments: [] };

  // ---------- helpers ----------

  // Builds DOM nodes with textContent only. Client names and notes come from WhatsApp users,
  // so they must never be inserted as HTML.
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
      if (child !== null && child !== undefined && child !== false) node.append(child);
    }
    return node;
  }

  const fmtDate = (iso) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });

  const fmtTime = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  let toastTimer;
  function toast(message, kind = 'ok') {
    const node = $('#toast');
    node.textContent = message;
    node.className = `toast ${kind === 'error' ? 'error' : ''}`;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 6000);
  }

  async function api(path, { method = 'GET', body } = {}) {
    const response = await fetch(`/admin/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    if (response.status === 401) {
      window.location.href = '/admin/login';
      throw new Error('Your session has expired');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  // ---------- appointments ----------

  async function loadAppointments() {
    const params = new URLSearchParams({ when: state.when });
    if (state.status) params.set('status', state.status);
    if (state.q) params.set('q', state.q);

    const { appointments, counts } = await api(`/appointments?${params}`);
    state.appointments = appointments;
    $('#stat-pending').textContent = counts.pending;
    $('#stat-confirmed').textContent = counts.confirmed;
    $('#stat-today').textContent = counts.today;
    renderRows();
  }

  function renderRows() {
    $('#rows').replaceChildren(...state.appointments.map(rowFor));
    $('#empty').hidden = state.appointments.length > 0;
  }

  function rowFor(a) {
    return el('tr', { class: `status-${a.status.toLowerCase()}` },
      el('td', { 'data-label': 'When' },
        el('div', {}, el('strong', { text: fmtDate(a.date) }), el('div', { class: 'muted', text: fmtTime(a.time) }),
          el('div', { class: 'muted small', text: `Ref ${a.reference}` }))),
      el('td', { 'data-label': 'Client' },
        el('div', {}, el('strong', { text: a.client.name }), el('div', { class: 'muted', text: a.client.phone }))),
      el('td', { 'data-label': 'Notes', class: 'notes' }, a.notes ? a.notes : el('span', { class: 'muted', text: '—' })),
      el('td', { 'data-label': 'Doctor' }, doctorSelect(a)),
      el('td', { 'data-label': 'Status' }, statusCell(a)),
      el('td', { 'data-label': 'Actions', class: 'actions' }, actionButtons(a)),
    );
  }

  function doctorSelect(a) {
    const select = el('select', {
      'aria-label': `Doctor for ${a.client.name}`,
      disabled: a.status === 'CANCELLED',
    });
    select.append(el('option', { value: '', text: 'Unassigned' }));

    const options = state.doctors.filter((d) => d.isActive);
    if (a.doctor && !options.some((d) => d.id === a.doctor.id)) options.push(a.doctor);
    for (const d of options) {
      select.append(el('option', { value: d.id, text: d.specialization ? `${d.name} (${d.specialization})` : d.name }));
    }
    select.value = a.doctorId || '';

    select.addEventListener('change', async () => {
      try {
        await api(`/appointments/${a.id}/doctor`, { method: 'PATCH', body: { doctorId: select.value || null } });
        toast(a.status === 'CONFIRMED'
          ? 'Doctor updated. Use Resend if the client should get the new details.'
          : 'Doctor assigned');
        await loadAppointments();
      } catch (err) {
        toast(err.message, 'error');
        await loadAppointments();
      }
    });
    return select;
  }

  function statusCell(a) {
    const label = a.status.charAt(0) + a.status.slice(1).toLowerCase();
    const parts = [el('span', { class: `badge ${a.status.toLowerCase()}`, text: label })];
    if (a.status === 'CONFIRMED') {
      parts.push(a.notifiedAt
        ? el('div', { class: 'muted small', text: 'Client notified on WhatsApp' })
        : el('div', { class: 'warn small', text: `Client not notified${a.notificationError ? `: ${a.notificationError}` : ''}` }));
    }
    return el('div', {}, parts);
  }

  function actionButtons(a) {
    if (a.status === 'CANCELLED') return [];
    const buttons = [];
    if (a.status === 'PENDING') {
      buttons.push(button('Confirm & notify', 'btn primary small', (b) => runAction(b, a, 'confirm')));
    } else {
      buttons.push(button('Resend', 'btn small', (b) => runAction(b, a, 'resend')));
    }
    buttons.push(button('Cancel', 'btn danger small', (b) => {
      const ok = window.confirm(
        `Cancel ${a.client.name}'s appointment on ${fmtDate(a.date)} at ${fmtTime(a.time)}?\n\nThe client is not notified automatically.`);
      if (ok) runAction(b, a, 'cancel');
    }));
    return buttons;
  }

  function button(text, className, onClick) {
    const node = el('button', { type: 'button', class: className, text });
    node.addEventListener('click', () => onClick(node));
    return node;
  }

  async function runAction(btn, a, action) {
    btn.disabled = true;
    try {
      const data = await api(`/appointments/${a.id}/${action}`, { method: 'POST' });
      if (action === 'cancel') {
        toast('Appointment cancelled');
      } else if (data.notification?.sent) {
        toast(action === 'confirm'
          ? 'Confirmed. The client was notified on WhatsApp.'
          : 'Confirmation message sent again.');
      } else if (data.notification) {
        toast(`Saved, but the WhatsApp message failed: ${data.notification.error}`, 'error');
      } else {
        toast('Already confirmed');
      }
      await loadAppointments();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  }

  // ---------- doctors ----------

  async function loadDoctors() {
    const { doctors } = await api('/doctors');
    state.doctors = doctors;
    renderDoctors();
  }

  function renderDoctors() {
    $('#doctor-list').replaceChildren(...state.doctors.map((d) =>
      el('li', { class: `doctor ${d.isActive ? '' : 'inactive'}` },
        el('div', {}, el('strong', { text: d.name }), el('div', { class: 'muted', text: d.specialization || 'No specialization' })),
        button(d.isActive ? 'Deactivate' : 'Activate', 'btn ghost small', async (b) => {
          b.disabled = true;
          try {
            await api(`/doctors/${d.id}`, { method: 'PATCH', body: { isActive: !d.isActive } });
            await loadDoctors();
            await loadAppointments();
          } catch (err) {
            toast(err.message, 'error');
            b.disabled = false;
          }
        }))));
    $('#doctors-empty').hidden = state.doctors.length > 0;
  }

  $('#doctor-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/doctors', { method: 'POST', body: { name: $('#doctor-name').value, specialization: $('#doctor-spec').value } });
      event.target.reset();
      toast('Doctor added');
      await loadDoctors();
      await loadAppointments();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // ---------- wiring ----------

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t === tab);
      $('#tab-appointments').hidden = tab.dataset.tab !== 'appointments';
      $('#tab-doctors').hidden = tab.dataset.tab !== 'doctors';
    });
  }

  for (const seg of document.querySelectorAll('.seg')) {
    seg.addEventListener('click', () => {
      state.status = seg.dataset.status;
      for (const s of document.querySelectorAll('.seg')) s.classList.toggle('active', s === seg);
      loadAppointments().catch((err) => toast(err.message, 'error'));
    });
  }

  $('#when').addEventListener('change', (event) => {
    state.when = event.target.value;
    loadAppointments().catch((err) => toast(err.message, 'error'));
  });

  let searchTimer;
  $('#search').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = event.target.value.trim();
      loadAppointments().catch((err) => toast(err.message, 'error'));
    }, 300);
  });

  $('#refresh').addEventListener('click', () => loadAppointments().catch((err) => toast(err.message, 'error')));

  $('#logout').addEventListener('click', async () => {
    await fetch('/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    window.location.href = '/admin/login';
  });

  // New bookings arrive while the page is open: refresh quietly, but never while a dropdown is in use.
  setInterval(() => {
    if (document.hidden || document.activeElement?.tagName === 'SELECT') return;
    loadAppointments().catch(() => {});
  }, 30000);

  Promise.all([loadDoctors(), loadAppointments()]).catch((err) => toast(err.message, 'error'));
})();
