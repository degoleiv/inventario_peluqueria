require('dotenv').config();
const express = require('express');
const { sendText } = require('./src/whatsapp');
const { handleMessage } = require('./src/conversation');

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

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message || message.type !== 'text') return;

    const from = message.from;
    const text = message.text.body.trim();
    const reply = await handleMessage(from, text);
    if (reply) await sendText(from, reply);
  } catch (err) {
    console.error('webhook error:', err.response?.data || err.message);
  }
});

app.get('/', (_, res) => res.send('ok'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`listening on :${port}`));
