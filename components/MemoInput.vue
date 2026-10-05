<template>
  <div class="p-2 sm:p-4 pb-2 border-b dark:border-[#C0BEBF]/10">
    <div class="flex flex-row my-2 ">
      <div class="flex flex-1 gap-2 ">
        <Popover :open="linkOpen">
          <PopoverTrigger as="div">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Link :stroke-width="1.5" class="cursor-pointer w-[20px] h-[20px]" @click="linkOpen = true" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>插入链接</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </PopoverTrigger>
          <PopoverContent as-child @interact-outside="linkOpen = false">
            <div class="flex flex-col gap-2">
              <div class="text-xs my-2 flex justify-between"><span>插入链接</span>
              </div>
              <Input class="my-2" placeholder="请输入链接地址" v-model="externalUrl" />
              <template v-if="externalFetchError">
                <Input class="my-2" placeholder="请输入链接标题" v-model="externalTitle" />
                <Input class="my-2" placeholder="请输入链接图标,选填" v-model="externalFavicon" />
              </template>
              <div class="text-sm my-1" v-if="externalPending">获取信息中...</div>
              <Button size="sm" @click="addLink">提交</Button>
              <Button size="sm" class="ml-2" variant="secondary" @click="clearExternalUrl()">清空并关闭</Button>
            </div>
          </PopoverContent>
        </Popover>
        <Popover :open="music163Open">
          <PopoverTrigger as="div">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Music4 :stroke-width="1.5" class="cursor-pointer w-[20px] h-[20px]" @click="music163Open = true" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>插入音乐</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

          </PopoverTrigger>
          <PopoverContent as-child @interact-outside="music163Open = false">
            <div @keyup.enter="importMusic()">
              <div class="flex flex-col space-y">
                <div class=" text-xs my-2 flex justify-between">
                  <span>插入音乐</span>
                  <div class="tooltip">
                  <span class="tooltip-text">
                    目前只支持粘贴网易云音乐和qq音乐的分享链接，暂不支持qq分享短链接，请自行粘贴qq分享链接到浏览器，跳转后复制跳转后的qq链接
                  </span>
                    <div class="circle">
                      <span class="exclamation">!</span>
                    </div>
                  </div>
                </div>
                <Input class="my-2" placeholder="请输入网易云音乐代码" v-model="music163Url" />
              </div>
              <Button size="sm" class="mr-2" @click="importMusic">确定</Button>
              <Button size="sm" variant="ghost"
                      @click="music163Url = ''; music163Open = false;">清空</Button>
            </div>
          </PopoverContent>
        </Popover>


        <Label for="imgUpload">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Image :stroke-width="1.5" class="cursor-pointer w-[20px] h-[20px]" />
              </TooltipTrigger>
              <TooltipContent>
                <p>上传本地图片</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <input type="file" id="imgUpload" class="hidden" name="file" multiple accept="image/*,video/quicktime,video/mp4,.mov" @change="uploadImgs">
        </Label>

      </div>
      <div class="flex flex-row gap-2">
        <Button
            @click="submitMemo"
            :disabled="submitting || ((!content) && imgs.length === 0) || pendingUploads.length > 0"
        >{{ submitting ? '提交中...' : '提交' }}</Button>
      </div>
    </div>
    <div class="relative">
      <Textarea ref="textareaRef" @paste="pasteImg" autocomplete="new-text" v-model="content" rows="4" @keyup.ctrl.enter="submitMemo()"
                placeholder="今天发点什么呢?" class=" dark:text-[#C0BEBF]"></Textarea>
    </div>
    <div class="flex flex-row gap-2 my-2 bg-[#f7f7f7] dark:bg-[#212121] items-center p-2 border rounded"
         v-if="externalFavicon && externalTitle">
      <div class="flex-1 flex flex-row gap-2 items-center"><img class="w-8 h-8" :src="externalFavicon" alt="">
        <div class="text-sm text-[#576b95] cursor-pointer" v-if="!externalTitleEditing" title="点击编辑标题"
             @click="externalTitleEditing = true">{{ externalTitle }}</div>
        <Input placeholder="请输入链接标题" v-model="externalTitle" v-if="externalTitleEditing" />
      </div>
      <Check class="w-5 h-5 mr-2 cursor-pointer" color="green" v-if="externalTitleEditing"
             @click="externalTitleEditing = false" />
      <CircleX class="w-5 h-5 cursor-pointer" color="red" @click="clearExternalUrl" />
    </div>

    <div class="grid grid-cols-3 my-2 gap-2" v-if="(imgs && imgs.length > 0) || pendingUploads.length > 0">
      <!-- 已完成的上传 -->
      <div v-for="(img, index) in imgs" :key="'done-'+index" class="relative" draggable="true"
           @dragstart="event => dragStart(event, index)"
           @dragover="dragOver"
           @drop="event => drop(event, index)">
        <img :src="getImgUrl(previewSrc(img))" class="rounded object-cover h-full aspect-square max-h-[200px] cursor-grab w-full" />
        <span v-if="img.includes('|')" class="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded select-none pointer-events-none">LIVE</span>
        <Trash2 color="#379d1b" :size="15" class="absolute top-1 right-1 cursor-pointer"
                @click="imgs.splice(index, 1)" />
      </div>
      <!-- 正在上传的占位（立刻显示本地预览 + 旋转 spinner + 不可拖动） -->
      <div v-for="p in pendingUploads" :key="'pending-'+p.id"
           class="relative rounded overflow-hidden bg-gray-100 dark:bg-neutral-800">
        <img :src="p.blobUrl" class="rounded object-cover h-full aspect-square max-h-[200px] w-full opacity-60" />
        <!-- 不定长度进度条（顶部条形动画） -->
        <div class="absolute top-0 left-0 right-0 h-1 bg-black/10 overflow-hidden">
          <div class="h-full bg-[#57BE6B] animate-pulse" style="width:100%; animation: progress-slide 1.2s ease-in-out infinite;"></div>
        </div>
        <!-- 中间居中的小 spinner -->
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div class="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
        <span v-if="p.isLive" class="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded select-none pointer-events-none">LIVE</span>
        <!-- 手动取消：上传卡住/失败时用户有自救手段，否则只能刷新页面 -->
        <CircleX color="red" :size="15" class="absolute top-1 right-1 cursor-pointer bg-white/80 rounded-full"
                 title="取消上传"
                 @click="cancelPending(p.id)" />
      </div>
    </div>

    <div style="max-width: 100%">
      <ClientOnly>
        <meting-js
            :key="musicBoxKey"
            :server="musicPlatform"
            :type="musicType"
            :id="musicId"
            :list-folded="true"
            v-if="music163Url && musicType && musicId"
        />
      </ClientOnly>
    </div>

    <div style="margin: 10px 10px;">
      <div class="flex flex-row justify-between items-center gap-2 memo-info-list">
        <div class="text-sm flex flex-row gap-1 flex-1 items-center">
          <Popover>
            <PopoverTrigger class="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/50">
              <span class="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                <MapPin class="w-4 h-4 shrink-0 opacity-75" />
                <span class="text-sm">所在位置</span>
              </span>
              <span class="flex items-center gap-0.5 text-sm text-[#576b95] dark:text-[#8aa8d8]">
                {{ fmtLocation }}
                <ChevronRight class="w-3.5 h-3.5 opacity-50" />
              </span>
            </PopoverTrigger>
            <PopoverContent class="w-auto">
              <div class="flex flex-row gap-2 text-sm">
                <Input
                    v-model="locationInfo"
                    class="w-full"
                    placeholder="请输入位置信息"
                    v-if="showLocationInput"
                />
                <Button variant="outline" @click="updateLocation">自动获取</Button>
                <Button variant="outline" @click="locationInfo = ''">清空</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div class="flex flex-row justify-between items-center gap-2 memo-info-list">
        <div class="text-sm flex flex-row gap-1 flex-1 items-center">
          <Popover>
            <PopoverTrigger class="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/50">
              <span class="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                <AtSign class="w-4 h-4 shrink-0 opacity-75" />
                <span class="text-sm">提醒谁看</span>
              </span>
              <span class="flex items-center gap-0.5 text-sm text-[#576b95] dark:text-[#8aa8d8] min-w-0">
                <span class="truncate">{{ fmtAite }}</span>
                <ChevronRight class="w-3.5 h-3.5 opacity-50 shrink-0" />
              </span>
            </PopoverTrigger>
            <PopoverContent class="w-80">
              <div class="flex flex-row gap-2 text-sm">
                <TagsInputRoot
                    v-model="atpeople"
                    class="flex gap-2 items-center border p-2 rounded-lg w-full max-w-[480px] flex-wrap border-blackA7"
                >
                  <TagsInputItem v-for="item in atpeopleNickname" :key="item" :value="item" class=" flex shadow-md items-center justify-center gap-2 bg-green8 aria-[current=true]:bg-green9 rounded p-1">
                    <TagsInputItemText class="text-sm pl-1" />
                    <TagsInputItemDelete
                        class="p-0.5 rounded bg-transparent hover:bg-blackA4"
                        @click="atpeople.splice(atpeopleNickname.indexOf(item), 1);atpeopleNickname.splice(atpeopleNickname.indexOf(item), 1);"
                    >
                      X
                    </TagsInputItemDelete>
                  </TagsInputItem>
                  <ComboboxRoot v-model="v" class="relative">
                    <ComboboxAnchor class="min-w-[160px] inline-flex items-center justify-between rounded px-[15px] text-[13px] leading-none h-[35px] gap-[5px] text-grass11 shadow-[0_2px_10px] shadow-black/10 hover:bg-mauve3 focus:shadow-[0_0_0_2px] focus:shadow-black data-[placeholder]:text-grass9 outline-none">
                      <ComboboxInput
                          :modelValue="inputs0"
                          @input="handleInputDebounced(0, $event)"
                          @compositionstart="composing=true"
                          @compositionend="composing = false;handleInputDebounced(0, $event)"
                          @keydown.enter.prevent
                          class="!bg-transparent outline-none text-grass11 h-full selection:bg-grass5 placeholder-mauve8"
                          placeholder="请输入需要查询的用户"
                      />
                    </ComboboxAnchor>

                    <ComboboxContent class="absolute z-10 w-full mt-2 min-w-[200px] bg-white dark:bg-black overflow-hidden rounded shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)] will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade">
                      <ComboboxViewport class="p-[5px]">
                        <ComboboxEmpty class="text-mauve8 text-xs font-medium text-center py-2" />

                        <ComboboxGroup>

                          <ComboboxItem
                              v-for="(option, index) in state.options" :key="index"
                              class="text-[13px] leading-none text-grass11 rounded-[3px] flex items-center h-[25px] pr-[35px] pl-[25px] relative select-none data-[disabled]:text-mauve8 data-[disabled]:pointer-events-none data-[highlighted]:outline-none data-[highlighted]:bg-grass9 data-[highlighted]:text-grass1"
                              :value="option"
                              @click="if(atpeople.indexOf(option.id) === -1){atpeopleNickname.push(option.nickname);atpeople.push(option.id); inputs0 = '';judgeAtSafty();}"
                          >
                            <ComboboxItemIndicator
                                class="absolute left-0 w-[25px] inline-flex items-center justify-center"
                            >
                            </ComboboxItemIndicator>
                            <img :src="getImgUrl(option.avatarUrl)" class="w-[20px] h-[20px] rounded-full" />
                            <span>
                            {{ option.nickname }}
                          </span>
                            <span style="color: #999; font-size: 12px;margin-left: 5px">
                            id：{{ option.id }}
                          </span>
                          </ComboboxItem>
                          <ComboboxSeparator class="h-[1px] bg-grass6 m-[5px]" />
                        </ComboboxGroup>
                      </ComboboxViewport>
                    </ComboboxContent>
                  </ComboboxRoot>
                </TagsInputRoot>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div class="flex flex-row justify-between items-center gap-2 memo-info-list">
        <div class="text-sm flex flex-row gap-1 flex-1 items-center">
          <Popover>
            <PopoverTrigger class="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/50">
              <span class="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                <User class="w-4 h-4 shrink-0 opacity-75" />
                <span class="text-sm">谁可以看</span>
              </span>
              <span class="flex items-center gap-0.5 text-sm text-[#576b95] dark:text-[#8aa8d8] min-w-0">
                <span class="truncate">{{ fmtAvailable }}</span>
                <ChevronRight class="w-3.5 h-3.5 opacity-50 shrink-0" />
              </span>
            </PopoverTrigger>
            <PopoverContent class="w-80">
              <div class="flex flex-row gap-2 text-sm">
                <TagsInputRoot
                    v-model="avpeople"
                    class="flex gap-2 items-center border p-2 rounded-lg w-full max-w-[480px] flex-wrap border-blackA7"
                >
                  <TagsInputItem v-for="item in avpeopleNickname" :key="item" :value="item" class=" flex shadow-md items-center justify-center gap-2 bg-green8 aria-[current=true]:bg-green9 rounded p-1">
                    <TagsInputItemText class="text-sm pl-1" />
                    <TagsInputItemDelete
                        class="p-0.5 rounded bg-transparent hover:bg-blackA4"
                        @click="avpeople.splice(avpeopleNickname.indexOf(item), 1);avpeopleNickname.splice(avpeopleNickname.indexOf(item), 1);if(atpeopleNickname.indexOf(item)>0){atpeople.splice(atpeopleNickname.indexOf(item), 1);atpeopleNickname.splice(atpeopleNickname.indexOf(item), 1);}"
                    >
                      X
                    </TagsInputItemDelete>
                  </TagsInputItem>
                  <ComboboxRoot v-model="v" class="relative">
                    <ComboboxAnchor class="min-w-[160px] inline-flex items-center justify-between rounded px-[15px] text-[13px] leading-none h-[35px] gap-[5px] text-grass11 shadow-[0_2px_10px] shadow-black/10 hover:bg-mauve3 focus:shadow-[0_0_0_2px] focus:shadow-black data-[placeholder]:text-grass9 outline-none">
                      <ComboboxInput
                          :modelValue="inputs1"
                          @input="handleInputDebounced(1, $event)"
                          @compositionstart="composing = true"
                          @compositionend="composing = false;handleInputDebounced(1, $event)"
                          @keydown.enter.prevent
                          class="!bg-transparent outline-none text-grass11 h-full selection:bg-grass5 placeholder-mauve8"
                          placeholder="请输入需要查询的用户"
                      />
                    </ComboboxAnchor>

                    <ComboboxContent class="absolute z-10 w-full mt-2 min-w-[200px] bg-white dark:bg-black overflow-hidden rounded shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)] will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade">
                      <ComboboxViewport class="p-[5px]">
                        <ComboboxEmpty class="text-mauve8 text-xs font-medium text-center py-2" />

                        <ComboboxGroup>

                          <ComboboxItem
                              v-for="(option, index) in state.options" :key="index"
                              class="text-[13px] leading-none text-grass11 rounded-[3px] flex items-center h-[25px] pr-[35px] pl-[25px] relative select-none data-[disabled]:text-mauve8 data-[disabled]:pointer-events-none data-[highlighted]:outline-none data-[highlighted]:bg-grass9 data-[highlighted]:text-grass1"
                              :value="option"
                              @click="if(avpeople.indexOf(option.id) === -1){avpeopleNickname.push(option.nickname);avpeople.push(option.id); inputs1 = '';judgeAtSafty();}"
                          >
                            <ComboboxItemIndicator
                                class="absolute left-0 w-[25px] inline-flex items-center justify-center"
                            >
                            </ComboboxItemIndicator>
                            <img :src="getImgUrl(option.avatarUrl)" class="w-[20px] h-[20px] rounded-full" />
                            <span>
                            {{ option.nickname }}
                          </span>
                            <span style="color: #999; font-size: 12px;margin-left: 5px">
                            id：{{ option.id }}
                          </span>
                          </ComboboxItem>
                          <ComboboxSeparator class="h-[1px] bg-grass6 m-[5px]" />
                        </ComboboxGroup>
                      </ComboboxViewport>
                    </ComboboxContent>
                  </ComboboxRoot>
                </TagsInputRoot>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getImgUrl, insertTextAtCursor, parseMusicShareUrl } from '~/lib/utils';
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { memoUpdateEvent, memoAddEvent } from '@/lib/event'
import type { Memo } from '~/lib/types';
import { useAnimate } from '@vueuse/core';
import { Image, Music4, Trash2, Link, CircleX, Check, MapPin, AtSign, User, ChevronRight } from 'lucide-vue-next'
import { ref } from 'vue';
import {toast} from "vue-sonner";
import {
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
  TagsInputRoot,
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxRoot,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxViewport
} from "radix-vue";
const locationInfo = ref('');
const inputs0 = ref('');
const inputs1 = ref('');
let musicBoxKey = ref(0)

