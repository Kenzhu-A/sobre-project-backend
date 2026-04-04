const supabase = require("../config/supabase");
const { uploadBase64Image } = require("../utils/uploadImage");
const { validate: isUuid } = require("uuid");
const { logAudit } = require("../utils/auditLogger"); // <-- Imported auditLogger

// ==========================================
// CONTROLLERS
// ==========================================

exports.getInventory = async (req, res) => {
  try {
    const {
      store_id,
      category,
      supplier,
      restock_needed,
      expiry_status,
      search,
      sortBy = "created_at",
      order = "desc",
      page = 1,
      limit = 20,
    } = req.query;

    const toArray = (param) => {
      if (!param) return undefined;
      return Array.isArray(param) ? param : [param];
    };

    const filters = {
      store_id: store_id,
      category: toArray(category),
      supplier: toArray(supplier),
      search: search,
      sortBy: sortBy,
      order: order,
      restock_needed: restock_needed ? restock_needed === "true" : undefined,
      expiry_status: expiry_status ? expiry_status === "true" : undefined,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };

    let query = supabase
      .from("v_inventory_status")
      .select("*, stock(*)", { count: "exact" });

    if (filters.store_id) {
      query = query.eq("store_id", store_id);
    }

    if (filters.search) {
      query = query.ilike("name", `%${filters.search}%`);
    }

    if (typeof filters.restock_needed === "boolean") {
      query = query.eq("is_restock_needed", filters.restock_needed);
    }

    if (typeof filters.expiry_status === "boolean") {
      query = query.eq("is_expiring_soon", filters.expiry_status);
    }

    if (filters.category && filters.category.length > 0) {
      query = query.in("category", filters.category);
    }

    if (filters.supplier && filters.supplier.length > 0) {
      query = query.in("supplier", filters.supplier);
    }

    query = query.order(sortBy, { ascending: filters.order == "asc" });

    const from = (filters.page - 1) * filters.limit;
    const to = from + filters.limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    return res.status(200).json({
      data,
      meta: {
        total_count: count,
        page: filters.page,
        limit: filters.limit,
      },
    });
  } catch (error) {
    console.error("Error fetching inventory!", error);
    res.status(500).json({ error: "Failed to fetch inventory." });
  }
};

exports.getInventoryIndiv = async (req, res) => {
  try {
    const { id } = req.params;
    let query = supabase.from("inventory").select("*").eq("id", id).single();
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Error fetching inventory!", err);
    res.status(500).json({ error: "Failed to fetch inventory." });
  }
};

exports.createInventory = async (req, res) => {
  try {
    const { store_id, name, category, cost, price, supplier, photo } = req.body;
    
    // Grab users_id from the URL query
    const userId = req.query.users_id;

    if (
      !store_id ||
      !name ||
      !category ||
      cost <= 0 ||
      price <= 0 ||
      !supplier
    ) {
      return res
        .status(400)
        .json({
          error:
            "Name, Category, Cost, Price, and Supplier are required fields.",
        });
    }

    const photoUrl = await uploadBase64Image(photo);

    const { data, error } = await supabase
      .from("inventory")
      .insert([
        {
          store_id,
          name,
          category,
          cost,
          price,
          supplier,
          photo: photoUrl,
        },
      ])
      .select("*")
      .single();

    if (error) throw error;

    // --- LOG AUDIT ---
    if (userId) {
      await logAudit({
        users_id: userId,
        store_id: data.store_id,
        inventory_id: data.id,
        area: "Inventory",
        action: "Adding",
        item: data.name,
        summary: "Added new product"
      });
    }

    res.status(201).json(data);
  } catch (err) {
    console.error("Error creating new item!", err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.updateInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    const userId = req.query.users_id;

    // Failsafe: Remove users_id if it somehow got into the updates object so it doesn't crash Supabase
    delete updates.users_id;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Fetch old data to compare differences for the summary
    const { data: oldData, error: fetchError } = await supabase
      .from("inventory")
      .select("*")
      .eq("id", id)
      .single();
      
    if (fetchError) throw fetchError;

    if (updates.photo && updates.photo.startsWith("data:image")) {
      updates.photo = await uploadBase64Image(updates.photo);
    }

    const { data, error } = await supabase
      .from("inventory")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    // --- LOG AUDIT ---
    if (userId && oldData) {
      let summaryParts = [];
      if (oldData.name !== data.name) summaryParts.push(`Name: ${oldData.name} -> ${data.name}`);
      if (oldData.category !== data.category) summaryParts.push(`Category: ${oldData.category} -> ${data.category}`);
      if (oldData.price !== data.price) summaryParts.push(`Price: ₱${Number(oldData.price).toFixed(2)} -> ₱${Number(data.price).toFixed(2)}`);
      if (oldData.cost !== data.cost) summaryParts.push(`Cost: ₱${Number(oldData.cost).toFixed(2)} -> ₱${Number(data.cost).toFixed(2)}`);
      if (oldData.discount !== data.discount) summaryParts.push(`Discount: ${oldData.discount}% -> ${data.discount}%`);
      if (updates.photo && oldData.photo !== data.photo) summaryParts.push(`Updated Photo`);

      let summary = summaryParts.length > 0 ? summaryParts.join(", ") : "Updated product details";

      await logAudit({
        users_id: userId,
        store_id: data.store_id,
        inventory_id: id,
        area: "Inventory",
        action: "Updating",
        item: data.name, 
        summary: summary
      });
    }

    res.json(data);
  } catch (err) {
    console.error("Error updating inventory", err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.users_id;

    if (!id || !isUuid(id)) {
      return res.status(400).json({ error: "Invalid item ID format." });
    }

    // Fetch details before deleting so we know what item was deleted
    const { data: oldItem } = await supabase
      .from("inventory")
      .select("name, store_id")
      .eq("id", id)
      .single();

    const { data, error } = await supabase
      .from("inventory")
      .delete()
      .eq("id", id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res
        .status(404)
        .json({ error: "Item not found or already deleted." });
    }

    // --- LOG AUDIT ---
    if (userId && oldItem) {
      await logAudit({
        users_id: userId,
        store_id: oldItem.store_id,
        inventory_id: id,
        area: "Inventory",
        action: "Deleting",
        item: oldItem.name,
        summary: "Deleted product"
      });
    }

    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("Error deleting entry.", err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.getSuppliers = async (req, res) => {
  try {
    const { store_id } = req.params;
    let query = supabase
      .from("inventory")
      .select("supplier", { distinct: true });
    if (store_id) query = query.eq("store_id", store_id);

    const { data, error } = await query;
    if (error) throw error;

    const uniqueSuppliers = [
      ...new Set(data.map((s) => s.supplier.trim())),
    ].map((supplier) => ({ supplier }));
    res.json(uniqueSuppliers);
  } catch (err) {
    console.error("Error fetching list of suppliers!", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const { store_id } = req.query;
    let query = supabase
      .from("inventory")
      .select("category", { distinct: true });
    if (store_id) query = query.eq("store_id", store_id);

    const { data, error } = await query;
    if (error) throw error;

    const uniqueCategories = [
      ...new Set(data.map((s) => s.category.trim())),
    ].map((category) => ({ category }));
    res.json(uniqueCategories);
  } catch (err) {
    console.error("Error fetching list of categories!", err);
    res.status(500).json({ error: err.message });
  }
};