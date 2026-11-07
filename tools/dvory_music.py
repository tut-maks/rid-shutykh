# Власна мелодія в дусі української народної музики (сопілка, цимбали, бандура, бубон). Синтез: libfluidsynth + TimGM6mb.
import ctypes, numpy as np, wave, random
fl = ctypes.CDLL('libfluidsynth.so.3')
fl.new_fluid_settings.restype = ctypes.c_void_p
fl.new_fluid_synth.restype = ctypes.c_void_p; fl.new_fluid_synth.argtypes = [ctypes.c_void_p]
fl.fluid_settings_setnum.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_double]
fl.fluid_synth_sfload.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
for f in ['fluid_synth_noteon']: getattr(fl, f).argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int]
fl.fluid_synth_noteoff.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
fl.fluid_synth_program_change.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
fl.fluid_synth_cc.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int]
fl.fluid_synth_write_float.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
SR = 44100
st = fl.new_fluid_settings(); fl.fluid_settings_setnum(st, b'synth.sample-rate', float(SR)); fl.fluid_settings_setnum(st, b'synth.gain', 0.5)
sy = fl.new_fluid_synth(st); fl.fluid_synth_sfload(sy, b'/usr/share/sounds/sf2/TimGM6mb.sf2', 1)
# канали: 0 сопілка (Pan Flute 75), 1 цимбали (Dulcimer 15), 2 бандура (Harp 46), 3 бас (Pizz 45), 9 бубон
for ch, pr in [(0, 75), (1, 15), (2, 46), (3, 45), (4, 73)]: fl.fluid_synth_program_change(sy, ch, pr)
for ch, pan, vol in [(0, 54, 100), (1, 80, 92), (2, 44, 96), (3, 64, 90), (4, 70, 70), (9, 64, 80)]: fl.fluid_synth_cc(sy, ch, 10, pan); fl.fluid_synth_cc(sy, ch, 7, vol); fl.fluid_synth_cc(sy, ch, 91, 70)
BPM = 92; E = 60 / BPM / 2  # восьма
ev = []  # (t, kind, ch, note, vel)
def note(t, ch, n, dur, vel): ev.append((t, 1, ch, n, vel)); ev.append((t + dur * 0.95, 0, ch, n, 0))
# лад: ре дорійський з підвищеним IV ступенем (G#) — «український дорійський»
A = [(69,2),(69,1),(71,1),(72,2),(71,1),(69,1),(68,1),(69,1),(71,1),(69,1),(65,2),(64,2),(62,1),(64,1),(65,1),(68,1),(69,2),(72,2),(71,1),(69,1),(68,1),(64,1),(62,4)]
B = [(74,2),(72,1),(74,1),(76,2),(74,2),(72,1),(71,1),(69,1),(71,1),(72,2),(69,2),(74,1),(72,1),(71,1),(69,1),(68,1),(69,1),(71,2),(69,1),(68,1),(65,1),(64,1),(62,4)]
CA = ['Dm','Am','E','Dm','Dm','Am','E','Dm']; CB = ['Dm','C','Am','Am','Dm','E','E','Dm']
CH = {'Dm':[38,62,65,69],'Am':[45,64,69,72],'E':[40,64,68,71],'C':[36,64,67,72]}
t = 0.0
def accomp(chords, t0, drums=True, harp=True):
  for b, c in enumerate(chords):
    tb = t0 + b * 4 * E; ch = CH[c]
    note(tb, 3, ch[0], 3.6 * E, 84); note(tb + 2 * E, 3, ch[0] + 7 if c != 'E' else ch[0] + 7, 1.8 * E, 64)
    if harp:
      for k, n in enumerate([ch[1], ch[2], ch[3], ch[2]]): note(tb + k * E, 2, n - 12 + (12 if k == 2 else 0), 2 * E, 58 + (10 if k == 0 else 0))
    if drums:
      note(tb, 9, 36, E, 70); note(tb + 2 * E, 9, 45, E, 46); note(tb + 3 * E, 9, 42, E * .5, 30)
def melody(seq, t0, ch, vel=88, oct=0, orn=False):
  tt = t0
  for i, (n, d) in enumerate(seq):
    if orn and d >= 2 and i % 3 == 0:  # народна прикраса: короткий форшлаг
      note(tt, ch, n + 2, E * .25, vel - 20); note(tt + E * .25, ch, n + oct, d * E - E * .25, vel)
    else: note(tt, ch, n + oct, d * E, vel + random.randint(-6, 6))
    tt += d * E
  return tt
random.seed(7)
L8 = 8 * 4 * E
accomp(['Dm','Dm','Am','E'], t, drums=False); t += 4 * 4 * E               # вступ: бандура
accomp(CA, t); melody(A, t, 0, orn=True); t += L8                            # A — сопілка
accomp(CA, t); melody(A, t, 1, 84); melody(A, t, 4, 52, 12); t += L8         # A — цимбали + флейта октавою вище
accomp(CB, t); melody(B, t, 0, 90, orn=True); t += L8                        # B
accomp(CB, t); melody(B, t, 1, 86); melody(B, t, 0, 60, -12); t += L8        # B
accomp(CA, t); melody(A, t, 0, 86, orn=True); melody(A, t, 1, 60); t += L8   # A
accomp(['Dm','Dm'], t, drums=False); note(t, 0, 62, 6 * E, 70); t += 2 * 4 * E  # кінець
ev.sort(key=lambda x: (x[0], x[1]))
total = int((t + 1.5) * SR); out = np.zeros((total, 2), np.float32); pos = 0
buf = 1024
def render(n):
  global pos
  L = np.zeros(n, np.float32); R = np.zeros(n, np.float32)
  fl.fluid_synth_write_float(sy, n, L.ctypes.data, 0, 1, R.ctypes.data, 0, 1)
  out[pos:pos + n, 0] = L; out[pos:pos + n, 1] = R; pos += n
for (tt, on, ch, n, v) in ev:
  tgt = min(int(tt * SR), total)
  while pos < tgt: render(min(buf, tgt - pos))
  if on: fl.fluid_synth_noteon(sy, ch, n, v)
  else: fl.fluid_synth_noteoff(sy, ch, n)
while pos < total: render(min(buf, total - pos))
pk = np.abs(out).max(); out = out / pk * 0.85
# плавний кінець, щоб петля не клацала
fade = int(1.2 * SR); out[-fade:] *= np.linspace(1, 0, fade)[:, None]; out[:400] *= np.linspace(0, 1, 400)[:, None]
with wave.open('/tmp/mus/dvory.wav', 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype('<i2').tobytes())
print('sec', t)
