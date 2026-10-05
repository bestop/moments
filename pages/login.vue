<template>
  <HeaderImg />
  <div class="p-2 sm:p-4 flex justify-center min-h-[500px] w-full">
    <div class="p-8 rounded shadow-md max-w-sm w-full">
      <div class="mb-4">
        <Label for="username" class="block text-neutral-800 dark:text-neutral-200 mb-2">登陆名/邮箱</Label>
        <Input
            v-model="state.username"
            autocomplete="off"
            type="text"
            id="username"
            @keydown.enter="login" />
      </div>
      <div class="mb-6">
        <Label for="password" class="block text-neutral-800 dark:text-neutral-200 mb-2">密码</Label>
        <Input
            v-model="state.password"
            autocomplete="off"
            type="password"
            id="password"
            @keydown.enter="login" />
      </div>
      <div class="flex flex-row gap-2">
        <Button @click="login" :disabled="pending" type="button">{{ pending ? '登录中...' : '登录' }}</Button>
        <Button variant="ghost" @click="navigateTo('/register')" type="button">前往注册</Button>
        <Button variant="ghost" @click="navigateTo('/')" type="button">返回首页</Button>
      </div>
      <div class="mt-4 flex justify-end">
        <span class="text-neutral-800 dark:text-neutral-200">忘记密码？</span><a href="/forget" class="text-blue-500">点我找回密码</a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {toast} from "vue-sonner";

const state = reactive({
  username: '',
  password: ''
})

const pending = ref(false)

const login = async () => {
  if (pending.value) return
  if (!state.username.trim()) {
    toast.warning('请输入登陆名/邮箱')
    return
  }
  if (!state.password) {
    toast.warning('请输入密码')
    return
  }
  pending.value = true
  try {
    const data: any = await $fetch('/api/user/login', {
      method: 'POST',
      body: JSON.stringify(state)
    })
    if (data.success) {
      toast.success('登录成功')
      navigateTo('/',{ replace: true });
      window.dispatchEvent(new Event('menurefresh'));
    } else {
      toast.error('登录失败: ' + (data.message || '未知错误'))
    }
  } catch (e: any) {
    toast.error('登录失败: ' + (e?.data?.message || e?.message || '网络异常，请稍后再试'))
  } finally {
    pending.value = false
  }
}
</script>

<style scoped></style>
