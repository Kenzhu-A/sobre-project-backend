const express = require("express");
const router = express.Router();

const { 
    getInventory 
} = require("../controllers/inventory.controller");

router.get("/", getInventory);

module.exports = router;