const supabase = require("../config/supabase");
const { logAudit } = require("../utils/auditLogger");

exports.getAuditLogs = async (req, res) => {
  try {
    const { store_id } = req.query;
    if (!store_id) return res.status(400).json({ error: "store_id is required" });

    const { data, error } = await supabase
      .from("audit_logs")
      .select(`*, users!audit_logs_users_id_fkey(username, photo)`)
      .eq("store_id", store_id)
      .order("date", { ascending: false })
      .order("timestamp", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
};

// For direct logging from frontend pages (like POS and Profile)
exports.createAuditLog = async (req, res) => {
  try {
    // FIX: Added receipt_id here so it actually gets saved to Supabase!
    const { users_id, store_id, area, action, item, summary, receipt_id } = req.body;
    
    await logAudit({ users_id, store_id, area, action, item, summary, receipt_id });
    
    res.status(201).json({ message: "Logged successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to log" });
  }
};