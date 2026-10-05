<template>
  <div class="footer p-4 flex flex-col items-center text-xs">
    <div class="flex flex-col gap-1 items-center">
      <a class="my-2 text-gray-500" v-if="beian" href="https://beian.miit.gov.cn/" target="_blank">{{ beian }}</a>
    </div>
  </div>
</template>

<script setup lang="ts">
// 页脚只保留备案号展示。原 CDN 品牌横幅（"本站由 xx 提供高防CDN加速/防护
// 服务" + Cloudflare/Akamai/Fastly/CloudFront/EdgeCast/腾讯云/阿里云 logo
// 池 + RandallFlare SSR 品牌块）随 Cloudflare 迁移一并移除——站点已部署在
// Vercel，供应商展示既不准确也无必要。
const response = await $fetch('/api/user/settings/get?user=0');
const beian = response.data.beianNo
</script>
