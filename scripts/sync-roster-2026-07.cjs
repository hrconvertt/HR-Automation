/**
 * sync-roster-2026-07.cjs — Approved July-2026 roster sync.
 * Run: node scripts/sync-roster-2026-07.cjs
 * All changes wrapped in a single transaction. Prints each change as applied.
 */
require('dotenv').config({ path: '.env.local', quiet: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const log = (name, field, oldV, newV) =>
  console.log(`${name}: ${field} ${oldV ?? 'null'} → ${newV ?? 'null'}`);

async function main() {
  await prisma.$transaction(async (tx) => {
    // ── 1. Syed Asghar (CON-CEO-001): email → syed@convertt.co, personalEmail → ceo@convertt.co
    const asghar = await tx.employee.findUniqueOrThrow({
      where: { employeeCode: 'CON-CEO-001' },
      include: { user: true },
    });
    if (asghar.email !== 'syed@convertt.co') {
      log('Syed Asghar', 'email', asghar.email, 'syed@convertt.co');
    }
    if (asghar.personalEmail !== 'ceo@convertt.co') {
      log('Syed Asghar', 'personalEmail', asghar.personalEmail, 'ceo@convertt.co');
    }
    await tx.employee.update({
      where: { id: asghar.id },
      data: { email: 'syed@convertt.co', personalEmail: 'ceo@convertt.co' },
    });
    if (asghar.user && asghar.user.email !== 'syed@convertt.co') {
      log('Syed Asghar', 'User.email', asghar.user.email, 'syed@convertt.co');
      await tx.user.update({ where: { id: asghar.user.id }, data: { email: 'syed@convertt.co' } });
    }

    // ── 4. Create Umer Afzal (CON-UIUX-043) + linked User
    const existing = await tx.employee.findUnique({ where: { employeeCode: 'CON-UIUX-043' } });
    if (existing) {
      console.log('Umer Afzal: already exists, skipping create');
    } else {
      const dept = await tx.department.findFirstOrThrow({ where: { code: 'UIUX' } });
      const abdullah = await tx.employee.findFirstOrThrow({
        where: { fullName: 'Abdullah Shafiq', employeeCode: 'CON-UIUX-002' },
      });
      const user = await tx.user.create({
        data: {
          email: 'omerafridi999@gmail.com',
          password: '', // Clerk owns auth; invite flow convention (see src/lib/invite-employee.ts)
          role: 'EMPLOYEE',
          isActive: true,
        },
      });
      const emp = await tx.employee.create({
        data: {
          employeeCode: 'CON-UIUX-043',
          fullName: 'Umer Afzal',
          email: 'omerafridi999@gmail.com',
          userId: user.id,
          joiningDate: new Date('2026-07-01T00:00:00Z'),
          designation: 'UIUX Designer',
          departmentId: dept.id,
          reportingManagerId: abdullah.id,
          employeeType: 'PROBATION',
          status: 'ACTIVE',
          workLocation: 'ONSITE',
          workDays: 'Mon,Tue,Wed,Thu,Fri',
          timings: '10am-7pm',
          phone: '0324-4818669',
          cnic: '35202-6180815-7',
          address: 'House no 475 block 15 sector b1 township lahore',
          nationalityCountry: 'Pakistan',
        },
      });
      log('Umer Afzal', 'created Employee', null, emp.employeeCode);
      log('Umer Afzal', 'created User (EMPLOYEE, no password — invite pending)', null, user.email);
    }

    // ── 6. Tahreem Waheed (CON-HR-001): personalEmail
    const tahreem = await tx.employee.findUniqueOrThrow({ where: { employeeCode: 'CON-HR-001' } });
    if (tahreem.personalEmail !== 'tahreemwaheed77@gmail.com') {
      log('Tahreem Waheed', 'personalEmail', tahreem.personalEmail, 'tahreemwaheed77@gmail.com');
      await tx.employee.update({
        where: { id: tahreem.id },
        data: { personalEmail: 'tahreemwaheed77@gmail.com' },
      });
    }

    // ── 2, 5, 7. Login hygiene — disable / enable User.isActive
    const setActive = async (employeeCode, target, label) => {
      const emp = await tx.employee.findUniqueOrThrow({
        where: { employeeCode },
        include: { user: true },
      });
      if (!emp.user) {
        console.log(`${emp.fullName}: no User row, skipped`);
        return;
      }
      if (emp.user.isActive === target) {
        console.log(`${emp.fullName} (${employeeCode}): User.isActive already ${target} — no change${label ? ' [' + label + ']' : ''}`);
        return;
      }
      log(`${emp.fullName} (${employeeCode})`, 'User.isActive', emp.user.isActive, target);
      await tx.user.update({ where: { id: emp.user.id }, data: { isActive: target } });
    };

    await setActive('CON-ADM-003', false, 'Jamshed, placeholder email');
    await setActive('CON-ADM-002', false, 'Islam, placeholder email');
    await setActive('CON-MDT-004', false, 'Momin Munir, RESIGNED');
    await setActive('CON-MRK-001', false, 'Muhammad Hashir Siddiqui, RESIGNED');
    await setActive('CON-WBS-001', false, 'Momna khan, duplicate');
    await setActive('CON-BD-007', true, 'Iqra Naveed, ACTIVE');
    await setActive('CON-UIUX-006', true, 'Umar Ameen, ACTIVE');
  }, { timeout: 120000, maxWait: 20000 });

  // ── Post-verification
  console.log('\n=== POST-VERIFICATION ===');
  const codes = [
    'CON-CEO-001', 'CON-EXE-001', 'CON-HR-001', 'CON-UIUX-043',
    'CON-WBS-001', 'CON-WBS-005', 'CON-ADM-002', 'CON-ADM-003',
    'CON-MDT-004', 'CON-MRK-001', 'CON-BD-007', 'CON-UIUX-006',
    'CON-UIUX-011', 'CON-GEN-001', 'CON-BD-031',
  ];
  // Roster file has { roster: [{ name, email, type }] } — match by email or name.
  let rosterPeople = [];
  try {
    const r = require('./roster-2026-07.local.json');
    rosterPeople = Array.isArray(r) ? r : r.roster || [];
  } catch { /* roster file absent — fall back to the explicit code list */ }
  const rows = await prisma.employee.findMany({
    where: {
      OR: [
        { employeeCode: { in: codes } },
        ...rosterPeople.flatMap((p) => {
          const or = [];
          if (p.email) or.push({ email: { equals: p.email, mode: 'insensitive' } });
          if (p.name) or.push({ fullName: { equals: p.name, mode: 'insensitive' } });
          return or;
        }),
      ],
    },
    orderBy: { employeeCode: 'asc' },
    select: {
      employeeCode: true, fullName: true, status: true, email: true,
      personalEmail: true, user: { select: { isActive: true } },
    },
  });
  console.table(rows.map((r) => ({
    code: r.employeeCode,
    name: r.fullName,
    status: r.status,
    email: r.email,
    personalEmail: r.personalEmail || '',
    'User.isActive': r.user ? r.user.isActive : 'no user',
  })));

  const disabled = rows.filter((r) =>
    ['CON-ADM-002', 'CON-ADM-003', 'CON-MDT-004', 'CON-MRK-001', 'CON-WBS-001'].includes(r.employeeCode),
  );
  const allOff = disabled.every((r) => r.user && r.user.isActive === false);
  console.log(`\n5 disabled logins all isActive=false: ${allOff ? 'CONFIRMED' : 'FAILED'}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
