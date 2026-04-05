const supabase = require("../config/supabase");
const { logAudit } = require("../utils/auditLogger");

exports.getSalesHistory = async (req, res) => {
  try {
    const { store_id } = req.query;
    if (!store_id) return res.status(400).json({ error: "Unauthorized: store_id is required." });

    // We use a Supabase Join to get the receipt, the items sold, and their base cost from inventory
    const { data, error } = await supabase
      .from("receipts")
      .select(`
        *,
        users:user_id ( username, photo ),
        sales (
          quantity,
          inventory ( cost )
        )
      `)
      .eq("store_id", store_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Join Error:", error);
      throw error;
    }

    // Calculate total cost for each receipt
    const receiptsWithCost = data.map(receipt => {
      let total_cost = 0;
      
      if (receipt.sales && Array.isArray(receipt.sales)) {
        receipt.sales.forEach(sale => {
          // Fallback to 0 if inventory item was deleted
          const cost = sale.inventory?.cost || 0; 
          total_cost += cost * sale.quantity;
        });
      }
      
      // Remove the raw sales array to keep the payload clean
      const { sales, ...rest } = receipt;
      return {
        ...rest,
        total_cost
      };
    });

    res.json(receiptsWithCost);
  } catch (err) {
    console.error(err);
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

// Record a New Sale (Checkout)
exports.createSale = async (req, res) => {
  try {
    const { store_id, user_id, subtotal, discount, total_price, amount_tendered, change, cart } = req.body;

    if (!store_id || !cart || cart.length === 0) {
      return res.status(400).json({ error: "Missing required fields or empty cart." });
    }

    // 1. Generate Philippine-Specific Invoice Number via our RPC
    const { data: invoice_no, error: invoiceError } = await supabase
      .rpc("generate_next_invoice_no", { p_store_id: store_id });

    if (invoiceError) {
        console.error("RPC Error:", invoiceError);
        throw invoiceError;
    }

    const total_items = cart.reduce((sum, item) => sum + item.totalQuantity, 0);

    // 2. Create Receipt with the real invoice number
    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .insert([{ 
        store_id, 
        user_id: user_id || null, 
        invoice_no, 
        subtotal, 
        discount, 
        total_price, 
        total_items 
      }])
      .select()
      .single();

    if (receiptError) throw receiptError;

    // 3. Insert Line Items into Sales Table
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

    // 4. Deduct Stock
    const stockUpdates = [];
    for (const item of cart) {
      for (const variation of item.variations) {
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
    
    await Promise.all(stockUpdates);

    res.status(201).json({ message: "Sale recorded successfully", receipt });
  } catch (err) {
    console.error("Error recording sale:", err);
    res.status(500).json({ error: "Failed to record sale", details: err.message });
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
        action: "Deleting",
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
          users_id: admin_user_id, store_id: receipt.store_id, area: "Sales", action: "Deleting", item: "Sales Record", summary: "Sales Voided" 
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
        action: "Deleting", 
        item: "Sales Record",
        summary: `${item.product_name} voided`
      });
    }

    res.json({ message: "Item voided successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to void item" });
  }
};