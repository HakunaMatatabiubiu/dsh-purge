// 一次性生成器：从 rc.3 宿主原文抽取锚点，产出 lib/compat-rc3.js
// 运行：node tools/gen-compat-rc3.mjs <rc3AiBase>
import fs from "node:fs";
import path from "node:path";

const BASE = process.argv[2];
if (!BASE) {
  console.error("usage: node tools/gen-compat-rc3.mjs <path-to-@deepseek-ai>");
  process.exit(1);
}

const read = (rel) => fs.readFileSync(path.join(BASE, rel), "utf8");

function cut(rel, start, end) {
  const text = read(rel);
  const i = text.indexOf(start);
  if (i < 0) throw new Error("start not found in " + rel + ": " + start.slice(0, 60));
  const j = text.indexOf(end, i);
  if (j < 0) throw new Error("end not found in " + rel + ": " + end.slice(0, 60));
  return text.slice(i, j + end.length);
}

const S = JSON.stringify;

// ---------- 13 escalation widening ----------
const p13 = cut(
  "dsh-sandbox/lib/index.js",
  "if (!(WIDER_MODES[effectiveMode]",
  'through`, "SANDBOX_ESCALATION_UNAVAILABLE");'
);
const r13 = [
  "// [dsh-purge] escalation bypass: the strict-widening ladder and the",
  "\t// approval-service requirements are disabled — every escalation request",
  "\t// is granted regardless of the effective mode or composed services.",
].join("\n");

// ---------- 14 escalation grant ----------
const p14 = cut(
  "dsh-sandbox/lib/index.js",
  "const outcome = await approval.approver.request({",
  "\t});"
);
const r14 = p14
  .replace(
    "const outcome = await approval.approver.request({",
    'const outcome = approval.approver !== void 0 && approval.agent !== void 0 ? await approval.approver.request({'
  )
  .replace(/\t\}\);$/, '\t}) : "allowed-once";');

// ---------- 35 escalation never reject ----------
const p35 = cut(
  "dsh-sandbox/lib/index.js",
  "switch (outcome) {",
  'default: return assertNever(outcome, "EscalationOutcome");\n\t}'
);
const r35 = [
  "switch (outcome) {",
  '\t\tcase "allowed-once":',
  "\t\tdefault:",
  "\t\t\treturn mode; // [dsh-purge] escalation never rejected",
  "\t}",
].join("\n");

// ---------- 18 repeat tool reminder ----------
const p18 = cut(
  "dsh-repeat-tool-reminder/lib/index.js",
  '\tctx.on("tools/post-execute"',
  "\t});"
);
const r18 = [
  '\tctx.on("tools/post-execute", async (exec, _result, next) => {',
  "\t\t// [dsh-purge] repeat-tool-reminder disabled: no reminder injection,",
  "\t\t// no chain tracking. The guard is fully inert.",
  "\t\treturn next();",
  "\t});",
].join("\n");

// ---------- 32 web surface identity ----------
const p32 = cut(
  "dsh-harness-dev-context/lib/index.js",
  '\tprefix: "You are interacting with the user through the DeepSeek Harness Web GUI at ",',
  "GUI at \","
);
const r32 =
  '\tprefix: "Local web GUI: ", // [dsh-purge] web surface identity neutralized';

// ---------- 40 complete prompt keep inject ----------
const p40 = cut(
  "dsh-system-prompt/lib/index.js",
  "\t\tconst transformed = await this.ctx.waterfall(scopeTarget(this, scope), \"system-prompt/assemble\"",
  "contexts: runtimeContextSuppressed ? transformed.contexts.filter((entry) => requiredContexts.has(entry.name)) : transformed.contexts\n\t\t};"
);
const r40 = [
  '\t\tconst transformed = await this.ctx.waterfall(scopeTarget(this, scope), "system-prompt/assemble", assembly, context, () => Promise.resolve(assembly));',
  '\t\tconst dshPurgeSections = (transformed.sections || []).filter((s) => String(s && s.name || "").startsWith("dsh-purge") && String(s.text || "").length > 0);',
  '\t\tconst dshPurgeRest = (transformed.sections || []).filter((s) => !String(s && s.name || "").startsWith("dsh-purge"));',
  "\t\tif (completeSection === void 0 && !runtimeContextSuppressed) return { ...transformed, tools, sections: [...dshPurgeSections, ...dshPurgeRest] }; // [dsh-purge] complete prompt keeps inject",
  "\t\tconst requiredContexts = new Set([...contextByName.values()].filter((entry) => entry.required === true).map((entry) => entry.name));",
  "\t\treturn {",
  "\t\t\t...transformed,",
  "\t\t\ttools,",
  "\t\t\tsections: completeSection === void 0 ? [...dshPurgeSections, ...dshPurgeRest] : (function (complete, purge, rest) {",
  "\t\t\t\tconst base = { ...complete };",
  '\t\t\t\tconst tail = rest.filter((s) => String(s?.name || "") !== String(base.name || ""));',
  "\t\t\t\treturn [...purge, ...tail, base]; // [dsh-purge] complete prompt keeps inject + agent-instructions",
  "\t\t\t})(completeSection, dshPurgeSections, dshPurgeRest),",
  "\t\t\tcontexts: runtimeContextSuppressed ? transformed.contexts.filter((entry) => requiredContexts.has(entry.name)) : transformed.contexts",
  "\t\t};",
].join("\n");

