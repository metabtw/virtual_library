"""Build the shared stereo ambience loops with NumPy and FFmpeg."""

import argparse
from pathlib import Path
import re
from shutil import copyfileobj
import subprocess
from tempfile import TemporaryDirectory
from urllib.request import Request, urlopen

import numpy as np


RATE = 44_100
DESTINATION = Path(__file__).resolve().parents[1] / "mobile" / "assets" / "ambience"
SOURCES = {
    "rain": "https://cdn.freesound.org/previews/81/81819_280284-hq.ogg",
    "fire": "https://cdn.freesound.org/previews/382/382616_7094269-hq.ogg",
    "cafe": "https://upload.wikimedia.org/wikipedia/commons/5/54/Cafe_ambiance.ogg",
    "forest": "https://upload.wikimedia.org/wikipedia/commons/0/0a/20090610_0_ambience.ogg",
    "drums": "https://cdn.freesound.org/previews/621/621177_12574855-hq.ogg",
}
FFMPEG = ["ffmpeg", "-hide_banner", "-nostdin"]
PCM_FORMAT = ["-f", "f32le", "-ar", str(RATE), "-ac", "2"]


def frames(seconds):
    return round(seconds * RATE)


def rms(samples):
    return np.sqrt(np.mean(samples**2))


def source_audio(directory, name, start=0, duration=None):
    path = directory / f"{name}.ogg"
    if not path.exists():
        request = Request(SOURCES[name], headers={"User-Agent": "VirtualLibrary/1.0 (metabtw/virtual_library)"})
        temporary = path.with_suffix(".part")
        with urlopen(request, timeout=45) as source, temporary.open("wb") as output:
            copyfileobj(source, output)
        temporary.replace(path)
    command = [*FFMPEG, "-loglevel", "error", "-ss", str(start), "-i", str(path), "-map", "0:a:0"]
    if duration is not None:
        command += ["-t", str(duration)]
    raw = subprocess.check_output([*command, *PCM_FORMAT, "pipe:1"])
    return np.frombuffer(raw, dtype="<f4").reshape(-1, 2).astype(np.float64)


def bandpass(samples, low, high):
    frequency = np.fft.rfftfreq(len(samples), 1 / RATE)
    # Smooth frequency response without phase shifts across the loop seam.
    gain = 1 / np.sqrt(1 + (low / np.maximum(frequency, 1)) ** 6)
    gain /= np.sqrt(1 + (frequency / high) ** 8)
    gain[0] = 0
    return np.fft.irfft(np.fft.rfft(samples, axis=0) * gain[:, None], n=len(samples), axis=0)


def recorded_loop(directory, name, offset, seconds, overlap, low, high):
    raw = source_audio(directory, name, offset, seconds + overlap)
    length, fade = frames(seconds), frames(overlap)
    if len(raw) < length + fade:
        raise ValueError(f"{name} recording is shorter than the selected section")
    # The next cycle begins inside the recording, followed by an equal-power blend
    # into the introduction. Neither end of the recording needs a fade to silence.
    blend = np.linspace(0, np.pi / 2, fade)[:, None]
    seam = raw[length:length + fade] * np.cos(blend) + raw[:fade] * np.sin(blend)
    return bandpass(np.concatenate((seam, raw[fade:length])), low, high)


def add_voice(track, sample, at, pan):
    position = frames(at) % len(track)
    angle = (pan + 1) * np.pi / 4
    stereo = sample[:, None] * [np.cos(angle), np.sin(angle)]
    remaining = min(len(stereo), len(track) - position)
    track[position:position + remaining] += stereo[:remaining]
    track[:len(stereo) - remaining] += stereo[remaining:]


def note_phase(midi, seconds):
    t = np.arange(frames(seconds)) / RATE
    frequency = 440 * 2 ** ((midi - 69) / 12)
    return t, 2 * np.pi * frequency * t


def electric_keys(midi, seconds):
    t, phase = note_phase(midi, seconds)
    tine = np.sin(phase + 1.15 * np.exp(-t * 4.5) * np.sin(phase * 2.004))
    body = .23 * np.sin(phase * .9994) + .06 * np.exp(-t * 9) * np.sin(phase * 3)
    envelope = (1 - np.exp(-t * 145)) * np.exp(-t * 1.45) * np.clip((seconds - t) / .12, 0, 1)
    return (tine + body) * envelope


def bass_note(midi, seconds):
    t, phase = note_phase(midi, seconds)
    tone = np.sin(phase) + .23 * np.sin(2 * phase) + .06 * np.sin(3 * phase)
    return tone * (1 - np.exp(-t * 95)) * np.exp(-t * 2.2) * np.clip((seconds - t) / .095, 0, 1)


