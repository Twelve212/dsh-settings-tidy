/**
 * dsh-settings-tidy — host 侧。
 *
 * 这个插件只做客户端样式注入，host 侧不需要任何能力：
 * 不注册工具、不写文件、不读配置。
 * `apply` 只留一个空实现，保证 loader 能正常激活这条 entry。
 */
export function apply(_ctx) {
  // 故意留空。所有逻辑都在 client.js。
}
