<template>
  <HeaderImg />
  <div class="p-2 sm:p-4 flex justify-center min-h-[500px] w-full">
    <div class="p-8 rounded shadow-md max-w-sm w-full">
      <div class="mb-4">
        <Label for="username" class="block text-neutral-800 dark:text-neutral-200 mb-2">登陆名</Label>
        <Input v-model="state.username" autocomplete="off" type="text" id="username" />
      </div>
      <div class="mb-4">
        <Label for="email" class="block text-neutral-800 dark:text-neutral-200 mb-2">邮箱</Label>
        <div class="flex flex-row gap-2">
          <Input v-model="state.email" autocomplete="email" type="email" id="email" />
          <Button @click="sendMail"
                  :disabled="sending || cooling"
                  type="button"
                  class="shrink-0 whitespace-nowrap"
          >{{ sendButtonTitle }}</Button>
        </div>
      </div>
      <div class="mb-6" v-show="codeVisible">
        <Label for="emailVerificationCode" class="block text-neutral-800 dark:text-neutral-200 mb-2">邮箱验证码</Label>
        <Input v-model="state.emailVerificationCode" maxlength="6" autocomplete="one-time-code" type="text" id="emailVerificationCode" />
        <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">验证码发送至上方邮箱，5 分钟内有效；未收到请检查垃圾邮件。</p>
      </div>
      <div class="mb-6">
        <Label for="password" class="block text-neutral-800 dark:text-neutral-200 mb-2">密码</Label>
        <Input v-model="state.password" autocomplete="off" type="password" id="password" />
      </div>
      <div class="flex flex-row gap-2">
        <Button @click="register" type="button">注册</Button>
        <Button variant="ghost" @click="navigateTo('/login')" type="button">前往登陆</Button>
        <Button variant="ghost" @click="navigateTo('/')" type="button">返回首页</Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {toast} from "vue-sonner";

const state = reactive({
  username: '',
  email: '',
  password: '',
  emailVerificationCode: ''
})

// 发送成功后才展开验证码输入区；按钮 60s 冷却与服务端限流对齐
const codeVisible = ref(false)
const sending = ref(false)
const { countdown, cooling, start: startCooldown } = useCodeCooldown(60)
const sendButtonTitle = computed(() => cooling.value ? `${countdown.value}s后重发` : '发送验证码')

const sendMail = async () => {
  if (sending.value || cooling.value) return
  if (!state.email) {
    toast.warning('请填写邮箱')
    return
  }
  if (!/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/.test(state.email)) {
    toast.warning('邮箱格式不正确')
    return
  }
  sending.value = true
  try {
    const data: any = await $fetch('/api/user/sendMail', {
      method: 'POST',
      body: JSON.stringify({
        email: state.email,
        action: 'register'
      })
    })
    if (data.success) {
      codeVisible.value = true
      startCooldown()
      toast.success('验证码已发送，5 分钟内有效，请注意查收')
    } else {
      // error 字段是后端返回的底层失败原因，直接带出来便于排障
      toast.warning('发送失败: ' + data.message + (data.error ? `（${data.error}）` : ''))
    }
  } catch (e: any) {
    // 网络错误/超时也要给出反馈，且 finally 会恢复按钮可用
    toast.warning(`发送失败: ${e?.message || '未知错误'}`)
  } finally {
    sending.value = false
  }
}


const register = async () => {

  toast.promise(
      $fetch('/api/user/register', {
        method: 'POST',
        body: JSON.stringify(state)
      }), {
        loading: '注册中...',
        success: (data) => {
          if (data.success) {
            setTimeout(() => {
              navigateTo('/login')
            }, 2000)
            return '注册成功，即将前往登陆页面';
          } else {
            return '注册失败: ' + data.message;
          }
        },
        error: (error) => `任务失败: ${error.message || '未知错误'}`,
      }
  );
}
</script>

<style scoped></style>