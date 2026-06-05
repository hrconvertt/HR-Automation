-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_attendance_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "clockIn" DATETIME,
    "clockOut" DATETIME,
    "workType" TEXT NOT NULL,
    "hoursWorked" REAL,
    "status" TEXT NOT NULL,
    "lateMinutes" INTEGER,
    "overtimeHours" REAL NOT NULL DEFAULT 0,
    "overtimeApproved" BOOLEAN NOT NULL DEFAULT false,
    "overtimeApprovedById" TEXT,
    "notes" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "attendance_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_attendance_logs" ("clockIn", "clockOut", "createdAt", "date", "employeeId", "hoursWorked", "id", "ipAddress", "lateMinutes", "notes", "status", "updatedAt", "workType") SELECT "clockIn", "clockOut", "createdAt", "date", "employeeId", "hoursWorked", "id", "ipAddress", "lateMinutes", "notes", "status", "updatedAt", "workType" FROM "attendance_logs";
DROP TABLE "attendance_logs";
ALTER TABLE "new_attendance_logs" RENAME TO "attendance_logs";
CREATE UNIQUE INDEX "attendance_logs_employeeId_date_key" ON "attendance_logs"("employeeId", "date");
CREATE TABLE "new_payslips" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "payrollRunId" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "basic" REAL NOT NULL,
    "houseRent" REAL NOT NULL DEFAULT 0,
    "utilities" REAL NOT NULL DEFAULT 0,
    "food" REAL NOT NULL DEFAULT 0,
    "fuel" REAL NOT NULL DEFAULT 0,
    "medicalAllowance" REAL NOT NULL DEFAULT 0,
    "otherAllowance" REAL NOT NULL DEFAULT 0,
    "bonus" REAL NOT NULL DEFAULT 0,
    "overtimePay" REAL NOT NULL DEFAULT 0,
    "grossSalary" REAL NOT NULL,
    "eobi" REAL NOT NULL DEFAULT 0,
    "incomeTax" REAL NOT NULL DEFAULT 0,
    "otherDeductions" REAL NOT NULL DEFAULT 0,
    "netSalary" REAL NOT NULL,
    "workingDays" INTEGER NOT NULL,
    "presentDays" INTEGER NOT NULL,
    "leaveDays" INTEGER NOT NULL DEFAULT 0,
    "absentDays" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "pdfUrl" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payslips_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_payslips" ("absentDays", "basic", "bonus", "createdAt", "employeeId", "eobi", "food", "fuel", "grossSalary", "houseRent", "id", "incomeTax", "leaveDays", "medicalAllowance", "month", "netSalary", "otherAllowance", "otherDeductions", "payrollRunId", "pdfUrl", "presentDays", "sentAt", "status", "updatedAt", "utilities", "workingDays", "year") SELECT "absentDays", "basic", "bonus", "createdAt", "employeeId", "eobi", "food", "fuel", "grossSalary", "houseRent", "id", "incomeTax", "leaveDays", "medicalAllowance", "month", "netSalary", "otherAllowance", "otherDeductions", "payrollRunId", "pdfUrl", "presentDays", "sentAt", "status", "updatedAt", "utilities", "workingDays", "year" FROM "payslips";
DROP TABLE "payslips";
ALTER TABLE "new_payslips" RENAME TO "payslips";
CREATE UNIQUE INDEX "payslips_employeeId_month_year_key" ON "payslips"("employeeId", "month", "year");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
