<template>
<div>
  <HeaderImg />
  <div class="flex flex-col gap-4 p-2 sm:p-4" v-html="content"></div>
  <div id="version-info">
    当前版本: <span id="version">V0.4.6 Beta</span>
    <div class="update-details">
      <div>这是一个基于Vue3/Nuxt3的开源项目，用于朋友圈、留言板等功能。</div>
      <div>本项目Fork自大佬<a href="https://github.com/kingwrcy" target="_blank">kingwrcy</a>的<a href="https://github.com/kingwrcy/moments" target="_blank">moments</a></div>
      更新日志:
      <br/>
      ·V0.1.0 2024-04-22 创建模板
      <br/>
      ·V0.1.1 2024-04-22 更新通知弹窗，添加动态加载
      <br/>
      ·V0.1.2 2024-04-23 支持markdown（不修改字体大小，也无列表等，保持朋友圈显示和谐）
      <br/>
      ·V0.2.0 2024-04-23 markdown功能完善，修复更新页面内容时markdown文本显示异常
      <br/>
      ·V0.2.1 2024-04-23 新增验证码功能
      <br/>
      ·V0.2.2 2024-04-24 新增访问速率限制，新增评论字数限制，将可变变量移动到.env文件
      <br/>
      ·V0.2.3 2024-04-24 新增邮件通知功能，所有被评论者（如果填写过邮箱）将会收到邮件通知
      <br/>
      ·V0.2.4 2024-04-24 新增自动获取位置，新增超长评论首页隐藏
      <br/>
      ·V0.2.5 2024-04-24 新增评论审核功能
      <br/>
      ·V0.2.6 2024-04-25 更新图片显示，新增图片懒加载
      <br/>
      ·V0.2.7 2024-04-26 更新多用户，demo版
      <br/>
      ·V0.2.8 2024-04-26 更新多用户权限控制
      <br/>
      ·V0.3.0 2024-04-26 正式开放多用户，欢迎注册尝试
      <br/>
      ·V0.3.1 2024-04-28 修复弹窗样式，更新变更用户名逻辑
      <br/>
      ·V0.3.2 2024-04-29 新增上传完的图片拖动排序功能
      <br/>
      ·V0.3.3 2024-04-30 新增用户邮箱修改功能
      <br/>
      ·V0.3.4 2024-05-01 新增“#”标签/话题功能，统一菜单栏位置，更新置顶显示方式，修复消息回复框不关闭的问题
      <br/>
      ·V0.3.5 2024-05-03 将后台配置更新到页面设置中，更方便更新修改管理
      <br/>
      ·V0.3.6 2024-05-04 新增@功能，被艾特用户拥有跟作者相同的事件通知
      <br/>
      ·V0.3.7 2024-05-12 新增查看权限功能，支持私密，或者部分用户可见
      <br/>
      ·V0.3.8 2024-05-14 修复编辑修改艾特用户时，无法更新提示的问题
      <br/>
      ·V0.3.9 2024-05-16 修复长文本审核异常，代码注入问题，markdown显示bug，v0.3.8_with_redis容器脚本bug
      <br/>
      ·V0.4.0 2024-05-18 新增站内通知功能，新增网站公告后台修改功能
      <br/>
      ·V0.4.1 2024-05-21 修复保存memo后图片打开异常、修复menu菜单显示异常、修复权限控制异常
      <br/>
      ·V0.4.2 2024-05-28 图片放大查看时隐藏菜单按钮，修复切换页面时头图不切换的bug，修复fancybox在新插入文章的时候刷新机制出现问题，修复docker启动时不检查upload文件夹是否存在
      <br/>
      ·V0.4.3 2024-06-03 新增几个快捷标签，新增部分后台自定义选项，新增邮件模板，新增code样式点击可复制，新增个人页面css，个人js依旧不能自定义
      <br/>
      ·V0.4.4 2024-06-06 全新音乐播放器上线（QQ音乐、网易云音乐），由于特殊原因暂不支持vip歌曲，新增首页天气控件开关，位置自定义开关，时间格式自定义
      <br/>
      ·V0.4.5 2024-06-27 更新自动生成jwtkey，新增Memo对代码段的适配，新增自定义关于页面，取消对s3存储的支持（由于准备支持图像处理功能，暂时放弃s3支持），新增根据内容搜索，修复一些bug
      <br/>
      ·V0.4.6 开发中... 适配websocket中
    </div>
  </div>
</div>
</template>

<script setup lang="ts">

const content = ref('')

await $fetch('/api/site/about/get').then((res) => {
  if(res.success) {
    content.value = res.data
  }
})


</script>

<style scoped>
#version-info {
  text-align: left;
  position: fixed;
  left: 10px;
  bottom: 10px;
  margin: 20px;
  padding: 0;
  border-radius: 5px;
  font-size: 12px;
  color: rgba(128, 128, 128, 0.7);
  z-index: 9999;
  transition: max-height 0.3s ease, max-width 0.3s ease;
  overflow: hidden;
  max-height: 20px;
  max-width: 100px;
}

#version-info:hover {
  color: white;
  background-color: rgba(128, 128, 128, 0.7);
  max-height: 100%;
  max-width: 80%;
}

.update-details {
  opacity: 0;
  max-height: 0;
  overflow: hidden;
  transition: all 0.3s ease;
}

#version-info:hover .update-details {
  opacity: 1;
  max-height: 100%;
}
</style>