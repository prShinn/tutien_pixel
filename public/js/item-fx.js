const ItemFX = (() => {
  const SPARKLE_PRESETS = Object.freeze(["NONE", "DEWDROP", "SHIMMER", "MYTHIC_PRISM", "ELEMENTAL"]);

  const RARITY_META = Object.freeze({
    NORMAL: Object.freeze({ code: "NORMAL", label: "Thường", color: "#d8e0ef", border: "#6c7585", glow: "rgba(108, 117, 133, 0.25)", badgeBg: "#252a35", text: "#d8e0ef", rank: 0 }),
    MAGIC: Object.freeze({ code: "MAGIC", label: "Ma Pháp", color: "#63b3ff", border: "#4da3ff", glow: "rgba(77, 163, 255, 0.48)", badgeBg: "#133157", text: "#9bd0ff", rank: 1 }),
    EXL: Object.freeze({ code: "EXL", label: "Hoàn Hảo", color: "#5ef2a8", border: "#4df28b", glow: "rgba(77, 242, 139, 0.52)", badgeBg: "#103e27", text: "#8effbc", rank: 2 }),
    ANCIENT: Object.freeze({ code: "ANCIENT", label: "Thần Thánh", color: "#ffd24d", border: "#ffd24d", glow: "rgba(255, 210, 77, 0.65)", badgeBg: "#4c320d", text: "#ffe899", rank: 3 }),
  });

  const ELEMENT_COLORS = Object.freeze({
    KIM: "#f0c85a",
    MOC: "#54db7b",
    THUY: "#57bdff",
    HOA: "#ff6944",
    THO: "#ce914f",
    QUANG: "#fff08a",
    AM: "#b374ff",
    PHONG: "#6df2c8",
    LOI: "#7ea8ff",
    COMMON: "#ffd966",
  });

  function isPersistentAllowed() {
    if (typeof VisualEffects !== "undefined" && typeof VisualEffects.arePersistentEffectsEnabled === "function") {
      return Boolean(VisualEffects.arePersistentEffectsEnabled());
    }
    return true;
  }

  function enhanceGlowTier(enhanceLevel) {
    const lvl = Math.max(0, Math.min(15, Math.floor(Number(enhanceLevel || 0))));
    if (lvl >= 13) return 4;
    if (lvl >= 11) return 3;
    if (lvl >= 9) return 2;
    if (lvl >= 7) return 1;
    return 0;
  }

  function resolveItemFxProfile(item = {}, opts = {}) {
    const enhanceLevel = Math.max(0, Math.min(15, Math.floor(Number(item?.enhanceLevel || opts.enhanceLevel || 0))));
    const rarityCode = String(item?.rarity || opts.rarity || "NORMAL").toUpperCase();
    const rarityMeta = RARITY_META[rarityCode] || RARITY_META.NORMAL;
    const rawElement = String(item?.linhCan || item?.element || "COMMON").toUpperCase();
    const elementColor = ELEMENT_COLORS[rawElement] || ELEMENT_COLORS.COMMON;
    const customSparkle = item?.sparkle && typeof item.sparkle === "object" ? item.sparkle : null;

    let preset = "NONE";
    let color = rarityMeta.border;
    let intensity = 1;

    if (customSparkle && customSparkle.enabled !== false && customSparkle.preset && customSparkle.preset !== "NONE") {
      const candidate = String(customSparkle.preset).toUpperCase();
      preset = SPARKLE_PRESETS.includes(candidate) ? candidate : "DEWDROP";
      color = /^#[0-9a-f]{6}$/i.test(customSparkle.color || "")
        ? customSparkle.color
        : (preset === "ELEMENTAL" ? elementColor : rarityMeta.rank >= 2 ? rarityMeta.border : "#ffd966");
      intensity = Math.max(1, Math.min(3, Math.floor(Number(customSparkle.intensity || 2))));
    } else if (!customSparkle || customSparkle.enabled !== false) {
      if (rarityCode === "ANCIENT") {
        preset = "MYTHIC_PRISM";
        color = "#ffd24d";
        intensity = 3;
      } else if (rarityCode === "EXL") {
        preset = "SHIMMER";
        color = "#5ef2a8";
        intensity = 2;
      } else if (rarityCode === "MAGIC") {
        preset = "DEWDROP";
        color = "#63b3ff";
        intensity = 1;
      }
    }

    const gearGlowTier = Number.isFinite(Number(opts.glowTier))
      ? Math.max(0, Math.min(4, Math.floor(Number(opts.glowTier))))
      : enhanceGlowTier(enhanceLevel);

    if (enhanceLevel >= 13) {
      preset = "MYTHIC_PRISM";
      color = "#ffe066";
      intensity = 3;
    } else if (enhanceLevel >= 11 && preset === "NONE") {
      preset = "MYTHIC_PRISM";
      color = "#ffd24d";
      intensity = 3;
    } else if (enhanceLevel >= 7 && (preset === "NONE" || preset === "DEWDROP")) {
      preset = "SHIMMER";
      color = enhanceLevel >= 9 ? "#ffd966" : "#78dcff";
      intensity = enhanceLevel >= 9 ? 2 : 1;
    }

    if (preset === "ELEMENTAL") {
      color = /^#[0-9a-f]{6}$/i.test(customSparkle?.color || "") ? customSparkle.color : elementColor;
    }

    const secondaryColor = preset === "MYTHIC_PRISM"
      ? (rarityCode === "EXL" ? "#5ef2a8" : "#7ee6ff")
      : (preset === "ELEMENTAL" ? "#ffffff" : "#fff6cf");

    const sparkleEnabled = preset !== "NONE";
    return {
      rarity: rarityMeta.code,
      rarityMeta,
      enhanceLevel,
      hasLuck: Boolean(item?.hasLuck),
      exlCount: Array.isArray(item?.exlOptions) ? item.exlOptions.length : 0,
      element: rawElement,
      sparkleEnabled,
      preset,
      color,
      secondaryColor,
      intensity,
      glowTier: gearGlowTier,
      persistentAllowed: isPersistentAllowed(),
    };
  }

  function applyPixelCrisp(ctx, cx, cy, r, fill, alpha = 1) {
    if (alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = fill;
    const w = Math.max(1.5, r * 0.42);
    ctx.fillRect(cx - r, cy - w * 0.5, r * 2, w);
    ctx.fillRect(cx - w * 0.5, cy - r, w, r * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx - w * 0.5, cy - w * 0.5, w, w);
    ctx.restore();
  }

  function drawSparkleOverlayCanvas(ctx, x, y, size, itemOrProfile, nowMs = Date.now(), opts = {}) {
    if (!ctx || size <= 0) return;
    const profile = itemOrProfile && Object.hasOwn(itemOrProfile, "sparkleEnabled")
      ? itemOrProfile
      : resolveItemFxProfile(itemOrProfile, opts);
    if (!profile.sparkleEnabled && profile.glowTier === 0) return;
    if (!profile.persistentAllowed && !opts.forceAnimate) return;

    const t = Number(nowMs || 0) * 0.001;
    const half = size * 0.5;
    const cx = x + half;
    const cy = y + half;

    ctx.save();

    if (profile.preset === "MYTHIC_PRISM" || profile.glowTier >= 3) {
      const pulse = 0.22 + 0.14 * Math.sin(t * 3.4);
      const grad = ctx.createRadialGradient(cx, cy, size * 0.08, cx, cy, size * 0.62);
      grad.addColorStop(0, `${profile.color}55`);
      grad.addColorStop(0.65, `${profile.secondaryColor}22`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = pulse * 1.4;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }

    if (profile.preset === "SHIMMER" || profile.preset === "MYTHIC_PRISM" || profile.glowTier >= 1) {
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.clip();
      const sweep = ((t * (0.55 + profile.intensity * 0.15)) % 2.4) - 0.7;
      const sx = x + sweep * size;
      const band = ctx.createLinearGradient(sx - size * 0.25, y, sx + size * 0.25, y + size);
      band.addColorStop(0, "rgba(255,255,255,0)");
      band.addColorStop(0.5, "rgba(255,255,255,0.28)");
      band.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = band;
      ctx.fillRect(x, y, size, size);
      ctx.restore();
      ctx.save();
    }

    const starCount = profile.preset === "DEWDROP"
      ? 2 + (profile.intensity > 2 ? 1 : 0)
      : (profile.preset === "MYTHIC_PRISM" ? 3 + profile.intensity : 2 + profile.intensity);

    for (let i = 0; i < starCount; i += 1) {
      const seed = i * 1.917 + (profile.enhanceLevel * 0.37);
      if (profile.preset === "ELEMENTAL") {
        const rise = ((t * (0.45 + (i % 2) * 0.22) + i * 0.27) % 1);
        const px = cx + Math.sin(t * 2.4 + seed * 3.1) * (size * 0.34);
        const py = y + size * (0.86 - rise * 0.74);
        const alpha = Math.sin(rise * Math.PI) * 0.92;
        const r = Math.max(1.8, size * (0.045 + (i % 2) * 0.02));
        applyPixelCrisp(ctx, px, py, r, i % 2 === 0 ? profile.color : profile.secondaryColor, alpha);
      } else {
        const angle = t * (profile.preset === "MYTHIC_PRISM" ? 1.15 : 0.45) + seed * 2.3;
        const orbitX = Math.cos(angle) * size * (0.24 + (i % 3) * 0.08);
        const orbitY = Math.sin(angle * 1.15 + i) * size * (0.24 + ((i + 1) % 2) * 0.08);
        const blink = Math.max(0, Math.sin(t * (2.6 + i * 0.55) + seed * 4));
        const starR = Math.max(1.8, size * (0.055 + blink * 0.045));
        const fill = i % 2 === 0 ? profile.color : profile.secondaryColor;
        applyPixelCrisp(ctx, cx + orbitX, cy + orbitY, starR, fill, blink * 0.95);
      }
    }

    ctx.restore();
  }

  function drawCharacterEnhanceAura(ctx, cx, cy, glowTier = 0, nowMs = Date.now(), baseRadius = 17) {
    const tier = Math.max(0, Math.min(4, Math.floor(Number(glowTier || 0))));
    if (!ctx || tier <= 0 || !isPersistentAllowed()) return;
    const t = Number(nowMs || 0) * 0.001;
    const palette = tier >= 4
      ? { primary: "#ffe26a", secondary: "#72f7ff", stars: 5 }
      : tier === 3
        ? { primary: "#66f7b0", secondary: "#ffe074", stars: 4 }
        : tier === 2
          ? { primary: "#ffcf4d", secondary: "#fff5b8", stars: 3 }
          : { primary: "#74d4ff", secondary: "#d8f4ff", stars: 2 };

    ctx.save();
    const pulse = 1 + 0.07 * Math.sin(t * 3.8);
    const rx = baseRadius * (1.05 + tier * 0.09) * pulse;
    const ry = baseRadius * (0.48 + tier * 0.05) * pulse;

    const grad = ctx.createRadialGradient(cx, cy + 7, rx * 0.15, cx, cy + 7, rx * 1.25);
    grad.addColorStop(0, `${palette.primary}38`);
    grad.addColorStop(0.7, `${palette.secondary}18`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 7, rx * 1.25, ry * 1.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = palette.primary;
    ctx.globalAlpha = 0.45 + tier * 0.1;
    ctx.lineWidth = tier >= 3 ? 1.8 : 1.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 7, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (tier >= 3) {
      ctx.strokeStyle = palette.secondary;
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 4.5);
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -t * 16;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 7, rx * 1.16, ry * 1.16, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (let i = 0; i < palette.stars; i += 1) {
      const a = t * (1.5 + tier * 0.25) + (Math.PI * 2 * i) / palette.stars;
      const sx = cx + Math.cos(a) * rx * 0.95;
      const sy = cy - 4 + Math.sin(a * 1.4) * (baseRadius * 0.55) - ((t * 10 + i * 5) % 10);
      const blink = 0.45 + 0.55 * Math.abs(Math.sin(t * 3 + i * 1.7));
      applyPixelCrisp(ctx, sx, sy, 2.2 + tier * 0.45, i % 2 === 0 ? palette.primary : palette.secondary, blink);
    }

    ctx.restore();
  }

  function decorateSlotElement(el, item, opts = {}) {
    if (!el || typeof el.classList === "undefined") return null;
    const profile = resolveItemFxProfile(item, opts);
    const rarityClasses = ["fx-rarity-normal", "fx-rarity-magic", "fx-rarity-exl", "fx-rarity-ancient"];
    const presetClasses = ["fx-sparkle-dewdrop", "fx-sparkle-shimmer", "fx-sparkle-mythic_prism", "fx-sparkle-elemental"];
    const glowClasses = ["fx-enh-t1", "fx-enh-t2", "fx-enh-t3", "fx-enh-t4"];
    el.classList.remove(...rarityClasses, ...presetClasses, ...glowClasses, "fx-animated", "fx-has-luck");

    if (!item) return profile;

    el.classList.add(`fx-rarity-${profile.rarity.toLowerCase()}`);
    if (profile.hasLuck) el.classList.add("fx-has-luck");
    if (profile.glowTier > 0) el.classList.add(`fx-enh-t${profile.glowTier}`);
    if (profile.sparkleEnabled) {
      el.classList.add(`fx-sparkle-${profile.preset.toLowerCase()}`);
      if (profile.persistentAllowed) el.classList.add("fx-animated");
    }
    el.style?.setProperty?.("--fx-color", profile.color);
    el.style?.setProperty?.("--fx-secondary", profile.secondaryColor);

    if (opts.renderBadges === false || typeof el.querySelector !== "function") return profile;

    let enhBadge = el.querySelector(".fx-enh-badge");
    if (profile.enhanceLevel > 0) {
      if (!enhBadge && typeof document !== "undefined") {
        enhBadge = document.createElement("span");
        enhBadge.className = "fx-enh-badge";
        el.appendChild(enhBadge);
      }
      if (enhBadge) {
        enhBadge.textContent = `+${profile.enhanceLevel}`;
        enhBadge.dataset.tier = String(profile.glowTier);
      }
    } else if (enhBadge) {
      enhBadge.remove();
    }

    let luckBadge = el.querySelector(".fx-luck-badge");
    if (profile.hasLuck) {
      if (!luckBadge && typeof document !== "undefined") {
        luckBadge = document.createElement("span");
        luckBadge.className = "fx-luck-badge";
        luckBadge.title = "Dòng May Mắn (+15% Cường Hóa, +5% Chí Mạng)";
        luckBadge.textContent = "✦";
        el.appendChild(luckBadge);
      }
    } else if (luckBadge) {
      luckBadge.remove();
    }

    let sparkleLayer = el.querySelector(".fx-sparkle-layer");
    if (profile.sparkleEnabled && profile.persistentAllowed) {
      if (!sparkleLayer && typeof document !== "undefined") {
        sparkleLayer = document.createElement("span");
        sparkleLayer.className = "fx-sparkle-layer";
        sparkleLayer.innerHTML = "<i class=\"fx-star s1\"></i><i class=\"fx-star s2\"></i><i class=\"fx-star s3\"></i>";
        el.appendChild(sparkleLayer);
      }
    } else if (sparkleLayer) {
      sparkleLayer.remove();
    }

    return profile;
  }

  return Object.freeze({
    SPARKLE_PRESETS,
    RARITY_META,
    ELEMENT_COLORS,
    enhanceGlowTier,
    resolveItemFxProfile,
    drawSparkleOverlayCanvas,
    drawCharacterEnhanceAura,
    decorateSlotElement,
  });
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ItemFX };
}
