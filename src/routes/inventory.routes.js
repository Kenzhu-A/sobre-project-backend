const express = require("express");
const router = express.Router();

const { 
    getInventory,
    createInventory,
    updateInventory,
    getInventoryIndiv,
    deleteInventory,
    getSuppliers,
    getCategories
} = require("../controllers/inventory.controller");

router.get("/", getInventory);
router.post("/", createInventory);
router.patch("/:id", updateInventory);
router.get("/suppliers", getSuppliers);
router.get("/categories", getCategories);
router.get("/:id", getInventoryIndiv);
router.delete("/:id", deleteInventory);



module.exports = router;