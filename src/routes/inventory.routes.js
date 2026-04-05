const express = require("express");
const router = express.Router();

const { 
    getInventory,
    createInventory,
    updateInventory,
    getInventoryIndiv,
    deleteInventory,
    getSuppliers,
    getCategories,
    getInventoryOperationalPDF,
    getInventoryFinancialPDF,
    importCSV,
    scanProduct,
} = require("../controllers/inventory.controller");

router.get("/scan", scanProduct);
router.get("/", getInventory);
router.post("/", createInventory);
router.patch("/:id", updateInventory);
router.get("/suppliers", getSuppliers);
router.get("/categories", getCategories);
router.post("/import", importCSV);
router.get("/pdfOperational", getInventoryOperationalPDF);
router.get("/pdfFinancial", getInventoryFinancialPDF);
router.get("/:id", getInventoryIndiv);
router.delete("/:id", deleteInventory);

module.exports = router;
