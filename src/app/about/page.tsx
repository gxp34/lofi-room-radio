'use client'

import Link from 'next/link'
import {
  ArrowRight,
  Cat,
  Coffee,
  Disc3,
  Lamp,
  Mailbox,
  NotebookPen,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { Icon } from '@/components/icon'
import { useRoom } from '@/components/providers/room-provider'
import { AchievementBoard } from '@/components/room/achievement-board'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DEFAULT_ACHIEVEMENTS, NAV_ITEMS } from '@/lib/constants'

/**
 * 主持人档案。
 *
 * 这一页刻意不写简历 —— 没有履历、没有技能条、没有「擅长团队协作」。
 * 就是房东坐在那儿，跟你解释这间房间是怎么来的。
 */

const ROOM_FACTS = [
  {
    icon: Lamp,
    title: '灯',
    text: '暖黄的那盏，二十块钱，开关有点松。点它 3 次我会念叨电费，7 次会跳闸。',
  },
  {
    icon: Disc3,
    title: '唱片机',
    text: '针有点钝了，爆豆声比音乐清楚。长按它，能拧到一些奇怪的频道。',
  },
  {
    icon: Cat,
    title: '猫',
    text: '不太理人，但会叼东西回来。如果你连着三天来看它，它会把小钥匙吐出来。',
  },
  {
    icon: NotebookPen,
    title: '日记本',
    text: '写到一半。公开的那些在书桌上，剩下的锁在抽屉里。',
  },
  {
    icon: Mailbox,
    title: '抽屉',
    text: '树洞在这里。不用登录、不用留名字。我会一封一封读完。',
  },
  {
    icon: Coffee,
    title: '茶',
    text: '总是凉。深夜写东西的时候会忘。',
  },
] as const

export default function AboutPage() {
  const { settings } = useRoom()

  return (
    <div className="container max-w-3xl py-8 sm:py-12">
      {/* ---------------- 开头 ---------------- */}
      <header className="mb-10">
        <p className="mb-2 font-display text-xs uppercase tracking-[0.2em] text-dust">
          {'// 主持人档案'}
        </p>
        <h1 className="font-display text-2xl text-paper sm:text-3xl">
          {settings.hostName}，以及这间房间
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{settings.tagline}</p>
      </header>

      {/* ---------------- 关于 ---------------- */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-sm text-dust">{'// 关于'}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-[1.9] text-paper/90">
            {settings.about}
          </p>
        </CardContent>
      </Card>

      {/* ---------------- 房间里的东西 ---------------- */}
      <section aria-labelledby="facts-heading" className="mb-10">
        <h2 id="facts-heading" className="mb-4 font-display text-lg text-lamp">
          {'// 房间里的东西'}
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          {ROOM_FACTS.map((fact) => (
            <Card key={fact.title}>
              <CardContent className="flex gap-3 p-4">
                <fact.icon className="mt-0.5 h-4 w-4 shrink-0 text-lamp" aria-hidden />
                <div className="min-w-0">
                  <p className="font-display text-sm text-paper">{fact.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{fact.text}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------- 一封短信 ---------------- */}
      <section aria-labelledby="letter-heading" className="mb-10">
        <h2 id="letter-heading" className="mb-4 font-display text-lg text-lamp">
          {'// 写给你的'}
        </h2>

        <div className="paper rounded-xl p-5 shadow-sm sm:p-7">
          <div className="space-y-4 text-[15px] leading-[1.9] text-[#2b2230]">
            <p>你好。</p>
            <p>
              这间房间是我自己搭的。没有别的用途，不是作品集，也不打算放简历 ——
              就是想有一个地方，可以放歌、写点东西、听雨。
            </p>
            <p>
              你可以随便点点看。台灯、猫、唱片机、抽屉，都有反应，
              有些反应藏在第 7 次点击、第 100 次点击、或者连续第三天的深夜里。
              我给每个物件都写了不止一句话，因为现实里的东西也不会只说一句。
            </p>
            <p>
              如果你想说什么，抽屉一直开着。匿名，不用邮箱，我会读完。
              不知道写什么也可以，写「今天很累」就够了。
            </p>
            <p className="font-display text-sm text-[#2b2230]/70">
              —— {settings.hostName}，写在{settings.weather}的夜里
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- 成就 ---------------- */}
      <AchievementBoard className="mb-10" />

      <p className="mb-8 flex items-center gap-2 text-xs text-dust">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        一共 {DEFAULT_ACHIEVEMENTS.length} 个成就，其中 4 个是隐藏的。
      </p>

      {/* ---------------- 正经的部分 ---------------- */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm text-rain">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            说点正经的
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-paper/85">隐私：</strong>
            树洞不存明文 IP，只存加盐哈希，且仅用于限流。
            访问统计只记录「某个浏览器会话来过哪个页面」，不采集设备信息、不做跨站追踪。
            所有你在这台设备上触发的房间事件、成就、连点记录，都只存在你自己的浏览器里。
          </p>
          <p>
            <strong className="text-paper/85">版权：</strong>
            {settings.musicCopyrightNotice}
          </p>
          <p>
            <strong className="text-paper/85">无障碍：</strong>
            全站键盘可达；系统开启「减少动态效果」时，雨滴和所有动画会自动停下来；
            页面缩放没有被锁死。
          </p>
        </CardContent>
      </Card>

      {/* ---------------- 社交链接（后台可配） ---------------- */}
      {settings.socialLinks.length > 0 && (
        <section aria-labelledby="links-heading" className="mb-10">
          <h2 id="links-heading" className="mb-3 font-display text-sm text-dust">
            {'// 别的地方'}
          </h2>
          <div className="flex flex-wrap gap-2">
            {settings.socialLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3.5 py-1.5 text-xs text-paper/85 transition-colors hover:border-lamp/30 hover:text-lamp"
              >
                {link.icon && <Icon name={link.icon} className="h-3.5 w-3.5" />}
                {link.label}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- 继续逛 ---------------- */}
      <section aria-labelledby="next-heading">
        <h2 id="next-heading" className="mb-3 font-display text-sm text-dust">
          {'// 还想看看的话'}
        </h2>
        <div className="flex flex-wrap gap-2">
          {NAV_ITEMS.filter((item) => item.href !== '/about' && item.href !== '/').map((item) => (
            <Button key={item.href} asChild variant="outline" size="sm">
              <Link href={item.href}>
                <Icon name={item.icon} className="h-3.5 w-3.5" />
                {item.label}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          ))}
        </div>

        <Badge variant="muted" className="mt-6">
          房东不太爱说话，但东西都摆在这儿了。
        </Badge>
      </section>
    </div>
  )
}
