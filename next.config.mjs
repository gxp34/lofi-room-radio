/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