const v = ref('')

const state = reactive({
  options: Array<any>(),
  // page: 1,
  // hasNext: false
})
let composing = false;

let debounceTimer: any = null;

const handleInputDebounced = (withMe: number, e: Event) => {
  clearTimeout(debounceTimer);
  const value = (e.target as HTMLInputElement).value;
  debounceTimer = setTimeout(() => handleInput(withMe, value), 300); // 300ms为防抖时间，可以根据实际需求调整
};

const handleInput = (withMe: number, value: string) => {
  if (composing) {
    return;
  }
  const inputs = withMe === 0 ? inputs0 : inputs1;
  inputs.value = value;
  if (inputs.value === '') {
    state.options = [];
    return;
  }
  $fetch('/api/user/list', {
    method: 'POST',
    body: JSON.stringify({
      find: inputs.value,
      withMe: withMe,
    })
  }).then((res) => {
    if (res.success) {
      state.options = res.data;
    } else {
      state.options = [];
    }
  });
};

const textareaRef = ref()
const showEmojiRef = ref<HTMLElement>()
const keyframes = { transform: 'rotate(360deg)' }
const showEmoji = ref(false)
const emit = defineEmits(['memo-added'])

const music163Url = ref('')
const musicType = ref('')
const musicId = ref('')
const musicPlatform = ref('netease')

