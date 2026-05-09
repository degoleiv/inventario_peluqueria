const axios = require('axios');

const version = process.env.GRAPH_API_VERSION || 'v21.0';

function endpoint() {
  return `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function sendMessage(payload) {
  const body = { messaging_product: 'whatsapp', ...payload };
  const { data } = await axios.post(endpoint(), body, { headers: authHeaders() });
  return data;
}

async function sendText(to, body) {
  return sendMessage({ to, type: 'text', text: { body } });
}

async function sendButtons(to, { body, buttons, header, footer }) {
  const interactive = {
    type: 'button',
    body: { text: body },
    action: {
      buttons: buttons.slice(0, 3).map((b) => ({
        type: 'reply',
        reply: { id: b.id, title: b.title.slice(0, 20) },
      })),
    },
  };
  if (header) interactive.header = { type: 'text', text: header.slice(0, 60) };
  if (footer) interactive.footer = { text: footer.slice(0, 60) };
  return sendMessage({ to, type: 'interactive', interactive });
}

async function sendList(to, { body, buttonText, sections, header, footer }) {
  const interactive = {
    type: 'list',
    body: { text: body },
    action: {
      button: buttonText.slice(0, 20),
      sections: sections.map((s) => ({
        title: (s.title || '').slice(0, 24),
        rows: s.rows.slice(0, 10).map((r) => ({
          id: r.id,
          title: r.title.slice(0, 24),
          description: r.description ? r.description.slice(0, 72) : undefined,
        })),
      })),
    },
  };
  if (header) interactive.header = { type: 'text', text: header.slice(0, 60) };
  if (footer) interactive.footer = { text: footer.slice(0, 60) };
  return sendMessage({ to, type: 'interactive', interactive });
}

module.exports = { sendText, sendMessage, sendButtons, sendList };
