/**
 * Point every avatar at the photo already filed against that employee.
 *
 * The photo endpoint has always served the latest PHOTO document with a blob on
 * it. The avatar only checks `employee.photoUrl`, which is set when a photo is
 * uploaded through the profile — so a photo that arrived as a document, which
 * is how most of them arrived, left the avatar showing initials with the image
 * sitting one click away in the Documents tab.
 *
 * Nothing is copied or re-encoded: photoUrl just names the endpoint, so
 * replacing the photo later still works exactly as before.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

;(async () => {
  const docs = await p.employeeDocument.findMany({
    where: { type: 'PHOTO', NOT: { fileBlob: null } },
    select: { employeeId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  // Latest photo wins, which is what the endpoint serves.
  const latest = new Map()
  for (const d of docs) if (!latest.has(d.employeeId)) latest.set(d.employeeId, d.createdAt)

  const emps = await p.employee.findMany({
    where: { id: { in: [...latest.keys()] } },
    select: { id: true, employeeCode: true, fullName: true, photoUrl: true },
    orderBy: { fullName: 'asc' },
  })

  let set = 0
  for (const e of emps) {
    if (e.photoUrl) continue
    // The version stamp is the document's own timestamp rather than "now", so
    // re-running this cannot bust every browser cache for no reason.
    const url = `/api/employees/${e.id}/photo?v=${latest.get(e.id).getTime()}`
    console.log((APPLY ? 'SET  ' : 'would set ') + `${e.employeeCode.padEnd(14)} ${e.fullName}`)
    set++
    if (APPLY) await p.employee.update({ where: { id: e.id }, data: { photoUrl: url } })
  }

  const already = emps.length - set
  console.log(`\n${emps.length} employees have a photo on file — ${already} already linked, ${set} ${APPLY ? 'linked' : 'to link'}.`)
  if (!APPLY && set) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
