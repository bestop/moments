<template>
  <HeaderImg />
  <div class="p-2 sm:p-4 flex justify-center min-h-[500px w-full]">
    <div class="p-8 rounded shadow-md max-w-sm w-full">
      <div class="mb-4">
        <Label for="username" class="block text-gray-700 mb-2">登陆名/邮箱</Label>
        <Input
            @compositionstart="composing=true"
            @compositionend="composing=false"
            v-model="state.username"
            autocomplete="off"
            type="text"
            id="username" />
      </div>
      <div class="mb-6">
        <Label for="password" class="block text-gray-700 mb-2">密码</Label>
        <Input
            @compositionstart="composing=true"
            @compositionend="composing=false"
            v-model="state.password"
            autocomplete="off"
            type="password"
            id="password" />
      </div>
      <div class="flex flex-row gap-2">
        <Button @click="login" type="button">登录</Button>
        <Button variant="ghost" @click="navigateTo('/register')" type="button">前往注册</Button>
        <Button variant="ghost" @click="navigateTo('/')" type="button">返回首页</Button>
      </div>
      <div class="mt-4 flex justify-end">
        <span>忘记密码？</span><a href="/forget" class="text-blue-500">点我找回密码</a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {toast} from "vue-sonner";

const composing = ref(false);

const state = reactive({
  username: '',
  password: ''
})

const login = async () => {
  toast.promise(
      $fetch('/api/user/login', {
        method: 'POST',
        body: JSON.stringify(state)
      }), {
        loading: '登陆中...',
        success: (data) => {
          if (data.success) {
            navigateTo('/',{ replace: true });
            window.dispatchEvent(new Event('menurefresh'));
            return '登录成功';
          } else {
            throw data.message;
          }
        },
        error: (error) => `登录失败: ${error || '未知错误'}`,
        finally() {

        },
      }
  );

}

onMounted(() => {
  // 监听密码输入框的回车事件
  document.getElementById('password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      login();
    }
  });
});

</script>

<style scoped></style>