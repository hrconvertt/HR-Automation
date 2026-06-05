-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_employees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeCode" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "cnic" TEXT,
    "dob" DATETIME,
    "gender" TEXT,
    "address" TEXT,
    "emergencyContact" TEXT,
    "emergencyPhone" TEXT,
    "photoUrl" TEXT,
    "joiningDate" DATETIME NOT NULL,
    "confirmationDate" DATETIME,
    "exitDate" DATETIME,
    "designation" TEXT NOT NULL,
    "hiringDesignation" TEXT,
    "departmentId" TEXT,
    "positionId" TEXT,
    "reportingManagerId" TEXT,
    "employeeType" TEXT NOT NULL DEFAULT 'PROBATION',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "workLocation" TEXT NOT NULL DEFAULT 'ONSITE',
    "timings" TEXT,
    "workDays" TEXT NOT NULL DEFAULT 'Mon,Tue,Wed,Thu,Fri',
    "bankName" TEXT,
    "bankAccount" TEXT,
    "bankBranch" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "employees_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "employees_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "employees" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_employees" ("address", "bankAccount", "bankBranch", "bankName", "cnic", "confirmationDate", "createdAt", "departmentId", "designation", "dob", "email", "emergencyContact", "emergencyPhone", "employeeCode", "employeeType", "exitDate", "fullName", "gender", "hiringDesignation", "id", "joiningDate", "phone", "photoUrl", "positionId", "reportingManagerId", "status", "timings", "updatedAt", "userId", "workLocation") SELECT "address", "bankAccount", "bankBranch", "bankName", "cnic", "confirmationDate", "createdAt", "departmentId", "designation", "dob", "email", "emergencyContact", "emergencyPhone", "employeeCode", "employeeType", "exitDate", "fullName", "gender", "hiringDesignation", "id", "joiningDate", "phone", "photoUrl", "positionId", "reportingManagerId", "status", "timings", "updatedAt", "userId", "workLocation" FROM "employees";
DROP TABLE "employees";
ALTER TABLE "new_employees" RENAME TO "employees";
CREATE UNIQUE INDEX "employees_employeeCode_key" ON "employees"("employeeCode");
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
