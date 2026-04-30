const supabase = require("../config/supabase");
const { logAudit } = require("../utils/auditLogger"); // <-- Imported auditLogger

exports.getStockByInventory = async (req, res) => {
  try {
    const { id } = req.params;

    let query = supabase
      .from("stock")
      .select("*")
      .eq("inventory_id", id)
      .order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("Error fetching stock item!", err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.createStock = async (req, res) => {
  try {
    const userId = req.query.users_id; // <-- ADD THIS LINE
    const { expiry_date, amount, inventory_id, supplier } = req.body;

    // STRICT VALIDATION: supplier is now mandatory
    if (!inventory_id || !amount || !supplier || String(supplier).trim() === "") {
      return res.status(400).json({ error: "Inventory ID, amount, and supplier are required." });
    }

    let query = supabase
      .from("stock")
      .insert([{ 
        expiry_date: expiry_date || null, // Expiry remains optional
        amount, 
        inventory_id, 
        supplier: String(supplier).trim() // Safe string injection
      }])
      .select("*")
      .single();

    const { data, error } = await query;
    if (error) throw error;

    // --- LOG AUDIT ---
    if (userId) {
      const { data: inv } = await supabase
        .from("inventory")
        .select("name, store_id")
        .eq("id", inventory_id)
        .single();

      if (inv) {
        await logAudit({
          users_id: userId,
          store_id: inv.store_id,
          inventory_id: inventory_id,
          area: "Inventory",
          action: "Adding",
          item: inv.name,
          summary: "Added new batch"
        });
      }
    }

    res.status(201).json(data);
  } catch (err) {
    console.error("Error creating new stock!", err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.updateStock = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    const userId = req.query.users_id;

    // Failsafe cleanup
    delete updates.users_id;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Fetch old stock data to get name and compare amounts
    const { data: oldStock, error: fetchError } = await supabase
      .from("stock")
      .select("amount, inventory_id, inventory(name, store_id)")
      .eq("id", id)
      .single();
    
    if (fetchError) throw fetchError;

    let query = supabase
      .from("stock")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    const { data, error } = await query;

    if (error) throw error;

    // --- LOG AUDIT ---
    if (userId && oldStock && oldStock.amount !== data.amount) {
      await logAudit({
        users_id: userId,
        store_id: oldStock.inventory.store_id,
        inventory_id: oldStock.inventory_id,
        area: "Inventory",
        action: "Updating",
        item: oldStock.inventory.name,
        summary: `Stock: ${oldStock.amount} -> ${data.amount}`
      });
    }

    res.json(data);
  } catch (err) {
    console.error("Error updating stock item!", err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteStock = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.users_id;

    // Fetch old data for logging
    const { data: oldStock } = await supabase
      .from("stock")
      .select("amount, inventory_id, inventory(name, store_id)")
      .eq("id", id)
      .single();

    let query = supabase.from("stock").delete().eq("id", id);

    const { error } = await query;

    if (error) throw error;

    // --- LOG AUDIT ---
    if (userId && oldStock) {
      await logAudit({
        users_id: userId,
        store_id: oldStock.inventory.store_id,
        inventory_id: oldStock.inventory_id,
        area: "Inventory",
        action: "Deleting",
        item: oldStock.inventory.name,
        summary: "Deleted a batch"
      });
    }

    res.json({ message: "Deleted Successfuly" });
  } catch (err) {
    console.error("Error deleting stock item!", err);
    res.status(500).json({ error: err.message });
  }
};

exports.POSUpdate = async (req, res) => {
  try {
    const { items } = req.body;

    // Length Validation
    if (!Array.isArray(items) || items.length === 0 || !items) {
      return res.status(400).json({
        error: "Invalid items array",
      });
    }

    // Schema Validation
    const isValidSchema = items.every(
      (item) =>
        typeof item.id === "string" &&
        item.id.trim() !== "" &&
        typeof item.amount === "number" &&
        item.amount > 0,
    );

    if (!isValidSchema) {
      return res.status(400).json({
        error:
          "Malformed payload. Each item requires a valid UUID 'id' and a positive number 'amount'.",
      });
    }

    // Database Transaction
    const { error } = await supabase.rpc("process_sales_transaction", {
      payload: items,
    });

    if (error) throw error;

    res.json({
      message: "POS update completed",
    });
  } catch (err) {
    console.error("POS Updates failed!", err);
    res.status(500).json({ error: err.message });
  }
};