const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

let tickets = [];
let clients = [];
let counter = 1;

// SSE endpoint
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send existing tickets immediately on connect
  res.write(`data: ${JSON.stringify({ type: 'init', tickets })}\n\n`);
  console.log(`[SSE Connected] Active clients: ${clients.length + 1}`);

  clients.push(res);

  // Keep alive ping every 30 seconds
  const ping = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(ping);
    clients = clients.filter(c => c !== res);
    console.log(`[SSE Separated] Active clients remaining: ${clients.length}`);
  });
});

// Webhook endpoint - receives from Make.com
app.post('/webhook', (req, res) => {
  console.log('[Webhook Received] GHL active payload:', req.body);

  const body = req.body;

  const ticket = {
    id: `TKT-${String(counter++).padStart(4, '0')}`,
    submitted_by: body.submitted_by || 'Unknown',
    sub_account_name: body.sub_account_name || 'Unknown',
    assign_to: body.assign_to || 'Unassigned',
    task_name: body.task_name || 'No Title',
    task_description: body.task_description || 'No Description',
    priority_level: body.priority_level || 'Low',
    status: 'Open',
    created_at: new Date().toISOString()
  };

  tickets.unshift(ticket);

  // Broadcast to ALL connected dashboard clients
  console.log(`[Broadcasting] Sending ticket ${ticket.id} to ${clients.length} client(s)`);
  clients.forEach(client => {
    try {
      client.write(`data: ${JSON.stringify({ type: 'new_ticket', ticket })}\n\n`);
    } catch (err) {
      console.error('[Broadcast Error]', err.message);
    }
  });

  console.log(`[Ticket Created] ${ticket.id} - ${ticket.task_name}`);
  res.status(200).json({ status: 'ok', ticket_id: ticket.id });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'running',
    tickets: tickets.length,
    connected_clients: clients.length
  });
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Support Ticket Dashboard running on port: ${PORT}`);
  console.log(`⚙️ Webhook Receiver Target: http://localhost:${PORT}/webhook`);
  console.log(`📣 Live Server-Sent Events Endpoint: http://localhost:${PORT}/events`);
});
