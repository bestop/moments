<template>
  <HeaderImg />

  <div class="flex flex-col gap-4 p-2 sm:p-4">

    <div class="flex flex-col gap-2">
      <Label for="username" class="font-bold">登陆名</Label>
      <Input type="text" id="username" placeholder="登陆名" autocomplete="off" v-model="state.username" />
    </div>

    <div class="flex flex-col gap-2">
      <Label for="eMail" class="font-bold">邮箱</Label>
      <div class="flex flex-row gap-2">
        <Input type="text" id="eMail" placeholder="邮箱" autocomplete="off" v-model="state.eMail" disabled="disabled"/>
        <Button @click="changeEmailButtonFunction"
                type="button"
                variant="outline"
                class="shrink-0"
        >{{ changeEmailButtonTitle }}</Button>
      </div>
      <template v-if="changeEmail">
        <div class="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3 flex flex-col gap-3 dark:border-neutral-800 dark:bg-neutral-900/40">
          <div class="flex flex-col gap-2">
            <Label for="newEmail" class="text-sm">新邮箱</Label>
            <Input type="email" id="newEmail" placeholder="接收验证码的新邮箱" autocomplete="email" v-model="state.newEMail" />
          </div>
          <div class="flex flex-col gap-2">
            <Label for="emailCode" class="text-sm">邮箱验证码</Label>
            <div class="flex flex-row gap-2">
              <Input type="text" id="emailCode" placeholder="6 位验证码" maxlength="6" autocomplete="one-time-code" v-model="state.eMailVerificationCode" />
              <Button @click="sendMail"
                      :disabled="sending || cooling"
                      type="button"
                      variant="outline"
                      class="shrink-0 whitespace-nowrap"
              >{{ sendButtonTitle }}</Button>
            </div>
            <p class="text-xs text-neutral-500 dark:text-neutral-400">验证码将发送至新邮箱，5 分钟内有效；未收到请检查垃圾邮件。</p>
          </div>
        </div>
      </template>

    </div>

    <div class="flex flex-col gap-2">
      <Label for="password" class="font-bold">密码</Label>
      <Input type="password" id="password" placeholder="留空则不修改密码" autocomplete="off" v-model="state.password" />
    </div>

    <div class="flex flex-col gap-2" v-if="state.password">
      <Label for="oldPassword" class="font-bold">原密码</Label>
      <Input type="password" id="oldPassword" placeholder="修改密码需先验证原密码" autocomplete="off" v-model="state.oldPassword" />
    </div>

    <div class="flex flex-col gap-2">
      <Label for="nickname" class="font-bold">昵称</Label>
      <Input type="text" id="nickname" placeholder="头像左边的作者名字" autocomplete="off" v-model="state.nickname" />
    </div>


    <div class="flex flex-col gap-2">
      <Label for="slogan" class="font-bold">心情状态</Label>
      <Input type="text" id="slogan" placeholder="头像下方文字,最好别超过15个汉字" autocomplete="off" v-model="state.slogan" />
    </div>

    <div class="flex flex-col gap-2">
      <Label for="avatarUrl" class="font-bold">头像</Label>
      <div class="flex gap-2">
        <Input type="file" id="avatarUrl" @change="(e: Event) => { uploadImgs(e, 'avatarUrl') }" style="width: 35%"/>
        <Label for="avatarUrl-input" class="font-medium" style="align-content: center;">或者输入在线地址:</Label>
        <Input type="text" id="avatarUrl-input" placeholder="或者填入在线地址" autocomplete="off" v-model="state.avatarUrl" style="width: 35%" />
      </div>
      <img :src="getImgUrl(state.avatarUrl)" alt="avatar" class="w-[70px] h-[70px] rounded-xl" v-if="state.avatarUrl" />
    </div>
    <div class="flex flex-col gap-2">
      <Label for="coverUrl" class="font-bold">顶部图片</Label>
      <div class="flex gap-2">
        <Input type="file" id="coverUrl" autocomplete="off" @change="(e: Event) => { uploadImgs(e, 'coverUrl') }" style="width: 35%"/>
        <Label for="coverUrl-input" class="font-medium" style="align-content: center;">或者输入在线地址:</Label>
        <Input type="text" id="coverUrl-input" placeholder="或者填入在线地址" autocomplete="off" v-model="state.coverUrl" style="width: 35%"/>
      </div>
      <img class="w-full h-[250px]" v-if="state.coverUrl" :src="getImgUrl(state.coverUrl)" alt="" />
    </div>

    <div class="flex flex-col gap-2">
      <Label for="css" class="font-bold">自定义个人页面CSS</Label>
      <Textarea id="css" v-model="state.css" rows="3"></Textarea>
    </div>

    <div class="flex flex-col gap-2">
      <Label for="js" class="font-bold">自定义个人页面JS</Label>
      <Textarea id="js" v-model="state.js" rows="3"></Textarea>
    </div>

    <div class="flex flex-col gap-2 ">
      <Button @click="saveSettings">保存</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { settingsUpdateEvent } from '~/lib/event'
