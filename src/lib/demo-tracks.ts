import type { Track } from '@/types'

/**
 * 演示曲目。
 *
 * 这三段音频是 **scripts/generate-demo-audio.py 程序合成的**，
 * 不涉及任何版权，可以随便用、随便删。
 *
 * 它们只在两种情况下出现：
 *   1. 还没配 Supabase（本地演示模式）；
 *   2. 配了 Supabase，但唱片架上一张都没有。
 * 你自己上传第一首歌之后，它们就自动消失了 —— 所以不会有「假歌混进来」的问题。
 */
export const DEMO_TRACKS: Track[] = [
  {
    id: 'demo:lamp-pad',
    title: '台灯下的和弦',
    artist: '房间电台',
    audioUrl: '/audio/demo/lamp-pad.wav',
    coverUrl: null,
    audioPath: 'demo/lamp-pad.wav',
    coverPath: null,
    duration: 8,
    tags: ['深夜', '随便听听'],
    note: '合成出来的一段和弦垫。听起来像有人在隔壁房间按着钢琴键不肯放。',
    visibility: 'public',
    sort: 10,
    playCount: 0,
    createdAt: new Date(0).toISOString(),
    isDemo: true,
  },
  {
    id: 'demo:rain-noise',
    title: '窗上的雨',
    artist: '房间电台',
    audioUrl: '/audio/demo/rain-noise.wav',
    coverUrl: null,
    audioPath: 'demo/rain-noise.wav',
    coverPath: null,
    duration: 8,
    tags: ['雨', '深夜'],
    note: '不是录的雨，是算出来的雨。但它确实会下。',
    visibility: 'public',
    sort: 20,
    playCount: 0,
    createdAt: new Date(0).toISOString(),
    isDemo: true,
  },
  {
    id: 'demo:soft-pulse',
    title: '凌晨两点的节拍',
    artist: '房间电台',
    audioUrl: '/audio/demo/soft-pulse.wav',
    coverUrl: null,
    audioPath: 'demo/soft-pulse.wav',
    coverPath: null,
    duration: 8,
    tags: ['深夜', '通勤'],
    note: '很懒的一个鼓机。它每四拍才愿意认真一下。',
    visibility: 'public',
    sort: 30,
    playCount: 0,
    createdAt: new Date(0).toISOString(),
    isDemo: true,
  },
]
