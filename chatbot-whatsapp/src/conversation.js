const { DateTime } = require('luxon');

const tz = process.env.TIMEZONE || 'America/Mexico_City';
const sessions = new Map();

function listAvailableSlots(dayISO) {
  const startHour = Number(process.env.BUSINESS_HOURS_START || 9);
  const endHour = Number(process.env.BUSINESS_HOURS_END || 18);
  const slotMin = Number(process.env.SLOT_MINUTES || 30);

  const day = DateTime.fromISO(dayISO, { zone: tz });
  const slots = [];
  let cursor = day.set({ hour: startHour, minute: 0, second: 0, millisecond: 0 });
  const dayEnd = day.set({ hour: endHour, minute: 0 });

  while (cursor < dayEnd) {
    if (cursor > DateTime.now().setZone(tz)) {
      slots.push(cursor.toFormat('HH:mm'));
    }
    cursor = cursor.plus({ minutes: slotMin });
  }
  return slots;
}

const SERVICES = {
  '1': { name: 'Consulta general', duration: 30 },
  '2': { name: 'Revisión', duration: 45 },
  '3': { name: 'Procedimiento', duration: 60 },
};

function getSession(from) {
  if (!sessions.has(from)) sessions.set(from, { step: 'start', data: {} });
  return sessions.get(from);
}

function reset(from) {
  sessions.delete(from);
}

function parseDate(input) {
  const today = DateTime.now().setZone(tz).startOf('day');
  const lower = input.toLowerCase().trim();
  if (lower === 'hoy') return today.toISODate();
  if (lower === 'mañana' || lower === 'manana') return today.plus({ days: 1 }).toISODate();

  const m = input.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.year;
    const dt = DateTime.fromObject({ year, month, day }, { zone: tz });
    if (dt.isValid && dt >= today) return dt.toISODate();
  }
  return null;
}

async function handleMessage(from, text) {
  const session = getSession(from);
  const lower = text.toLowerCase();

  if (['cancelar', 'salir', 'reset'].includes(lower)) {
    reset(from);
    return 'Conversación reiniciada. Escribe *hola* para empezar de nuevo.';
  }

  switch (session.step) {
    case 'start': {
      session.step = 'name';
      return '👋 ¡Hola! Soy el asistente de citas.\n\n¿Cuál es tu nombre?';
    }

    case 'name': {
      session.data.name = text;
      session.step = 'service';
      const list = Object.entries(SERVICES)
        .map(([k, v]) => `${k}. ${v.name} (${v.duration} min)`)
        .join('\n');
      return `Encantado, ${text}.\n\nElige un servicio:\n${list}`;
    }

    case 'service': {
      const svc = SERVICES[text.trim()];
      if (!svc) return 'Opción no válida. Responde con 1, 2 o 3.';
      session.data.service = svc;
      session.step = 'date';
      return '¿Qué día prefieres? (escribe *hoy*, *mañana* o una fecha como 15/05/2026)';
    }

    case 'date': {
      const dayISO = parseDate(text);
      if (!dayISO) return 'No entendí la fecha. Ejemplo: *mañana* o *15/05/2026*.';
      const slots = listAvailableSlots(dayISO);
      if (!slots.length) return 'No hay horarios disponibles ese día. Prueba otra fecha.';
      session.data.dayISO = dayISO;
      session.data.slots = slots;
      session.step = 'time';
      return `Horarios disponibles para ${dayISO}:\n${slots.join(', ')}\n\nResponde con la hora (ej: 10:30).`;
    }

    case 'time': {
      const time = text.trim();
      if (!session.data.slots.includes(time)) {
        return `Hora no disponible. Elige una de: ${session.data.slots.join(', ')}.`;
      }
      session.data.time = time;
      session.step = 'confirm';
      const { name, service, dayISO } = session.data;
      return `Confirma tu cita:\n\n👤 ${name}\n💼 ${service.name}\n📅 ${dayISO} a las ${time}\n\nResponde *sí* para confirmar o *cancelar*.`;
    }

    case 'confirm': {
      if (!['si', 'sí', 'ok', 'confirmar'].includes(lower)) {
        return 'Responde *sí* para confirmar o *cancelar* para abortar.';
      }
      const { name, service, dayISO, time } = session.data;
      const refId = `LOC-${Date.now().toString(36).toUpperCase()}`;
      console.log('[reserva]', { refId, from, name, service: service.name, dayISO, time });
      reset(from);
      return `✅ ¡Cita registrada!\n\n👤 ${name}\n📅 ${dayISO} a las ${time}\n💼 ${service.name}\n\nReferencia: ${refId}\n\n_(Google Calendar está desactivado por ahora; la cita se registró solo en el log del servidor.)_`;
    }

    default:
      reset(from);
      return 'Algo salió mal. Escribe *hola* para empezar.';
  }
}

module.exports = { handleMessage };
