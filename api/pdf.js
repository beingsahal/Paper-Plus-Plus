const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const { writeFileSync, mkdtempSync } = require('fs');
const { tmpdir } = require('os');
const { join }   = require('path');
const { spawnSync } = require('child_process');
const puppeteer = require('puppeteer-core');

function tmp(name){ return join(mkdtempSync(join(tmpdir(), 'cv-')), name); }

module.exports = async (req, res) => {
  try {
    const resume = req.method === 'POST' ? req.body
                 : JSON.parse(req.query.data || '{}');

    const jsonPath = tmp('resume.json');
    writeFileSync(jsonPath, JSON.stringify(resume));

    const htmlPath = tmp('resume.html');
    spawnSync('npx', ['resume', 'export', htmlPath,
                      '--resume', jsonPath,
                      '--theme', process.cwd()],
              { stdio: 'inherit' });

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),   // ← magic path
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.end(pdfBuffer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
};
