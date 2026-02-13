const supabase = require("../config/supabase");

// Get Sales History (Receipts) with User details
exports.getSalesHistory = async (req, res) => {
  try {
    const { store_id } = req.query; // Filter by store

    let query = supabase
      .from("receipts")
      .select(`
        *,
        users:user_id ( username, photo )
      `)
      .order("created_at", { ascending: false });

    if (store_id) {
      query = query.eq("store_id", store_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Error fetching sales:", err);
    res.status(500).json({ error: "Failed to fetch sales history" });
  }
};

// Get Single Sale Details (Receipt + Line Items)
exports.getSaleDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get Receipt Info
    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .select(`*, users:user_id ( username )`)
      .eq("id", id)
      .single();

    if (receiptError) throw receiptError;

    // 2. Get Line Items for this receipt
    const { data: items, error: itemsError } = await supabase
      .from("sales")
      .select("*")
      .eq("receipt_id", id);

    if (itemsError) throw itemsError;

    res.json({ receipt, items });
  } catch (err) {
    console.error("Error fetching details:", err);
    res.status(500).json({ error: "Failed to fetch sale details" });
  }
};

// Void a Sale (Optional but requested in UI)
exports.voidSale = async (req, res) => {
  try {
    const { id } = req.params;
    // In a real app, you would restore inventory here before deleting
    const { error } = await supabase.from("receipts").delete().eq("id", id);
    if (error) throw error;
    res.json({ message: "Sale voided successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to void sale" });
  }
};