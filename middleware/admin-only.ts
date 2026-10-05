// 仅管理员可进入的路由守卫（当前用于 /config 后台页）。
// 放在路由中间件而不是 setup 里：setup 顶层 return 会被 vue 的
// ?macro=true 宏提取上下文拒绝（'return' outside of function），
// 且中间件在页面组件实例化之前就能完成跳转，不浪费一次页面渲染。
export default defineNuxtRouteMiddleware(async () => {
  const res: any = await $fetch('/api/user/settings/get?user=0').catch(() => null)
  if (!res?.success || !res?.data?.isadmin) {
    return navigateTo('/')
  }
})
