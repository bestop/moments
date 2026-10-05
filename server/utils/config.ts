// SystemConfig 中属于 secret 的 key 集合 —— 任何会下发到浏览器的接口
// （settings/get、config/get 公开分支）都必须先按这个集合过滤。
// 将来新增 secret 类型的配置时，往这里加一行即可。
export const SECRET_SYSTEM_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'metingToken', // meting 音乐 API 请求的 HMAC 签名密钥
])
