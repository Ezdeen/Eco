// Shared HTML → PDF buffer generation, via the same Playwright pipeline used
// by src/app/api/reports/[id]/pdf/route.ts (scripts/html-to-pdf.js). Extracted
// here so both the public download route AND the Gmail email sender
// (src/lib/solar-lead-notify.ts) can generate the identical PDF without
// duplicating the spawn/tmp-file logic.

import { spawn } from 'child_process'
import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export async function renderHtmlToPdfBuffer(html: string, fileBase: string): Promise<Buffer> {
  const tmpDir = path.join(process.cwd(), 'tmp', 'solar-lead-pdfs')
  if (!existsSync(tmpDir)) {
    await mkdir(tmpDir, { recursive: true })
  }
  const htmlPath = path.join(tmpDir, `${fileBase}.html`)
  const pdfPath = path.join(tmpDir, `${fileBase}.pdf`)
  await writeFile(htmlPath, html, 'utf-8')

  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'html-to-pdf.js')
    return await new Promise<Buffer>((resolve, reject) => {
      const proc = spawn('node', [scriptPath, htmlPath, pdfPath], { cwd: process.cwd() })
      let stderr = ''
      proc.stderr?.on('data', (d) => { stderr += d.toString() })
      proc.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`PDF generation failed (exit ${code}): ${stderr}`))
          return
        }
        try {
          resolve(await readFile(pdfPath))
        } catch (err) {
          reject(err)
        }
      })
      proc.on('error', reject)
    })
  } finally {
    await unlink(htmlPath).catch(() => {})
    await unlink(pdfPath).catch(() => {})
  }
}
