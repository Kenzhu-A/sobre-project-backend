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

// Record a New Sale (Checkout)
exports.createSale = async (req, res) => {
  try {
    const { store_id, user_id, subtotal, discount, total_price, cart } = req.body;

    if (!store_id || !cart || cart.length === 0) {
      return res.status(400).json({ error: "Missing required fields or empty cart." });
    }

    // 1. Generate Invoice Number & Create Receipt
    const invoice_no = `INV-${Math.floor(Date.now() / 1000)}`;
    const total_items = cart.reduce((sum, item) => sum + item.totalQuantity, 0);

    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .insert([{ 
        store_id, 
        user_id: user_id || null, // Nullable if no user is logged in
        invoice_no, 
        subtotal, 
        discount, 
        total_price, 
        total_items 
      }])
      .select()
      .single();

    if (receiptError) throw receiptError;

    // 2. Insert Line Items into Sales Table
    const salesPayload = cart.map(item => ({
      receipt_id: receipt.id,
      inventory_id: item.productId,
      product_name: item.name,
      quantity: item.totalQuantity,
      price_at_sale: item.price
    }));

    const { error: salesError } = await supabase
      .from("sales")
      .insert(salesPayload);

    if (salesError) throw salesError;

    // 3. Deduct Stock from Variations
    const stockUpdates = [];
    for (const item of cart) {
      for (const variation of item.variations) {
        // Fetch current stock to subtract accurately
        const { data: stockData } = await supabase
          .from("stock")
          .select("amount")
          .eq("id", variation.stockId)
          .single();

        if (stockData) {
          const newAmount = Math.max(0, stockData.amount - variation.quantity);
          stockUpdates.push(
            supabase.from("stock").update({ amount: newAmount }).eq("id", variation.stockId)
          );
        }
      }
    }
    
    // Execute all stock deductions simultaneously
    await Promise.all(stockUpdates);

    res.status(201).json({ message: "Sale recorded successfully", receipt });
  } catch (err) {
    console.error("Error recording sale:", err);
    res.status(500).json({ error: "Failed to record sale", details: err.message });
  }
};