// 统一的输入规范化工具。
//
// 背景：PG(int4) 不像 SQLite 宽松——NaN / 超范围整数绑定到 integer 列会直接
// 500（invalid input syntax / integer out of range），而不是静默匹配不到。
// 各端点此前各自 Number()/parseInt() 后直接入查询，客户端传 "abc"、
// "1e20"、超长数字串都能打出未捕获 500。统一在这里拦下。

/** 解析为合法的数据库 id（正整数且在 int4 范围内），非法返回 null。 */
export function parseId(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) return null
  return n
}

/**
 * 转义 LIKE/ILIKE 模式中的通配符（% _ \），让用户输入按字面匹配。
 * 否则搜索 "%"" 会全表命中、用户名查重可用通配符绕过子串判断。
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => '\\' + c)
}
