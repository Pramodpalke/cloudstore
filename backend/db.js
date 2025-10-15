const { Pool } = require("pg");

const pool = new Pool({
  connectionString: "postgresql://cloud_storage_dwpg_user:9455ubOXN6U5PNrSEWn9uqZuGg11ExLO@dpg-d3kicfp5pdvs739iph40-a.singapore-postgres.render.com/cloud_storage_dwpg",
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
