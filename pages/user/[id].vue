<template>
  <HeaderImg />
  <div>
    <div class="content flex flex-col gap-2">
      <div v-if="state.memoList.length === 0" class="text-center">
        <div class="my-2 text-sm">什么也没有,赶紧去登录发表Moments吧!</div>
      </div>
      <div v-for="memo in annotatedMemoList" :key="memo.id">
        <!-- 检查是否需要显示年份 -->
        <div v-if="memo.displayYear">
          <div style="margin: 0 20px">
            <span style="font-size: 30px">{{ memo.displayYear }}</span>
          </div>
        </div>

        <!-- 显示memo -->
        <OnesMemo :memo="memo" :show-more="true" @memo-update="firstLoad" />
      </div>
    </div>

    <div id="get-more" ref="getMore" class="cursor-pointer text-center text-sm opacity-70 my-4" @click="loadMore()" v-if="state.hasNext" >
      {{ state.loadingMore ? '加载中...' : '加载更多' }}
    </div>
    <div class="cursor-pointer text-center text-sm opacity-70 my-4">
      ———— 没有更多啦～ ————
    </div>
  </div>
</template>

<script setup lang="ts">
import { type Memo } from '~/lib/types';
import { plainExcerpt } from '~/lib/utils';
import {onMounted, onUnmounted, watch, ref, computed} from 'vue';

import OnesMemo from "~/components/OnesMemo.vue";
import dayjs from "dayjs";
import {toast} from "vue-sonner";

const token = useCookie('token')
const route = useRoute()

const userId = useCookie('userId');
let findId: any = userId.value || route.params.id

// SSR 化：第一页列表在服务端获取并随 HTML 返回（useFetch 自动转发 cookie，
// 私密内容过滤与客户端一致）；翻页仍走客户端 loadMore 无限滚动。
// key 绑定登录态：匿名/登录看到的可见范围不同，SPA 内不能复用旧 payload
const loginState = useCookie('token')
const { data: firstPage } = await useFetch('/api/memo/list', {
  key: `user-memo-list:${route.params.id}:1:${loginState.value ? 'auth' : 'anon'}`,
  method: 'POST',
  body: { user: route.params.id, page: 1 },
})

// —— 内容页 SEO meta ——
const firstUser = computed(() =>
  Array.isArray(firstPage.value?.data) && firstPage.value.data.length
    ? (firstPage.value.data[0] as any)?.user
    : null,
)
const authorName = computed(() => firstUser.value?.nickname || firstUser.value?.username || '')
const pageTitle = computed(() => (authorName.value ? `${authorName.value}的 Moments` : 'Moments'))
const excerpt = computed(() =>
  Array.isArray(firstPage.value?.data) && firstPage.value.data.length
    ? plainExcerpt((firstPage.value.data[0] as any)?.content ?? '')
    : '',
)
useSeoMeta({
  title: pageTitle,
  description: () => excerpt.value || undefined,
  ogTitle: pageTitle,
  ogDescription: () => excerpt.value || undefined,
})

const getMore = ref(null);

let observer: IntersectionObserver | null = null;

// 生命周期钩子必须在 setup 顶层同步注册：放进 onMounted 的 await 之后
// 会因无 active instance 而注册失败，observer 永不清理（每次进出页面泄漏一个）
onUnmounted(() => {
  observer?.disconnect()
  observer = null
})

const setupObserver = () => {
  // IntersectionObserver 只存在于浏览器：watch(immediate) 在 SSR 期间也会
  // 触发一次，必须在这里拦住（旧代码把 watch 藏在 onMounted 里才是"安全"的）
  if (import.meta.server) return
  observer?.disconnect()
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      loadMore();
    }
  }, {
    // 上边框距离屏幕底部一定距离时触发
    rootMargin: '500px',
  });

  if (getMore.value) {
    observer.observe(getMore.value);
  }
};

// 监听 getMore 引用的变化，并重新设置观察者
watch(getMore, () => {
  setupObserver();
}, {
  immediate: true // 立即触发，确保初始 setup
});

