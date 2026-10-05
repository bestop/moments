<template>
  <HeaderImg />
  <div class="p-2 sm:p-4 flex justify-center min-h-[500px w-full]">
    <div class="p-8 rounded shadow-md max-w-sm w-full">
      <div class="mb-4">
        <Label for="username" class="block text-gray-700 mb-2">登陆名</Label>
        <Input v-model="state.username" autocomplete="off" type="text" id="username" />
      </div>
      <div class="mb-4">
        <Label for="username" class="block text-gray-700 mb-2">邮箱</Label>
        <div class="flex flex-row gap-2">
          <Input v-model="state.email" autocomplete="off" type="text" id="email" />
          <Button id="sendMail" type="button">发送验证码</Button>
        </div>
      </div>
      <div class="mb-6" id="vcode">
        <Label for="password" class="block text-gray-700 mb-2">邮箱验证码</Label>
        <Input v-model="state.emailVerificationCode" autocomplete="off" type="text" id="emailVerificationCode" />
      </div>
      <div class="mb-6">
        <Label for="password" class="block text-gray-700 mb-2">密码</Label>
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {toast} from "vue-sonner";


const state = reactive({
  username: '',
  email: '',
  password: '',
  emailVerificationCode: ''
})


onMounted(() => {

  document.getElementById('vcode').hidden = true
  const sendMail = async () => {
    // 按钮禁用
    document.getElementById('sendMail').disabled = true
    toast.promise(
        $fetch('/api/user/sendMail', {
          method: 'POST',
          body: JSON.stringify({
            email: state.email,
            action: 'register'
          })
        }), {
          loading: '发送中...',
          success: (data) => {
            document.getElementById('sendMail').disabled = false;
            if (data.success) {
              document.getElementById('vcode').hidden = false;
              return '发送成功';
            } else {
              return '发送失败: ' + data.message + (data.error ? '（' + data.error + '）' : '');
            }
          },
          error: (error) => `发送失败: ${error.message || '未知错误'}`, // 显示具体的错误信息
        }
    );
  }

  document.getElementById('sendMail').addEventListener('click', sendMail)
})


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