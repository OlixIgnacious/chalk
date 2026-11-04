"""sfx.py — one designed transition sound, made from noise (no library, no licence).

    python sfx.py <out.wav> [swish|impact] [seed]     prints the sound's peak time in seconds

swish:  air moving past. Noise through a band that sweeps up (400 Hz -> 3 kHz) on an ease-in, with some
        100-200 Hz body, everything above ~5 kHz cut so it never sits on the voice's s and ch. It swells
        for ~0.25 s into its peak and falls away fast, panned left to right: placed with the PEAK on the
        picture's change, it builds into it.
impact: the swish plus a soft low thump (70 Hz falling to 45 Hz) on the peak, for the one or two reveals
        that should land like a beat.
A different seed gives a slightly different sound (sweep range, length, pan), so repeated hits never sound
like one clip pasted.
"""

import sys
import wave

import numpy as np
from scipy.signal import butter, istft, sosfilt, stft

SR = 48000


def swish(seed):
    rng = np.random.default_rng(seed)
    rise = 0.22 + 0.06 * rng.random()          # 220-280 ms into the peak
    tail = 0.12 + 0.05 * rng.random()
    dur = rise + tail + 0.05
    f0, f1 = 380 + 80 * rng.random(), 2600 + 700 * rng.random()
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    nper = 1024
    f, t, Z = stft(noise, fs=SR, nperseg=nper, noverlap=nper * 3 // 4)
    prog = np.clip(t / rise, 0, 1) ** 1.8
    centre = f0 * (f1 / f0) ** prog
    band = np.exp(-0.5 * ((f[:, None] - centre[None, :]) / (0.6 * centre[None, :])) ** 2)
    body = 0.35 * np.exp(-0.5 * ((f[:, None] - 150) / 60) ** 2)  # low air, so it has weight
    _, y = istft(Z * (band + body), fs=SR, nperseg=nper, noverlap=nper * 3 // 4)
    y = sosfilt(butter(4, 5000, "low", fs=SR, output="sos"), y[:n])
    tt = np.arange(n) / SR
    env = np.where(tt < rise, (tt / rise) ** 2.4, np.exp(-(tt - rise) / (tail / 3)))
    y = y * env
    y /= np.max(np.abs(y)) + 1e-9
    p0 = 0.15 + 0.2 * rng.random()
    pan = p0 + (1 - 2 * p0) * np.clip(tt / dur, 0, 1)
    return np.stack([y * np.cos(pan * np.pi / 2), y * np.sin(pan * np.pi / 2)], axis=1), rise


def thump():
    tt = np.arange(int(0.2 * SR)) / SR
    phase = 2 * np.pi * np.cumsum(45 + 25 * np.exp(-tt / 0.05)) / SR
    y = np.sin(phase) * np.exp(-tt / 0.07) * (1 - np.exp(-tt / 0.004))
    return np.stack([y, y], axis=1)


def main():
    out, kind, seed = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "swish"), int(sys.argv[3] if len(sys.argv) > 3 else 0)
    x, peak = swish(seed)
    if kind == "impact":
        x = x * 0.8
        th = thump()
        k = int(peak * SR)
        x = np.concatenate([x, np.zeros((max(0, k + len(th) - len(x)), 2))])
        x[k:k + len(th)] += th * 0.9
        x /= max(1.0, np.max(np.abs(x)))
    with wave.open(out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767 * 0.9).astype("<i2").tobytes())
    print(f"{peak:.4f}")


if __name__ == "__main__":
    main()
