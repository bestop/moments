<template>
  <HeaderImg />
  <div class="p-2 sm:p-4 flex justify-center min-h-[500px] w-full">
    <div class="p-8 rounded shadow-md max-w-sm w-full">
      <div class="mb-4">
        <Label for="username" class="block text-neutral-800 dark:text-neutral-200 mb-2">用户名/邮箱</Label>
        <div class="flex flex-row gap-2">
          <Input v-model="state.email" autocomplete="off" type="text" id="username" @keydown.enter="sendMail" />
          <Button
            type="button"
            :disabled="sending || cooling"
            :title="sendButtonTitle"
            class="shrink-0 whitespace-nowrap"
            @click="sendMail"
          >{{ sendButtonTitle }}</Button>
        </div>
        <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
          验证码将发送至账户绑定邮箱，5 分钟内有效；未收到请检查垃圾邮件。
        </p>
      </div>
      <div class="flex flex-row gap-2 justify-end">
        <Button variant="ghost" @click="navigateTo('/login')" type="button">前往登录</Button>
        <Button variant="ghost" @click="navigateTo('/register')" type="button">前往注册</Button>
        <Button variant="ghost" @click="navigateTo('/')" type="button">返回首页</Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'vue-sonner'

// 本页只负责发送重置验证码；实际重置在 /user/recovery/[id] 完成
const state = reactive({
  email: '',
})

const sending = ref(false)
const { countdown, cooling, start } = useCodeCooldown(60)
const sendButtonTitle = computed(() =>
  cooling.value ? `${countdown.value}s后重发` : '发送验证码',
)

const sendMail = async () => {
  if (sending.value || cooling.value) return
  const email = state.email.trim()
  if (!email) {
    toast.error('请输入用户名/邮箱')
    return
  }
  sending.value = true
  try {
    const data: any = await $fetch('/api/user/sendMail', {
      method: 'POST',
      body: { email, action: 'resetPassword' },
    })
    if (data.success) {
      start()
      toast.success('发送成功，如果该账号存在，重置邮件将发往其绑定邮箱，请注意查收')
    } else {
      toast.error('发送失败: ' + (data.message || '未知错误'), { duration: 8000 })
    }
  } catch (e: any) {
    toast.error(
      '发送失败: ' + (e?.data?.message || e?.message || '网络异常，请稍后再试'),
      { duration: 8000 },
    )
  } finally {
    // 任何路径都必须恢复按钮，避免一次网络错误后永久点不动
    sending.value = false
  }
}
</script>

<style scoped></style>
