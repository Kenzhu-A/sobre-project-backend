/**
 * Formats a date string into "MMM DD, YYYY" (e.g., Jan 01, 2026)
 */
exports.formatDate = (dateString) => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
};

/**
 * Formats a number into a Philippine Peso currency string
 */
exports.formatCurrency = (amount) => {
  return "P" + Number(amount || 0).toFixed(2);
};