def lofi_loop(directory):
    beat = 60 / 85
    bars = 12
    length = frames(bars * 4 * beat)
    drums = source_audio(directory, "drums")[:length]
    drums = np.pad(drums, ((0, length - len(drums)), (0, 0)))
    # Preserve the drum grid over the full twelve bars while smoothing the codec's edge.
    edge = frames(.006)
    drums[:edge] *= np.linspace(0, 1, edge)[:, None]
    drums[-edge:] *= np.linspace(1, 0, edge)[:, None]
    drums = bandpass(drums, 45, 7200)
    drums *= .020 / rms(drums)

    rng = np.random.default_rng(420)
    keys = np.zeros((length, 2))
    bass = np.zeros_like(keys)
    chords = [(54, 57, 61, 62), (56, 59, 62, 66), (56, 59, 61, 64), (54, 57, 61, 68)]
    roots = [35, 40, 33, 42]
    for bar in range(bars):
        downbeat = bar * 4
        chord, root = chords[bar % 4], roots[bar % 4]
        for beat_offset, strength in ((.04, 1), (2.56, .58)):
            for index, midi in enumerate(chord):
                at = (downbeat + beat_offset + index * .025) * beat
                pan = (index - 1.5) * .29
                voice = electric_keys(midi, beat * 2.7)
                add_voice(keys, voice * strength * rng.uniform(.027, .038), at, pan)
        for beat_offset, midi, strength in ((0, root, .062), (1.54, root + 12, .033), (2.51, root, .046)):
            at = (downbeat + beat_offset) * beat
            add_voice(bass, bass_note(midi, beat * 1.18) * strength, at, 0)

    for bar, beat_offset, midi in (
        (0, 1.58, 73), (1, 3.18, 71), (2, 1.52, 76), (3, 2.92, 73),
        (5, 1.54, 74), (7, 3.05, 69), (8, 1.58, 73), (10, 1.62, 76), (11, 2.75, 73),
    ):
        add_voice(keys, electric_keys(midi, beat * 1.7) * .021, (bar * 4 + beat_offset) * beat, .24)

    room = (.17 * np.roll(keys[:, ::-1], frames(.066), axis=0)
            + .10 * np.roll(keys, frames(.132), axis=0)
            + .055 * np.roll(keys[:, ::-1], frames(.226), axis=0))
    return bandpass(drums + keys + bass + room, 38, 8900)


def space_loop():
    length = frames(44)
    rng = np.random.default_rng(304)
    phase = np.arange(length) * (2 * np.pi / length)
    common = rng.standard_normal((length, 1))
    noise = .82 * common + .37 * rng.standard_normal((length, 2))
    vent = bandpass(noise, 69, 650)
    air = bandpass(noise, 520, 2600)
    vent *= .033 / rms(vent)
    air *= .010 / rms(air)
    breathing = (.88 + .09 * np.sin(phase * 2) + .03 * np.cos(phase * 3))[:, None]
    track = vent * breathing + air
    # Periodic oscillators give a softly lit cabin tone without an abrupt pitch restart.
    for pitch, strength, spread in ((52, .017, 0), (78, .011, .15), (116, .009, .45), (175, .004, .6)):
        cycle = round(pitch * length / RATE)
        swell = .67 + .33 * np.sin(phase + pitch) ** 2
        tone = np.sin(cycle * phase[:, None] + spread * np.cos(phase[:, None]) * [-1, 1])
        track += strength * swell[:, None] * tone
    return track


def integrated_loudness(track):
    report = subprocess.run(
        [*FFMPEG, *PCM_FORMAT, "-i", "pipe:0", "-af", "ebur128", "-f", "null", "-"],
        input=track.astype("<f4").tobytes(), capture_output=True, check=True,
    ).stderr.decode()
    return float(re.findall(r"^\s*I:\s*([-\d.]+) LUFS", report, re.MULTILINE)[-1])


def master(track):
    track = track * 10 ** ((-22 - integrated_loudness(track)) / 20)
    # Give the linked limiter context across the seam. Allow room for AAC overshoot.
    edge = frames(.2)
    wrapped = np.concatenate((track[-edge:], track, track[:edge]))
    limited = subprocess.run(
        [*FFMPEG, "-loglevel", "error", *PCM_FORMAT, "-i", "pipe:0",
         "-af", "alimiter=limit=0.24:attack=2.8:release=55:level=0:latency=1",
         *PCM_FORMAT, "pipe:1"],
        input=wrapped.astype("<f4").tobytes(), capture_output=True, check=True,
    ).stdout
    return np.frombuffer(limited, dtype="<f4").reshape(-1, 2)[edge:edge + len(track)]


def save(directory, name, track):
    subprocess.run(
        [*FFMPEG, "-loglevel", "error", "-y", *PCM_FORMAT, "-i", "pipe:0",
         "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "128k", "-movflags", "+faststart",
         str(directory / f"{name}.m4a")],
        input=master(track).astype("<f4").tobytes(), check=True,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-cache", type=Path, help="Reuse the source Ogg recordings from this directory")
    parser.add_argument("--output-dir", type=Path, default=DESTINATION)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="library-ambience-") as temporary:
        source = args.source_cache or Path(temporary)
        source.mkdir(parents=True, exist_ok=True)
        for name, start, seconds, fade, low, high in (
            ("rain", 4, 40, 3, 115, 8000),
            ("fire", 12, 48, 3, 78, 7200),
            ("cafe", 17, 44, 4, 125, 2900),
            ("forest", 6, 45, 4, 145, 9200),
        ):
            save(args.output_dir, name, recorded_loop(source, name, start, seconds, fade, low, high))
        save(args.output_dir, "lofi", lofi_loop(source))
        save(args.output_dir, "space", space_loop())


if __name__ == "__main__":
    main()