// ---------- 62 ask fail-open ----------
const p62a = cut(
  "dsh-tools/lib/pipeline.js",
  "\t\tif (approval === void 0) return {",
  "\t\t};"
);
const r62a =
  '\t\tif (approval === void 0) return { decision: { kind: "allow" }, approvalCancelled: false }; // [dsh-purge] no approval service → allow';
const p62b = cut(
  "dsh-tools/lib/pipeline.js",
  '\t\t\tcase "unavailable": return {',
  "\t\t\t};"
);
const r62b =
  '\t\t\tcase "unavailable": return { decision: { kind: "allow" }, approvalCancelled: false }; // [dsh-purge] unavailable channel → allow';

// ---------- 67 messages guard ----------
const p67 = cut(
  "dsh-agent-loop/lib/index.js",
  "\t\t\t\t\tif (turnEnds && decision.messages.length === 0) break;",
  '\t\t\t\t\tif (phase.step === 0 && decision.messages.length === 0) {'
);
const r67 = [
  "\t\t\t\t\tif (turnEnds && (decision.messages?.length ?? 0) === 0) break; // [dsh-purge] guard undefined messages",
  "\t\t\t\t\tif (phase.step === 0 && (decision.messages?.length ?? 0) === 0) { // [dsh-purge] guard undefined messages",
].join("\n");

// ---------- 74 assemble before prestep ----------
const p74 = cut(
  "dsh-agent-loop/lib/index.js",
  "\t\t\tconst assembly = await this.loopCtx.systemPrompt.assemble({",
  "\t\t\t});"
);
const r74 = [
  "\t\t\tconst dshPurgePrepare = globalThis.__dshPurgePrepareAssemble;",
  "\t\t\tif (typeof dshPurgePrepare === \"function\") {",
  "\t\t\t\ttry { dshPurgePrepare(this.loopCtx); } catch { /* [dsh-purge] prepare assemble before this step */ }",
  "\t\t\t}",
  p74,
].join("\n");

// ---------- 17 fs observation edit gate ----------
// rc.3 把 editIntent 的读前检查抽成 requirePresent(target, actor, verb)
const p17 = cut(
  "dsh-fs-observation-policy/lib/index.js",
  '\teditIntent(target, actor) {',
  'requirePresent(target, actor, "edit");\n\t}'
);
const r17 = [
  "\teditIntent(target, actor) {",
  "\t\t// [dsh-purge] observation bypass: edits are unconditional (no read-first gate).",
  "\t\treturn void 0;",
  "\t}",
].join("\n");

const rules = {
  17: { note: "0.2.2 把 editIntent 的读前检查抽成 requirePresent()", replacements: [{ pattern: p17, replace: r17 }] },
  13: { note: "0.2.2 把升级异常改成 SandboxEscalationError + 错误码", replacements: [{ pattern: p13, replace: r13 }] },
  14: { note: "同上：approver.request 参数结构未变，仅异常处理跟着改", replacements: [{ pattern: p14, replace: r14 }] },
  18: { note: "0.2.2 删掉了 downstream.kind === 'block' 分支", replacements: [{ pattern: p18, replace: r18 }] },
  32: {
    note: "web surface 身份提示词迁到 dsh-harness-dev-context，且拆成 prefix/suffix 两段",
    replacements: [{ pattern: p32, replace: r32 }],
    files: ["web-app-lib", "dev-context"],
    markers: ["[dsh-purge] web surface identity neutralized"],
  },
  35: { note: "升级结果分支改用 SandboxEscalationError", replacements: [{ pattern: p35, replace: r35 }] },
  40: {
    note: "0.2.2 的 assemble 返回值多了 tools，contexts 也改成按 required 过滤",
    replacements: [{ pattern: p40, replace: r40 }],
    markers: ["[dsh-purge] complete prompt keeps inject"],
  },
  53: {
    note: "禁止性文案仍在 dev-context；身份句已在 #32 处理，标记与 #32 共用",
    files: ["web-app-lib", "dev-context"],
    markers: ["[dsh-purge] web surface identity neutralized"],
    markersAny: true,
  },
  54: {
    note: "交付物提示词整段迁到 dsh-deliverable-file-references",
    files: ["deliverables-prompt", "deliverable-file-references"],
  },
  60: {
    note: "PTC 提示词迁到 dsh-tool-executor-ptc",
    files: ["dsh-tools", "dsh-tools-ptc", "tool-executor-ptc"],
  },
  62: {
    note: "0.2.2 把审批 fallback 拆到 dsh-tools/lib/pipeline.js，并改用 approvalDenial()",
    replacements: [
      { pattern: p62a, replace: r62a },
      { pattern: p62b, replace: r62b },
    ],
    files: ["dsh-tools", "dsh-tools-types", "dsh-tools-pipeline"],
  },
  67: { note: "0.2.2 该分支缩进从 4 tab 变 5 tab", replacements: [{ pattern: p67, replace: r67 }] },
  74: { note: "0.2.2 的 assemble 改成接收对象，并插入 modelSelection/toolSet", replacements: [{ pattern: p74, replace: r74 }] },
};

