/**
 * Asset Management List importer.
 *
 *   • Reads C:\Users\HRConvertt\Downloads\Asset Management List.xlsx
 *   • Upserts into the new Asset schema (assetCode is the natural key).
 *   • Matches "Allocated Person" → Employee by fullName (case-insensitive
 *     fuzzy). If no person matches but a dept/location is supplied,
 *     the row is stored as SHARED with locationLabel.
 *   • Generates a category-prefixed assetCode when blank
 *     (ELE-NNN / FUR-NNN / EQU-NNN / STU-NNN / AST-NNN).
 *   • Re-run safe — upsert by assetCode.
 *   • Includes Neon wake-up retry (4s × 10) for cold-start friendliness.
 *
 * Usage:  node scripts/import-assets.js
 */
const path = require('path')
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const SHEET_PATH = String.raw`C:\Users\HRConvertt\Downloads\Asset Management List.xlsx`

const prisma = new PrismaClient({
  log: ['warn', 'error'],
  transactionOptions: { timeout: 30_000 },
})

// ─── Helpers ──────────────────────────────────────────────────────────

function xlsxDate(serial) {
  if (serial == null || serial === '-' || serial === '') return null
  if (typeof serial === 'number') {
    return new Date(Math.round((serial - 25569) * 86400 * 1000))
  }
  const d = new Date(serial)
  return isNaN(d.getTime()) ? null : d
}

