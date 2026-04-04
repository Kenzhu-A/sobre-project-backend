const express = require("express");
const router = express.Router();

const {
  getUsers,
  getUserById,
  createUserProfile,
  getUsersByStore,
  createOrgUser,
  deleteOrgUsers,
  updateUserRole, // <-- 1. Import
} = require("../controllers/users.controller");

router.get("/", getUsers);
router.get("/:id", getUserById);
router.post("/", createUserProfile);
router.get("/store/:storeId", getUsersByStore);
router.post("/org", createOrgUser);
router.post("/org/delete", deleteOrgUsers);
router.put("/org/:userId/role", updateUserRole);

module.exports = router;