const importMusic = () => {
  const share = parseMusicShareUrl(music163Url.value)
  if (share) {
    musicPlatform.value = share.platform
    musicType.value = share.type
    musicId.value = share.id
  } else if (music163Url.value.trim()) {
    toast.warning('暂不支持该链接，请粘贴网易云音乐或 QQ 音乐的分享链接')
  }
  music163Open.value = false
  musicBoxKey++
}

const toggleShowEmoji = () => {
  showEmoji.value = !showEmoji.value
  useAnimate(showEmojiRef.value, keyframes, { duration: 1000, easing: 'ease-in-out' })
}
const fmtLocation = computed(() => {
  if (locationInfo.value) {
    return locationInfo.value.split(' ').join(' · ')
  }
  return ''
})

const fmtAite = computed(() => {
  if(atpeopleNickname.value.length > 0) {
    return '提醒: ' + atpeopleNickname.value.join('、')
  }
  return ''
})

const fmtAvailable = computed(() => {
  if(avpeopleNickname.value.length > 0) {
    // cookie 值是字符串，avpeople 存的是 number：先转数字再比，否则
    // “私密”徽标永远不显示
    if(avpeople.value.length === 1 && avpeople.value[0] === Number(userId.value)) {
      return '私密'
    }
    return '仅: ' + avpeopleNickname.value.join('、') + '可见'
  }
  return '公开'
})

