const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const usersRoutes = require("./routes/users.routes");
const salesRoutes = require("./routes/sales.routes");
const inventoryRoutes = require("./routes/inventory.routes")
const stocksRoutes = require("./routes/stocks.routes")
const storeRoutes = require("./routes/store.routes");
const auditRoutes = require("./routes/audit.routes");
const app = express();

app.use(morgan('dev'));

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true
}));

// --- FIX: INCREASE PAYLOAD LIMIT TO 10MB ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.get("/", (req, res) => {
  res.send("Sobre Backend running 🚀");
});

app.use("/api/users", usersRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/stock", stocksRoutes);
app.use("/api/store", storeRoutes);
app.use("/api/audit", auditRoutes);

module.exports = app;