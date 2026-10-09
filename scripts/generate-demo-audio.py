"""
生成三段「房间演示音频」。

为什么要有这个脚本：
  前台播放器需要真的能出声才能验证（也让你第一次跑起来就有歌听）。
  这三段是**程序合成的**，没有任何版权问题，可以随便用、随便删。
  你自己上传音乐之后，演示曲目就不再显示了。

输出：public/audio/demo/*.wav
格式：22050 Hz / 单声道 / 16bit —— 音质够用，文件小，浏览器都认。
"""

import os
import wave

import numpy as np

SR = 22050
DURATION = 8.0
OUT_DIR = os.path.join("public", "audio", "demo")

# 统一的淡入淡出，避免循环时「咔」一声
FADE = 0.35


def envelope(n: int, fade: float = FADE) -> np.ndarray:
    """首尾各做一段淡入淡出"""
    env = np.ones(n)
    fade_n = int(fade * SR)
    if fade_n * 2 < n:
        env[:fade_n] = np.linspace(0.0, 1.0, fade_n)
        env[-fade_n:] = np.linspace(1.0, 0.0, fade_n)
    return env


def normalize(signal: np.ndarray, peak: float = 0.5) -> np.ndarray:
    maximum = float(np.max(np.abs(signal))) or 1.0
    return signal / maximum * peak


def write_wav(name: str, signal: np.ndarray) -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    data = np.clip(signal, -1.0, 1.0)
    pcm = (data * 32767.0).astype("<i2")

    with wave.open(path, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SR)
        handle.writeframes(pcm.tobytes())

    size_kb = os.path.getsize(path) / 1024
    print(f"  写出 {path}  ({size_kb:.0f} KB)")


def t() -> np.ndarray:
    return np.arange(int(SR * DURATION)) / SR


def detuned_sine(freq: float, time: np.ndarray, detune: float = 0.0) -> np.ndarray:
    """两个略微失谐的正弦叠加，听感更「暖」，也更像旧录音"""
    return 0.5 * np.sin(2 * np.pi * freq * time) + 0.5 * np.sin(
        2 * np.pi * (freq + detune) * time
    )


# ---------------------------------------------------------------------------
# 1. 台灯下的和弦垫：Fmaj7 慢慢呼吸
# ---------------------------------------------------------------------------
def make_lamp_pad() -> np.ndarray:
    time = t()
    chord = [174.61, 220.00, 261.63, 329.63]  # F3 A3 C4 E4
    signal = np.zeros_like(time)

    for index, freq in enumerate(chord):
        # 每个音有自己的呼吸相位，避免四个音一起起伏显得机械
        lfo = 0.55 + 0.45 * np.sin(2 * np.pi * (0.07 + index * 0.017) * time + index)
        signal += detuned_sine(freq, time, detune=0.6) * lfo / len(chord)

    # 低八度铺一层底
    signal += detuned_sine(87.31, time, detune=0.4) * 0.35

    signal *= envelope(len(time))
    return normalize(signal, 0.45)


# ---------------------------------------------------------------------------
# 2. 窗外雨声：滤波噪声 + 偶尔的水滴
# ---------------------------------------------------------------------------
def make_rain() -> np.ndarray:
    time = t()
    rng = np.random.default_rng(20240611)

    # 白噪声做一阶低通，得到「沙沙」而不是「嘶嘶」
    noise = rng.normal(0, 1, len(time))
    smoothed = np.copy(noise)
    alpha = 0.06
    for i in range(1, len(smoothed)):
        smoothed[i] = smoothed[i - 1] + alpha * (noise[i] - smoothed[i - 1])

    # 慢速起伏，像雨势一阵大一阵小
    gust = 0.6 + 0.4 * np.sin(2 * np.pi * 0.06 * time) * np.sin(2 * np.pi * 0.017 * time + 1.2)
    signal = smoothed * gust * 6.0

    # 随机水滴：短促的衰减正弦
    for _ in range(26):
        start = int(rng.uniform(0, DURATION - 0.25) * SR)
        length = int(0.12 * SR)
        freq = rng.uniform(900, 2400)
        local = np.arange(length) / SR
        drop = np.sin(2 * np.pi * freq * local) * np.exp(-local * 42) * 0.22
        signal[start : start + length] += drop

    signal *= envelope(len(time), fade=0.6)
    return normalize(signal, 0.4)


# ---------------------------------------------------------------------------
# 3. 深夜脉冲：一个很轻的节拍 + 低音
# ---------------------------------------------------------------------------
def make_soft_pulse() -> np.ndarray:
    time = t()
    signal = detuned_sine(87.31, time, detune=0.3) * 0.5  # F2 低音
    signal += detuned_sine(174.61, time, detune=0.5) * 0.18

    # 每 0.5 秒一次很轻的「哒」，用衰减正弦模拟
    beat = 0.5
    for index in range(int(DURATION / beat)):
        center = index * beat
        length = int(0.18 * SR)
        start = int(center * SR)
        if start + length > len(signal):
            break
        local = np.arange(length) / SR
        # 每四拍重一下，像个很懒的鼓机
        gain = 0.16 if index % 4 == 0 else 0.08
        pulse = np.sin(2 * np.pi * 320 * local) * np.exp(-local * 34) * gain
        signal[start : start + length] += pulse

    signal *= envelope(len(time))
    return normalize(signal, 0.42)


def main() -> None:
    print("生成演示音频 →", OUT_DIR)
    write_wav("lamp-pad.wav", make_lamp_pad())
    write_wav("rain-noise.wav", make_rain())
    write_wav("soft-pulse.wav", make_soft_pulse())
    print("完成。这三段是程序合成的，无版权限制，可自由替换或删除。")


if __name__ == "__main__":
    main()
