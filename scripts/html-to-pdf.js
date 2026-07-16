// HTML to PDF converter using Playwright
// Usage: node scripts/html-to-pdf.js <input.html> <output.pdf>
/* eslint-disable @typescript-eslint/no-require-imports */

const { chromium } = require('playwright')

async function convertToPdf(htmlPath, pdfPath) {
  let browser
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    const page = await browser.newPage()

    // Load the HTML file
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' })

    // Wait for fonts to load
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500)

    // Generate PDF with A4 size
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '1.5cm',
        bottom: '1.5cm',
        left: '1.5cm',
        right: '1.5cm',
      },
      preferCSSPageSize: true,
    })

    console.log(`PDF generated: ${pdfPath}`)
  } catch (error) {
    console.error('Error generating PDF:', error)
    process.exit(1)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

// Get args
const [htmlPath, pdfPath] = process.argv.slice(2)
if (!htmlPath || !pdfPath) {
  console.error('Usage: node html-to-pdf.js <input.html> <output.pdf>')
  process.exit(1)
}

convertToPdf(htmlPath, pdfPath)
