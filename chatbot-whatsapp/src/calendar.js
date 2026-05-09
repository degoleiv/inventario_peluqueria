const { google } = require('googleapis');
const { DateTime } = require('luxon');

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/calendar'],
});
const calendar = google.calendar({ version: 'v3', auth });
const calendarId = process.env.GOOGLE_CALENDAR_ID;
const tz = process.env.TIMEZONE || 'America/Mexico_City';

async function getBusySlots(dayISO) {
  const start = DateTime.fromISO(dayISO, { zone: tz }).startOf('day');
  const end = start.endOf('day');
  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: start.toISO(),
      timeMax: end.toISO(),
      timeZone: tz,
      items: [{ id: calendarId }],
    },
  });
  return data.calendars[calendarId].busy || [];
}

async function listAvailableSlots(dayISO) {
  const busy = await getBusySlots(dayISO);
  const startHour = Number(process.env.BUSINESS_HOURS_START || 9);
  const endHour = Number(process.env.BUSINESS_HOURS_END || 18);
  const slotMin = Number(process.env.SLOT_MINUTES || 30);

  const day = DateTime.fromISO(dayISO, { zone: tz });
  const slots = [];
  let cursor = day.set({ hour: startHour, minute: 0, second: 0, millisecond: 0 });
  const dayEnd = day.set({ hour: endHour, minute: 0 });

  while (cursor < dayEnd) {
    const slotEnd = cursor.plus({ minutes: slotMin });
    const overlaps = busy.some((b) => {
      const bs = DateTime.fromISO(b.start);
      const be = DateTime.fromISO(b.end);
      return cursor < be && slotEnd > bs;
    });
    if (!overlaps && cursor > DateTime.now().setZone(tz)) {
      slots.push(cursor.toFormat('HH:mm'));
    }
    cursor = slotEnd;
  }
  return slots;
}

async function createEvent({ summary, description, dayISO, time, durationMin }) {
  const start = DateTime.fromISO(`${dayISO}T${time}`, { zone: tz });
  const end = start.plus({ minutes: durationMin || Number(process.env.SLOT_MINUTES || 30) });

  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      description,
      start: { dateTime: start.toISO(), timeZone: tz },
      end: { dateTime: end.toISO(), timeZone: tz },
    },
  });
  return data;
}

module.exports = { listAvailableSlots, createEvent };
