// 发送验证码按钮的冷却倒计时（默认 60s）。
// 纯客户端节流：服务端已有 5 次/小时/IP 限流 + 单邮箱 5 分钟窗口，
// 这里负责给用户即时反馈、避免连点撞限流后只看到报错。
import { computed, onUnmounted, ref } from 'vue'

export function useCodeCooldown(seconds = 60) {
  const countdown = ref(0)
  const cooling = computed(() => countdown.value > 0)
  let timer: ReturnType<typeof setInterval> | null = null

  function start() {
    countdown.value = seconds
    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      countdown.value -= 1
      if (countdown.value <= 0 && timer) {
        clearInterval(timer)
        timer = null
      }
    }, 1000)
  }

  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return { countdown, cooling, start }
}
