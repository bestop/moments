// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  ssr: true,
  modules: [
    "@nuxtjs/tailwindcss",
    "shadcn-nuxt",
    "@nuxtjs/color-mode",
    "@vite-pwa/nuxt",
  ],
  pwa: {
    registerType: "autoUpdate",
    injectRegister: "auto",
    // 切到 injectManifest：我们自己写 SW（要处理 push event），workbox 帮忙打 precache
    strategies: "injectManifest",
    srcDir: "service-worker",
    filename: "sw.ts",
    injectManifest: {
      // 只预缓存构建产物 + 站点必需的小体积静态资源。不要用宽泛的
      // public/** 通配 —— 以后任何放进 public 的大图都会被打进每个用户
      // 的离线缓存，首装流量爆炸。
      globPatterns: [
        "_nuxt/**",
        "pwa-*.png",
        "favicon*",
        "apple-touch-icon.png",
        "avatar.webp",
        "cover.webp",
        "loader.svg",
        "css/APlayer.min.css",
        "js/APlayer.min.js",
        "js/Meting.min.js",
      ],
      globIgnores: ["**/heic-converter*.js"],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    },
    manifest: {
      name: "Moments",
      short_name: "Moments",
      description: "Moments 个人时间线",
      lang: "zh-CN",
      theme_color: "#181818",
      background_color: "#f1f5f9",
      display: "standalone",
      orientation: "portrait",
      scope: "/",
      start_url: "/",
      icons: [
        { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "/pwa-256x256.png", sizes: "256x256", type: "image/png" },
        { src: "/pwa-384x384.png", sizes: "384x384", type: "image/png" },
        { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
        { src: "/pwa-maskable-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    // workbox 的 runtimeCaching / skipWaiting 等改到了自定义 SW 里（service-worker/sw.ts）
    client: {
      installPrompt: true,
    },
    devOptions: {
      enabled: false,
      type: "module",
    },
  },
  colorMode: {
    classSuffix: "",
  },
  shadcn: {
    /**
     * Prefix for all the imported component
     */
    prefix: "",
    /**
     * Directory that the component lives in.
     * @default "./components/ui"
     */
    componentDir: "./components/ui",
  },
  nitro: {
    // Vercel Node runtime preset：server/api 与 server/routes 变成
    // Vercel Functions（Node 20+），静态资源走 Vercel CDN。
    preset: 'vercel',
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          // 让 chunk 文件名带上其名字（默认 nuxt 配置只用 hash），方便
          // workbox.globIgnores 按名字精确排除
          chunkFileNames: '_nuxt/[name]-[hash].js',
          manualChunks(id: string) {
            // 把 heic-to + 它带的 libheif WASM 包打成独立 chunk，文件名固定前缀
            if (id.includes('/heic-to/') || id.includes('libheif')) {
              return 'heic-converter';
            }
          },
        },
      },
    },
  },
  runtimeConfig: {
    public: {
      // Web Push VAPID 公钥（浏览器订阅时需要）。私钥/subject 走服务端
      // 环境变量 VAPID_PRIVATE_KEY / VAPID_SUBJECT（Vercel 项目环境变量）。
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY
        || 'BBWjYp1l-pjKkNcjNghpQb5B7DmwtnOhLsCbBERCUbzSI40D5CouDewrIg5sWTpXb1ClbJBCNE_VZmxof395Ch8',
    },
  },
  app: {
    // head: {
    //   style: [
    //     { src: `https://unpkg.com/aplayer/dist/APlayer.min.css`, type: 'text/css' },
    //   ],
    //   script: [
    //     { src: `https://unpkg.com/aplayer/dist/APlayer.min.js`, type: 'text/javascript', async: true, defer: true },
    //     { src: `https://unpkg.com/@xizeyoupan/meting@latest/dist/Meting.min.js`, type: 'text/javascript', async: true, defer: true },
    //   ]
    // }
    head: {
      style: [
        { src: `/css/APlayer.min.css`, type: 'text/css' },
      ],
      script: [
        { src: `/js/APlayer.min.js`, type: 'text/javascript', async: true, defer: true },
        { src: `/js/Meting.min.js`, type: 'text/javascript', async: true, defer: true },
      ]
    }
  },
  plugins: [
    '~/plugins/vue-lazyload.ts',
    '~/plugins/pinia.ts',
    '~/plugins/meting.ts'
  ],
});