const content = ref('')
const id = ref(-1)

const linkOpen = ref(false)
const externalUrl = ref('')
const externalTitle = ref('')
const externalFavicon = ref('')
const externalPending = ref(false)
const externalFetchError = ref(false)
const externalTitleEditing = ref(false)
const music163Open = ref(false)

const userId = useCookie('userId')
const clearExternalUrl = () => {
  externalUrl.value = ''
  externalTitle.value = ''
  externalFavicon.value = ''
  linkOpen.value = false
  externalFetchError.value = false
}
const addLink = async () => {
  if (externalPending.value) return
  if (externalFetchError.value && externalTitle.value === '') {
    toast.warning('请填写标题和图标')
    return
  }
  if (externalFetchError.value && externalTitle.value !== '') {
    externalFetchError.value = false
    linkOpen.value = false
    externalPending.value = false
    externalFavicon.value = externalFavicon.value || '/favicon.png'
    return
  }
  externalPending.value = true
  externalFetchError.value = false
  // 直接 $fetch + try/catch：useAsyncData 以 URL 作 key 会把失败/旧结果
  // 缓存进 payload，站点修复后仍拿到旧缓存
  try {
    const res: any = await $fetch('/api/memo/readExternal', {
      method: 'POST',
      body: JSON.stringify({ url: externalUrl.value }),
    })
    if (res?.success) {
      externalTitle.value = res.title || '无法获取标题'
      externalFavicon.value = res.favicon || '/favicon.png'
      linkOpen.value = false
    } else {
      toast.warning('获取失败: ' + (res?.message || '未知错误'))
      externalFetchError.value = true
    }
  } catch (e: any) {
    toast.warning('获取失败: ' + (e?.data?.message || e?.message || '网络异常'))
    externalFetchError.value = true
  } finally {
    externalPending.value = false
  }
}



