<template>
  <HeaderImg />
  <div>

    <div class="content flex flex-col divide-y divide-[#C0BEBF]/10 gap-2">
      <div v-if="state.loaded && state.memoList.length === 0" class="text-center">
        <div class="my-2 text-sm">关于该话题什么也没有,赶紧去登录发表Moments，内容里添加上 #{{ tagname }} 吧!</div>
      </div>
      <FriendsMemo :memo="memo" v-for="memo in state.memoList" :key="memo.id" :show-more="true"
                   @memo-update="firstLoad" />
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
import { type User, type Memo } from '~/lib/types';
import { onMounted, onUnmounted, watch, ref } from 'vue';
import {toast} from "vue-sonner";
import HeaderImg from "~/components/HeaderImg.vue";
import MemoInput from "~/components/MemoInput.vue";
import FriendsMemo from "~/components/FriendsMemo.vue";

const getMore = ref(null);
const token = useCookie('token')
const route = useRoute();
const tagname = route.params.tagname;

let observer: IntersectionObserver | null = null;

const state = reactive({
  memoList: Array<Memo>(),
  page: 1,
  hasNext: false,
  loaded: false,
  loadingMore: false
})

// 生命周期钩子必须在 setup 顶层同步注册：放进 onMounted 的 await 之后
// 会因无 active instance 而注册失败，observer 永不清理（每次进出页面泄漏一个）
onUnmounted(() => {
  observer?.disconnect()
  observer = null
})

const setupObserver = () => {
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

onMounted(async () => {
  await firstLoad();
});

const firstLoad = async () => {
  state.page = 1
  toast.promise($fetch('/api/memo/list', {
        method: 'POST',
        body: JSON.stringify({
          tagname: tagname,
          page: state.page,
        })
      }), {
        loading: '加载中...',
        success: (data) => {
          if (data.success) {
            state.memoList = data.data as any as Memo[]
            state.hasNext = data.hasNext || false
            state.loaded = true
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
          tagname: tagname,
          page: state.page + 1
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
