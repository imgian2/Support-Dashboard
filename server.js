/**
 * Standalone Node.js + Express Webhook Server
 * Powered by Server-Sent Events (SSE)
 *
 * Install dependencies:
 *   npm install express
 *
 * Run:
 *   node server.js
 *
 * Exposes:
 *   - POST /webhook : Receives GHL Webhook data
 *   - GET /events   : Server-Sent Events endpoint for dashboard update streams
 *   - GET /         : Serves the static index.html dashboard template
 */

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Body-parsing utilities
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS for development configurations
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Server-Sent Events connection list
let clients = [];
let ticketCounter = 1001;
const transientHistory = [];

// Helper to filter GHL braces or empty variables
function sanitizeValue(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    return fallback;
  }
  return trimmed;
}

// 1. WEBHOOK POST RECEIVER: Parses the form/json and pushes live events
app.post("/webhook", (req, res) => {
  console.log("[Webhook Received] GHL active payload:", req.body);

  const {
    submitted_by,
    sub_account_name,
    assign_to,
    task_name,
    task_description,
    priority_level
  } = req.body;

  // Process and shape GHL parameters safely
  const rawPriority = sanitizeValue(priority_level, "Medium");
  const priority = rawPriority.charAt(0).toUpperCase() + rawPriority.slice(1).toLowerCase();

  const ticket = {
    id: `TKT-${ticketCounter++}`,
    submitted_by: sanitizeValue(submitted_by, "Guest Submitter"),
    sub_account_name: sanitizeValue(sub_account_name, "Office Hub Solutions"),
    assign_to: sanitizeValue(assign_to, "Admin Pool"),
    task_name: sanitizeValue(task_name, "Incoming CRM Support Request"),
    task_description: sanitizeValue(task_description, "No detailed report provided written in this CRM ticket template."),
    priority_level: ["High", "Medium", "Low"].includes(priority) ? priority : "Medium",
    timestamp: new Date().toISOString(),
    status: "Open",
    notes: ""
  };

  // Keep a small trace of the last 100 received tickets for incoming client reconciliation
  transientHistory.unshift(ticket);
  if (transientHistory.length > 100) {
    transientHistory.pop();
  }

  // Broadcast to all active browser SSE channels
  clients.forEach((client) => {
    try {
      client.res.write(`event: ticket_new\n`);
      client.res.write(`data: ${JSON.stringify(ticket)}\n\n`);
    } catch (err) {
      console.error("Error writing to client stream:", client.id);
    }
  });

  return res.status(200).json({
    success: true,
    message: "Ticket broadcast to connected dashboard clients successfully via SSE stream pipeline.",
    ticket: ticket
  });
});

// 2. LIVE SSE SUBSCRIPTION ENDPOINT
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Send a handshake confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ connected: true, msg: "Server SSE Channel Subscribed" })}\n\n`);

  const clientObj = {
    id: Date.now(),
    res: res
  };

  clients.push(clientObj);
  console.log(`[SSE Connected] Active clients: ${clients.length}`);

  // Ping intervals to maintain active pipeline state on strict proxy gateways
  const pingInterval = setInterval(() => {
    res.write(`:\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(pingInterval);
    clients = clients.filter((c) => c.id !== clientObj.id);
    console.log(`[SSE Separated] Active clients remaining: ${clients.length}`);
  });
});

// 3. API RETRIEVE RECENT: Used for initializing newly loaded screens when local database gaps exist
app.get("/api/tickets", (req, res) => {
  res.json(transientHistory);
});

// 4. STATICS: Serve index.html dynamically
app.use(express.static(path.join(__dirname)));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 Support Ticket Dashboard running on: http://localhost:${PORT}`);
  console.log(`⚙️ Webhook Receiver Target: http://localhost:${PORT}/webhook`);
  console.log(`📢 Live Server-Sent Events Endpoint: http://localhost:${PORT}/events`);
  console.log(`=============================================================\n`);
});
