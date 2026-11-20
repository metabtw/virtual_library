"""Rebuild the original synthesized room loops (requires NumPy and FFmpeg)."""
from pathlib import Path
import subprocess

import numpy as np

RATE = 22050
rng = np.random.default_rng(186)
destination = Path(__file__).resolve().parents[1] / "mobile" / "assets" / "ambience"
destination.mkdir(parents=True, exist_ok=True)


def envelope(seconds, low, high):
    noise = rng.standard_normal(round(RATE * seconds))
    frequencies = np.fft.rfftfreq(len(noise), 1 / RATE)
    spectrum = np.fft.rfft(noise)
    lower_cutoff = np.minimum(1, frequencies / low)
    upper_cutoff = np.minimum(1, high / np.maximum(frequencies, 1))
    filtered = np.fft.irfft(spectrum * lower_cutoff**2 * upper_cutoff**2, n=len(noise))
    return filtered / max(np.std(filtered), 1e-9)


def add(track, sample, when):
    start = round(when * RATE) % len(track)
    end = min(len(sample), len(track) - start)
    track[start:start + end] += sample[:end]
    track[:len(sample) - end] += sample[end:]


def time(seconds):
    return np.arange(round(RATE * seconds)) / RATE


def wave(hz, seconds):
    return np.sin(2 * np.pi * hz * time(seconds))


def save(name, track):
    pcm = (np.tanh(track) * 23500).astype("<i2")
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "s16le",
         "-ar", str(RATE), "-ac", "1", "-i", "pipe:0", "-c:a", "aac", "-b:a", "48k",
         str(destination / f"{name}.m4a")],
        input=pcm.tobytes(), check=True,
    )


length = 12
rain = 0.12 * envelope(length, 850, 4700) + 0.06 * envelope(length, 190, 900)
for _ in range(45):
    add(rain, 0.07 * envelope(.06, 1100, 3300) * np.exp(-time(.06) * 60), rng.uniform(0, length))
save("rain", rain)

fire = .095 * envelope(length, 55, 440)
for _ in range(44):
    fade = time(.16)
    crackle = envelope(.16, 500, 2700) * np.exp(-fade * rng.uniform(22, 50))
    add(fire, rng.uniform(.04, .24) * crackle, rng.uniform(0, length))
save("fire", fire)

cafe = .05 * envelope(length, 160, 2400)
for _ in range(36):
    duration = rng.uniform(.3, .9)
    t = time(duration)
    frequency = rng.uniform(90, 215)
    syllables = (0.55 + .45 * wave(rng.uniform(3, 6), duration)) * np.sin(np.pi * t / duration)**2
    voice = sum(wave(frequency * harmonic, duration) / harmonic for harmonic in (1, 2, 3, 4, 6, 8))
    add(cafe, .032 * syllables * voice, rng.uniform(0, length))
save("cafe", cafe)

beat = 60 / 72
lofi = .018 * envelope(beat * 16, 300, 2300)
for bar, chord in enumerate(((48, 55, 59, 62), (45, 52, 55, 60), (41, 48, 52, 55), (43, 50, 53, 57))):
    for offset, note in enumerate(chord):
        frequency = 440 * 2 ** ((note - 69) / 12)
        t = time(beat * 3.8)
        tone = wave(frequency, beat * 3.8) + .17 * wave(frequency * 2, beat * 3.8)
        add(lofi, .115 * tone * np.minimum(1, t * 30) * np.exp(-t * 1.4), (bar * 4 + .05 * offset) * beat)
for step in range(16):
    t = time(.27)
    drum = np.sin(2 * np.pi * (49 * t + 2.3 * (1 - np.exp(-t * 37)))) if step % 2 == 0 else envelope(.27, 440, 3100)
    add(lofi, (.17 if step % 2 == 0 else .075) * drum * np.exp(-t * 25), step * beat)
    add(lofi, .025 * envelope(.09, 2600, 6500) * np.exp(-time(.09) * 70), (step + .5) * beat)
save("lofi", lofi)

space = .1 * envelope(length, 46, 240)
space += (.08 + .04 * wave(1 / length, length)) * (wave(55, length) + .5 * wave(110, length))
space += .025 * wave(165, length) * wave(2 / length, length)
save("space", space)

forest = .105 * envelope(length, 225, 1300)
for offset in (1.8, 2.1, 6.8, 7.2, 10.0):
    t = time(.21)
    pitch = rng.uniform(1250, 1950)
    chirp = np.sin(2 * np.pi * (pitch * t + 600 * t**2)) * np.sin(np.pi * t / .21)**2
    add(forest, .084 * chirp, offset)
save("forest", forest)
