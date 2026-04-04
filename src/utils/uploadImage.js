const supabase = require("../config/supabase");
const { decode } = require("base64-arraybuffer");
const { v4: uuidv4 } = require("uuid");

// ==========================================
// HELPER FUNCTION: Handle Base64 Image Upload
// ==========================================
const uploadBase64Image = async (base64String, bucket = "inventory") => {
  // If no photo is provided, safely return null so the DB entry can proceed without an image
  if (!base64String) return null;

  // Extract base64 content and mime type
  const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error("Invalid base64 image format. Please try uploading again.");
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const extension = mimeType.split('/')[1];
  const filename = `${uuidv4()}.${extension}`; 

  // Decode base64 to ArrayBuffer
  const fileBuffer = decode(base64Data);

  // Upload to Supabase Storage Bucket
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filename, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    console.error("Supabase Storage Upload Error:", uploadError);
    throw new Error("Failed to upload image to storage.");
  }

  // Retrieve the Public URL
  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(filename);

  return publicUrlData.publicUrl;
};

module.exports = { uploadBase64Image }