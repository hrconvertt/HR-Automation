import { buildEmployeeInfoFormPdf } from '@/lib/pdf/employee-info-form'
import fs from 'node:fs'
const bytes = await buildEmployeeInfoFormPdf()
const out = process.argv[2] ?? 'Employee-Information-Form.pdf'
fs.writeFileSync(out, Buffer.from(bytes))
console.log('OK', out, (bytes.length/1024).toFixed(1)+'KB')
