---
name: rush-skill-creator
description: Use when the user wants to create a new AI agent skill from scratch conforming to the Agent Skills Specification (agentskills.io) — triggers on phrases like "做一个 skill", "创建一个 skill", "帮我写一个 skill", "make a skill", "create a skill", "write a new skill", "turn this workflow into a skill". Covers SKILL.md authoring, the standard frontmatter schema, directory conventions, what NOT to include, and hands off to rush-reskill-usage for publishing. Works across all agent platforms that follow the spec (Cursor, Claude Code, Codex, Windsurf, etc.); includes Rush-specific integration notes for publishing to rush.zhenguanyu.com. Strongly prefer this skill over guessing at skill format — LLMs tend to invent formats like `skill.yaml` / `prompt.md` / README-style files that the spec rejects.
version: 0.1.1
license: MIT
---

# Rush Skill Creator

本 skill 指导按照 **Agent Skills 标准规范**（[agentskills.io](https://agentskills.io/specification)）从零创建一个 AI Agent Skill。

本文前九节（Skill 是什么 / SKILL.md 结构 / Frontmatter 规范 / description 写作 / Body 原则 / 禁止清单 / 最小示例 / 端到端工作流 / 迭代方法）讲的**都是跨平台通用规范**，在 Cursor、Claude Code、Codex、Windsurf 等支持 Agent Skills 的 agent 上都成立。第十节是 Rush 平台（`rush.zhenguanyu.com`）的集成要点，只适用于把 skill 发布到 Rush registry 的场景。

> **发布 / 安装 / 管理 skill？** 请用 `rush-reskill-usage` skill，那里专门讲 `reskill` CLI。
> **从 Confluence 内部文档批量生产 skill？** 请用 `create-skill-from-docs` skill，那里覆盖 MCP 抓取 + 拆分策略。
> **本 skill 专注于「从零写一个合格的 SKILL.md 和目录结构」**。

---

## 一、Skill 是什么

一个 skill 是一个目录，里面有一份 `SKILL.md`，以及可选的 `scripts/` / `references/` / `assets/`。

```
my-skill/
├── SKILL.md            # 必需，所有元数据都在它的 frontmatter 里
├── scripts/            # 可选，需要确定性执行的脚本（Python/Bash 等）
├── references/         # 可选，按需加载到上下文的参考文档
└── assets/             # 可选，用于输出的模板/图片/字体等
```

**最小合法 skill = 一个目录 + 一个 `SKILL.md`**。reskill 只读 `SKILL.md` 的 frontmatter 获取元数据，`skill.json` / `README.md` / `skill.yaml` / `prompt.md` / `package.json` 这些文件一概不强制要求。

> `rush-skills` 仓库里部分历史 skill 会额外配一份 `skill.json`，那是历史惯例，不是 reskill 的技术要求。新 skill 可以不配，也可以配（不影响任何行为）。详见第十节。

---

## 二、SKILL.md 的结构

一个 `SKILL.md` 由两部分组成：

1. **YAML frontmatter**（`---` 包住的元数据块）—— registry 读取，决定 skill 的身份和触发条件
2. **Markdown body** —— 只有当 skill 被触发加载后才进上下文，是给另一个 AI agent 看的指令

```markdown
---
name: code-review
description: 一段精准的描述，告诉模型这个 skill 是做什么的，以及什么时候应该用。
version: 1.0.0
license: MIT
---

# Code Review

（Markdown 正文，写给 AI agent 看的操作指南）
```

---

## 三、Frontmatter 字段规范（权威清单）

以下是 **[agentskills.io 标准规范](https://agentskills.io/specification)** 定义的字段，reskill / Cursor / Claude Code 等所有主流 agent 平台都按此解析。**多写的字段会被忽略但不会报错，建议不要写**，避免误导读者以为它们生效。

| 字段 | 必需 | 说明 | 规则 |
|------|:---:|------|------|
| `name` | ✅ | skill 标识符 | ≤64 字符，只允许小写字母、数字、`-`，不能头尾是 `-`，不能有连续 `--`。**不要带 `@scope/` 前缀** —— scope 由目标 registry 在 publish 时决定是否注入（Rush 自动注入 `@kanyun`，见第十节） |
| `description` | ✅ | 触发提示 + 能力描述 | ≤1024 字符。这是唯一能让模型决定是否加载 skill 的依据，见下一节「如何写好 description」 |
| `version` | 推荐 | 语义化版本 | 遵循 semver，如 `1.0.0`。发布时 registry 会以此作为版本号 |
| `license` | 可选 | 开源协议 | 如 `MIT` / `Apache-2.0`。不写会触发 publish 时的 warning |
| `compatibility` | 罕用 | 依赖/兼容性说明 | 自由文本 |
| `metadata` | 罕用 | 附加结构化元数据 | 对象，一层嵌套 |
| `allowed-tools` | 罕用 | 限制可用工具 | 空格分隔的工具名 |

### 被 agent 平台解析的扩展字段（可写，但要知道谁在读）

reskill 本身只消费上表中的字段，但 **agent 平台会解析下面这些扩展字段**（Claude Code 最明显），所以在 rush-skills 仓库里也常见：

| 字段 | 被谁读 | 用途 |
|------|------|------|
| `tags` | Rush 市场搜索、部分聚合工具 | 3–8 个关键词，便于搜索 |
| `author` | Rush 市场展示 | 作者名 |
| `user-invocable` | Claude Code | `true` 表示用户可通过 `/skill-name` 直接调用 |
| `argument-hint` | Claude Code | 如 `<project-path>`，显示在参数提示里 |
| `disable-model-invocation` | Claude Code | `true` 表示禁止模型自动触发，只能手动调用 |

这些字段 reskill 会直接忽略（不报错），**写不写不影响 publish 和触发**，按需补即可。

### ❌ 永远不要写的字段

下面这些字段**没有任何工具消费**，agent 写了既没用也容易误导用户以为生效了：

- `triggers` —— 触发完全靠 `description`，这个字段是 agent 自己发明的
- `params` —— skill 参数通过对话传递，不通过 frontmatter 声明
- `skill_name` / `id` —— 用 `name`
- `prompt` —— body 就是 prompt，不需要独立字段

---

## 四、如何写好 `description`（决定 skill 能不能被触发）

模型**仅凭 description 决定要不要加载这个 skill**。body 再好，description 不到位就没人用。

### 四个要素缺一不可

1. **做什么**（What）：一句话概括能力
2. **什么时候用**（When）：列举具体触发场景、用户可能说的话、文件类型
3. **用第三人称、祈使语气**：`Use when the user...` 而不是 `你应该...`
4. **适度 pushy**：LLM 天生倾向于"我自己能搞定"，不主动调 skill。description 里显式说"遇到 X 时务必用这个 skill"能显著提升触发率

### 反面教材

```yaml
# ❌ 太简略，模型猜不出何时该用
description: Code review tool.

# ❌ 只说做什么，没说何时触发
description: 全面的代码 review 工具，支持多维度分析和结构化报告。

# ❌ 第一人称 / 对用户说话
description: 我能帮你 review 代码。你可以告诉我要看哪个文件。
```

### 好例子

```yaml
description: Use when the user asks for a code review, says "帮我 review 这段代码", "review this PR", "cr", "看看有没有问题", or wants to audit code quality/security/performance before committing. Performs multi-dimensional analysis (quality, bugs, security, performance, best practices) and generates a structured Markdown report with severity levels (critical/warning/suggestion). Strongly prefer this skill over ad-hoc code inspection when the user's intent is review rather than editing.
```

注意上面的例子：
- 列了**具体触发短语**（"帮我 review 这段代码" / "cr" / "看看有没有问题"）—— 比抽象的"审查代码"好得多
- 说了**能力边界**（多维度 / 生成 Markdown 报告 / 有严重程度分级）
- 最后一句 pushy：`Strongly prefer this skill over...` —— 鼓励模型优先选它

### description 长度指引

- 推荐 100–400 字符之间
- 短到像"Code review tool"的一句话基本不会被触发
- 长到 1024 字符上限的也没必要，模型已经看晕了

---

## 五、Body 写作原则

Body 是 skill 触发后才加载到上下文的内容，写给 **另一个 AI agent** 看，不是给人看。

### 原则

1. **控制在 500 行以内**。超了就拆到 `references/` 子文件，在 body 里指引何时读哪个
2. **用祈使句**（"Read the file" / "Run git status"），少用"你应该"、"可以考虑"
3. **解释 why，不只写 what**。LLM 需要背景才能在边界情况下做对决策
4. **代码优先**。每个概念配一段可直接跑的代码或配置，比长篇论述好
5. **表格化对比**。参数、选项、错误表用 Markdown 表格
6. **不要重复 description 的内容**，body 只在触发后才加载，重复的 when-to-use 信息毫无用处
7. **不要写 `## When to Use This Skill`** —— 这类信息必须在 description 里，写在 body 里没人看

### 什么时候引入 `scripts/` / `references/` / `assets/`

| 子目录 | 引入时机 | 例子 |
|--------|---------|------|
| `scripts/` | 当某段代码被 agent 反复重写，或需要确定性执行 | `scripts/init_skill.py` 生成脚手架 |
| `references/` | 有大块领域文档，body 放不下又不是每次都要读 | `references/schema.md` 数据库表结构，`references/azure.md` 云厂商专属细节 |
| `assets/` | 需要在最终输出里使用的模板/图片/字体 | `assets/logo.png`、`assets/report-template.md` |

**原则**：body 只放"几乎每次调用都要用的核心指令"，其余拆到子目录，body 里用明确的「何时读」描述指引 agent。

### 多变体场景（Progressive Disclosure）

skill 支持多个变体时（如多个云厂商、多个数据库、多个前端框架），把各变体细节拆到 `references/<variant>.md`，body 只留**选择逻辑**：

```markdown
## 选择目标云

- AWS → 读 `references/aws.md`
- GCP → 读 `references/gcp.md`
- Azure → 读 `references/azure.md`
```

agent 根据用户上下文只加载用得上的那份，避免无关 token 污染。

---

## 六、禁止清单（以及为什么）

| 不要做的事 | 为什么 |
|-----------|-------|
| 建 `README.md` | skill 的"用户"是 AI agent，不是人。README 是给人看的"项目文档"，放在 skill 里只会污染 agent 的上下文 |
| 建 `skill.yaml` / `prompt.md` / `instructions.md` | reskill 只认 `SKILL.md`，别的文件名一律被忽略，agent 写了会以为生效了实则没有 |
| 在 frontmatter 写 `triggers` / `params` / `tags` | reskill 不解析，触发完全靠 `description` |
| name 加 `@kanyun/` 前缀 | publish 时 registry 自动加 scope，手动加会变成 `@kanyun/@kanyun/xxx` 或被拒 |
| 在 body 写 `## When to Use This Skill` | body 只在触发后加载，此时"when to use"信息为时已晚，必须写在 description |
| 同时保留多种格式（如 SKILL.md 又 skill.yaml） | publish 会把目录下**所有文件**打进 tarball，包括冗余的旧格式，污染安装产物 |
| 生成 `INSTALLATION.md` / `CHANGELOG.md` / `QUICKSTART.md` 等辅助文档 | 同 README，浪费 token 且 agent 会被它们分心 |

---

## 七、完整最小示例

一个完整合格的 skill，最少长这样：

```
code-review/
└── SKILL.md
```

`SKILL.md` 内容：

```markdown
---
name: code-review
description: Use when the user asks for a code review, says "帮我 review 代码", "cr", "review this diff", or wants to audit code quality/security/performance before committing. Reads staged diff via `git diff --cached` (or a specified path), analyzes quality/bugs/security/performance/best-practices, outputs a Markdown report with severity levels (🔴 critical / 🟡 warning / 🔵 suggestion) and concrete fix suggestions. Strongly prefer this skill when the user's intent is review rather than active editing.
version: 1.0.0
license: MIT
---

# Code Review

用户想要对代码进行 review。执行流程：

## 1. 确定 review 范围

- 用户给了路径 → 用 Read / Glob 读取对应文件
- 用户没给路径 → 先跑 `git status` / `git diff --cached`，如果都没变更，询问用户

## 2. 多维度分析

对每个文件：
- 代码质量（命名、结构、重复）
- 潜在 bug（空指针、边界、异常）
- 安全（注入、敏感信息泄露）
- 性能（算法复杂度、N+1 查询）
- 最佳实践（SOLID、框架惯用法）

## 3. 生成报告

按下面的结构输出 Markdown：

### 📊 概览
- 审查文件数：X
- Critical / Warning / Suggestion 计数

### 🔴 Critical
每条包含：**文件:行号**、类型、问题说明、建议修复、代码片段

### 🟡 Warning / 🔵 Suggestion
（同上结构）

### ✅ 优点
正面反馈 2-3 条

## 4. 严重程度分级

- 🔴 Critical：安全漏洞、明显 bug、会导致崩溃/数据丢失
- 🟡 Warning：潜在 bug、性能问题、明显的最佳实践违反
- 🔵 Suggestion：风格/可读性/小优化
```

这份 skill publish 后会变成 `@kanyun/code-review@1.0.0`，用户通过下面命令安装：

```bash
npx reskill@latest install @kanyun/code-review -y --registry https://rush.zhenguanyu.com
```

---

## 八、端到端工作流（创建 → 发布 → 安装自测）

> 以下每一步都**只做一件事**，不要合并。发布环节的细节在 `rush-reskill-usage` skill 里，本节只给出串联。

### Step 1：澄清意图（对话）

在动手前，向用户确认：

1. **这个 skill 要解决什么具体任务？** 让用户给 1–2 个真实使用场景的例子
2. **什么样的用户提问应该触发它？** 收集 3–5 条典型短语，直接用在 description 里
3. **预期输出格式？** 文本报告、文件生成、UI 修改等
4. **需不需要 `scripts/` / `references/` / `assets/`？** 如果不清楚先不建，等 body 写完再看要不要拆

把这些答案记录下来（如果你的环境有 TodoWrite 之类的 TodoList 工具就写进去，否则在对话上下文里留存），后面写 description 和 body 时直接引用。

### Step 2：选定 name 和目录

```bash
# name 只能小写字母 + 数字 + -
# 目录名建议和 name 一致
mkdir -p ./code-review
```

### Step 3：写 SKILL.md

创建 `code-review/SKILL.md`：

1. **frontmatter 只写 4 个字段**：`name` / `description` / `version: 1.0.0` / `license: MIT`
2. **description 按第四节的原则写**，把 Step 1 收集的触发短语塞进去
3. **body 按第五节的原则写**，<500 行

### Step 4：本地校验（在工作区外装一次看看）

`reskill` 当前不稳定支持 `./` 相对路径，建议用 `file://` 绝对路径：

```bash
# 把 skill 当"本地源"安装到当前项目，纯粹看 SKILL.md 能不能被正确解析
npx reskill@latest install "file://$(pwd)/code-review" -y --no-save
```

装成功并能在 `.skills/` 看到预期目录即说明 frontmatter 格式没问题。

如果这一步卡在 `Resolving skill` 超过 30 秒，说明 `reskill` CLI 本地路径解析可能有问题，跳过本地校验直接进 Step 5（publish --dry-run 也能校验）。

### Step 5：publish --dry-run 做正式校验

```bash
npx reskill@latest publish ./code-review --dry-run -y --registry https://rush.zhenguanyu.com
```

dry-run 会完整跑校验但不真正发布。注意看输出：
- ✓ `SKILL.md found`
- ✓ `Name: code-review`
- ✓ `Version: 1.0.0`
- ⚠ `license: No license specified` → 回到 SKILL.md 加 `license: MIT`
- ❌ 任何 error 都要修，别跳过

### Step 6：发布（交给 rush-reskill-usage）

确认 dry-run 通过后，转交给 `rush-reskill-usage` skill，它会处理：
- Rush 平台的 token / login（若需要）
- 正确的 publish 命令、路径、flag
- 发布后的 scope 自动注入（`code-review` → `@kanyun/code-review`）
- 失败排查

**不要在本 skill 里代管 publish** —— 那是 `rush-reskill-usage` 的职责，避免两处不一致。

### Step 7：真实环境测一次

发布成功后，用 `rush-reskill-usage` 安装到一个新项目，开一段新对话验证：

1. 用户说出 description 里的某个触发短语 → agent 是否自动加载了 skill？
2. 加载后 agent 按 body 的指令完成任务 → 输出符合预期？
3. 如果触发率低，回到 Step 3 改 description；如果输出不符预期，改 body

---

## 九、迭代：发现 skill 不准就改 description

**90% 的 skill 问题是 description 问题**，body 改来改去作用有限。

典型症状和对应改法：

| 症状 | 原因 | 改法 |
|------|------|------|
| 用户说"做 X"，agent 没触发 skill，自己硬写代码 | description 缺少"X"相关触发短语 | 把用户的原话加进 description 的例子列表 |
| agent 在不该用的时候也用了 | description 太宽泛 | 加入排除条件："Do NOT use when..." |
| 两个 skill 抢触发 | 两者 description 没划清边界 | 在两边 description 加"use the other skill when Y" 的指引 |

### 改完 description 如何测

1. 改 `SKILL.md` frontmatter 的 description
2. bump version（`1.0.0` → `1.0.1`）
3. 重新 publish
4. 在新对话里试 3–5 条真实用户话术，看触发率

`version` 每次发布必须递增，registry 不允许重复覆盖。

---

## 十、Rush 平台集成要点

> **本节只适用于发布到 Rush 平台**（`rush.zhenguanyu.com`）的场景。如果目标是 GitHub / GitLab / 其他 registry，前九节已经覆盖全部规则，跳过本节即可。

以下几点是 Rush registry 和 Rush Pod 运行环境的具体行为，与 Agent Skills 标准规范无关，是 Rush 这个具体实现的便利设定：

1. **SKILL.md `name` 不带 scope**：在 SKILL.md frontmatter 写 `name: code-review`，publish 时 registry 自动注入 `@kanyun` scope，变成 `@kanyun/code-review`。**不要**手动加 `@kanyun/` 到 SKILL.md 的 name 里
2. **Pod 内 publish 免 login**：在 Rush 平台内（项目 Pod 里）执行 publish，平台自动注入凭据。本机开发需要 `reskill login`
3. **registry 默认值**：`https://rush.zhenguanyu.com`，所有 reskill 命令建议显式带 `--registry`
4. **不要走 `.skill` 打包路径**：Rush 上发布走 `reskill publish`，不是 Anthropic 的 `.skill` zip 格式，不需要 `package_skill.py` 类脚本

### 关于 skill.json（可选）

**reskill 完全不读 `skill.json`**。所有元数据（name / version / description / license）都来自 SKILL.md frontmatter，publish API 需要的 skillJson 对象是代码从 SKILL.md 合成出来的（见 reskill 源码 `skill-validator.ts:synthesizeSkillJson`）。

`rush-skills` 仓库里一些历史 skill 目录下有 `skill.json` 文件，那是早期仓库惯例遗留，对 reskill 没有任何影响：

- 有 `skill.json`：reskill 忽略文件内容，会把它当普通文件打进 tarball
- 没有 `skill.json`：publish、install、触发一切正常

新 skill 推荐**只写一份 `SKILL.md`**，避免元数据两处同步的维护负担。如果一定要配 skill.json（比如跟仓库现有约定对齐），格式参考下面，但记住**真正的 source of truth 永远是 SKILL.md**：

```json
{
  "name": "@kanyun/<skill-name>",
  "version": "1.0.0",
  "description": "一句精炼的描述"
}
```

> SKILL.md frontmatter 的 `name: <skill-name>` **不带 scope**，而 skill.json（如果配了）的 `name` 带 `@kanyun/` 前缀 —— 这是两个文件的历史分工。如果你写了 skill.json，两处 version 务必同步。

---

## 附录：最常见的"半成品"到"合格 skill"的修正

如果你看到一个"半成品" skill 长这样：

```
code-review/
├── skill.yaml          ← ❌ reskill 不认
├── prompt.md           ← ❌ reskill 不认
├── README.md           ← ❌ 浪费上下文
└── INSTALLATION.md     ← ❌ 多余
```

正确的修法 —— **只保留 `SKILL.md`**：

```
code-review/
└── SKILL.md
```

操作步骤：把 `skill.yaml` 的 frontmatter + `prompt.md` 的 body 合并进 `SKILL.md`；`README.md` 的内容重写成 `description`（"what + when"）放进 frontmatter；`INSTALLATION.md` 直接删除。如果要跟 `rush-skills` 仓库的历史惯例对齐，可以额外配一份 `skill.json`（详见第十节），但 reskill 不强制。

---

**Done.** 写完 SKILL.md 后，转 `rush-reskill-usage` 完成 publish。
