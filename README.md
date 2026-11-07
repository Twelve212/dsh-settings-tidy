# dsh-settings-tidy

**把 DSH 设置页里散落一地的插件入口，收进一个「插件设置」总页。**

> Collapse every plugin's settings entry into one tidy "Plugins" section — so the sidebar stops growing.

![demo](docs/demo.png)

---

## 它解决什么问题

装了几个插件之后，DSH 设置页左侧会变成这样：

```
账号与余额
通用设置
模型
内置插件
Agent 预设
──────────  ← 原生设置到此为止
声音提醒
快照
插件市场
本地模型
侧边卡片
Vision Router
起子插件设置
...
```

每装一个插件就多一行，而且**永远只在变长**。

这个插件把下面那一整段收进一个入口：

```
账号与余额
通用设置
模型
内置插件
Agent 预设
══════════════ ← 一条梭形分隔线
插件设置        ← 点进去是全部插件的列表
```

点「插件设置」会列出所有插件页，点任意一项跳回原页面——**原插件一行代码都不用改**。

## 安装

```bash
# 在 DSH profile 目录下
dsh plugin --profile desktop add dsh-settings-tidy
```

或者手动：

```bash
# 1. 装包
pnpm add file:/path/to/dsh-settings-tidy

# 2. 在 profile package.json 的 dsh.profile.bundles 里追加 "dsh-settings-tidy"

# 3. 重启 DSH
```

## 兼容性

| 项 | 要求 |
|---|---|
| DSH | `>=0.2.0-rc.2 <0.3.0`（含 0.2.1-rc.3 实测通过） |
| Node | `>=20.18` |
| 平台 | Web GUI / 桌面版 |

## 它怎么工作（给好奇的人）

不重写别人的组件，只做三件事：

1. **注册一个 section**「插件设置」，进去列出 `ctx.slots.entries('settings.section')` 的全部条目（排除宿主原生 5 项）
2. **点击转发**：调设置外壳 store 的 `actions.openSection(id)`，跳到原页面
3. **隐藏原入口**：`MutationObserver` 监听设置弹层，导航出现时把插件项 `display:none`，并给总页画分隔线

所以原插件完全不受影响——图标、事件、状态都在，只是入口换了个地方。

## 已知限制

- 依赖设置页导航的 DOM 结构（`button[class*="_navCell"]`）。DSH 大改版可能需要适配
- 隐藏是靠 `display:none`，不是真删除；如果别的插件依赖「导航项必须可见」的行为，可能冲突
- 分隔线是 `border-image` 渐变（视觉梭形），不是几何变细

## License

MIT
