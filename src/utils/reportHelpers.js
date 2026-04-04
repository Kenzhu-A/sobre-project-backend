const supabase = require("../config/supabase");

/**
 * Fetches standard user, store, and timestamp data needed for report headers.
 */
exports.getReportMetaData = async (req) => {
  // Use optional chaining to safely check query then body
  const userId = req.query?.user_id || req.body?.user_id;
  if (!userId) throw new Error("user_id is required");

  // Fetch User
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("username, role, store_id")
    .eq("auth_user_id", userId) 
    .single();
  if (userError || !user) throw new Error("User not found");

  // Fetch Store
  const { data: store, error: storeError } = await supabase
    .from("store")
    .select("store_name, low_stock_param, expiration_param")
    .eq("id", user.store_id)
    .single();
  if (storeError || !store) throw new Error("Store not found");

  // Format Generation Date
  const generationDate = new Date().toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return { user, store, generationDate, today };
};

/**
 * Standardized logic for determining if an item is safe, near expiry, or expired.
 */
exports.evaluateExpiry = (expiryDate, today, expirationParam) => {
  if (!expiryDate) return { status: "N/A", color: "#ffffff", isExpired: false, isNear: false };
  
  const expDate = new Date(expiryDate);
  const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { status: "Expired", color: "#e8b8b8", isExpired: true, isNear: false };
  if (diffDays <= expirationParam) return { status: "Near Expiry", color: "#fcf0c2", isExpired: false, isNear: true };
  return { status: "Safe", color: "#d4edda", isExpired: false, isNear: false };
};