const path = require("node:path");

// Resolve from this file so root-level commands also load server/.env.
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
