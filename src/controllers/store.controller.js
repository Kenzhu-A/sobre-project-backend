const supabase = require("../config/supabase");
const { logAudit } = require("../utils/auditLogger"); 

exports.getStoreByAuthId = async (req, res) => {
  try {
    const { authId } = req.params;
    const { data, error } = await supabase
      .from("users")
      .select("store_id, store(*)")
      .eq("auth_user_id", authId)
      .single();

    if (error) throw error;
    if (!data || !data.store) return res.status(404).json({ error: "Store not found for this user." });
    
    res.json(data.store);
  } catch (err) {
    console.error("Error fetching store by auth ID:", err);
    res.status(500).json({ error: "Failed to fetch store details" });
  }
};

exports.getStoreById = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from("store").select("*").eq("id", id).single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Error fetching store:", err);
    res.status(500).json({ error: "Failed to fetch store details" });
  }
};

exports.updateStore = async (req, res) => {
  try {
    const { id } = req.params;
    const { auth_user_id, ...updates } = req.body; 

    // 1. Fetch old store data to compare
    const { data: oldStore } = await supabase.from("store").select("*").eq("id", id).single();

    // 2. Perform the update
    const { data: newStore, error } = await supabase
      .from("store")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // 3. Evaluate changes and log them exactly as requested
    if (auth_user_id) {
      const logs = [];
      const baseLog = { users_id: auth_user_id, store_id: id, action: "Updating" };

      // --- Threshold Logs ---
      if (updates.low_stock_param !== undefined && updates.low_stock_param !== oldStore.low_stock_param) {
        logs.push({ ...baseLog, area: "System Settings", item: "Threshold", summary: `Updated low stock threshold (${oldStore.low_stock_param} -> ${updates.low_stock_param})` });
      }
      if (updates.expiration_param !== undefined && updates.expiration_param !== oldStore.expiration_param) {
        logs.push({ ...baseLog, area: "System Settings", item: "Threshold", summary: `Updated expiration date threshold (${oldStore.expiration_param} -> ${updates.expiration_param})` });
      }

      // --- Shop Details Logs ---
      if (updates.store_name && updates.store_name !== oldStore.store_name) logs.push({ ...baseLog, area: "System Settings", item: "Shop Details", summary: "Updated Store Name" });
      if (updates.building && updates.building !== oldStore.building) logs.push({ ...baseLog, area: "System Settings", item: "Shop Details", summary: "Updated Building" });
      if (updates.street && updates.street !== oldStore.street) logs.push({ ...baseLog, area: "System Settings", item: "Shop Details", summary: "Updated Street" });
      if (updates.barangay && updates.barangay !== oldStore.barangay) logs.push({ ...baseLog, area: "System Settings", item: "Shop Details", summary: "Updated Barangay" });
      if (updates.city && updates.city !== oldStore.city) logs.push({ ...baseLog, area: "System Settings", item: "Shop Details", summary: "Updated City" });
      if (updates.province && updates.province !== oldStore.province) logs.push({ ...baseLog, area: "System Settings", item: "Shop Details", summary: "Updated Province" });

      // Fire off all generated logs concurrently
      for (const log of logs) await logAudit(log);
    }

    res.json({ message: "Store updated successfully", store: newStore });
  } catch (err) {
    console.error("Error updating store:", err);
    res.status(500).json({ error: "Failed to update store" });
  }
};