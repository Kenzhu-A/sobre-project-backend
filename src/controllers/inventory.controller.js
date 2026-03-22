const supabase = require("../config/supabase");
const { uploadBase64Image } = require("../utils/uploadImage");
const { validate: isUuid } = require("uuid");

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

    // Attempt to upload the photo using our helper function.
    // If 'photo' is empty, this safely returns null.
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
          photo: photoUrl, // Save the generated URL (or null if no photo)
        },
      ])
      .select("*")
      .single();

    if (error) throw error;

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

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Check if the frontend sent a new photo as a Base64 string
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

    res.json(data);
  } catch (err) {
    console.error("Error updating inventory", err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteInventory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !isUuid(id)) {
      return res.status(400).json({ error: "Invalid item ID format." });
    }

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
