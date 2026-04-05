require("dotenv").config();

const app = require("./app");

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(
    `🚀 Backend Server is ALIVE and running on http://localhost:${PORT}`,
  );
});

// This prevents the server from silently turning off if there's a background error
process.on("unhandledRejection", (err) => {
  console.error("❌ CRITICAL ERROR: Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("❌ CRITICAL ERROR: Uncaught Exception:", err);
});
