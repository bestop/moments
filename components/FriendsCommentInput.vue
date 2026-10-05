<template>
  <div class="p-2 rounded text-sm " >
    <div class="relative" >
      <Textarea @keyup.ctrl.enter="saveComment" ref="textareaRef" autocomplete="new-text" rows="3" v-model="content" class="dark:bg-slate-500 border-separate" :placeholder="placeholder"  />
    </div>
    <div class="flex flex-row items-center justify-end mt-2 gap-2" >
      <Input placeholder="昵称,必填,登陆后更改无效" type="text"  v-model="info.username" class="input-username dark:bg-slate-500 text-xs sm:text-sm  py-0.5" ></Input>
      <Input placeholder="邮箱,可空,登陆后更改无效" type="text" v-model="info.email" class="input-email sm:block dark:bg-slate-500 text-xs sm:text-sm py-0.5" ></Input>
      <Button size="sm" @click="saveComment" :disabled="pending">发表评论</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {useAnimate, useStorage} from '@vueuse/core'
import { insertTextAtCursor } from '~/lib/utils';
import {toast} from "vue-sonner";

const token = useCookie('token')

const recaptchaSiteKey = ref('')

const textareaRef = ref()
const content = ref('')
const placeholder = ref('发表评论')
const emit = defineEmits(['commentAdded'])
const showEmoji = ref(false)
const keyframes = { transform: 'rotate(360deg)' }
const props = defineProps<{ memoId: number, reply?: string, replyId?: number }>()
const showEmojiRef = ref<HTMLElement>()
const info = useStorage('anonymous', {
  email:'',
  website:'',
  username:'',
  notifyToken:''
})



const toggleShowEmoji = ()=>{
  showEmoji.value = !showEmoji.value
  useAnimate(showEmojiRef.value, keyframes, { duration: 1000, easing: 'ease-in-out' })
}
const emojiSelected = (emoji: string) => {
  const target = textareaRef.value?.getRef() as HTMLTextAreaElement
  insertTextAtCursor(emoji, target)
  content.value = target.value!
  // showEmoji.value = false
}

const pending = ref(false)

const saveComment = async (e) => {
  // e.stopPropagation()
  e.preventDefault();
  const siteConfig = await $fetch('/api/site/config/get')
  if(siteConfig && siteConfig.success && siteConfig.data && siteConfig.data.enableRecaptcha){
    grecaptcha.ready(function() {
      grecaptcha.execute(siteConfig.data.recaptchaSiteKey, {action: 'submit'}).then(async function(token: string) {
        if (!content.value) {
          toast.warning('先填写评论');
          return;
        }
        if (!info.value.username) {
          toast.warning('用户名必填');
          return;
        }
        pending.value = true;

        toast.promise( $fetch('/api/comment/save', {
              method: 'POST',
              body: JSON.stringify({
                content: content.value,
                memoId: props.memoId,
                replyTo: props.reply,
                replyToId: props.replyId,
                author:false,
                email:info.value.email,
                website:info.value.website,
                username:info.value.username,
                reToken:token,
              })
            }), {
              loading: '审核评论中...',
              success: (data) => {
                if (data.success) {
                  content.value = '';
                  // 服务端下发的通知凭证：存起来供首页拉自己的互动通知
                  if (data.notifyToken) info.value.notifyToken = data.notifyToken;
                  emit('commentAdded');
                  return '评论成功';
                } else {
                  throw new Error(data.message)
                }
              },
              error: (error) => `评论失败: ${error || '网络错误'}`,
            }
        );
        pending.value = false;
      });
    });
  }else{
    if (!content.value) {
      toast.warning('先填写评论');
      return;
    }
    if (!info.value.username) {
      toast.warning('用户名必填');
      return;
    }
    pending.value = true;

    toast.promise( $fetch('/api/comment/save', {
          method: 'POST',
          body: JSON.stringify({
            content: content.value,
            memoId: props.memoId,
            replyTo: props.reply,
            replyToId: props.replyId,
            author:false,
            email:info.value.email,
            website:info.value.website,
            username:info.value.username,
            reToken:'',
          })
        }), {
          loading: '审核评论中...',
          success: (data) => {
            if (data.success) {
              content.value = '';
              // 服务端下发的通知凭证：存起来供首页拉自己的互动通知
              if (data.notifyToken) info.value.notifyToken = data.notifyToken;
              emit('commentAdded');
              return '评论成功';
            } else {
              return '评论失败: ' + data.message;
            }
          },
          error: (error) => `评论失败: ${error.message || '网络错误'}`,
        }
    );

    pending.value = false;
  }
}


onMounted(async () => {
  if (props.reply) {
    placeholder.value = "回复给@" + props.reply
  }
  const userId = useCookie('userId')
  if (userId.value) {
    const user = await $fetch('/api/user/settings/get?user='+userId.value)
    if (user) {
      info.value.username = user.data.nickname
      info.value.email = user.data.eMail
      // 设置输入框不可编辑

    }
  }
})
</script>

<style scoped></style>
