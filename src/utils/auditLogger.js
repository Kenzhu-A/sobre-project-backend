const supabase = require("../config/supabase");

const logAudit = async ({ users_id, store_id, area, action, item, summary, inventory_id = null, receipt_id = null }) => {
  try {
    const now = new Date();
    
    // 1. Generate strict GMT+8 (Asia/Manila) Date
    const dateParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    
    const yyyy = dateParts.find(p => p.type === 'year').value;
    const mm = dateParts.find(p => p.type === 'month').value;
    const dd = dateParts.find(p => p.type === 'day').value;
    const date = `${yyyy}-${mm}-${dd}`;

    // 2. Generate strict GMT+8 (Asia/Manila) Time in 24hr format
    const timeParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(now);

    let hh = timeParts.find(p => p.type === 'hour').value;
    const min = timeParts.find(p => p.type === 'minute').value;
    const sec = timeParts.find(p => p.type === 'second').value;
    if (hh === '24') hh = '00';
    const timestamp = `${hh}:${min}:${sec}`;

    // 3. Insert into Supabase
    const { error } = await supabase.from('audit_logs').insert({
      users_id, store_id, inventory_id, receipt_id,
      area, action, item, summary,
      date, timestamp
    });

    if (error) console.error("Supabase Audit Log Error:", error.message);
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
};

module.exports = { logAudit };