const express = require("express");
const cors = require("cors");

const usersRoutes = require("./routes/users.routes");

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Sobre Backend running 🚀");
});

app.use("/api/users", usersRoutes);

module.exports = app;
