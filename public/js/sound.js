// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/sound.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Hệ thống Âm thanh Toàn diện (Web Audio Sound Engine):
//      + Bộ tổng hợp âm thanh hiệu ứng (Procedural SFX Synthesizer) 0 KB dung lượng.
//      + Bộ phát nhạc nền không gian Tiên hiệp Cổ phong (Procedural Zen Guqin Ambient).
//      + Quản lý Âm lượng, Bật/Tắt (Mute/Unmute), tự động lưu tùy chọn vào localStorage.
// 2. CẤU HÌNH LIÊN QUAN:
//    - Web Audio API (AudioContext, OscillatorNode, GainNode, BiquadFilterNode).
//    - Tự động thích ứng chính sách Autoplay Policy của trình duyệt hiện đại.
// ════════════════════════════════════════════════════════════════════════════════════════

const Sound = {
  _ctx: null,
  _masterGain: null,
  _sfxGain: null,
  _bgmGain: null,
  _initialized: false,
  _sfxMuted: false,
  _bgmMuted: false,
  _bgmTimer: null,
  _bgmRunning: false,

  // Thang âm Ngũ Cung Tiên Hiệp (C, D, E, G, A ở các quãng tám)
  _pentatonicFrequencies: [
    130.81, 146.83, 164.81, 196.00, 220.00, // C3, D3, E3, G3, A3
    261.63, 293.66, 329.63, 392.00, 440.00, // C4, D4, E4, G4, A4
    523.25, 587.33, 659.25, 783.99, 880.00, // C5, D5, E5, G5, A5
  ],

  init() {
    if (this._initialized) return;
    try {
      this._sfxMuted = localStorage.getItem("tutien_sfx_muted") === "1";
      this._bgmMuted = localStorage.getItem("tutien_bgm_muted") === "1";
    } catch { /* local storage optional */ }

    const unlock = () => {
      this._ensureAudioContext();
      if (this._ctx && this._ctx.state === "suspended") {
        this._ctx.resume().then(() => {
          if (!this._bgmMuted && !this._bgmRunning) this.startBgm();
        }).catch(() => {});
      } else if (this._ctx && !this._bgmMuted && !this._bgmRunning) {
        this.startBgm();
      }
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };

    window.addEventListener("click", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    this._initialized = true;
  },

  _ensureAudioContext() {
    if (this._ctx) return this._ctx;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    this._ctx = new AudioContextClass();

    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.setValueAtTime(0.75, this._ctx.currentTime);
    this._masterGain.connect(this._ctx.destination);

    this._sfxGain = this._ctx.createGain();
    this._sfxGain.gain.setValueAtTime(this._sfxMuted ? 0 : 0.85, this._ctx.currentTime);
    this._sfxGain.connect(this._masterGain);

    this._bgmGain = this._ctx.createGain();
    this._bgmGain.gain.setValueAtTime(this._bgmMuted ? 0 : 0.35, this._ctx.currentTime);
    this._bgmGain.connect(this._masterGain);

    return this._ctx;
  },

  // ── BẬT / TẮT SFX VÀ BGM ──
  toggleSfx() {
    this._ensureAudioContext();
    this._sfxMuted = !this._sfxMuted;
    try { localStorage.setItem("tutien_sfx_muted", this._sfxMuted ? "1" : "0"); } catch {}
    if (this._sfxGain && this._ctx) {
      this._sfxGain.gain.setValueAtTime(this._sfxMuted ? 0 : 0.85, this._ctx.currentTime);
    }
    if (!this._sfxMuted) this.play("click");
    return !this._sfxMuted;
  },

  toggleBgm() {
    this._ensureAudioContext();
    this._bgmMuted = !this._bgmMuted;
    try { localStorage.setItem("tutien_bgm_muted", this._bgmMuted ? "1" : "0"); } catch {}
    if (this._bgmGain && this._ctx) {
      this._bgmGain.gain.setValueAtTime(this._bgmMuted ? 0 : 0.35, this._ctx.currentTime);
    }
    if (this._bgmMuted) {
      this.stopBgm();
    } else {
      this.startBgm();
    }
    return !this._bgmMuted;
  },

  isSfxMuted() { return this._sfxMuted; },
  isBgmMuted() { return this._bgmMuted; },

  // ════════════════════════════════════════════════════════════════════
  // §1. PROCEDURAL SFX SYNTHESIZER (Tự sinh âm thanh 0 KB)
  // ════════════════════════════════════════════════════════════════════

  play(name, opts = {}) {
    if (this._sfxMuted) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    try {
      switch (name) {
        case "attack":
          this._synthAttack(ctx);
          break;
        case "hit":
          this._synthHit(ctx, opts.isCrit);
          break;
        case "crit":
          this._synthHit(ctx, true);
          break;
        case "miss":
          this._synthMiss(ctx);
          break;
        case "skill":
          this._synthSkill(ctx, opts.element);
          break;
        case "coin":
          this._synthCoin(ctx);
          break;
        case "item":
          this._synthItem(ctx);
          break;
        case "breakthrough":
          this._synthBreakthrough(ctx);
          break;
        case "levelUp":
          this._synthLevelUp(ctx);
          break;
        case "hurt":
          this._synthHurt(ctx);
          break;
        case "click":
          this._synthClick(ctx);
          break;
        case "portal":
          this._synthPortal(ctx);
          break;
        case "craft":
        case "buy":
          this._synthBuy(ctx);
          break;
        default:
          this._synthClick(ctx);
          break;
      }
    } catch {
      // Audio playback must never crash the game loop
    }
  },

  // Tiếng vung kiếm xé gió
  _synthAttack(ctx) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.12);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._sfxGain);

    osc.start(t);
    osc.stop(t + 0.13);
  },

  // Tiếng chém trúng quái vật (thường hoặc bạo kích)
  _synthHit(ctx, isCrit = false) {
    const t = ctx.currentTime;
    // Layer 1: Cú va chạm kim loại/thịt
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isCrit ? "triangle" : "sawtooth";
    osc.frequency.setValueAtTime(isCrit ? 260 : 160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + (isCrit ? 0.22 : 0.14));

    gain.gain.setValueAtTime(isCrit ? 0.6 : 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (isCrit ? 0.22 : 0.14));

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + (isCrit ? 0.23 : 0.15));

    // Layer 2: Tiếng sắc xé rách (nếu bạo kích thì ngân dài hơn)
    if (isCrit) {
      const critOsc = ctx.createOscillator();
      const critGain = ctx.createGain();
      critOsc.type = "square";
      critOsc.frequency.setValueAtTime(880, t);
      critOsc.frequency.exponentialRampToValueAtTime(220, t + 0.18);

      critGain.gain.setValueAtTime(0.2, t);
      critGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      critOsc.connect(critGain);
      critGain.connect(this._sfxGain);
      critOsc.start(t);
      critOsc.stop(t + 0.19);
    }
  },

  // Tiếng đánh hụt (Miss)
  _synthMiss(ctx) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.09);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.1);
  },

  // Tiếng phóng kỹ năng Thần Thông
  _synthSkill(ctx, element = "KIM") {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    const isFire = element === "HOA";
    const isThunder = element === "LOI";
    osc.type = isThunder ? "sawtooth" : isFire ? "triangle" : "sine";

    const startFreq = isThunder ? 1200 : isFire ? 240 : 440;
    const endFreq = isThunder ? 180 : isFire ? 880 : 1320;

    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + 0.25);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(600, t);
    filter.Q.setValueAtTime(3, t);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._sfxGain);

    osc.start(t);
    osc.stop(t + 0.29);
  },

  // Tiếng nhặt tiền xu leng keng (Hai nốt chuông trong vắt)
  _synthCoin(ctx) {
    const t = ctx.currentTime;
    // Nốt 1: B5 (987.77 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(987.77, t);
    gain1.gain.setValueAtTime(0.25, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc1.connect(gain1);
    gain1.connect(this._sfxGain);
    osc1.start(t);
    osc1.stop(t + 0.09);

    // Nốt 2: E6 (1318.51 Hz) nảy lên sau 0.07s
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1318.51, t + 0.07);
    gain2.gain.setValueAtTime(0.001, t);
    gain2.gain.setValueAtTime(0.3, t + 0.07);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc2.connect(gain2);
    gain2.connect(this._sfxGain);
    osc2.start(t + 0.07);
    osc2.stop(t + 0.26);
  },

  // Tiếng nhặt trang bị hoặc dược liệu
  _synthItem(ctx) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(784, t + 0.12);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.17);
  },

  // Tiếng ĐỘT PHÁ CẢNH GIỚI (Hùng tráng, ngân vang)
  _synthBreakthrough(ctx) {
    const t = ctx.currentTime;
    const chords = [261.63, 329.63, 392.00, 523.25]; // Hợp âm C trưởng ngũ cung
    chords.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const delay = idx * 0.08;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t + delay);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + delay + 0.6);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.setValueAtTime(0.35, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.8);

      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.start(t + delay);
      osc.stop(t + delay + 0.85);
    });
  },

  // Tiếng thăng tầng tu vi nhỏ
  _synthLevelUp(ctx) {
    const t = ctx.currentTime;
    const notes = [440, 554.37, 659.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const delay = idx * 0.06;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t + delay);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.setValueAtTime(0.2, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.2);

      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.start(t + delay);
      osc.stop(t + delay + 0.22);
    });
  },

  // Tiếng nhân vật bị dính đòn
  _synthHurt(ctx) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.13);
  },

  // Tiếng click nút giao diện
  _synthClick(ctx) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1000, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.02);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.03);
  },

  // Tiếng dịch chuyển Portal
  _synthPortal(ctx) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.4);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.52);
  },

  // Tiếng mua bán đồ
  _synthBuy(ctx) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(523.25, t);
    osc.frequency.exponentialRampToValueAtTime(659.25, t + 0.08);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.13);
  },

  // ════════════════════════════════════════════════════════════════════
  // §2. PROCEDURAL ZEN BGM (Nhạc nền Cổ Cầm Ngũ Cung Tiên Hiệp)
  // ════════════════════════════════════════════════════════════════════

  startBgm() {
    if (this._bgmMuted || this._bgmRunning) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;
    this._bgmRunning = true;
    this._scheduleNextNote();
  },

  stopBgm() {
    this._bgmRunning = false;
    if (this._bgmTimer) {
      clearTimeout(this._bgmTimer);
      this._bgmTimer = null;
    }
  },

  _scheduleNextNote() {
    if (!this._bgmRunning || this._bgmMuted) return;
    const ctx = this._ensureAudioContext();
    if (!ctx || ctx.state !== "running") {
      this._bgmTimer = setTimeout(() => this._scheduleNextNote(), 1000);
      return;
    }

    // Chọn 1-2 nốt ngũ cung ngẫu nhiên tạo âm điệu Đàn Tranh (Guqin)
    const freqIndex = Math.floor(Math.random() * this._pentatonicFrequencies.length);
    const freq = this._pentatonicFrequencies[freqIndex];
    this._playGuqinString(ctx, freq);

    // Thỉnh thoảng gảy nốt kép hài hòa (harmony chord)
    if (Math.random() < 0.3) {
      const harmonyIndex = (freqIndex + 2) % this._pentatonicFrequencies.length;
      setTimeout(() => {
        if (this._bgmRunning && !this._bgmMuted) {
          this._playGuqinString(ctx, this._pentatonicFrequencies[harmonyIndex], 0.7);
        }
      }, 120);
    }

    // Nhịp điệu thong thả, tự nhiên như tiếng suối chảy (từ 1.2s đến 2.8s mỗi nốt)
    const nextInterval = 1200 + Math.random() * 1600;
    this._bgmTimer = setTimeout(() => this._scheduleNextNote(), nextInterval);
  },

  // Giả lập tiếng gảy dây đàn Cổ Cầm (Plucked String Acoustic)
  _playGuqinString(ctx, freq, volumeScale = 1.0) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);

    // Bộ lọc tạo cảm giác mộc của gỗ đàn
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq * 3.5, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.8, t + 1.2);

    const baseVol = 0.22 * volumeScale;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(baseVol, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._bgmGain);

    osc.start(t);
    osc.stop(t + 1.85);
  },
};

// Tự động khởi tạo ngay khi nạp file
Sound.init();

