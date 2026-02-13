const express = require("express");
const router = express.Router();

const {
  getSalesHistory,
  getSaleDetails,
  voidSale
} = require("../controllers/sales.controller");

router.get("/", getSalesHistory);
router.get("/:id", getSaleDetails);
router.delete("/:id", voidSale);

module.exports = router;