const dragStart = (event, index) => {
  event.dataTransfer.setData('text/plain', index);
}

const dragOver = (event) => {
  event.preventDefault();
}

const drop = (event, dropIndex) => {
  event.preventDefault();
  const dragIndex = event.dataTransfer.getData('text/plain');
  const dragImg = imgs.value[dragIndex];
  imgs.value.splice(dragIndex, 1);  // 删除被拖拽的图片
  imgs.value.splice(dropIndex, 0, dragImg);  // 在放置位置插入被拖拽的图片
}


const imgs = ref<string[]>([])
const submitting = ref(false)

// 上传进行中的占位项：用本地 blob URL 立刻显示缩略图，旁边一个旋转 spinner，
// 上传完成后从这里删除、把真实 URL 推进 imgs。submit 时如果还有 pending 则提示。
type PendingItem = {
  id: number
  blobUrl: string    // still 的本地预览 URL（来自 createObjectURL）
  isLive?: boolean   // Live Photo 配对的标记
}
const pendingUploads = ref<PendingItem[]>([])
let pendingIdSeq = 0
const removePending = (pid: number) => {
  const idx = pendingUploads.value.findIndex((p) => p.id === pid)
  if (idx >= 0) {
    URL.revokeObjectURL(pendingUploads.value[idx].blobUrl)
    pendingUploads.value.splice(idx, 1)
  }
}
// 用户手动取消上传中的占位图（上传失败/卡住时的自救手段）
const cancelPending = (pid: number) => {
  removePending(pid)
  toast.info('已取消该图片上传')
}
const atpeople = ref<number[]>([])
const atpeopleNickname = ref<string[]>([])

