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
let deletedIds = [];
let clients = [];
let counter = 1;
 
// ── SSE ENDPOINT ──────────────────────────────────────
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
 
  // Send existing tickets (excluding deleted)
  const active = tickets.filter(t => !deletedIds.includes(t.id));
  res.write(`data: ${JSON.stringify({ type: 'init', tickets: active })}\n\n`);
  console.log(`[SSE Connected] Active clients: ${clients.length + 1}`);
 
  clients.push(res);
 
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
 
  req.on('close', () => {
    clearInterval(ping);
    clients = clients.filter(c => c !== res);
    console.log(`[SSE Disconnected] Remaining: ${clients.length}`);
  });
});
 
// ── BROADCAST HELPER ──────────────────────────────────
function broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  clients.forEach(c => { try { c.write(msg); } catch (e) {} });
}
 
// ── WEBHOOK — receive ticket from Make.com ────────────
app.post('/webhook', (req, res) => {
  const b = req.body;
  console.log('[Webhook Received]', b);
 
  const ticket = {
    id: `TKT-${String(counter++).padStart(4, '0')}`,
    submitted_by:     b.submitted_by     || 'Unknown',
    sub_account_name: b.sub_account_name || 'Unknown',
    assign_to:        b.assign_to        || 'Unassigned',
    task_name:        b.task_name        || 'No Title',
    task_description: b.task_description || 'No Description',
    priority_level:   b.priority_level   || 'Low',
    status:           'Open',
    created_at:       new Date().toISOString()
  };
 
  // Only add if not already deleted
  if (!deletedIds.includes(ticket.id)) {
    tickets.unshift(ticket);
    broadcast({ type: 'new_ticket', ticket });
    console.log(`[Ticket Created] ${ticket.id}`);
  }
 
  res.status(200).json({ status: 'ok', ticket_id: ticket.id });
});
 
// ── DELETE TICKET — permanent cross-session sync ──────
app.post('/delete-ticket', (req, res) => {
  const { ticket_id } = req.body;
  if (!ticket_id) return res.status(400).json({ error: 'ticket_id required' });
 
  // Remove from server memory
  tickets = tickets.filter(t => t.id !== ticket_id);
 
  // Track as permanently deleted
  if (!deletedIds.includes(ticket_id)) deletedIds.push(ticket_id);
 
  // Broadcast deletion to all other connected clients
  broadcast({ type: 'delete_ticket', ticket_id });
 
  console.log(`[Ticket Deleted] ${ticket_id}`);
  res.status(200).json({ status: 'ok', deleted: ticket_id });
});
 
// ── HEALTH CHECK ──────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'running',
    tickets: tickets.length,
    deleted: deletedIds.length,
    connected_clients: clients.length
  });
});
 
// ── SERVE DASHBOARD ───────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
 
app.listen(PORT, () => {
  console.log(`🚀 Support Ticket Dashboard running on port: ${PORT}`);
  console.log(`⚙️  Webhook endpoint: /webhook`);
  console.log(`📡 SSE endpoint: /events`);
  console.log(`🗑️  Delete endpoint: /delete-ticket`);
});
 
