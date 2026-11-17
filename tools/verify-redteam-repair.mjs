/**
 * 红队预设 0.2.2+ 兼容性验收（不启客户端、不写真实 $DSH_HOME）。
 *
 * 1) 用「坏掉的旧预设」夹具喂本仓库的 installPreset()，确认自愈逻辑真的把 0.2.2 的两处硬失效删掉；
 * 2) 用插件自己的 readPresetDefinition() 解析修复后的目录，确认 YAML 子集能读；
 * 3) 逐行核对模块能否解析（0.2.2 已删的 tool-subagent-control/list-agents 子路径必须不存在）；
 * 4) 关键行的 config 过一遍宿主 schema；
 * 5) 若本机已部署 `$DSH_HOME/.agent-presets/redteam`，再对它跑一遍 2)–4)。
 *
 * 环境变量：DSH_APP_NODE_MODULES（宿主 node_modules 路径）、DSH_HOME。
 * 用法：node tools/verify-redteam-repair.mjs（或 pnpm verify:redteam-preset）
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const HOME = process.env.USERPROFILE || process.env.HOME || ''
const DSH_HOME = process.env.DSH_HOME || join(HOME, '.dsh')
const PKG = join(DSH_HOME, 'profiles', 'desktop', 'node_modules', 'dsh-purge')
const APP = process.env.DSH_APP_NODE_MODULES || 'D:\\DeepSeek Harness\\resources\\app\\dsh\\node_modules'
const STALE = join(HERE, 'fixtures', 'redteam-agent.cordis.stale.yml')
const DEPLOYED = join(DSH_HOME, '.agent-presets', 'redteam')

const failures = []
const ok = (name) => console.log(`  ok   ${name}`)
const bad = (name, detail) => {
  failures.push(`${name}: ${detail}`)
  console.log(`  FAIL ${name} — ${detail}`)
}
const assert = (cond, name, detail = '') => (cond ? ok(name) : bad(name, detail))

const { readPresetDefinition } = await import(pathToFileURL(join(REPO, 'lib', 'redteam', 'preset-composition.js')).href)

const PROBE_FILES = [join(REPO, 'package.json'), join(PKG, 'package.json'), join(APP, '..', 'package.json')]
  .filter((file) => existsSync(file))
const REQUIRES = PROBE_FILES.map((file) => createRequire(file))

/** 解析一个预设目录：YAML 可读 + 每行模块可解析（disabled 行不参与解析要求）。 */
function verifyDir(dir, label) {
  console.log(`\n== ${label} :: ${dir}`)
  let definition
  try {
    definition = readPresetDefinition('redteam', dir)
    ok(`readPresetDefinition 解析成功（${definition.plugins.length} 行，name=${JSON.stringify(definition.name)}）`)
  } catch (error) {
    bad('readPresetDefinition', error?.message || String(error))
    return
  }
  const inspect = (rows, prefix = '') => {
    for (const row of rows) {
      if (row && row.group === true) { inspect(row.config ?? [], `${prefix}${row.id}/`); continue }
      const name = row?.name
      if (typeof name !== 'string') { bad('row', `缺少 name: ${JSON.stringify(row).slice(0, 80)}`); continue }
      if (row.disabled === true) { ok(`模块 ${prefix}${row.id} → ${name}（disabled，跳过解析）`); continue }
      if (name.startsWith('.') || /^[A-Za-z]:[\\/]/.test(name) || name.startsWith('/')) {
        const file = name.startsWith('.') ? join(dir, name) : name
        assert(existsSync(file), `本地模块 ${prefix}${row.id} → ${name}`)
        continue
      }
      let resolved = null
      for (const require of REQUIRES) {
        try { resolved = require.resolve(name); break } catch { /* 换下一个解析根 */ }
      }
      if (resolved === null) {
        try { resolved = import.meta.resolve(name) } catch { resolved = null }
      }
      assert(Boolean(resolved), `模块 ${prefix}${row.id} → ${name}`, '各解析根都没找到')
    }
  }
  inspect(definition.plugins)
  return definition
}

