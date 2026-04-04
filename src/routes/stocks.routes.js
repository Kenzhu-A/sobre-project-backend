const express = require("express");
const {
  getStockByInventory,
  createStock,
  updateStock,
  deleteStock,
  POSUpdate,
} = require("../controllers/stocks.controller");
const router = express.Router();

router.get("/inventory/:id", getStockByInventory);
router.post("/", createStock);
router.patch("/POS", POSUpdate);
router.patch("/:id", updateStock);
router.delete("/:id", deleteStock);

module.exports = router;
