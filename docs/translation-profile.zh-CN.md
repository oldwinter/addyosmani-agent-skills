# Addy Agent Skills 中文化档案

同步上游后先读本档案，再处理新增或变更内容。

## 项目定位

- 上游项目：`addyosmani/agent-skills`
- 中文 fork：`oldwinter/addyosmani-agent-skills`
- 当前同步上游 commit：`d2c37ef6225dd8726cdd369a8030307f48592d26`
- 主要安装面：skills CLI、Claude Code plugin marketplace、Codex plugin
- 中文 runtime 入口：`skills/*/SKILL.md` 的 25 个工程 skill

## 中文化目标

本 fork 保留上游英文正文作为精确技术契约，并在每个实际 runtime 入口前提供中文执行导读。导读负责中文请求的路由、输出语言和边界提示；命令、参数、路径、URL、代码、schema、测试精确字符串和 skill slug 保持原样。

## 安装与交付

```bash
npx skills add oldwinter/addyosmani-agent-skills --full-depth
codex plugin marketplace add oldwinter/addyosmani-agent-skills
```

Claude Code 与 Codex 的 plugin metadata 均指向 `oldwinter/addyosmani-agent-skills`；安装后实际读取 `skills/*/SKILL.md` 中的中文导读和上游正文。

## 同步后检查

- `git diff --check`
- `rg -n '^(<<<<<<<|=======|>>>>>>>)$' .`
- JSON manifest 解析和 Claude/Codex plugin 入口校验
- 25 个 `skills/*/SKILL.md` 均包含中文导读，且 frontmatter `name` 与目录一致
