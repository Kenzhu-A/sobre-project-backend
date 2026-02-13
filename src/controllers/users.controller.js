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
    const { 
      auth_user_id, username, role, phone, photo, 
      store_name, building, street, barangay, city, province 
    } = req.body;

    if (!auth_user_id) return res.status(400).json({ error: "auth_user_id required" });

    // STEP A: Insert Store Information First
    // (We create the store so we can get the store_id to link to the user)
    const { data: storeData, error: storeError } = await supabase
      .from("store")
      .insert({
        store_name,
        building,   // Nullable
        street,
        barangay,
        city,
        province,
        // user_id: auth_user_id // Include this if your store table has a user_id FK as per prompt Step 2
      })
      .select()
      .single();

    if (storeError) {
      console.error("Store Create Error:", storeError);
      return res.status(400).json({ error: "Failed to create store record." });
    }

    // STEP B: Insert User Profile linked to that Store
    const { data: userData, error: userError } = await supabase
      .from("users")
      .upsert(
        {
          auth_user_id,
          username: username || 'Manager',
          role: role || 'manager',
          phone,
          photo,
          store_id: storeData.id // Link the user to the newly created store
        },
        { onConflict: 'auth_user_id' }
      )
      .select()
      .single();

    if (userError) {
      console.error("User Create Error:", userError);
      // Optional: Logic to delete the orphaned store could go here
      return res.status(400).json({ error: "Failed to create user profile." });
    }

    res.json({ user: userData, store: storeData });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};