const avpeople = ref<number[]>([])
const avpeopleNickname = ref<string[]>([])

const submitMemo = async () => {
  if (submitting.value) return
  if (content.value === '') {
    toast.warning('请输入内容')
    return
  }
  submitting.value = true
  judgeAtSafty()
  const body = {
    id: id.value,
    content: content.value,
    imgUrls: imgs.value,
    atpeople: atpeople.value,
    avpeople: avpeople.value,
    location: locationInfo.value,
    externalFavicon: externalFavicon.value,
    externalTitle: externalTitle.value,
    externalUrl: externalUrl.value,
    music163Url: music163Url.value
  }
  // 单一请求实例：toast.promise 负责展示，finally 恢复提交按钮（成败都恢复）
  const req = $fetch('/api/memo/save', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  toast.promise(req, {
        loading: '提交中...',
        success: (data) => {
          if (data.success) {
            memoAddEvent.emit(data.id, {data:body,atpeopleNickname:atpeopleNickname.value,avpeopleNickname:avpeopleNickname.value})
            if(!body.id || body.id <= 0){
              location.reload();
            }
            content.value = ''
            id.value = -1
            imgs.value = []
            atpeople.value = []
            atpeopleNickname.value = []
            avpeople.value = []
            avpeopleNickname.value = []
            locationInfo.value = ''
            externalFavicon.value = ''
            externalTitle.value = ''
            externalUrl.value = ''
            showEmoji.value = false
            music163Open.value = false
            music163Url.value = ''
            emit('memo-added')
            return '提交成功';
          } else {
            throw new Error(data.message)
          }
        },
        error: (error) => `提交失败: ${error || '未知错误'}`,
      }
  )
  req.finally(() => { submitting.value = false }).catch(() => {})
}

const pasteImg = async (event: ClipboardEvent) => {
  var items = event.clipboardData?.files
  if (!items || items.length === 0) {
    return;
  }
  // 粘贴也走同一管线：多文件不再丢弃、有占位预览、失败可取消/重试
  await handleFiles(Array.from(items))
}

// Live Photo：iOS 把动态照片导出为同名的 <basename>.HEIC + <basename>.MOV 一对，
// 用户在文件选择器多选两个文件时按基名配对，存为 imgs 中的 "still|video" 一项。
// 单独的图片/视频按原逻辑各自一项。
// 缩略图用 still 那一半（Live Photo 编码 "still|video"）
const previewSrc = (entry: string) => entry.includes('|') ? entry.split('|')[0] : entry

const baseName = (n: string) => n.replace(/\.[^.]+$/, '')
const isImageFile = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif|tiff?)$/i.test(f.name)
const isVideoFile = (f: File) => f.type.startsWith('video/') || /\.(mov|mp4|m4v)$/i.test(f.name)