// 被访用户的自定义 CSS：用 useHead 声明，组件卸载时自动移除。
// 旧实现 document.head.appendChild 后永不清理——离开该用户页后其 CSS
// 仍作用于全站（SPA 内直到手动刷新）
const personalCss = ref('')
useHead({
  style: computed(() => (personalCss.value ? [{ innerHTML: personalCss.value }] : [])),
})

onMounted(async () => {
  const url = window.location.pathname
  if(url.startsWith('/user/')) {
    findId = url.split('/user/')[1]
  }
  // 第一页已由 SSR 取回（见上方 useFetch），这里不再重复 firstLoad
  // 拿到个人css（失败不打断页面）
  try {
    const res: any = await $fetch('/api/user/settings/get?user=' + findId)
    if (res?.success && res?.data?.personalCss) {
      personalCss.value = res.data.personalCss
    }
  } catch (e) {
    console.warn('[user] load personal css failed:', e)
  }
});

const annotatedMemoList = computed(() => {
  if (!state.memoList.length) return [];
  let lastYear = null;
  let lastDay = null;
  let started = false;
  return state.memoList.map((memo) => {
    if (!started && memo.pinned) {
      return memo;
    }
    const currentYear = dayjs(memo.createdAt).locale('zh-cn').format('YYYY');
    const currentDay = dayjs(memo.createdAt).locale('zh-cn').format('YYYYMMDD');
    if (!started && !memo.pinned) {
      started = true;
      lastYear = currentYear;
      lastDay = currentDay;
      return { ...memo, displayYear: currentYear, displayDay: currentDay };
    }else{
      let returns = memo;
      if (currentYear !== lastYear) {
        lastYear = currentYear;
        returns = {...returns, displayYear: currentYear};
      }else{
        returns = {...returns, displayYear: null};
      }
      if (currentDay !== lastDay) {
        lastDay = currentDay;
        returns = {...returns, displayDay: currentDay};
      }else{
        returns = {...returns, displayDay: null};
      }
      return returns;
    }

  });
})


const state = reactive({
  // 初值来自 SSR 拉取的第一页；水合时 useAsyncData payload 已就位，两端一致
  memoList: ((firstPage.value?.success && Array.isArray(firstPage.value.data))
    ? (firstPage.value.data as unknown as Memo[])
    : []),
  page: 1,
  hasNext: firstPage.value?.hasNext || false,
  loadingMore: false,
})

const firstLoad = async () => {
  state.page = 1
  toast.promise($fetch('/api/memo/list', {
        method: 'POST',
        body: JSON.stringify({
          user: route.params.id,
          page: state.page,
        })
      }), {
        loading: '加载中...',
        success: (data) => {
          if (data.success) {
            state.memoList = data.data as any as Memo[]
            state.hasNext = data.hasNext || false
            return '加载成功';
          } else {
            return '加载失败: ' + data.message;
          }
        },
        error: (error) => {
          if (error.response && error.response.status === 429) {
            return '请求过于频繁，请稍后再试';
          } else {
            return `加载失败: ${error.message || '未知错误'}`;
          }
        },
        finally() {
          loadLock = false; // 确保加载锁被重置
        },
      }
  );
}


let loadLock = false;

const loadMore = async () => {
  if(loadLock) return;
  loadLock = true;
  state.loadingMore = true

  toast.promise(
      $fetch('/api/memo/list', {
        method: 'POST',
        body: JSON.stringify({
          user: route.params.id,
          page: state.page + 1 // 先不增加页码
        })
      }), {
        loading: '加载中...',
        success: (data) => {
          if (data.success) {
            state.page += 1; // 成功后增加页码
            if (Array.isArray(data.data)) { // 确保数据是数组
              state.memoList.push(...data.data);
            }
            state.hasNext = data.hasNext;
            return '加载成功';
          } else {
            return '加载失败: ' + data.message;
          }
        },
        error: (error) => {
          if (error.response && error.response.status === 429) {
            return '请求过于频繁，请稍后再试';
          } else {
            return `加载失败: ${error.message || '未知错误'}`;
          }
        },
        finally() {
          loadLock = false; // 确保加载锁被重置
          state.loadingMore = false
        },
      }
  );
}


</script>

<style scoped></style>
<style>
</style>
