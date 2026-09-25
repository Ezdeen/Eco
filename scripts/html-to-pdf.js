// HTML to PDF converter using Playwright
// Usage: node scripts/html-to-pdf.js <input.html> <output.pdf>
/* eslint-disable @typescript-eslint/no-require-imports */

// Must be set BEFORE `require('playwright')` — Playwright resolves the browser
// install location the moment the module loads. scripts/install-playwright-browser.mjs
// installs Chromium into node_modules/playwright-core/.local-browsers using this
// same PLAYWRIGHT_BROWSERS_PATH=0 override (so Next's standalone output tracing,
// which only copies node_modules/**, actually includes the browser binary — see
// next.config.ts). If this script is ever launched by a process whose environment
// does NOT already have PLAYWRIGHT_BROWSERS_PATH=0 set (e.g. a hosting platform's
// dashboard env vars were never configured with it), Playwright silently falls back
// to looking in the OS-default external cache dir (~/.cache/ms-playwright on Linux,
// e.g. /opt/render/.cache/ms-playwright on Render) where nothing was ever installed,
// producing: "browserType.launch: Executable doesn't exist at .../chrome-headless-shell".
// Setting it here, unconditionally, makes this script self-contained and correct
// regardless of what the hosting platform's env vars are configured to.
process.env.PLAYWRIGHT_BROWSERS_PATH = '0'

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
