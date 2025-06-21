'use strict';

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const { writeFileSync, mkdtempSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const { spawnSync } = require('child_process');

// Helper that allocates a unique file inside the system tmp dir
function tmp(name) {
  return join(mkdtempSync(join(tmpdir(), 'cv-')), name);
}

module.exports = async (req, res) => {
  try {
    /* ───────────────────── 1. Accept résumé JSON ───────────────────── */
    const resumeJson =
      req.method === 'POST' ? req.body : JSON.parse(req.query.data || '{}');

    /* ───────────────────── 2. Convert to HTML via resume-cli ───────── */
    const jsonPath = tmp('resume.json');
    writeFileSync(jsonPath, JSON.stringify(resumeJson));

    const htmlPath = tmp('resume.html');

    // Use local binary to avoid `npx` download on every cold start
    const resumeBin = require.resolve('resume-cli/bin/resume.js');
    const { status } = spawnSync(
      process.execPath,
      [resumeBin, 'export', htmlPath, '--resume', jsonPath, '--theme', 'flat'],
      { stdio: 'inherit' }
    );

    if (status !== 0) {
      throw new Error(`resume export failed with exit code ${status}`);
    }

    /* ───────────────────── 3. Render PDF with headless Chrome ─────── */
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto('file://' + htmlPath, { waitUntil: 'load' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    /* ───────────────────── 4. Reply with the PDF ──────────────────── */
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="resume.pdf"');
    res.end(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
}; 
