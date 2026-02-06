// Utility: Normalize pedal name for matching
// This should match the normalization used in scrape-monthly.js
function normalizePedalName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\b(excellent|very good|good|fair|poor|mint|b-stock|demo)\b/gi, " ")
    .replace(/\bcondition\b/gi, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ") // Remove years (matches scraping script)
    .replace(/\([^)]*\)/g, " ") // Remove parentheses content
    .replace(/\[[^\]]*\]/g, " ") // Remove brackets content
    .replace(/[^a-z0-9]+/g, " ") // Replace all non-alphanumeric with space
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();
}

// Utility: Normalize condition string for matching
function normalizeCondition(condition) {
  if (!condition) return null;
  // Convert to title case (first letter uppercase, rest lowercase)
  return condition
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

module.exports = {
  normalizePedalName,
  normalizeCondition,
};
