const supabase = require("../config/supabase");
const { logAudit } = require("../utils/auditLogger"); // <-- Import the logger

// --- Get all users for a specific store (with joined store info) ---
exports.getUsersByStore = async (req, res) => {
  try {
    const { storeId } = req.params;

    const { data: storeUsers, error: usersError } = await supabase
      .from("users")
      .select("*, store(store_name, province)")
      .eq("store_id", storeId);

    if (usersError) throw usersError;

    const { data: authData, error: authError } =
      await supabase.auth.admin.listUsers();
    if (authError) throw authError;

    const authUsers = authData.users;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const enrichedUsers = await Promise.all(
      storeUsers.map(async (u) => {
        const authU = authUsers.find((au) => au.id === u.auth_user_id);
        let email = authU ? authU.email : "Unknown Email";
        let currentStatus = u.status || "active";

        const lastActiveDate =
          authU && authU.last_sign_in_at
            ? new Date(authU.last_sign_in_at)
            : authU
              ? new Date(authU.created_at)
              : new Date();

        if (lastActiveDate < thirtyDaysAgo && currentStatus === "active") {
          currentStatus = "inactive";
          await supabase
            .from("users")
            .update({ status: "inactive" })
            .eq("auth_user_id", u.auth_user_id);
        } else if (
          lastActiveDate >= thirtyDaysAgo &&
          currentStatus === "inactive"
        ) {
          currentStatus = "active";
          await supabase
            .from("users")
            .update({ status: "active" })
            .eq("auth_user_id", u.auth_user_id);
        }

        return {
          ...u,
          email,
          status: currentStatus,
          store_name: u.store?.store_name || "No Store",
          province: u.store?.province || "Unknown Location",
        };
      }),
    );

    res.json(enrichedUsers);
  } catch (err) {
    console.error("Error fetching org users:", err);
    res.status(500).json({ error: "Failed to fetch organization users." });
  }
};

exports.getUsers = async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("*, store(store_name, province)");

  if (error) return res.status(400).json(error);
  res.json(data);
};

exports.getUserById = async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("users")
    .select("*, store(store_name, province)")
    .eq("auth_user_id", id)
    .single();

  if (error) return res.status(400).json(error);
  res.json(data);
};

exports.createUserProfile = async (req, res) => {
  try {
    const {
      auth_user_id,
      username,
      role,
      phone,
      photo,
      store_name,
      building,
      street,
      barangay,
      city,
      province,
    } = req.body;

    if (!auth_user_id)
      return res.status(400).json({ error: "auth_user_id required" });

    const { data: storeData, error: storeError } = await supabase
      .from("store")
      .insert({ store_name, building, street, barangay, city, province })
      .select()
      .single();

    if (storeError)
      return res.status(400).json({ error: "Failed to create store record." });

    const { data: userData, error: userError } = await supabase
      .from("users")
      .upsert(
        {
          auth_user_id,
          username: username || "Manager",
          role: role || "manager",
          phone,
          photo,
          store_id: storeData.id,
        },
        { onConflict: "auth_user_id" },
      )
      .select()
      .single();

    if (userError)
      return res.status(400).json({ error: "Failed to create user profile." });

    res.json({ user: userData, store: storeData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// Create a new user for an organization (Manager action)
exports.createOrgUser = async (req, res) => {
  try {
    const { email, password, username, phone, store_id, admin_user_id } =
      req.body;

    if (!email || !password || !store_id) {
      return res
        .status(400)
        .json({ error: "Email, password, and store_id are required." });
    }

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) throw authError;

    const authUserId = authData.user.id;

    const { data: userData, error: userError } = await supabase
      .from("users")
      .insert({
        auth_user_id: authUserId,
        username: username || "New User",
        phone: phone || null,
        role: "staff",
        store_id: store_id,
        status: "active",
      })
      .select()
      .single();

    if (userError) {
      await supabase.auth.admin.deleteUser(authUserId);
      throw userError;
    }

    // --- LOG AUDIT: ADDED A USER ---
    if (admin_user_id && store_id) {
      await logAudit({
        users_id: admin_user_id,
        store_id: store_id,
        area: "System Settings",
        action: "Adding",
        item: "User & Role Management",
        summary: "Added a user",
      });
    }

    res
      .status(201)
      .json({ message: "User created successfully", user: userData });
  } catch (err) {
    console.error("Error creating org user:", err);
    res.status(500).json({ error: err.message || "Failed to create user." });
  }
};

// Delete users from the organization
exports.deleteOrgUsers = async (req, res) => {
  try {
    const { userIds, admin_user_id, store_id } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "No users provided for deletion." });
    }

    for (const id of userIds) {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) throw error;
    }

    // --- LOG AUDIT: DELETED A USER ---
    if (admin_user_id && store_id) {
      await logAudit({
        users_id: admin_user_id,
        store_id: store_id,
        area: "System Settings",
        action: "Deleting",
        item: "User & Role Management",
        summary: `Deleted ${userIds.length} user${userIds.length > 1 ? "s" : ""}`,
      });
    }

    res.json({ message: "Users deleted successfully." });
  } catch (err) {
    console.error("Error deleting users:", err);
    res.status(500).json({ error: "Failed to delete users." });
  }
};

// Update a user's role (Inline Edit)
exports.updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, admin_user_id, store_id } = req.body;

    if (!role) return res.status(400).json({ error: "Role is required." });

    const { data, error } = await supabase
      .from("users")
      .update({ role: role.toLowerCase() })
      .eq("auth_user_id", userId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0)
      return res.status(404).json({ error: "User not found." });

    // --- LOG AUDIT: UPDATED USER ROLE ---
    if (admin_user_id && store_id) {
      await logAudit({
        users_id: admin_user_id,
        store_id: store_id,
        area: "System Settings",
        action: "Updating",
        item: "User & Role Management",
        summary: "Updated a user’s role",
      });
    }

    res.json({ message: "User role updated successfully", user: data[0] });
  } catch (err) {
    console.error("Error updating user role:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
