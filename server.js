const express = require("express");
const path = require("path");

const app = express();
const puerto = process.env.PORT || 5173;

app.get("/config.js", (_req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
  res.type("application/javascript").send(
    `window.AUTODATO_NUBE = ${JSON.stringify({ supabaseUrl, supabaseAnonKey })};`
  );
});

app.use(express.static(path.join(__dirname)));

app.listen(puerto, () => {
  console.log(`AutoDato en http://localhost:${puerto}`);
});