// ── 1. 用旧预设跑一次自愈（跑的是本仓库的 installPreset）────────────────
const sandbox = mkdtempSync(join(tmpdir(), 'redteam-preset-'))
process.env.DSH_HOME = sandbox
const target = join(sandbox, '.agent-presets', 'redteam')
mkdirSync(target, { recursive: true })
for (const file of ['preset.yml', 'anchor-gate.mjs']) {
  const from = join(REPO, 'presets', 'redteam', file)
  if (existsSync(from)) cpSync(from, join(target, file))
}
writeFileSync(join(target, 'agent.cordis.yml'), readFileSync(STALE, 'utf8'), 'utf8')

const staleText = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
console.log('旧预设夹具：toolFilter %s / list-agents %s',
  /^[ \t]*toolFilter:/m.test(staleText) ? '有' : '无',
  /- id: tool-subagent-list-agents/.test(staleText) ? '有' : '无')

const { installPreset } = await import(pathToFileURL(join(REPO, 'lib', 'redteam', 'index.js')).href)
const installed = installPreset({ log: (msg) => console.log(`  · ${msg}`) })
console.log('installPreset →', installed.action, installed.repaired ?? '')

const fixed = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
console.log('修复后：')
assert(!/^[ \t]*toolFilter:/m.test(fixed), 'toolFilter 已删除')
assert(!/- id: tool-subagent-list-agents/.test(fixed), 'list-agents 子路径行已删除')
assert(/^[ \t]*modelSelection: true$/m.test(fixed), 'modelSelection 已启用')
assert(!/^[ \t]*modelSelectionSettings:/m.test(fixed), '旧 modelSelectionSettings 已不再出现')
assert(!/^[ \t]*backgroundMode:/m.test(fixed), 'backgroundMode 已删除')
assert(/^[ \t]*maxDepth: 1$/m.test(fixed), 'maxDepth: 1 保留（叶子节点兜底）')
const again = installPreset({ log: () => {} })
assert(!/tool-filter|list-agents-subpath/.test(again.repaired ?? ''), '重复运行不再重复修（幂等）', again.repaired ?? again.action)

verifyDir(target, '沙箱修复结果')
if (existsSync(join(DEPLOYED, 'agent.cordis.yml'))) verifyDir(DEPLOYED, '本机部署目录')
else console.log(`\n（跳过本机部署目录：${DEPLOYED} 不存在）`)

// ── 2. 关键行的 config 过宿主 schema（schemastery 会拒掉不认识的键）──────
const SCHEMA_PACKAGES = ['@deepseek-ai/dsh-tool-subagent', '@deepseek-ai/dsh-tool-subagent-control']
console.log('\n== config schema')
const schemaDir = existsSync(join(DEPLOYED, 'agent.cordis.yml')) ? DEPLOYED : target
const schemaRows = readPresetDefinition('redteam', schemaDir).plugins
const walk = (rows) => rows.flatMap((row) => (row && row.group === true ? walk(row.config ?? []) : [row]))
for (const pkg of SCHEMA_PACKAGES) {
  let mod
  try {
    mod = await import(pathToFileURL(join(APP, ...pkg.split('/'), 'lib', 'index.js')).href)
  } catch (error) {
    bad(`import ${pkg}`, error?.message || String(error))
    continue
  }
  for (const row of walk(schemaRows)) {
    if (row?.name !== pkg || row.disabled === true || row.config === undefined) continue
    try {
      mod.Config(row.config)
      ok(`${row.id} 的 config 通过 ${pkg.split('/').pop()} 的 schema（${Object.keys(row.config).join(',')}）`)
    } catch (error) {
      bad(`${row.id} 的 config`, error?.message || String(error))
    }
  }
}

console.log('')
if (failures.length === 0) {
  console.log('结论：全部通过 —— 预设可注册、无 0.2.2 已移除的字段与子路径。')
  process.exit(0)
}
console.log(`结论：${failures.length} 项失败`)
for (const item of failures) console.log(' - ' + item)
process.exit(1)
