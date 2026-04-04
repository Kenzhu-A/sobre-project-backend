const supabase = require("../config/supabase");
const { logAudit } = require("../utils/auditLogger");

exports.getSalesHistory = async (req, res) => {
  try {
    const { store_id } = req.query;
    if (!store_id) return res.status(400).json({ error: "Unauthorized: store_id is required." });

    const { data, error } = await supabase
      .from("receipts")
      .select(`*, users:user_id ( username, photo )`)
      .eq("store_id", store_id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sales history" });
  }
};

exports.getSaleDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: receipt, error: receiptError } = await supabase.from("receipts").select(`*, users:user_id ( username )`).eq("id", id).single();
    if (receiptError) throw receiptError;

    const { data: items, error: itemsError } = await supabase.from("sales").select("*").eq("receipt_id", id);
    if (itemsError) throw itemsError;

    res.json({ receipt, items });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sale details" });
  }
};

exports.createSale = async (req, res) => {
  try {
    const { store_id, user_id, subtotal, discount, total_price, amount_tendered, change, cart } = req.body;
    const invoice_no = `INV-${Date.now()}`;
    const total_items = cart.reduce((sum, item) => sum + item.totalQuantity, 0);

    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .insert({ store_id, user_id, invoice_no, subtotal, discount, total_price, amount_tendered, change, total_items })
      .select().single();
    if (receiptError) throw receiptError;

    const salesItems = cart.map(item => ({
      receipt_id: receipt.id,
      inventory_id: item.productId,
      product_name: item.name,
      quantity: item.totalQuantity,
      price_at_sale: item.price
    }));

    const { error: salesError } = await supabase.from("sales").insert(salesItems);
    if (salesError) throw salesError;

    res.status(201).json({ message: "Sale successful", receipt });
  } catch (err) {
    res.status(500).json({ error: "Failed to record sale" });
  }
};

// --- VOID ENTIRE SALE ---
exports.voidSale = async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_user_id } = req.body;

    const { data: receipt, error: fetchErr } = await supabase.from("receipts").select("*").eq("id", id).single();
    if (fetchErr) throw fetchErr;

    await supabase.from("sales").delete().eq("receipt_id", id);
    await supabase.from("receipts").delete().eq("id", id);

    if (admin_user_id) {
      await logAudit({
        users_id: admin_user_id,
        store_id: receipt.store_id,
        area: "Sales",
        action: "Deleting", // FIX: Changed to Deleting
        item: "Sales Record",
        summary: "Sales Voided"
      });
    }

    res.json({ message: "Sale voided successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to void sale" });
  }
};

// --- VOID PARTIAL SALE (SINGLE ITEM) ---
exports.voidSaleItem = async (req, res) => {
  try {
    const { receiptId, itemId } = req.params;
    const { admin_user_id } = req.body;

    const { data: item, error: itemErr } = await supabase.from("sales").select("*").eq("id", itemId).single();
    if (itemErr) throw itemErr;

    const { data: receipt, error: recErr } = await supabase.from("receipts").select("*").eq("id", receiptId).single();
    if (recErr) throw recErr;

    const itemTotal = item.price_at_sale * item.quantity;
    const newSubtotal = receipt.subtotal - itemTotal;
    const newTotalItems = receipt.total_items - item.quantity;
    const newTotalPrice = Math.max(0, newSubtotal - receipt.discount);

    if (newTotalItems <= 0) {
      await supabase.from("sales").delete().eq("receipt_id", receiptId);
      await supabase.from("receipts").delete().eq("id", receiptId);
      
      if (admin_user_id) {
        await logAudit({
          users_id: admin_user_id, store_id: receipt.store_id, area: "Sales", action: "Deleting", item: "Sales Record", summary: "Sales Voided" // FIX: Changed to Deleting
        });
      }
      return res.json({ message: "Last item voided, entire sale voided." });
    }

    await supabase.from("sales").delete().eq("id", itemId);
    
    await supabase.from("receipts").update({
      subtotal: newSubtotal,
      total_items: newTotalItems,
      total_price: newTotalPrice
    }).eq("id", receiptId);

    if (admin_user_id) {
      await logAudit({
        users_id: admin_user_id,
        store_id: receipt.store_id,
        area: "Sales",
        action: "Deleting", // FIX: Changed to Deleting
        item: "Sales Record",
        summary: `${item.product_name} voided`
      });
    }

    res.json({ message: "Item voided successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to void item" });
  }
};