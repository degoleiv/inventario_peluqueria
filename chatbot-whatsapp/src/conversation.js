const path = require('path');
const { DateTime } = require('luxon');
const { sendText, sendButtons, sendList } = require('./whatsapp');

const config = require(path.join(__dirname, '..', 'config.json'));
const tz = config.business.timezone || process.env.TIMEZONE || 'America/Mexico_City';

const sessions = new Map();

function getSession(from) {
  if (!sessions.has(from)) sessions.set(from, { step: 'idle', data: {} });
  return sessions.get(from);
}

function reset(from) {
  sessions.delete(from);
}

function fmt(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function getServices() {
  return config.services;
}

function findService(id) {
  return config.services.find((s) => s.id === id);
}

function listAvailableSlots(dayISO) {
  const { start, end, slotMinutes } = config.hours;
  const day = DateTime.fromISO(dayISO, { zone: tz });
  const slots = [];
  let cursor = day.set({ hour: start, minute: 0, second: 0, millisecond: 0 });
  const dayEnd = day.set({ hour: end, minute: 0 });
  const now = DateTime.now().setZone(tz);

  while (cursor < dayEnd) {
    if (cursor > now) slots.push(cursor.toFormat('HH:mm'));
    cursor = cursor.plus({ minutes: slotMinutes });
  }
  return slots;
}

function nextOpenDays(count = 3) {
  const closed = new Set(config.hours.closedDays || []);
  const days = [];
  let cursor = DateTime.now().setZone(tz).startOf('day');
  while (days.length < count) {
    if (!closed.has(cursor.weekday % 7)) days.push(cursor.toISODate());
    cursor = cursor.plus({ days: 1 });
  }
  return days;
}

function humanDate(iso) {
  return DateTime.fromISO(iso, { zone: tz }).setLocale('es').toFormat("cccc d 'de' LLLL");
}

async function sendMainMenu(to) {
  const welcome = fmt(config.messages.welcome, { businessName: config.business.name });
  await sendButtons(to, {
    header: config.messages.menuTitle,
    body: welcome,
    footer: config.business.name,
    buttons: [
      { id: 'menu_book', title: 'Agendar cita' },
      { id: 'menu_services', title: 'Ver servicios' },
      { id: 'menu_human', title: 'Hablar con humano' },
    ],
  });
}

async function sendServicesList(to, { forBooking }) {
  const rows = getServices().map((s) => ({
    id: forBooking ? `svc_${s.id}` : `info_${s.id}`,
    title: s.name,
    description: `${s.duration} min · $${s.price}`,
  }));
  await sendList(to, {
    header: config.messages.servicesHeader,
    body: forBooking ? config.messages.servicesBody : 'Estos son nuestros servicios y precios:',
    footer: config.business.name,
    buttonText: 'Ver servicios',
    sections: [{ title: 'Servicios', rows }],
  });
}

async function sendDaysList(to) {
  const rows = nextOpenDays(3).map((iso) => ({
    id: `day_${iso}`,
    title: humanDate(iso),
    description: iso,
  }));
  await sendList(to, {
    header: 'Elige el día',
    body: '¿Qué día prefieres venir?',
    buttonText: 'Ver días',
    sections: [{ title: 'Próximos días', rows }],
  });
}

async function sendSlotsList(to, dayISO) {
  const slots = listAvailableSlots(dayISO);
  if (!slots.length) {
    await sendText(to, 'No hay horarios disponibles ese día. Escribe *hola* para empezar de nuevo.');
    reset(to);
    return;
  }
  const rows = slots.slice(0, 10).map((t) => ({
    id: `slot_${t}`,
    title: t,
    description: 'Disponible',
  }));
  await sendList(to, {
    header: config.messages.slotsHeader,
    body: fmt(config.messages.slotsBody, { date: humanDate(dayISO) }),
    buttonText: 'Ver horarios',
    sections: [{ title: humanDate(dayISO), rows }],
  });
}

async function sendConfirm(to, session) {
  const { service, dayISO, time } = session.data;
  await sendButtons(to, {
    header: 'Confirmar cita',
    body: `💇 ${service.name}\n📅 ${humanDate(dayISO)}\n🕒 ${time}\n💵 $${service.price}\n\n¿Confirmas la cita?`,
    buttons: [
      { id: 'confirm_yes', title: 'Sí, confirmar' },
      { id: 'confirm_no', title: 'Cancelar' },
    ],
  });
}

async function handleEvent(from, event) {
  const session = getSession(from);

  if (event.type === 'text') {
    const lower = event.text.toLowerCase().trim();
    if (['cancelar', 'salir', 'reset'].includes(lower)) {
      reset(from);
      await sendText(from, 'Conversación reiniciada. Escribe *hola* para empezar de nuevo.');
      return;
    }
    if (['hola', 'hi', 'hello', 'menu', 'menú', 'buenas'].includes(lower)) {
      session.step = 'menu';
      await sendMainMenu(from);
      return;
    }
    await sendText(from, config.messages.fallback);
    return;
  }

  if (event.type !== 'interactive') return;

  const id = event.id;

  if (id === 'menu_book') {
    session.step = 'service';
    await sendServicesList(from, { forBooking: true });
    return;
  }

  if (id === 'menu_services') {
    await sendServicesList(from, { forBooking: false });
    await sendButtons(from, {
      body: '¿Quieres agendar uno?',
      buttons: [
        { id: 'menu_book', title: 'Agendar cita' },
        { id: 'menu_human', title: 'Hablar con humano' },
      ],
    });
    return;
  }

  if (id === 'menu_human') {
    reset(from);
    await sendText(
      from,
      fmt(config.messages.humanHandoff, { humanPhone: config.business.humanAgentNumber })
    );
    return;
  }

  if (id.startsWith('svc_')) {
    const svc = findService(id.slice(4));
    if (!svc) return sendText(from, config.messages.fallback);
    session.data.service = svc;
    session.step = 'day';
    await sendDaysList(from);
    return;
  }

  if (id.startsWith('info_')) {
    const svc = findService(id.slice(5));
    if (!svc) return sendText(from, config.messages.fallback);
    await sendText(from, `*${svc.name}*\nDuración: ${svc.duration} min\nPrecio: $${svc.price}`);
    return;
  }

  if (id.startsWith('day_')) {
    const dayISO = id.slice(4);
    session.data.dayISO = dayISO;
    session.step = 'slot';
    await sendSlotsList(from, dayISO);
    return;
  }

  if (id.startsWith('slot_')) {
    session.data.time = id.slice(5);
    session.step = 'confirm';
    await sendConfirm(from, session);
    return;
  }

  if (id === 'confirm_yes') {
    const { service, dayISO, time } = session.data;
    const refId = `LOC-${Date.now().toString(36).toUpperCase()}`;
    console.log('[reserva]', { refId, from, service: service.name, dayISO, time });
    reset(from);
    await sendText(
      from,
      `✅ ¡Cita registrada!\n\n💇 ${service.name}\n📅 ${humanDate(dayISO)} a las ${time}\n💵 $${service.price}\n\nReferencia: ${refId}\n\nTe esperamos en *${config.business.name}*.\n${config.business.address}`
    );
    return;
  }

  if (id === 'confirm_no') {
    reset(from);
    await sendText(from, 'Cita cancelada. Escribe *hola* cuando quieras agendar.');
    return;
  }

  await sendText(from, config.messages.fallback);
}

module.exports = { handleEvent, config };
