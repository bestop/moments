import { defineNuxtModule } from '@nuxt/kit'

/**
 * shadcn-nuxt 会在 components:dirs 里 unshift 一个 components/ui 扫描项
 * （extensions: [] 实际仍按默认扩展名扫描）。该项以裸名注册 index.ts
 * （取父目录名）与同名 X.vue，与模块自身的 addComponent（同样指向
 * index.ts）产生 11 个 "Two component files resolving to the same name"
 * 警告。ui/ 下所有 .vue 均已由各自 index.ts 具名导出覆盖，该扫描项
 * 纯冗余，这里在其注册之后把该项移除；addComponent 的裸名注册不受影响。
 * 必须排在 shadcn-nuxt 之后（modules 数组顺序即 hook 执行顺序）。
 */
export default defineNuxtModule({
  meta: { name: 'shadcn-dirs-cleanup' },
  setup(_, nuxt) {
    nuxt.hook('components:dirs', (dirs) => {
      const idx = dirs.findIndex(
        (d) => typeof d === 'object' && d !== null && 'path' in d &&
          String(d.path).replace(/\/$/, '').endsWith('components/ui'),
      )
      if (idx !== -1) dirs.splice(idx, 1)
    })
  },
})
