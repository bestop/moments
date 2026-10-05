// 浏览器端 Web Push 订阅管理。
// 用法：
//   const { state, isSupported, subscribe, unsubscribe, test } = usePushSubscribe()
//   state 取值：'unsupported' | 'denied' | 'unsubscribed' | 'subscribed' | 'busy'
//
// 所有「可能永远不落定」的 API（serviceWorker.ready / requestPermission /
// pushManager.subscribe / 网络请求）都套了超时竞速：任何一步卡住——最典型的是
// 国内网络连不上 Chrome/Edge 的推送通道 FCM（fcm.googleapis.com 被墙），
// pushManager.subscribe 会无限挂起——都会在几秒内失败并恢复按钮状态，
// 绝不把用户留在「处理中...」。这是「开启通知一直处理中」的直接修复。

import { ref, onMounted } from 'vue'

/** 给悬挂型 Promise 加超时竞速；超时抛出带指引信息的 Error。 */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

// 兼容 base64url 与标准 base64：先剥掉已有 padding，统一成 base64 再补齐
const b64uDecode = (s: string): Uint8Array => {
  s = s.trim().replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/')
  s += '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export type PushState = 'unsupported' | 'denied' | 'unsubscribed' | 'subscribed' | 'busy'

export function usePushSubscribe() {
  const state = ref<PushState>('unsupported')

  const isSupported = () =>
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  async function refresh() {
    if (!isSupported()) { state.value = 'unsupported'; return }
    if (Notification.permission === 'denied') { state.value = 'denied'; return }
    try {
      // serviceWorker.ready 在 SW 注册失败/安装卡住时永远 pending，必须竞速
      const reg = await withTimeout(
        navigator.serviceWorker.ready,
        8_000,
        'Service Worker 未就绪',
      )
      const sub = await reg.pushManager.getSubscription()
      state.value = sub ? 'subscribed' : 'unsubscribed'
    } catch {
      // SW 一直没就绪：退回「未订阅」让按钮可点，点后的 subscribe 自带超时保护
      state.value = 'unsubscribed'
    }
  }

  async function subscribe() {
    if (!isSupported()) return
    state.value = 'busy'
    try {
      // 60s：给人类足够时间响应浏览器授权弹窗，同时兜住 Safari 上
      // requestPermission 不 resolve 的已知怪癖
      const perm = await withTimeout(
        Promise.resolve(Notification.requestPermission()),
        60_000,
        '授权弹窗超时：浏览器未响应通知权限请求，请重试',
      )
      if (perm !== 'granted') { state.value = 'denied'; return }
      const cfg = useRuntimeConfig()
      const publicKey: string = cfg.public.vapidPublicKey as string
      if (!publicKey) {
        state.value = 'unsubscribed'
        throw new Error('VAPID 公钥未配置（服务端缺 VAPID_PUBLIC_KEY 环境变量）')
      }

      const reg = await withTimeout(
        navigator.serviceWorker.ready,
        10_000,
        'Service Worker 未就绪：请刷新页面后重试',
      )
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        // 20s：国内网络下 Chrome/Edge 连不上 FCM 会无限挂起，这里是
        // 「一直处理中」的主根因；超时后给出可操作的替代建议
        sub = await withTimeout(
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: b64uDecode(publicKey) as BufferSource,
          }),
          20_000,
          '连接推送服务超时：Chrome/Edge 的推送通道（FCM）在大陆网络下通常无法连通，建议改用 Safari 或 Firefox，或将本站添加到主屏幕后重试',
        )
      }
      const p = sub.toJSON()
      await withTimeout(
        $fetch('/api/push/subscribe', {
          method: 'POST',
          body: {
            endpoint: sub.endpoint,
            keys: { p256dh: p.keys?.p256dh, auth: p.keys?.auth },
          },
        }),
        15_000,
        '订阅上报超时：请检查网络后重试',
      )
      state.value = 'subscribed'
    } catch (e) {
      console.warn('[push] subscribe failed:', e)
      await refresh()
      throw e
    }
  }

  async function unsubscribe() {
    if (!isSupported()) return
    state.value = 'busy'
    try {
      const reg = await withTimeout(
        navigator.serviceWorker.ready,
        10_000,
        'Service Worker 未就绪',
      )
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        // 服务端注销失败不阻塞本地取消（endpoint 已换/网络差时也要能退出）
        try {
          await withTimeout(
            $fetch('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }),
            12_000,
            'unsubscribe 上报超时',
          )
        } catch {}
        await sub.unsubscribe()
      }
      state.value = 'unsubscribed'
    } catch (e) {
      console.warn('[push] unsubscribe failed:', e)
      await refresh()
    }
  }

  async function test() {
    return await withTimeout(
      $fetch('/api/push/test', { method: 'POST' }),
      20_000,
      '测试通知请求超时',
    )
  }

  onMounted(() => { refresh() })

  return { state, isSupported, subscribe, unsubscribe, test, refresh }
}