const handleFiles = (files: File[]) => {
  if (files.length === 0) return Promise.resolve()

  // 按基名分组找 Live Photo 配对（同基名 + 一个 image + 一个 video）
  const groups = new Map<string, { still?: File; video?: File; extras: File[] }>()
  for (const f of files) {
    const k = baseName(f.name) || f.name
    const g = groups.get(k) || { extras: [] }
    if (isImageFile(f) && !g.still) g.still = f
    else if (isVideoFile(f) && !g.video) g.video = f
    else g.extras.push(f)
    groups.set(k, g)
  }

  // 把所有 group 的占位条目先一次性塞进 pendingUploads（立刻有预览），
  // 上传逻辑在后台并行跑，结果回来后从 pendingUploads 移除、推进 imgs。
  // 每个任务 finally 里移除占位：任何异常（网络/401/取消）都不会把
  // 占位项残留成“提交按钮永久禁用”。
  const tasks: Array<() => Promise<void>> = []
  for (const g of groups.values()) {
    if (g.still && g.video) {
      const pid = ++pendingIdSeq
      pendingUploads.value.push({
        id: pid,
        blobUrl: URL.createObjectURL(g.still),
        isLive: true,
      })
      const still = g.still, video = g.video
      tasks.push(async () => {
        let stillUrl = '', videoUrl = ''
        try {
          await useUpload(still, (res) => { if (res.success) stillUrl = res.filename; else toast.warning('上传失败' + res.message) })
          await useUpload(video, (res) => { if (res.success) videoUrl = res.filename; else toast.warning('上传失败' + res.message) })
        } finally {
          removePending(pid)
        }
        if (stillUrl && videoUrl) {
          imgs.value = [...imgs.value, `${stillUrl}|${videoUrl}`]
          toast.success('Live Photo 已添加')
        }
      })
      continue
    }
    const lone = [g.still, g.video, ...g.extras].filter(Boolean) as File[]
    for (const f of lone) {
      const pid = ++pendingIdSeq
      pendingUploads.value.push({
        id: pid,
        blobUrl: URL.createObjectURL(f),
      })
      tasks.push(async () => {
        let url = ''
        try {
          await useUpload(f, (res) => { if (res.success) url = res.filename; else toast.warning('上传失败' + res.message) })
        } finally {
          removePending(pid)
        }
        if (url) imgs.value = [...imgs.value, url]
      })
    }
  }

  // 全部 task 并行跑
  return Promise.all(tasks.map(t => t())).then(() => {})
}

const uploadImgs = async (event: Event) => {
  const inputEl = event.target as HTMLInputElement
  const files = Array.from(inputEl.files || [])
  inputEl.value = ''
  await handleFiles(files)
}

memoUpdateEvent.on((event: Memo) => {
  content.value = event.content
  id.value = event.id
  if (event.imgs) {
    imgs.value = event.imgs?.split(',')
  }
  if(event.atpeople) {
    atpeopleNickname.value = []
    atpeople.value = event.atpeople.split(',').map(Number)
    for (let i = 0; i < atpeople.value.length; i++) {
      $fetch('/api/user/settings/get?user='+atpeople.value[i]).then((res: any) => {
        if (res.success) {
          atpeopleNickname.value.push(res.data.nickname)
        }
      })
    }
  }
  if(event.avpeople) {
    avpeopleNickname.value = []
    avpeople.value = event.avpeople.split(',').map(Number)
    for (let i = 0; i < avpeople.value.length; i++) {
      $fetch('/api/user/settings/get?user='+avpeople.value[i]).then((res: any) => {
        if (res.success) {
          avpeopleNickname.value.push(res.data.nickname)
        }
      })
    }
  }
  locationInfo.value = event.location || ''
  externalFavicon.value = event.externalFavicon || ''
  externalTitle.value = event.externalTitle || ''
  externalUrl.value = event.externalUrl || ''
  music163Url.value = event.music163Url || ''
  {
    // 统一走共享解析器：原 split 链在 URL 命中关键词但无 id 参数时
    // 会在 undefined 上调用 split，编辑/回填场景直接崩
    const share = parseMusicShareUrl(music163Url.value)
    if (share) {
      musicPlatform.value = share.platform
      musicType.value = share.type
      musicId.value = share.id
    } else if (music163Url.value) {
      music163Url.value = ''
      musicType.value = ''
      musicId.value = ''
    }
  }
  music163Open.value = false
  musicBoxKey++
})
const showLocationInput = ref(false)
onMounted(async () => {
  // 走 SPA 级缓存，整个会话只发一次（跟 FriendsMemo / HeaderImg 共用）
  const settings = await useSiteSettings().fetchSettings()
  if (settings?.success) {
    showLocationInput.value = (settings.data.customLocation == "1")
  }
})

