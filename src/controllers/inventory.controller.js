const supabase = require("../config/supabase");

exports.getInventory = async(req, res) => {
    try {
        const { store_id } = req.query;

        let query = supabase
        .from("inventory")
        .select("*")
        .order("created_at", {ascending: false});

        if (store_id) {
            query = query.eq("store_id", store_id);
        }

        const  { data, error } = await query;

        if (error) throw error;
        res.json(data)
    } catch (error) {
        console.error("Error fecthing inventory!", err);
        res.status(500).json({error: "Failed to fetch inventory."})
    }
}