const supabase = require("../config/supabase");
const { generatePDF } = require("../utils/pdfGenerator");
const { uploadBase64Image } = require("../utils/uploadImage");
const {
  getHeaderTemplate,
  getFooterTemplate,
  buildReportHTML,
} = require("../utils/pdfTemplates");
const { formatDate, formatCurrency } = require("../utils/formatters");
const { getReportMetaData, evaluateExpiry } = require("../utils/reportHelpers");
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
      query = query.in("primary_supplier", filters.supplier);
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
    const { store_id, name, category, cost, price, primary_supplier, photo } =
      req.body;

    if (
      !store_id ||
      !name ||
      !category ||
      cost <= 0 ||
      price <= 0 ||
      !primary_supplier
    ) {
      return res.status(400).json({
        error: "Name, Category, Cost, Price, and Supplier are required fields.",
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
          primary_supplier,
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

    // 1. Fetch primary suppliers from the inventory blueprint
    let invQuery = supabase.from("inventory").select("primary_supplier");

    if (store_id) invQuery = invQuery.eq("store_id", store_id);

    // 2. Fetch batch suppliers from the stock history
    // We use !inner to force an inner join, filtering stock by the parent inventory's store_id
    let stockQuery = supabase
      .from("stock")
      .select("supplier, inventory!inner(store_id)");

    if (store_id) stockQuery = stockQuery.eq("inventory.store_id", store_id);

    // Execute both queries concurrently for better performance
    const [invResult, stockResult] = await Promise.all([invQuery, stockQuery]);

    if (invResult.error) throw invResult.error;
    if (stockResult.error) throw stockResult.error;

    // 3. Extract, clean, and merge the arrays
    const invSuppliers = invResult.data
      .map((s) => s.primary_supplier?.trim())
      .filter(Boolean);

    const stockSuppliers = stockResult.data
      .map((s) => s.supplier?.trim())
      .filter(Boolean);

    // 4. Deduplicate using a Set and map back to the expected object structure
    const uniqueSuppliers = [...new Set([...invSuppliers, ...stockSuppliers])]
      .sort((a, b) => a.localeCompare(b)) // Optional: Alphabetize the list
      .map((supplier) => ({ supplier }));

    res.json(uniqueSuppliers);
  } catch (err) {
    console.error("Error fetching combined list of suppliers!", err);
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

// --- Controller 1: Operational Inventory Report ---
exports.getInventoryOperationalPDF = async (req, res) => {
  try {
    const { user, store, generationDate, today } = await getReportMetaData(req);

    const { data: inventory, error: invError } = await supabase
      .from("v_stock_inventory_details")
      .select("*")
      .eq("store_id", user.store_id);
    if (invError) throw invError;

    const summary = {
      inStock: 0,
      lowStock: 0,
      outOfStock: 0,
      safe: 0,
      nearExpiry: 0,
      expired: 0,
    };
    let tableRowsHTML = "";

    inventory.forEach((item) => {
      // Evaluate Stock
      let stockStatus = "In Stock";
      let stockColor = "#d4edda";
      if (item.amount === 0) {
        stockStatus = "Out of Stock";
        stockColor = "#e8b8b8";
        summary.outOfStock++;
      } else if (item.amount <= store.low_stock_param) {
        stockStatus = "Low Stock";
        stockColor = "#fcf0c2";
        summary.lowStock++;
      } else {
        summary.inStock++;
      }

      // Evaluate Expiry
      const expiry = evaluateExpiry(
        item.expiry_date,
        today,
        store.expiration_param,
      );
      if (expiry.isExpired) summary.expired++;
      else if (expiry.isNear) summary.nearExpiry++;
      else if (expiry.status === "Safe") summary.safe++;

      tableRowsHTML += `
        <tr>
          <td class="border border-gray-700 p-2 text-center font-bold bg-[${stockColor}]">${stockStatus}</td>
          <td class="border border-gray-700 p-2 text-center">${item.sku || "N/A"}</td>
          <td class="border border-gray-700 p-2 text-left">${item.name || "N/A"}</td>
          <td class="border border-gray-700 p-2 text-center">${item.amount}</td>
          <td class="border border-gray-700 p-2 text-center">${item.barcode || "N/A"}</td>
          <td class="border border-gray-700 p-2 text-center font-bold bg-[${expiry.color}]">${expiry.status}</td>
          <td class="border border-gray-700 p-2 text-center">${formatDate(item.expiry_date)}</td>
          <td class="border border-gray-700 p-2 text-center">${formatDate(item.restock_date)}</td>
          <td class="border border-gray-700 p-2 text-center">${item.sales_today || 0}</td>
          <td class="border border-gray-700 p-2 text-center">${item.recommended_restock || 0}</td>
        </tr>
      `;
    });

    const tableHeadersHTML = `
      <th class="w-[8%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Stock Status</th>
      <th class="w-[8%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">SKU</th>
      <th class="w-[18%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Name</th>
      <th class="w-[7%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Amount</th>
      <th class="w-[12%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Barcode</th>
      <th class="w-[9%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Expiry Status</th>
      <th class="w-[9%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Expiry Date</th>
      <th class="w-[9%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Restock Date</th>
      <th class="w-[8%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Sales for Today</th>
      <th class="w-[12%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Recommended Restock</th>
    `;

    const summaryHTML = `
      <div class="grid grid-cols-2 gap-x-10 gap-y-2.5 w-[80%] text-[11px]">
        <div class="flex justify-between font-bold"><span>Total Items In Stock:</span> <span>${summary.inStock}</span></div>
        <div class="flex justify-between font-bold"><span>Total Items Far from Expiry:</span> <span>${summary.safe}</span></div>
        <div class="flex justify-between font-bold"><span>Total Low Stock Items:</span> <span>${summary.lowStock}</span></div>
        <div class="flex justify-between font-bold"><span>Total Items Near Expiry:</span> <span>${summary.nearExpiry}</span></div>
        <div class="flex justify-between font-bold"><span>Total Out of Stock Items:</span> <span>${summary.outOfStock}</span></div>
        <div class="flex justify-between font-bold"><span>Total Items Expired:</span> <span>${summary.expired}</span></div>
      </div>
    `;

    const bodyHTML = buildReportHTML(
      "Operational Inventory Report",
      tableHeadersHTML,
      tableRowsHTML,
      summaryHTML,
    );
    const headerHTML = getHeaderTemplate(
      store.store_name,
      user.username,
      user.role,
      generationDate,
    );

    const pdfBuffer = await generatePDF(bodyHTML, {
      landscape: true,
      displayHeaderFooter: true,
      headerTemplate: headerHTML,
      footerTemplate: getFooterTemplate(),
      margin: { top: "140px", bottom: "60px", left: "40px", right: "40px" },
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition":
        'inline; filename="Operational_Inventory_Report.pdf"',
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Error exporting Operational PDF", err);
    res.status(500).json({ error: err.message });
  }
};

// --- Controller 2: Financial Inventory Value Report ---
exports.getInventoryFinancialPDF = async (req, res) => {
  try {
    const { user, store, generationDate, today } = await getReportMetaData(req);

    const { data: inventory, error: invError } = await supabase
      .from("v_stock_inventory_details")
      .select("*")
      .eq("store_id", user.store_id);
    if (invError) throw invError;

    const summary = { totalValue: 0, sellableValue: 0, expiredValue: 0 };
    let tableRowsHTML = "";

    inventory.forEach((item) => {
      const expiry = evaluateExpiry(
        item.expiry_date,
        today,
        store.expiration_param,
      );

      const itemInventoryValue = Number(item.inventory_value) || 0;
      summary.totalValue += itemInventoryValue;
      if (expiry.isExpired) {
        summary.expiredValue += itemInventoryValue;
      } else {
        summary.sellableValue += itemInventoryValue;
      }

      tableRowsHTML += `
        <tr>
          <td class="border border-gray-700 p-2 text-center">${item.sku || "N/A"}</td>
          <td class="border border-gray-700 p-2 text-left">${item.name || "N/A"}</td>
          <td class="border border-gray-700 p-2 text-center">${item.amount}</td>
          <td class="border border-gray-700 p-2 text-center">${formatCurrency(item.cost_per_item)}</td>
          <td class="border border-gray-700 p-2 text-center font-bold">${formatCurrency(itemInventoryValue)}</td>
          <td class="border border-gray-700 p-2 text-center">${formatCurrency(item.price_per_item)}</td>
          <td class="border border-gray-700 p-2 text-center">${item.supplier || "N/A"}</td>
          <td class="border border-gray-700 p-2 text-center font-mono">${item.barcode || "N/A"}</td>
          <td class="border border-gray-700 p-2 text-center font-bold bg-[${expiry.color}]">${expiry.status}</td>
          <td class="border border-gray-700 p-2 text-center">${formatDate(item.expiry_date)}</td>
        </tr>
      `;
    });

    const tableHeadersHTML = `
      <th class="w-[8%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">SKU</th>
      <th class="w-[16%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Name</th>
      <th class="w-[7%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Amount</th>
      <th class="w-[9%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Cost Per<br/>Item</th>
      <th class="w-[10%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Total<br/>Inventory<br/>Value</th>
      <th class="w-[9%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Price<br/>Per<br/>Item</th>
      <th class="w-[14%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Supplier</th>
      <th class="w-[10%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Barcode</th>
      <th class="w-[8%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Expiry<br/>Status</th>
      <th class="w-[9%] border border-gray-700 p-2 text-center bg-[#174276] text-white font-bold">Expiry Date</th>
    `;

    const summaryHTML = `
      <div class="flex flex-col gap-2.5 w-[35%] text-[11px]">
        <div class="flex justify-between font-bold"><span>Total Inventory Value:</span> <span>${formatCurrency(summary.totalValue)}</span></div>
        <div class="flex justify-between font-bold"><span>Sellable Inventory Value:</span> <span>${formatCurrency(summary.sellableValue)}</span></div>
        <div class="flex justify-between font-bold"><span>Expired / Non-Sellable Value:</span> <span>${formatCurrency(summary.expiredValue)}</span></div>
      </div>
    `;

    const bodyHTML = buildReportHTML(
      "Financial Inventory Value Report",
      tableHeadersHTML,
      tableRowsHTML,
      summaryHTML,
    );
    const headerHTML = getHeaderTemplate(
      store.store_name,
      user.username,
      user.role,
      generationDate,
    );

    const pdfBuffer = await generatePDF(bodyHTML, {
      landscape: true,
      displayHeaderFooter: true,
      headerTemplate: headerHTML,
      footerTemplate: getFooterTemplate(),
      margin: { top: "140px", bottom: "60px", left: "40px", right: "40px" },
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition":
        'inline; filename="Financial_Inventory_Report.pdf"',
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Error exporting Financial PDF", err);
    res.status(500).json({ error: err.message });
  }
};

exports.importCSV = async (req, res) => {
  try {
    const userId = req.query.users_id;
    const { updates = [], newItems = [], supplier } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing users_id parameter." });
    }

    // 1. Resolve Store ID
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("store_id")
      .eq("auth_user_id", userId)
      .single();

    if (userError || !user) {
      return res
        .status(404)
        .json({ error: "Store mapping failed for this user." });
    }
    const storeId = user.store_id;

    const stockPayload = [];

    // 2. Process New Products
    if (newItems.length > 0) {
      const inventoryPayload = newItems.map((item) => ({
        store_id: storeId,
        name: item.name,
        category: item.category,
        primary_supplier: supplier,
        cost: item.cost,
        price: item.sellingPrice,
      }));

      // Insert and return generated IDs to link with the stock table
      const { data: insertedInventory, error: invError } = await supabase
        .from("inventory")
        .insert(inventoryPayload)
        .select("id, name");

      if (invError) throw invError;

      // Map generated inventory IDs to their initial stock batches
      insertedInventory.forEach((dbItem) => {
        const originalItem = newItems.find((n) => n.name === dbItem.name);
        if (originalItem && originalItem.amount > 0) {
          stockPayload.push({
            inventory_id: dbItem.id,
            amount: originalItem.amount,
            expiry_date: originalItem.expiryDate || null,
            supplier: supplier, // CORRECTED KEY
          });
        }
      });
    }

    // 3. Process Stock Updates for Existing Products
    if (updates.length > 0) {
      updates.forEach((update) => {
        if (update.amount > 0) {
          stockPayload.push({
            inventory_id: update.inventoryId,
            amount: update.amount,
            expiry_date: update.expiryDate || null,
            supplier: supplier, // CORRECTED KEY
          });
        }
      });
    }

    // 4. Execute Bulk Stock Insertion
    if (stockPayload.length > 0) {
      const { error: stockError } = await supabase
        .from("stock")
        .insert(stockPayload);

      if (stockError) throw stockError;
    }

    return res.status(200).json({
      message: "Import successful",
      metrics: {
        newItemsCreated: newItems.length,
        stockBatchesAdded: stockPayload.length,
      },
    });
  } catch (error) {
    console.error("CSV Import Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to process CSV import.",
    });
  }
};
