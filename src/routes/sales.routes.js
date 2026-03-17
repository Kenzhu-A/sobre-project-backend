const express = require("express");
const router = express.Router();
const salesController = require("../controllers/sales.controller");

const {
  getSalesHistory,
  getSaleDetails,
  voidSale,
  createSale
} = require("../controllers/sales.controller");

router.get("/", getSalesHistory);
router.get("/:id", getSaleDetails);
router.delete("/:id", voidSale);
router.post("/", createSale);

module.exports = router;