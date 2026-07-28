/* One-shot mechanical edit: prefix every `verifyToken(` call with `await `.
 * Skips src/lib/auth.ts (the definition itself).
 * Skips occurrences that are already preceded by `await ` or are part of
 * type-only references (export, import, etc.).
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', 'src')
const SKIP_FILE = path.resolve(ROOT, 'lib', 'auth.ts')

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

let changed = 0
let totalReplacements = 0
for (const f of walk(ROOT)) {
  if (f === SKIP_FILE) continue
  const src = fs.readFileSync(f, 'utf8')
  if (!src.includes('verifyToken(')) continue
  // Negative lookbehind for `await ` and `import` / `export` / `function ` (declaration)
  // We only want call expressions in user code.
  const re = /(?<!await\s)(?<!await\s\s)\bverifyToken\(/g
  let count = 0
  const out = src.replace(re, (m, offset) => {
    // Skip if it's part of `function verifyToken(` or `export ... verifyToken`
    const back = src.slice(Math.max(0, offset - 30), offset)
    if (/(function|import|export|from\s+['"])\s*$/.test(back)) return m
    // Skip if the line is a type/interface
    count++
    return 'await verifyToken('
  })
  if (count > 0 && out !== src) {
    fs.writeFileSync(f, out, 'utf8')
    changed++
    totalReplacements += count
  }
}
console.log(`Changed ${changed} files, ${totalReplacements} call sites`)
