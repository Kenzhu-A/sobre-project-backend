const express = require("express");
const router = express.Router();
const { getSalesHistory, getSaleDetails, createSale, voidSale, voidSaleItem } = require("../controllers/sales.controller");

router.get("/", getSalesHistory);
router.get("/:id", getSaleDetails);
router.post("/", createSale);
router.delete("/:id", voidSale);
router.delete("/:receiptId/item/:itemId", voidSaleItem); // <-- NEW PARTIAL VOID ROUTE

module.exports = router;