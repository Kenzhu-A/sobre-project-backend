const supabase = require("../config/supabase");

exports.getInventory = async(req, res) => {
    try {
        console.log("-----------------------------------------");
        console.log("➡️ API hit: GET /api/inventory");
        
        const { store_id } = req.query;

        let query = supabase
        .from("inventory")
        .select("*, stock(*)")
        .order("created_at", {ascending: false});

        if (store_id) {
            console.log(`Filtering by store_id: ${store_id}`);
            query = query.eq("store_id", store_id);
        }

        console.log("Fetching from Supabase...");
        const { data, error } = await query;

        // If Supabase throws an error, log it specifically!
        if (error) {
            console.error("❌ SUPABASE ERROR:", error);
            throw error;
        }

        console.log(`✅ Success! Found ${data ? data.length : 0} products.`);
        console.log("Data sample:", JSON.stringify(data).substring(0, 200) + "...");
        console.log("-----------------------------------------");
        
        res.json(data);
    } catch (error) {
        console.error("❌ BACKEND CRASH in getInventory:", error.message);
        res.status(500).json({ error: "Failed to fetch inventory.", details: error.message });
    }
}