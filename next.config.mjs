/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * 构建产物放哪。
   *
   * ⚠️ 开发和构建**必须用不同的目录**，否则 `next dev` 跑着的时候再跑
   * `next build`，两者共写 `.next` 会把它写坏 —— 表现是整站 CSS/JS chunk 全部 404、
   * 样式全丢、客户端永远不 hydrate（页面上所有 useState 停在初值）。
   * 这个现象非常像"代码写错了"，我为此白查过一轮（星空那页的行星/月亮/时间三块
   * 同时显示空值，其实是这个原因）。
   *
   * 用 NODE_ENV 判断而不是加一个环境变量：`next dev` 自己会设 development、
   * `next build` 设 production，所以不需要在 package.json 里写跨平台设置环境变量的
   * 命令（Windows 上 `FOO=1 next dev` 是不work的，得再引一个 cross-env）。
   */
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  // 图片：只允许 Supabase Storage 与本地占位图，避免被当成图床 / 开放代理
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
    formats: ['image/webp'],
  },
  // 音频文件通过 <audio> 直接播放，这里无需额外配置；
  // 但把常用的响应头写清楚，方便缓存与移动端拖动进度条。
  async headers() {
    return [
      {
        source: '/audio/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Accept-Ranges', value: 'bytes' },
        ],
      },
    ]
  },
  experimental: {
    /**
     * 默认保持 Next.js 官方行为（构建时用子进程跑 worker）。
     * 只有在不允许 fork 子进程的环境（某些容器 / CI 沙箱）里，
     * 才用 `NEXT_USE_WORKER_THREADS=1 npm run build` 把 worker 换成线程。
     */
    ...(process.env.NEXT_USE_WORKER_THREADS === '1' ? { workerThreads: true } : {}),
  },
}

export default nextConfig
