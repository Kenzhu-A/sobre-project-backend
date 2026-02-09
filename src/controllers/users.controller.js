const supabase = require("../config/supabase");


// Get all users (admin use)
exports.getUsers = async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("*");

  if (error) return res.status(400).json(error);

  res.json(data);
};



// Get single user
exports.getUserById = async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", id)
    .single();

  if (error) return res.status(400).json(error);

  res.json(data);
};


// Create profile after signup
// Replace your createUserProfile function with this:
exports.createUserProfile = async (req, res) => {
  try {
    const { auth_user_id, username, role, phone, photo, establishment, location } = req.body;

    if (!auth_user_id) return res.status(400).json({ error: "auth_user_id required" });

    const { data, error } = await supabase
      .from("users")
      .upsert(
        {
          auth_user_id,
          username: username || 'User',
          role: role || 'manager', // Default to manager
          phone,
          photo,
          establishment, // New field
          location      // New field
        },
        { onConflict: 'auth_user_id' }
      )
      .select()
      .single();

    if (error) return res.status(400).json(error);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};