const puppeteer = require("puppeteer");

/**
 * Generates a PDF buffer from HTML content.
 * * @param {string} htmlContent - The raw HTML string for the body.
 * @param {object} options - Puppeteer PDF options (margins, header, footer, format).
 * @returns {Promise<Buffer>} - The generated PDF buffer.
 */
exports.generatePDF = async (htmlContent, options = {}) => {
  // Use --no-sandbox to prevent crashing in most server/Docker environments
  const browser = await puppeteer.launch({ 
    headless: "new", 
    args: ["--no-sandbox", "--disable-setuid-sandbox"] 
  });

  try {
    const page = await browser.newPage();
    
    // networkidle0 is strictly required so the Tailwind CDN has time to load and apply
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    // Set default standard options, but allow the controller to override them
    const defaultOptions = {
      format: "A4",
      printBackground: true,
      margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
    };

    const pdfBuffer = await page.pdf({ ...defaultOptions, ...options });
    
    return pdfBuffer;
  } finally {
    // A finally block ensures the headless browser ALWAYS closes, preventing memory leaks
    if (browser) {
      await browser.close();
    }
  }
};