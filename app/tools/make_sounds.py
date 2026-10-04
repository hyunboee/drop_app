"""캡슐 열고 닫는 소리 10세트 생성기.

실행: python app/tools/make_sounds.py
결과: sound/NN_이름_open.wav, sound/NN_이름_close.wav (44.1kHz 16bit 모노)
악기 녹음이 아니라 코드로 합성한 소리다. 마음에 드는 세트를 고르면 앱에 연결한다.
"""
import math
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parents[2] / 'sound'
rng = np.random.default_rng(11)


def t_axis(sec):
    return np.arange(int(sec * SR)) / SR


def noise(sec):
    return rng.standard_normal(int(sec * SR))


def lowpass(x, fc):
    a = math.exp(-2 * math.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def highpass(x, fc):
    return x - lowpass(x, fc)


def bandpass(x, f0, q=8.0):
    """공진 필터(쌍이차). 금속·나무의 울림을 만든다."""
    w = 2 * math.pi * f0 / SR
    alpha = math.sin(w) / (2 * q)
    b0, b2 = alpha, -alpha
    a0, a1, a2 = 1 + alpha, -2 * math.cos(w), 1 - alpha
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i, v in enumerate(x):
        o = (b0 * v + b2 * x2 - a1 * y1 - a2 * y2) / a0
        y[i] = o
        x2, x1 = x1, v
        y2, y1 = y1, o
    return y


def decay(n, rate):
    return np.exp(-np.arange(n) / SR * rate)


def place(buf, snd, at):
    i = int(at * SR)
    end = min(len(buf), i + len(snd))
    if i < end:
        buf[i:end] += snd[: end - i]


def modal(freqs, rates, sec, amps=None):
    """부딪혔을 때 나는 소리: 감쇠하는 사인파 여러 개."""
    t = t_axis(sec)
    amps = amps or [1.0] * len(freqs)
    return sum(a * np.sin(2 * math.pi * f * t) * np.exp(-r * t) for f, r, a in zip(freqs, rates, amps))


def thud(f0=70, sec=0.5, rate=9.0):
    t = t_axis(sec)
    sweep = f0 * (1 + 1.4 * np.exp(-t * 40))
    ph = 2 * math.pi * np.cumsum(sweep) / SR
    return np.sin(ph) * np.exp(-t * rate)


def click(f=3200, sec=0.04, rate=120.0, q=12):
    n = noise(sec)
    return bandpass(n, f, q) * decay(len(n), rate) * 3


def creak(sec, f_start, f_end, rough=0.6):
    """삐걱이는 소리: 불규칙하게 떨리는 톱니파를 공진 필터로 거른다."""
    t = t_axis(sec)
    jitter = lowpass(noise(sec), 40) * rough * 30
    f = np.linspace(f_start, f_end, len(t)) + jitter
    ph = 2 * math.pi * np.cumsum(f) / SR
    saw = 2 * ((ph / (2 * math.pi)) % 1) - 1
    env = np.sin(math.pi * t / sec) ** 0.7
    return bandpass(saw * env, (f_start + f_end) / 2 * 2.2, 5) * 2.5


def hiss(sec, fc=4000, shape=2.0):
    n = highpass(noise(sec), fc)
    t = t_axis(sec)
    return n * (np.sin(math.pi * t / sec) ** shape)


def rumble(sec, fc=120):
    n = lowpass(noise(sec), fc) * 6
    t = t_axis(sec)
    return n * np.sin(math.pi * t / sec)


def mix(sec, parts):
    buf = np.zeros(int(sec * SR))
    for snd, at, gain in parts:
        place(buf, snd * gain, at)
    return buf


def save(name, x):
    x = np.nan_to_num(x)
    x = x - np.mean(x)
    peak = np.max(np.abs(x)) or 1.0
    x = x / peak * 0.85
    fade = int(0.008 * SR)
    x[:fade] *= np.linspace(0, 1, fade)
    x[-fade:] *= np.linspace(1, 0, fade)
    OUT.mkdir(exist_ok=True)
    with wave.open(str(OUT / name), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    print(name, f'{len(x) / SR:.1f}s')


# ---------- 10세트 (열기, 닫기) ----------

def vault():  # 두꺼운 금고 문: 빗장이 풀리는 딸깍, 묵직한 이동, 낮은 울림
    o = mix(2.0, [
        (click(2400), 0.00, 0.8), (click(2900), 0.12, 0.8), (click(2100), 0.26, 0.9), (click(3300), 0.40, 0.7),
        (thud(55, 0.7, 6), 0.55, 1.0), (creak(0.9, 140, 210, 0.3), 0.6, 0.45), (rumble(1.0, 90), 0.6, 0.5),
        (modal([210, 340, 560, 910], [6, 7, 9, 12], 1.0), 1.35, 0.25),
    ])
    c = mix(1.4, [
        (creak(0.5, 210, 140, 0.3), 0.0, 0.4), (thud(50, 0.8, 7), 0.45, 1.2), (modal([180, 300, 520, 880], [7, 8, 10, 13], 0.9), 0.45, 0.4),
        (click(2200), 0.62, 0.9), (click(2800), 0.74, 0.8), (click(2500), 0.88, 0.7),
    ])
    return o, c


def latch():  # 금속 걸쇠: 짧고 또렷한 딸깍, 스프링
    o = mix(0.9, [(click(3600, rate=90), 0.0, 1.0), (modal([1800, 2650, 3900], [30, 40, 55], 0.3), 0.01, 0.5),
                  (modal([620, 980], [14, 18], 0.4), 0.06, 0.35), (click(2500, rate=140), 0.2, 0.5)])
    c = mix(0.7, [(click(2800, rate=140), 0.0, 0.6), (click(3800, rate=80), 0.10, 1.0), (modal([1900, 2750, 4000], [28, 38, 52], 0.3), 0.11, 0.5)])
    return o, c


def wood():  # 오래된 나무 상자: 경첩 삐걱 + 둔탁한 소리
    o = mix(2.0, [(creak(1.4, 260, 480, 0.8), 0.05, 0.9), (thud(95, 0.4, 14), 1.35, 0.7), (modal([330, 610], [18, 26], 0.4), 1.36, 0.3)])
    c = mix(1.5, [(creak(0.8, 480, 260, 0.8), 0.0, 0.8), (thud(110, 0.5, 11), 0.78, 1.0), (modal([300, 560, 910], [16, 22, 30], 0.5), 0.79, 0.4)])
    return o, c


def stone():  # 돌 뚜껑: 갈리는 소리와 깊은 울림
    grind = bandpass(noise(1.8), 380, 1.6) * 4 * np.sin(math.pi * t_axis(1.8) / 1.8) ** 0.6
    o = mix(2.4, [(grind, 0.0, 0.8), (rumble(1.9, 70), 0.0, 0.9), (thud(45, 1.0, 5), 1.7, 0.9)])
    c = mix(1.8, [(grind[: int(1.0 * SR)], 0.0, 0.7), (rumble(1.0, 70), 0.0, 0.8), (thud(40, 1.1, 5), 0.95, 1.2), (hiss(0.6, 1500, 3), 1.0, 0.15)])
    return o, c


def airlock():  # 밀폐 해제: 공기 빠지는 소리, 걸림쇠, 서보
    servo = lambda sec, a, b: (np.sin(2 * math.pi * np.cumsum(np.linspace(a, b, int(sec * SR))) / SR) * (np.sin(math.pi * t_axis(sec) / sec) ** 2))
    o = mix(2.2, [(click(1800, rate=70), 0.0, 0.9), (thud(60, 0.5, 10), 0.05, 0.8), (hiss(1.3, 3500, 1.2), 0.2, 0.7),
                  (servo(0.9, 120, 260), 0.4, 0.25), (click(2400), 1.6, 0.6)])
    c = mix(1.8, [(servo(0.7, 260, 120), 0.0, 0.25), (thud(55, 0.5, 9), 0.65, 1.0), (click(2000, rate=70), 0.68, 0.9), (hiss(0.9, 4000, 1.5), 0.75, 0.55)])
    return o, c


def scifi():  # 미래형 잠금 해제: 짧은 전자음과 올라가는 울림
    def chirp(sec, a, b):
        ph = 2 * math.pi * np.cumsum(np.geomspace(a, b, int(sec * SR))) / SR
        return np.sin(ph) * (np.sin(math.pi * t_axis(sec) / sec) ** 1.5)
    o = mix(1.6, [(chirp(0.12, 900, 1800), 0.0, 0.5), (chirp(0.12, 1200, 2400), 0.16, 0.5), (chirp(0.5, 300, 1600), 0.34, 0.6),
                  (modal([880, 1320, 1760], [5, 6, 8], 1.0), 0.8, 0.25), (hiss(0.6, 6000, 2), 0.4, 0.25)])
    c = mix(1.2, [(chirp(0.5, 1600, 300), 0.0, 0.6), (chirp(0.1, 1800, 900), 0.55, 0.5), (chirp(0.1, 1200, 600), 0.7, 0.5), (thud(70, 0.4, 14), 0.78, 0.6)])
    return o, c


def bell():  # 묵직한 종: 어긋난 배음의 긴 울림 (귀엽지 않은 낮은 음)
    parts = [110, 220 * 1.19, 220 * 1.5, 220 * 2.0, 220 * 2.76, 220 * 3.3]
    o = mix(3.2, [(thud(80, 0.3, 20), 0.0, 0.5), (modal(parts, [1.1, 1.5, 1.9, 2.4, 3.2, 4], 3.0, [1, 0.7, 0.55, 0.45, 0.3, 0.2]), 0.02, 0.8)])
    c = mix(1.4, [(modal(parts, [6, 8, 10, 12, 14, 16], 1.0, [1, 0.7, 0.5, 0.4, 0.3, 0.2]), 0.0, 0.6), (thud(60, 0.5, 12), 0.0, 0.8)])
    return o, c


def clockwork():  # 시계태엽: 똑딱이는 톱니와 감기는 소리
    ticks = []
    for i in range(14):
        at = 0.05 + sum(0.16 * (0.94 ** k) for k in range(i))
        ticks.append((click(4200 - i * 40, rate=160), at, 0.5 + 0.03 * i))
    o = mix(2.2, ticks + [(modal([1300, 2100], [20, 30], 0.4), 1.7, 0.3), (thud(90, 0.4, 14), 1.75, 0.6)])
    ticks_c = [(click(3200 + i * 60, rate=160), 0.04 + i * 0.07, 0.6) for i in range(8)]
    c = mix(1.2, ticks_c + [(thud(100, 0.4, 14), 0.62, 0.9), (modal([1100, 1900], [22, 30], 0.4), 0.63, 0.3)])
    return o, c


def leather():  # 가죽 책: 천천히 펼치는 바스락 소리와 부드러운 소리
    rustle = lambda sec: bandpass(noise(sec), 1800, 0.8) * (np.sin(math.pi * t_axis(sec) / sec) ** 1.2) * 3
    o = mix(1.6, [(rustle(1.0), 0.0, 0.55), (creak(0.7, 200, 260, 0.4), 0.05, 0.4), (thud(120, 0.3, 18), 0.95, 0.6)])
    c = mix(1.1, [(rustle(0.5), 0.0, 0.5), (thud(110, 0.4, 14), 0.42, 0.9), (hiss(0.2, 2500, 2), 0.42, 0.25)])
    return o, c


def magic():  # 신비한 울림: 천천히 커지는 어긋난 화음과 반짝임
    t = t_axis(2.6)
    pad = sum(np.sin(2 * math.pi * f * t + i) * (1 + 0.3 * np.sin(2 * math.pi * (0.4 + i * 0.1) * t)) for i, f in enumerate([110, 165.7, 220.4, 329.1, 441.2]))
    pad *= np.sin(math.pi * t / 2.6) ** 2
    sparkle = [(modal([1760 * 2 ** (k / 5), 2349], [9, 11], 0.7), 0.4 + k * 0.17, 0.12) for k in range(8)]
    o = mix(2.6, [(pad, 0.0, 0.4), (hiss(1.8, 7000, 1.5), 0.3, 0.12)] + sparkle)
    t2 = t_axis(1.4)
    pad2 = sum(np.sin(2 * math.pi * f * t2 * (1 - 0.15 * t2)) for f in [110, 165.7, 220.4, 329.1]) * np.exp(-t2 * 2.2)
    c = mix(1.4, [(pad2, 0.0, 0.4), (thud(60, 0.5, 12), 0.1, 0.6)])
    return o, c


SETS = [('vault', vault), ('latch', latch), ('wood', wood), ('stone', stone), ('airlock', airlock),
        ('scifi', scifi), ('bell', bell), ('clockwork', clockwork), ('leather', leather), ('magic', magic)]

if __name__ == '__main__':
    for i, (name, fn) in enumerate(SETS, 1):
        o, c = fn()
        save(f'{i:02d}_{name}_open.wav', o)
        save(f'{i:02d}_{name}_close.wav', c)
