/**
 * Parse the all-in-one Salary Slips PDF and emit a JSON file of structured records.
 * Run: node scripts/parse-salary-slips.cjs
 */
const fs = require('fs')
const path = require('path')
const { PDFParse } = require('pdf-parse')

const PDF_PATH = 'C:\\Users\\HRConvertt\\Downloads\\Convert - Salary Slips .docx.pdf'
const OUT_PATH = path.join(__dirname, 'salary-slips.json')

function num(s) {
  if (!s) return 0
  // Strip commas, double commas (typo "80,,000"), spaces; return integer
  const cleaned = String(s).replace(/[,\s]/g, '')
  const n = parseInt(cleaned, 10)
  return isNaN(n) ? 0 : n
}

;(async () => {
  const buf = fs.readFileSync(PDF_PATH)
  const parser = new PDFParse({ data: buf })
  const result = await parser.getText()
  const text = result.text

  // Split on the "Salary Slip" marker so each chunk is one employee
  const chunks = text.split(/Employee Number:\s*CON\s*-/i).slice(1)
  console.log(`Found ${chunks.length} potential slips`)

  const records = []

  for (const raw of chunks) {
    const chunk = 'CON-' + raw  // restore prefix
    const get = (regex) => {
      const m = chunk.match(regex)
      return m ? m[1].trim() : ''
    }

    const code = get(/^CON\s*-\s*([A-Z]+-\d+)/)
    const name = get(/Employee Name:\s*([^\n]+)/)
    const designation = get(/Designation:\s*([^\n]+)/)
    const month = get(/Salary Month:\s*([^\n]+)/)

    const basic       = num(get(/Basic Salary\s+([\d,]+)/))
    const houseRent   = num(get(/House Rent\s+([\d,]+)/))
    const utilities   = num(get(/Utilities\s+([\d,]+)/))
    const food        = num(get(/Food Allowance\s+([\d,]+)/))
    const fuel        = num(get(/Fuel Allowance\s+([\d,]+)/))
    const otBonus     = num(get(/Over Time\/Bonus\s+([\d,]+)/))
    const other       = num(get(/Other Allowances\s+([\d,]+)/))
    const monthly     = num(get(/Monthly Allowance\s+([\d,]+)/))
    const arrears     = num(get(/Arrears\s+([\d,]+)/))
    const totalPay    = num(get(/Total Payments:\s+([\d,]+)/))
    const netPay      = num(get(/Net Pay:\s+([\d,]+)/))

    if (!code || !name) continue

    records.push({
      code: `CON-${code}`,
      name,
      designation,
      month,
      basic,
      houseRent,
      utilities,
      food,
      fuel,
      otBonus,
      other,
      monthly,
      arrears,
      totalPay,
      netPay,
    })
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(records, null, 2))
  console.log(`✅ Wrote ${records.length} slips to ${OUT_PATH}`)

  // Print summary table
  console.log('\nCode             | Name                          | Basic     | Gross     | Net')
  console.log('-----------------|-------------------------------|-----------|-----------|----------')
  for (const r of records) {
    const gross = r.basic + r.houseRent + r.utilities
    console.log(
      `${r.code.padEnd(17)}| ${r.name.slice(0, 30).padEnd(30)}| ${String(r.basic).padStart(9)} | ${String(gross).padStart(9)} | ${r.netPay}`
    )
  }
})().catch((e) => {
  console.error('Parse failed:', e)
  process.exit(1)
})
