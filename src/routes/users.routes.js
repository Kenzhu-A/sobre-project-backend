const express = require("express");
const router = express.Router();

const {
  getUsers,
  getUserById,
  createUserProfile
} = require("../controllers/users.controller");

router.get("/", getUsers);
router.get("/:id", getUserById);
router.post("/", createUserProfile);

module.exports = router;