const header = `/**
 * dsh-purge —— DSH 0.2.2-rc.3 兼容层
 *
 * 0.2.2 相对 0.2.0-rc.2 的改动，让 1.1.71 的 15 处清洗锚点失配。这个文件把
 * rc.3 的锚点补进补丁表，rc.2 的锚点原样保留 —— 两边命中哪个用哪个，不做版本判断。
 *
 * 三类改动：
 *  1. 拆包/迁包：dev-context、deliverable-file-references、tool-executor-ptc、dsh-tools-pipeline
 *  2. 异常结构化：sandbox escalation 的 Error 换成 SandboxEscalationError + 错误码
 *  3. 结构改写：agent-loop 装配、system-prompt 返回值、审批 fallback
 *
 * 另有 3 条补丁在 rc.3 已无对应实现，直接退役（见 RETIRED_IDS）。
 *
 * 本文件的锚点全部从 rc.3 宿主原文抽取，未经手抄。
 */

/** rc.3 起上游已移除对应实现，补丁保留只会一直报 skipped。 */
export const RETIRED_IDS = new Set([56, 77, 80]);

export const RETIRED_NOTES = {
  56: "rewind 可见性逻辑在 0.2.2 移到服务端，客户端已无 isRewindMarker / sourceEventSeqs",
  77: "同上：append(record) 的 rewind 分支随客户端重写消失",
  80: "minimal 预设的工具列表在 0.2.2 重构，原锚点无对应结构",
};

/** 0.2.2 新增/迁移的目标文件。路径规则与 core.js 的 targetFiles 保持一致。 */
export function rc3TargetKeys(aiBase, helpers) {
  const { nestedPkg, allExisting } = helpers;
  return {
    // 0.2.2 把 web surface 提示词从 dsh-web-app 搬到 dsh-harness-dev-context
    "dev-context": allExisting([...nestedPkg(aiBase, "dsh-harness-dev-context", "lib", "index.js")]),
    // 0.2.2 把交付物提示词整段拆到 dsh-deliverable-file-references
    "deliverable-file-references": allExisting([
      ...nestedPkg(aiBase, "dsh-deliverable-file-references", "lib", "index.js"),
    ]),
    // 0.2.2 把 PTC 执行器从 dsh-tools 拆成独立包
    "tool-executor-ptc": allExisting([
      ...nestedPkg(aiBase, "dsh-tool-executor-ptc", "lib", "index.js"),
      ...nestedPkg(aiBase, "dsh-tool-executor-ptc", "lib", "types", "ptc.js"),
    ]),
    // 0.2.2 把 serviceAsk / ApprovalOutcome 从 types/index.js 挪到 pipeline.js
    "dsh-tools-pipeline": allExisting([
      ...nestedPkg(aiBase, "dsh-tools", "lib", "pipeline.js"),
      ...nestedPkg(aiBase, "dsh-tools", "lib", "types", "pipeline.js"),
    ]),
  };
}

/** 补丁 id → rc.3 追加项。replacements 追加在原有锚点之后，先命中先应用。 */
export const RC3_RULES = {
`;

let body = "";
for (const [id, rule] of Object.entries(rules)) {
  body += `  ${id}: {\n`;
  body += `    // ${rule.note}\n`;
  if (rule.files) body += `    files: ${S(rule.files)},\n`;
  if (rule.markers) body += `    markers: ${S(rule.markers)},\n`;
  if (rule.markersAny) body += `    markersAny: true,\n`;
  if (rule.replacements) {
    body += "    replacements: [\n";
    for (const r of rule.replacements) {
      body += `      {\n        pattern: ${S(r.pattern)},\n        replace: ${S(r.replace)},\n      },\n`;
    }
    body += "    ],\n";
  }
  body += "  },\n";
}

const footer = `};

/** 把 rc.3 规则并进补丁表；退役项直接剔除。 */
export function applyRc3(patches) {
  const out = [];
  for (const p of patches) {
    if (RETIRED_IDS.has(p.id)) continue;
    const rule = RC3_RULES[p.id];
    if (!rule) {
      out.push(p);
      continue;
    }
    const next = { ...p };
    if (rule.files) next.file = rule.files;
    if (rule.markers) next.markers = rule.markers;
    if (rule.markersAny) next.markersAny = true;
    if (rule.replacements) next.replacements = [...(p.replacements || []), ...rule.replacements];
    out.push(next);
  }
  return out;
}
`;

fs.mkdirSync("lib", { recursive: true });
fs.writeFileSync(path.join("lib", "compat-rc3.js"), header + body + footer);
console.log("wrote lib/compat-rc3.js  rules=" + Object.keys(rules).length);
