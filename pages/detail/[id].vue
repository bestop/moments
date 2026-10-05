<template>
  <div>
    <div class="p-2 sm:p-4">
      <FriendsMemo :memo="memo as any as Memo" v-if="memo" :show-more="true" @memo-update="refresh" />
      <span v-else>{{ message || '内容不存在' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Memo } from '~/lib/types';
import { plainExcerpt } from '~/lib/utils';

const route = useRoute()
const id = route.params.id as string

// SSR 化：useFetch 在服务端执行并自动转发浏览器 cookie，私密内容的可见性
// 判断与客户端完全一致；首屏 HTML 直接包含动态正文与作者信息，不再依赖
// onMounted 后的客户端请求（SEO 抓取 + 首屏渲染双收益）。
const { data: res, refresh } = await useFetch('/api/memo/detail', {
  key: `memo-detail:${id}`,
  method: 'POST',
  body: { id },
})

const memo = computed(() =>
  res.value?.success && res.value?.data ? (res.value.data as unknown as Memo) : null,
)
const message = computed(() => res.value?.message ?? '')

// —— 内容页 SEO meta（服务端注入 head，分享/搜索引擎可见）——
const authorName = computed(
  () => (memo.value as any)?.user?.nickname || (memo.value as any)?.user?.username || '',
)
const excerpt = computed(() => plainExcerpt(memo.value?.content ?? ''))
const requestOrigin = useRequestURL().origin
const ogImage = computed(() => {
  const first = memo.value?.imgs?.split(',')[0]
  if (!first) return undefined
  return first.startsWith('http') ? first : requestOrigin + first
})
const pageTitle = computed(() => (authorName.value ? `${authorName.value}的动态` : 'Moments'))

useSeoMeta({
  title: pageTitle,
  description: () => excerpt.value || undefined,
  ogTitle: pageTitle,
  ogDescription: () => excerpt.value || undefined,
  ogType: 'article',
  ogImage,
})
</script>

<style scoped></style>
