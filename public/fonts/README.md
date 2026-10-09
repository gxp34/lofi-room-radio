# 字体目录（可选）

默认情况下，本站**不使用任何自托管字体**，全部走系统字体栈，理由见
[`docs/字体与素材.md`](../../docs/字体与素材.md)：

- `next/font/google` 会在构建时联网下载字体，离线或网络受限时 `next build` 直接失败；
- 英文点阵字体（VT323 之类）没有汉字，直接用会满屏豆腐块。

想换成 Space Mono / VT323 / 霞鹜文楷，把 `.woff2` 文件放到这个目录，然后按文档里的
**方案 A（自托管）** 操作，只需要加两段 `@font-face` 加改一行 CSS 变量。

## 如果放字体在这里，建议的命名

```
public/fonts/
├─ SpaceMono-Regular.woff2
├─ SpaceMono-Bold.woff2
├─ VT323-Regular.woff2
└─ LXGWWenKai-Regular.woff2     # 中文字体，注意体积（建议做子集化）
```

## 授权

放进来的字体必须是 OFL / CC0 / 已购授权等允许商用的。
霞鹜文楷是 OFL 协议，可以放心用（记得保留它的授权文件）。
