<template>
  <div class="p-2 rounded text-sm " >
    <div class="relative" >
      <Textarea @keyup.ctrl.enter="saveComment" ref="textareaRef" autocomplete="new-text" rows="3" v-model="content" class="dark:bg-slate-500 border-separate" :placeholder="placeholder"  />
    </div>
    <div class="flex flex-row items-center justify-end mt-2 gap-2" >
      <Input placeholder="昵称,必填,登陆后更改无效" type="text"  v-model="info.username" class="input-username dark:bg-slate-500 text-xs sm:text-sm  py-0.5" ></Input>
      <Input placeholder="邮箱,可空,登陆后更改无效" type="text" v-model="info.email" class="input-email sm:block dark:bg-slate-500 text-xs sm:text-sm py-0.5" ></Input>
      <Button size="sm" @click="saveComment" :disabled="pending">{{ pending ? '提交中...' : '发表评论' }}</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from "vue-sonner";

const textareaRef = ref()
const content = ref('')
const placeholder = ref('发表评论')
const emit = defineEmits(['commentAdded'])
const props = defineProps<{ memoId: number, reply?: string, replyId?: number }>()
const info = useStorage('anonymous', {
  email:'',
  website:'',
  username:'',
  notifyToken:''
})

const pending = ref(false)

// 站点公开配置在 SPA 会话内基本不变（仅 admin 后台可改），useState 缓存
// 避免每次点击评论都拉一次配置；请求失败也不能让评论功能整个瘫痪
const siteConfig = useState<any | null>('site-config-public', () => null)
async function loadSiteConfig() {
  if (siteConfig.value) return siteConfig.value
  try {
    const res = await $fetch('/api/site/config/get')
    if (res?.success && res?.data) siteConfig.value = res
    return res
  } catch (e) {
    console.warn('[comment] load site config failed:', e)
    return null
  }
}

/** 拿 reCAPTCHA token；未启用/脚本缺失/执行失败一律返回空串（服务端会跳过校验）。 */
async function getRecaptchaToken(siteKey: string): Promise<string> {
  if (!siteKey) return ''
  try {
    // reCaptcha 脚本由配置决定是否注入，类型上没有全局声明
    const g: any = (globalThis as any).grecaptcha
    if (!g) {
      // reCaptcha 脚本被墙/加载失败时不要让评论功能瘫痪
      console.warn('[comment] grecaptcha not available')
      return ''
    }
    await g.ready()
    return await g.execute(siteKey, { action: 'submit' })
  } catch (e) {
    console.warn('[comment] grecaptcha execute failed:', e)
    return ''
  }
}

const submitComment = async (reToken: string) => {
  pending.value = true
  try {
    const data: any = await $fetch('/api/comment/save', {
      method: 'POST',
      body: JSON.stringify({
        content: content.value,
        memoId: props.memoId,
        replyTo: props.reply,
        replyToId: props.replyId,
        author: false,
        email: info.value.email,
        website: info.value.website,
        username: info.value.username,
        reToken,
      }),
    })
    if (data.success) {
      content.value = ''
      // 服务端下发的通知凭证：存起来供首页拉自己的互动通知
      if (data.notifyToken) info.value.notifyToken = data.notifyToken
      emit('commentAdded')
      toast.success('评论成功')
    } else {
      toast.error('评论失败: ' + (data.message || '未知错误'), { duration: 8000 })
    }
  } catch (error: any) {
    toast.error('评论失败: ' + (error?.message || '网络错误'), { duration: 8000 })
  } finally {
    // finally 里恢复：请求飞行中按钮保持禁用，双击/回车连击不会重复提交
    pending.value = false
  }
}

const saveComment = async (e?: Event) => {
  e?.preventDefault()
  if (pending.value) return
  // 校验前置：空内容/缺昵称不再白白消耗一次 reCAPTCHA execute
  if (!content.value) {
    toast.warning('先填写评论')
    return
  }
  if (!info.value.username) {
    toast.warning('用户名必填')
    return
  }
  const config = await loadSiteConfig()
  const siteKey =
    config?.success && config?.data?.enableRecaptcha
      ? config.data.recaptchaSiteKey
      : ''
  const token = await getRecaptchaToken(siteKey)
  await submitComment(token)
}

onMounted(() => {
  if (props.reply) {
    placeholder.value = "回复给@" + props.reply
  }
  prefillFromLogin()
})

// 登录用户预填昵称/邮箱；任何失败都不该打断挂载，也不能把匿名者
// 本地存好的昵称/邮箱覆盖成 undefined
async function prefillFromLogin() {
  const userId = useCookie('userId')
  if (!userId.value || userId.value === '0') return
  try {
    const user: any = await $fetch('/api/user/settings/get?user=' + userId.value)
    if (user?.success && user?.data) {
      if (user.data.nickname) info.value.username = user.data.nickname
      if (user.data.eMail) info.value.email = user.data.eMail
    }
  } catch (e) {
    console.warn('[comment] prefill user info failed:', e)
  }
}
</script>

<style scoped></style>
