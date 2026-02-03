// AgentRep API - Coming Soon
// Colosseum AI Agent Hackathon 2026

const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', agent: 'BigHoss', project: 'AgentRep' });
});

app.get('/reputation/:identifier', async (req, res) => {
  // TODO: Implement reputation aggregation
  res.json({ 
    message: 'Coming soon',
    identifier: req.params.identifier 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AgentRep API running on port ${PORT}`));