const getTmpLocation = async (): Promise<string> => {
  let tencentMapKey = ''
  try {
    const siteConfig: any = await $fetch('/api/site/config/get')
    if (siteConfig?.success && siteConfig?.data?.enableTencentMap) {
      tencentMapKey = siteConfig.data.tencentMapKey?.trim() || ''
    }
  } catch (e) {
    console.warn('[location] load site config failed:', e)
  }
  if (!tencentMapKey) {
    // 用 throw 而不是 reject 后继续执行：旧代码 reject 后没 return，
    // 仍会带着空 key 去请求腾讯接口
    throw '当前站点未开启地图服务，请手动输入位置或者联系管理员开启地图服务'
  }

  const params = { key: tencentMapKey, output: 'jsonp' }
  const jsonpUrl = `https://apis.map.qq.com/ws/location/v1/ip?${new URLSearchParams(params).toString()}`
  const { default: jsonp } = await import('jsonp')
  return new Promise<string>((resolve, reject) => {
    jsonp(jsonpUrl, null, (err: any, data: any) => {
      if (err) {
        // 必须 reject：旧代码 return 字符串既不 resolve 也不 reject，
        // toast.promise 会永远停在“获取位置中...”
        reject('获取位置失败，请手动输入位置')
        return
      }
      const result = data?.result
      const ad = result?.ad_info ?? {}
      const ref = result?.address_reference ?? {}
      if (data?.status !== 0 || !ad.nation) {
        reject('获取位置失败，请手动输入位置')
        return
      }
      let pos = ad.nation
      if (ad.province && ad.province !== '') pos += '-' + ad.province
      if (ad.city && ad.city !== '' && ad.city !== ad.province) pos += '-' + ad.city
      if (ad.district && ad.district !== '') pos += '-' + ad.district
      // 各参考点取自己的 title：旧代码 8 个分支全部 copy-paste 成 town.title，
      // 会出现“深圳-深圳”这类重复/错误位置；按优先级取第一个存在的
      const refOrder = [
        'famous_area', 'business_area', 'town', 'landmark_l1', 'landmark_l2',
        'street', 'street_number', 'crossroad', 'water', 'ocean',
      ]
      for (const key of refOrder) {
        const item = ref[key]
        if (item && item.title) {
          pos += ' ' + item.title
          break
        }
      }
      resolve(pos)
    })
  })
}

async function updateLocation() {
  try {
    toast.promise(getTmpLocation(), {
      loading: '获取位置中...',
      success: (data: any) => {
        typeof data === "string" ? locationInfo.value = data : locationInfo.value = ''
        return '获取位置成功';
      },
      error: (error: any) => {
        locationInfo.value = '';
        return error;
      }
    });
  } catch (error) {
    console.error(error);
  }
}

const judgeAtSafty = () => {
  if(avpeople.value.length > 0) {
    for(let i = 0; i < atpeople.value.length; i++) {
      if(avpeople.value.indexOf(atpeople.value[i]) === -1) {
        avpeople.value.push(atpeople.value[i]);
        avpeopleNickname.value.push(atpeopleNickname.value[i]);
      }
    }
  }
}

</script>

<style scoped>
.full-cover-image-mult {
  object-fit: cover;
  object-position: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  border: transparent 1px solid;
}
.memo-info-list{
  border-top: 1px solid rgba(0, 0, 0, .06);
}
.dark .memo-info-list{
  border-top-color: rgba(255, 255, 255, .08);
}
img{
  pointer-events: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -webkit-user-select:none;
  -o-user-select:none;
  user-select:none;
}

.qus-box{
  margin-bottom: 10px;
}

.circle {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 15px;
  height: 15px;
  background-color: white;
  border: 1px solid black;
  border-radius: 50%;
  position: relative;
}

.exclamation {
  color: black;
  font-size: 10pt;
  font-weight: bold;
}

.tooltip {
  position: relative;
  display: inline-block;
}

.tooltip-text {
  visibility: hidden;
  width: 150px;
  background-color: #555;
  color: #fff;
  text-align: left;
  padding: 5px;
  border-radius: 6px;
  font-size: 10pt;

  position: absolute;
  z-index: 1;
  bottom: 125%;
  left: 50%;
  margin-left: -75px;
  opacity: 0;
  transition: opacity 1s;
}

.tooltip:hover .tooltip-text {
  visibility: visible;
  opacity: 1;
}

.aplayer-body {
  max-width: 100%; /* 限制宽度不超过父容器 */
  width: 100%; /* 自动调整宽度 */
}

.aplayer-pic{
  z-index: 1;
}

.aplayer-music {
  overflow: hidden;
  display: inline-block;
  align-items: center;
  width: 100%;
  position: absolute;
  animation: scroll 8s linear infinite;
}

.aplayer-title, .aplayer-author {
  padding-right: 10px;
}

@keyframes scroll {
  from { transform: translateX(100%); }
  to { transform: translateX(-100%); }
}

@keyframes progress-slide {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.aplayer-lrc {
  margin-top: 25px !important; /* 调整歌词与播放器的间距 */
}

</style>