import { getImgUrl } from '~/lib/utils'
const token = useCookie('token')
const userId = useCookie('userId')
import { useSiteSettings } from '@/composables/useSiteSettings'
import type { User } from '~/lib/types';
import {toast} from "vue-sonner";

const response = await $fetch('/api/user/settings/get?user=0');

const changeEmail = ref(false)
// 发送按钮冷却：与服务端“单邮箱 5 分钟窗口 + 每 IP 5 次/小时”限流对齐，
// 避免连点撞限流后只能看到报错
const { countdown: cooldown, cooling, start: startCooldown } = useCodeCooldown(60)
const sending = ref(false)
const changeEmailButtonTitle = computed(() => changeEmail.value ? '取消变更' : '更改邮箱')
const sendButtonTitle = computed(() => cooling.value ? `${cooldown.value}s后重发` : '发送验证码')

useHead({
  title: '设置-'+(response.data.title || 'Moments'),
})


const state = reactive({
  username: '',
  eMail: '',
  password: '',
  oldPassword: '',
  nickname: '',
  slogan: '',
  avatarUrl: '',
  coverUrl: '',
  css: '',
  js: '',
  newEMail: '',
  eMailVerificationCode: ''
})

const changeEmailButtonFunction = () => {
  changeEmail.value = !changeEmail.value
  if(!changeEmail.value){
    state.newEMail = ''
    state.eMailVerificationCode = ''
  }
}

const sendMail = async () => {
  if (sending.value || cooling.value) return
  if(!state.newEMail){
    toast.warning('请填写新邮箱')
    return
  }
  if(state.newEMail === state.eMail){
    toast.warning('新邮箱不能和旧邮箱一样')
    return
  }
  sending.value = true
  try {
    const data: any = await $fetch('/api/user/sendMail', {
      method: 'POST',
      body: JSON.stringify({
        email: state.newEMail,
        action: 'changeEmail'
      })
    })
    if (data.success) {
      startCooldown()
      toast.success('验证码已发送至新邮箱，5 分钟内有效，请注意查收')
    } else {
      // error 字段是后端返回的底层失败原因（如 Resend 域名未验证），直接带出来便于排障
      toast.warning('发送失败: ' + data.message + (data.error ? `（${data.error}）` : ''))
    }
  } catch (e: any) {
    // 网络错误/超时也要给出反馈，且 finally 会恢复按钮可用
    toast.warning(`发送失败: ${e?.message || '未知错误'}`)
  } finally {
    sending.value = false
  }
}

// key 绑定 userId：固定 key 会在 SPA 换号登录后复用上一账号的缓存资料（串号）
const { data: res } = await useFetch<{ data: typeof state }>('/api/user/settings/full',{key:'user-settings-' + (userId.value || 'anon')})
const data = res.value?.data
state.coverUrl = data?.coverUrl || '/cover.webp'
state.avatarUrl = data?.avatarUrl || '/avatar.webp'
state.username = data?.username || ''
state.nickname = data?.nickname || ''
state.eMail = data?.eMail || ''
state.slogan = data?.slogan || ''
state.css = data?.css || ''
state.js = data?.js || ''


const uploadImgs = async (event: Event, id: string) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) {
    return
  }

  await useUpload(file, async (res) => {
    if (res.success) {
      (event.target as HTMLInputElement).value = ''
      if (id === 'coverUrl') {
        state.coverUrl = res.filename
      } else if (id === 'avatarUrl') {
        state.avatarUrl = res.filename
      } else {
        toast.warning('上传失败: 未知图片类型')
      }
    } else {
      toast.warning('上传失败: ' + res.message)
    }
  })
}

const saveSettings = async () => {
  toast.promise($fetch('/api/user/settings/save', {
        method: 'POST',
        body: JSON.stringify(state)
      }), {
        loading: '保存中...',
        success: (data) => {
          if(data.success){
            // 先取出本次是否改了密码再清空输入框 —— 原先先清空再判断，
            // 改密后强制重新登录的分支永远走不到
            const changedPassword = state.password
            state.password = ''
            state.oldPassword = ''
            // 让 SPA 级 site-settings 缓存失效，下一次读取会重拉新值（customWeather /
            // customLocation / timeFrontend 等都是从这里读的）。
            // 配合 location.reload() 是冗余的，但 reload 一旦未来被移除就靠它兜底。
            useSiteSettings().invalidate()
            settingsUpdateEvent.emit()
            if (changedPassword) {
              token.value = ''
              userId.value = '0'
              navigateTo('/login')
              return ('密码修改成功,请重新登录')
            }else{
              location.reload()
              return '保存成功'
            }
          } else {
            throw new Error(data.message)
          }
        },
        error: (error: any) => `保存失败: ${error?.message || '未知错误'}`,
      }
  );
}
</script>

<style scoped></style>