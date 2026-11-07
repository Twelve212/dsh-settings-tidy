window.__ModuleLoader__.load({
	id: "dsh-settings-tidy",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		/**
		 * dsh-settings-tidy — 设置页插件入口聚合（A2）。
		 *
		 * 最终形态：左侧只保留 5 个宿主原生设置 + 一个「插件设置」总页。
		 * 其余插件入口全部收进总页，点击跳到原页面。
		 *
		 * 实现要点：
		 * 1. 注册 settings.section「插件设置」。
		 * 2. 总页列出所有插件 section（排除宿主原生 id）。
		 * 3. MutationObserver 持续监听设置弹层，导航一出现就整理：
		 *    隐藏插件项 + 给 hub 画分隔线。
		 * 4. 选中态转移：跳到被隐藏的插件页时，高亮落到 hub 上。
		 *
		 * CSS 铁律（踩了三次）：
		 * - 不加 padding（挤压 flex 内容）
		 * - 不加 position（会抢走插件自己 absolute 图标的定位上下文）
		 * - 不用伪元素画线（在 flex 按钮里错位）
		 */
		const HUB_ID = "settings-tidy-hub";
		const HUB_LABEL = "插件设置";
		const ACTIVE_CLASS = "dsh-tidy-active";
		/** hub 上方的分隔线：border-image 横向渐变，中间实、两端渐隐成梭形。 */
		const HUB_BORDER_WIDTH = "2px solid transparent";
		const HUB_BORDER_IMAGE =
			"linear-gradient(90deg, rgba(128,128,128,0) 0%, rgba(128,128,128,0.44) 42%, rgba(128,128,128,0.44) 58%, rgba(128,128,128,0) 100%) 1";

		/** 宿主原生设置的 section id：永远不进总页、永远不隐藏。 */
		const NATIVE_IDS = ["account", "general", "models", "plugins", "agent-presets"];

		const CSS = `
/* ===== 插件设置总页 ===== */
.dsh-tidy-hub {
	padding: 20px 24px 32px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	max-width: 760px;
}
.dsh-tidy-hub__title {
	font-size: 15px;
	font-weight: 600;
	margin: 0 0 4px;
	color: var(--dsw-alias-label-primary, inherit);
}
.dsh-tidy-hub__hint {
	font-size: 12px;
	line-height: 1.6;
	margin: 0 0 14px;
	color: var(--dsw-alias-label-tertiary, #9aa0a6);
}
.dsh-tidy-hub__row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 11px 14px;
	border-radius: 10px;
	border: 1px solid var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.16));
	background: transparent;
	cursor: pointer;
	text-align: left;
	font: inherit;
	color: inherit;
	width: 100%;
	transition: background 140ms ease;
}
.dsh-tidy-hub__row:hover {
	background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.08));
}
.dsh-tidy-hub__name { font-size: 13px; }
.dsh-tidy-hub__id {
	font-size: 11px;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	opacity: 0.5;
}
.dsh-tidy-hub__empty { font-size: 12px; opacity: 0.6; }

/* 选中态转移到 hub：模仿原生选中项的浅底 */
button[class*="_navCell"].${ACTIVE_CLASS} {
	background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.1));
}
`;

		const STYLE_ATTR = "data-dsh-settings-tidy";

		function install() {
			if (typeof document === "undefined" || !document.head) return;
			const existing = document.querySelector("style[" + STYLE_ATTR + "]");
			if (existing) {
				if (existing.textContent !== CSS) existing.textContent = CSS;
				return;
			}
			const tag = document.createElement("style");
			tag.setAttribute(STYLE_ATTR, "");
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		function entryLabel(entry) {
			const opts = entry?.options ?? {};
			try {
				if (typeof opts.label === "function") {
					const v = opts.label();
					if (typeof v === "string" && v.trim()) return v;
				}
			} catch {
				// label 可能依赖未就绪的 locale。
			}
			if (typeof opts.label === "string" && opts.label.trim()) return opts.label;
			return opts.key ?? opts.id ?? "(未命名)";
		}

		function entryId(entry) {
			return entry?.options?.id ?? entry?.options?.key;
		}

		/** 所有「插件」section（排除宿主原生和自身）。 */
		function pluginSections(ctx) {
			let all = [];
			try {
				all = ctx.slots.entries("settings.section") ?? [];
			} catch (error) {
				console.warn("[dsh-settings-tidy] entries failed", error);
				return [];
			}
			return all
				.map((entry) => ({ id: entryId(entry), label: entryLabel(entry) }))
				.filter((it) => it.id && it.id !== HUB_ID && !NATIVE_IDS.includes(it.id));
		}

		function openSection(ctx, id) {
			try {
				const shells = ctx.slots.entries("sidebar.settings");
				const store = shells?.[0]?.store;
				if (store && typeof store.create === "function") {
					store.create().actions.openSection(id);
					return true;
				}
			} catch (error) {
				console.warn("[dsh-settings-tidy] openSection failed", error);
			}
			return false;
		}

		function cellLabel(cell) {
			return (cell.querySelector('[class*="_navLabel"]')?.textContent ?? "").trim();
		}

		function isActiveCell(cell) {
			if (/(^|\s)_active(\s|$)/.test(" " + cell.className + " ")) return true;
			if ((cell.getAttribute("aria-current") ?? "") === "true") return true;
			return false;
		}

		/** 隐藏插件项 + 给 hub 画分隔线 + 转移选中态。 */
		function tidyNav(ctx) {
			if (typeof document === "undefined") return;
			const hideLabels = new Set(pluginSections(ctx).map((it) => it.label));
			const cells = Array.from(document.querySelectorAll('button[class*="_navCell"]'));
			let hub = null;
			let hiddenActive = false;

			for (const cell of cells) {
				const label = cellLabel(cell);
				if (!label) continue;
				if (label === HUB_LABEL) {
					hub = cell;
					if (cell.style.marginTop !== "30px") cell.style.marginTop = "30px";
					// 分隔线：border-image 横向渐变 → 中间实、两端渐隐，梭形。
					// 每次都写（幂等），改样式不用清缓存。
					if (cell.style.borderTop !== HUB_BORDER_WIDTH) cell.style.borderTop = HUB_BORDER_WIDTH;
					if (cell.style.borderImage !== HUB_BORDER_IMAGE) cell.style.borderImage = HUB_BORDER_IMAGE;
					if (cell.style.display === "none") cell.style.display = "";
					continue;
				}
				if (hideLabels.has(label)) {
					if (cell.style.display !== "none") cell.style.display = "none";
					if (isActiveCell(cell)) hiddenActive = true;
				}
			}

			if (hub) {
				const has = hub.classList.contains(ACTIVE_CLASS);
				if (hiddenActive && !has) hub.classList.add(ACTIVE_CLASS);
				if (!hiddenActive && has) hub.classList.remove(ACTIVE_CLASS);
			}
		}

		/**
		 * 设置弹层是懒挂载 + 反复重渲染的，一次性重试覆盖不了。
		 * 用 MutationObserver 常驻：导航出现或 class 变化就跑一次整理。
		 * 用 rAF 合并连续 mutation；自己改 style/class 引发的回调用 busy 标志挡掉。
		 */
		function watchNav(ctx) {
			if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
			let scheduled = false;
			let busy = false;
			const run = () => {
				scheduled = false;
				if (busy) return;
				busy = true;
				try {
					tidyNav(ctx);
				} catch (error) {
					console.warn("[dsh-settings-tidy] tidyNav failed", error);
				} finally {
					setTimeout(() => { busy = false; }, 0);
				}
			};
			const schedule = () => {
				if (scheduled) return;
				scheduled = true;
				requestAnimationFrame(run);
			};
			const observer = new MutationObserver(schedule);
			try {
				observer.observe(document.body, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ["class"],
				});
			} catch (error) {
				console.warn("[dsh-settings-tidy] observer failed", error);
				return;
			}
			ctx?.effect?.(() => () => observer.disconnect(), "dsh-settings-tidy: nav observer");
			schedule();
		}

		function mountHub(ctx) {
			const React = require("react");
			const h = React.createElement;

			function HubPage() {
				const [items, setItems] = React.useState(null);

				const read = React.useCallback(() => {
					setItems(pluginSections(ctx));
				}, []);

				React.useEffect(() => {
					read();
					try {
						const off = ctx.slots.subscribe("settings.section", read);
						return () => {
							try { off(); } catch { /* ignore */ }
						};
					} catch {
						return undefined;
					}
				}, [read]);

				const rows = (items ?? []).map((it) =>
					h("button", {
						key: it.id,
						type: "button",
						className: "dsh-tidy-hub__row",
						onClick: () => openSection(ctx, it.id),
					},
						h("span", { className: "dsh-tidy-hub__name" }, it.label),
						h("span", { className: "dsh-tidy-hub__id" }, it.id),
					));

				return h("div", { className: "dsh-tidy-hub" },
					h("h3", { className: "dsh-tidy-hub__title" }, HUB_LABEL),
					h("p", { className: "dsh-tidy-hub__hint" },
						"这里汇总了所有插件的设置页。点任意一项会跳到它的原页面。"),
					items === null
						? h("div", { className: "dsh-tidy-hub__empty" }, "读取中…")
						: rows.length === 0
							? h("div", { className: "dsh-tidy-hub__empty" }, "没有检测到插件设置页。")
							: rows,
				);
			}

			ctx.slots.inject("settings.section", () => {
				try {
					return ctx.slots.register({
						name: "settings.section",
						id: HUB_ID,
						order: 110,
						label: () => HUB_LABEL,
					}, HubPage);
				} catch (error) {
					console.warn("[dsh-settings-tidy] hub register failed", error);
					return () => {};
				}
			});
		}

		function apply(ctx) {
			install();
			try {
				ctx?.effect?.(() => install(), "dsh-settings-tidy: style");
			} catch {
				// effect 不可用时忽略。
			}
			try {
				mountHub(ctx);
				watchNav(ctx);
			} catch (error) {
				console.warn("[dsh-settings-tidy] mount failed", error);
			}
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		return module.exports;
	}
});