function num(v) {
  if (v == null || v === '' || v === '-') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

function str(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s.length === 0 ? null : s
}

// "Web - Shopify" → "WBS", "Studio" → "STU", etc. Used to derive a code
// prefix when the input row doesn't carry one.
function codePrefix(category, subCategory) {
  const cat = (category || '').toUpperCase()
  const sub = (subCategory || '').toUpperCase()
  if (cat.includes('STUDIO') || sub.includes('STUDIO')) return 'STU'
  if (cat.includes('FURNIT')) return 'FUR'
  if (cat.includes('ELECTRO')) return 'ELE'
  if (cat.includes('EQUIP')) return 'EQU'
  if (cat.includes('WATER')) return 'WAT'
  return 'AST'
}

function fuzzyEqName(a, b) {
  if (!a || !b) return false
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return norm(a) === norm(b)
}

// Neon often sleeps cold connections. Try a no-op query with backoff.
async function wakeUp() {
  for (let i = 1; i <= 10; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`
      return
    } catch (e) {
      console.warn(`[wakeUp] attempt ${i}/10 failed: ${e.message?.slice(0, 80)}`)
      await new Promise((r) => setTimeout(r, 4_000))
    }
  }
  throw new Error('Neon did not wake up after 10 attempts.')
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`Reading ${SHEET_PATH}`)
  const wb = XLSX.readFile(SHEET_PATH)
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
  console.log(`Sheet "${sheetName}" — ${rows.length} rows`)

  await wakeUp()

  // Pre-load all employees once for fuzzy name matching.
  const allEmps = await prisma.employee.findMany({
    select: { id: true, fullName: true, employeeCode: true },
  })

  // Per-prefix counter — start from the current max so re-runs don't collide.
  const existing = await prisma.asset.findMany({
    where: { assetCode: { not: null } },
    select: { assetCode: true },
  })
  const counters = {}
  for (const r of existing) {
    const m = /^([A-Z]+)-(\d+)$/.exec(r.assetCode || '')
    if (!m) continue
    const [, p, n] = m
    const v = parseInt(n, 10)
    if (!counters[p] || v > counters[p]) counters[p] = v
  }

  let created = 0, updated = 0, skipped = 0, assigned = 0, shared = 0

  for (const row of rows) {
    // Try to read columns under both the exact headers we expect AND a few
    // common spelling variants so the script survives minor sheet edits.
    const code = str(row['Asset ID'] || row['Asset Code'] || row['AssetID'])
    const category = str(row['Category'])
    const subCategory = str(row['Sub-Category'] || row['Sub Category'] || row['SubCategory'])
    const name = str(row['Name / Description'] || row['Name/Description'] || row['Name'] || row['Description'])
    const qty = num(row['Quantity']) ?? 1
    const allocatedPerson = str(row['Allocated Person'] || row['Allocated To'])
    const allocatedDept = str(row['Allocated Department'] || row['Department'])
    const modelSerial = str(row['Model/Serial Number'] || row['Serial Number'] || row['Model Serial'])
    const motherboard = str(row['Mother Board Number'] || row['Motherboard Number'])
    const estLife = num(row['Estimated Life (Years)'] || row['Estimated Life'])
    const purchasePrice = num(row['Purchase Price (Cost)'] || row['Purchase Price'])
    const currentMarket = num(row['Current Market Value'])
    const residual = num(row['Residual Value'])
    const purchaseDate = xlsxDate(row['Purchase Date'])
    const driveLink = str(row['Drive Link'] || row['Photo'] || row['Image'])

    // Skip rows with no category and no name and no qty — they're spacers.
    if (!category && !name && !qty) { skipped++; continue }

    // Resolve assetCode — use as-is, or generate a category-prefixed one.
    let assetCode = code
    if (!assetCode) {
      const prefix = codePrefix(category, subCategory)
      const next = (counters[prefix] ?? 0) + 1
      counters[prefix] = next
      assetCode = `${prefix}-${String(next).padStart(3, '0')}`
    }

    // Resolve custody.
    let custodyType = 'INDIVIDUAL'
    let matchedEmp = null
    if (allocatedPerson) {
      matchedEmp = allEmps.find((e) => fuzzyEqName(e.fullName, allocatedPerson))
    }
    let locationLabel = null
    if (!matchedEmp) {
      // No person → SHARED, attribute to dept or person name as a location.
      custodyType = 'SHARED'
      locationLabel = allocatedDept || allocatedPerson || null
      if (locationLabel) shared++
    } else {
      assigned++
    }

    const data = {
      assetCode,
      // Legacy fields — keep populated so the existing Asset list still renders.
      name: name || subCategory || category || assetCode,
      type: subCategory || category || 'OTHER',
      // New typed fields.
      category,
      subCategory,
      quantity: Math.max(1, Math.round(qty || 1)),
      modelSerialNumber: modelSerial,
      motherboardNumber: motherboard,
      estimatedLifeYears: estLife,
      purchasePricePkr: purchasePrice,
      currentMarketValue: currentMarket,
      residualValue: residual,
      purchaseDate,
      photoUrl: driveLink,
      custodyType,
      locationLabel,
    }

    // Upsert by assetCode (natural key).
    const existing = await prisma.asset.findUnique({ where: { assetCode } })
    if (existing) {
      await prisma.asset.update({ where: { assetCode }, data })
      updated++
    } else {
      await prisma.asset.create({ data })
      created++
    }

    // If matched, also seed/refresh an AssetAssignment so the existing
    // assignment-driven UI shows the holder. We do NOT touch any prior
    // assignment history.
    if (matchedEmp) {
      const asset = await prisma.asset.findUnique({ where: { assetCode } })
      if (asset) {
        const open = await prisma.assetAssignment.findFirst({
          where: { assetId: asset.id, employeeId: matchedEmp.id, returnedDate: null },
        })
        if (!open) {
          await prisma.assetAssignment.create({
            data: {
              assetId: asset.id,
              employeeId: matchedEmp.id,
              assignedDate: purchaseDate || new Date(),
              assetCode,
              brand: null,
              model: null,
              serialNumber: modelSerial,
              costPkr: purchasePrice,
              purchaseDate,
              conditionAtIssue: 'GOOD',
            },
          })
        }
      }
    }
  }

  console.log(`\n────────────────────────────────────────────`)
  console.log(`Created: ${created}`)
  console.log(`Updated: ${updated}`)
  console.log(`Skipped (empty): ${skipped}`)
  console.log(`Allocated to employee: ${assigned}`)
  console.log(`Shared / location-attributed: ${shared}`)
  console.log(`────────────────────────────────────────────`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
