const express = require("express");
const router = express.Router();

const {
  getStoreById,
  updateStore,
  getStoreByAuthId, // Import the new controller
} = require("../controllers/store.controller");

// NEW: Endpoint to fetch via auth_user_id
router.get("/user/:authId", getStoreByAuthId);

router.get("/:id", getStoreById);
router.put("/:id", updateStore);

module.exports = router;
