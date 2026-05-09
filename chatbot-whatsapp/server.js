require('dotenv').config();
const express = require('express');
const { handleEvent } = require('./src/conversation');

const app = express();
app.use(express.json());

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

function parseEvent(message) {
  if (!message) return null;
  if (message.type === 'text') {
    return { type: 'text', text: message.text.body.trim() };
  }
  if (message.type === 'interactive') {
    const i = message.interactive;
    if (i.type === 'button_reply') {
      return { type: 'interactive', id: i.button_reply.id, title: i.button_reply.title };
    }
    if (i.type === 'list_reply') {
      return { type: 'interactive', id: i.list_reply.id, title: i.list_reply.title };
    }
  }
  return null;
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    const event = parseEvent(message);
    if (!event) return;

    const from = message.from;
    await handleEvent(from, event);
  } catch (err) {
    console.error('webhook error:', err.response?.data || err.message);
  }
});

app.get('/', (_, res) => res.send('ok'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`listening on :${port}`));
