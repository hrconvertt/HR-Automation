/**
 * Seed the payslip email template (PAY-01) so the payroll "Send slips" wording
 * is editable in Settings > Email Templates instead of living in code.
 * Idempotent — re-running leaves an edited template alone.
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const KEY = 'PAY-01'
const SUBJECT = 'Your salary & payslip for [Month Year]'
const BODY = [
  'Hi [First Name],',
  '',
  'Your salary for [Month Year] has been processed and credited to your registered bank account.',
  '',
  'Net amount: [amount]',
  'Payment date: [date]',
  '',
  'Your payslip is available in the HR portal, with a breakdown of gross salary, deductions and net pay. Please review it and flag any discrepancy within [X days].',
  '',
  'Your payslip is confidential — please keep it secure.',
  '',
  'Best regards,',
  '[Your Name]',
  'HR Team, Convertt',
].join('\n')

async function main() {
  const existing = await prisma.emailTemplate.findUnique({ where: { key: KEY } })
  if (existing) { console.log('PAY-01 already present — left untouched.'); return }
  await prisma.emailTemplate.create({
    data: {
      key: KEY,
      category: 'Payroll & Compensation',
      name: 'Payroll Processed (Payslip + Credit)',
      triggerEvent: 'payroll.credited',
      channel: 'email',
      active: true,
      subject: SUBJECT,
      body: BODY,
      description: 'Sent to each employee when payroll slips are released.',
    },
  })
  console.log('Created PAY-01 payslip template.')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
