"""BGM 원본을 끊김 없이 반복되는 loop-<이름>.mp3로 만든다.

사용: python3 tools/make_bgm_loops.py <원본 폴더> [출력 폴더(기본 public/audio)]
원본: afternoon / dawn / finale / title .mp3 (또는 bgm-<이름>.mp3). ffmpeg와 numpy가 필요하다.
방법: 처음 3초를 끝 3초와 등전력(equal-power)으로 겹쳐서 이어 붙이고 앞 3초를 잘라, 끝에서 처음으로 돌아갈 때 소리가 이어진다.
"""
import os, subprocess, sys, tempfile, wave
import numpy as np

src = sys.argv[1]
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'audio')
os.makedirs(dst, exist_ok=True)
XFADE = 3  # 초
for name in ['afternoon', 'dawn', 'finale', 'title']:
    path = next((os.path.join(src, f) for f in (f'{name}.mp3', f'bgm-{name}.mp3') if os.path.exists(os.path.join(src, f))), None)
    if path is None:
        print('skip', name)
        continue
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'a.wav')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', path, '-map_metadata', '-1', '-ar', '44100', wav], check=True)
        w = wave.open(wav)
        n, ch, sr = w.getnframes(), w.getnchannels(), w.getframerate()
        x = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, ch).astype(np.float32)
        w.close()
        L = int(XFADE * sr)
        head, body = x[:L], x[L:]
        t = np.linspace(0, 1, L, dtype=np.float32)[:, None]
        tail = body[-L:] * np.cos(t * np.pi / 2) + head * np.sin(t * np.pi / 2)
        out = np.clip(np.concatenate([body[:-L], tail]), -32768, 32767).astype(np.int16)
        o = wave.open(os.path.join(tmp, 'b.wav'), 'wb')
        o.setnchannels(ch); o.setsampwidth(2); o.setframerate(sr); o.writeframes(out.tobytes()); o.close()
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', os.path.join(tmp, 'b.wav'), '-map_metadata', '-1', '-b:a', '112k', os.path.join(dst, f'loop-{name}.mp3')], check=True)
    print('ok', name, round(out.shape[0] / sr, 1), 's')
