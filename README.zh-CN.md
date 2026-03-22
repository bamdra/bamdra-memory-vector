# bamdra-memory-vector

![Bamdra Animated Logo](./docs/assets/bamdra-logo-animated.svg)

Bamdra 套件中的本地知识库与语义召回层。

它可以独立运行，和 `bamdra-openclaw-memory` 配合时效果最好。

单独安装：

```bash
openclaw plugins install @bamdra/bamdra-memory-vector
```

发布包下载：

- GitHub Releases: https://github.com/bamdra/bamdra-memory-vector/releases
- 本地也可以执行 `pnpm package:release` 生成独立发布包

[English README](./README.md)

## 它做什么

`bamdra-memory-vector` 会把本地 Markdown 变成真正可维护的知识库。

它会索引：

- `knowledge/`
- `docs/`
- `notes/`
- `ideas/`

其中 `ideas/` 只是通用示例名。如果你的 Obsidian 实际目录叫 `06_Interest/`，也完全可以按那个结构来放，插件同样可以把它当成灵感知识桶。

并尽量让 OpenClaw 在上网之前先查本地知识。

## 为什么重要

很多记忆系统最弱的一层，其实就是知识库层：

- 知识越来越黑盒
- 人不再愿意维护
- web search 被过度使用
- 延迟和 token 成本不断上升

这个插件补上的，正是这块短板。它让知识继续保持本地、可读、可改。

## 最佳实践目录

```text
private/
  knowledge/
  docs/
  notes/
  ideas/
  06_Interest/

shared/
  knowledge/
  docs/
  notes/
  ideas/
  06_Interest/
```

## 最佳实践存储方式

索引留在本地，Markdown 根目录指向一个会同步、会编辑的目录。

```json
{
  "enabled": true,
  "privateMarkdownRoot": "~/Documents/Obsidian/MyVault/openclaw/private",
  "sharedMarkdownRoot": "~/Documents/Obsidian/MyVault/openclaw/shared",
  "indexPath": "~/.openclaw/memory/vector/index.json"
}
```

这尤其适合：

- Obsidian
- iCloud Drive
- Git 同步仓库
- Syncthing 工作区

## 架构图

![Bamdra 套件架构图](./docs/assets/architecture-technical-zh.svg)

## 它能解锁什么

与 `bamdra-openclaw-memory` 组合时：

- 旧工作可以通过模糊召回被重新找回
- 本地文档能进入答案链路，而不是靠 prompt 硬塞

与 `bamdra-user-bind` 组合时：

- 私有知识会继续对齐到正确用户边界

## 仓库地址

- [GitHub 首页](https://github.com/bamdra)
- [仓库地址](https://github.com/bamdra/bamdra-memory-vector)
- [Releases](https://github.com/bamdra/bamdra-memory-vector/releases)
