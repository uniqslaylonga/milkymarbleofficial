// api/index.js
// Vercel serverless entry point. Vercel's Node runtime accepts an Express
// app export directly and calls it as a (req, res) handler, so we just
// re-export the app built in server.js (which no-ops app.listen() here
// because require.main !== this file).
module.exports = require('../server.js');
