const supabase = require("../config/supabase");

const logAudit = async ({ users_id, store_id, area, action, item, summary, inventory_id = null, receipt_id = null }) => {
  try {
    // We pass the required data, Supabase handles the date and time automatically
    const { error } = await supabase.from('audit_logs').insert({
      users_id,
      store_id,
      inventory_id,
      receipt_id,
      area,
      action,
      item,
      summary
    });

    if (error) {
      console.error("Supabase Audit Log Error:", error.message);
    }
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
};

module.exports = { logAudit };