<template>
  <HeaderImg />
  <div class="p-2 sm:p-4 flex justify-center min-h-[500px] w-full">
    <div class="p-8 rounded shadow-md max-w-sm w-full">
      <div class="mb-6">
        <Label for="password" class="block text-neutral-800 dark:text-neutral-200 mb-2">新密码</Label>
        <Input v-model="state.password" autocomplete="new-password" type="password" id="password" @keydown.enter="forget" />
        <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-2">6-20 位字符；提交成功后将返回登录页。</p>
      </div>
      <div class="flex flex-row gap-2">
        <Button @click="forget" :disabled="pending" type="button">{{ pending ? '提交中...' : '提交' }}</Button>
        <Button variant="ghost" @click="navigateTo('/')" type="button">返回首页</Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {toast} from "vue-sonner";

const route = useRoute()

const state = reactive({
  user: route.params.id,
  password: '',
  emailVerificationCode: ''
})

const pending = ref(false)

onMounted(() => {
  // 获取url参数v http://localhost:3000/user/recovery/1?v=eEfht7
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('v')){
    state.emailVerificationCode = urlParams.get('v') ?? ''
  } else {
    navigateTo('/')
  }
})


const forget = async () => {
  if (pending.value) return
  if (!state.password) {
    toast.warning('请输入新密码')
    return
  }
  if (state.password.length < 6 || state.password.length > 20) {
    toast.warning('密码长度需为 6-20 位')
    return
  }
  pending.value = true
  try {
    const data: any = await $fetch('/api/user/forget', {
      method: 'POST',
      body: JSON.stringify(state)
    })
    if (data.success) {
      toast.success('更新密码成功，即将前往登录页面')
      setTimeout(() => {
        navigateTo('/login')
      }, 2000)
    } else {
      toast.error('更新密码失败: ' + (data.message || '未知错误'), { duration: 8000 })
    }
  } catch (e: any) {
    toast.error('更新密码失败: ' + (e?.data?.message || e?.message || '网络异常，请稍后再试'), { duration: 8000 })
  } finally {
    pending.value = false
  }
}
</script>

<style scoped></style>
