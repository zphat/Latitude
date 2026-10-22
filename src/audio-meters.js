import { gainToDb, clamp } from "../audio/dsp.js";

// Sample-peak meters, not loudness meters. Fixed gradient positions correspond
// to dBFS at every card width; clipping has no visual hold or CSS transition.
const ids = ["voice1", "voice2", "desktop", "mix"];
const dbText = (db) => (db < -70 ? "−∞" : db.toFixed(1));
const setText = (node, value) => {
  if (node.textContent !== value) node.textContent = value;
};
const bar = (id, label, input = false) => `
  <div class="meter-row${input ? " meter-input" : ""}">
    <div class="meter-label"><span>${label}</span><span id="${input ? "input-peak" : "peak"}-${id}">−∞ dBFS</span></div>
    <div class="level-track" role="meter" aria-label="${id.replace("voice", "Voice ")} ${label} sample peak" aria-valuemin="-60" aria-valuemax="0" aria-valuenow="-60" title="Sample peak · −60 to 0 dBFS. Yellow above −12, red above −6. The right edge is full scale.">
      <div class="level-fill" id="${input ? "input-level" : "level"}-${id}"></div><div class="level-grid"></div>
      ${input ? '<span class="clip-lamp" aria-hidden="true"></span>' : '<span class="ceiling-mark" title="Always-on limiter ceiling: −1.5 dBFS"></span>'}
    </div>
  </div>`;

export const meterMarkup = (id, voice) => `
  ${voice ? bar(id, "Input", true) : ""}${bar(id, voice ? "Protected output" : "Output")}
  <div class="meter-scale" aria-hidden="true"><span>−60</span><span>−12</span><span>0</span></div>
  <div class="meter-safety" id="safety-${id}" title="The limiter stays on for processed tracks, monitoring and the full mix, even with processing bypassed. Raw backup tracks preserve the original input.">Limiter on · −1.5 dBFS</div>`;

export class AudioMeters {
  constructor(root) {
    this.cards = ids.map((id, i) => {
      const card = root.querySelector(`[data-mixer="${i}"]`);
      const find = (prefix) => card.querySelector(`#${prefix}-${id}`);
      return {
        card,
        fill: find("level"),
        peak: find("peak"),
        input: find("input-level"),
        inputPeak: find("input-peak"),
        safety: find("safety"),
        status: find("status"),
      };
    });
  }
  paintBar(fill, label, peak) {
    const db = gainToDb(Number.isFinite(peak) ? Math.abs(peak) : 0);
    const percentage = clamp(((db + 60) / 60) * 100, 0, 100);
    fill.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
    setText(label, `${dbText(db)} dBFS`);
    const track = fill.parentElement;
    track.setAttribute("aria-valuenow", String(clamp(db, -60, 0).toFixed(1)));
    track.setAttribute(
      "aria-valuetext",
      db < -70 ? "No signal" : `${db.toFixed(1)} dBFS`,
    );
    return db;
  }
  clearActivity(label = "Meter paused") {
    for (const m of this.cards) {
      m.card.classList.remove("input-clipping", "input-hot", "limiter-active");
      this.paintBar(m.fill, m.peak, 0);
      if (m.input) this.paintBar(m.input, m.inputPeak, 0);
      setText(m.safety, "Limiter on · −1.5 dBFS");
      setText(m.status, label);
      m.status.classList.remove("level-warning", "clip-history");
    }
  }
  update(data, sources, clipped, desktop) {
    for (let i = 0; i < this.cards.length; i++) {
      const m = this.cards[i];
      this.paintBar(m.fill, m.peak, data.peaks[i]);
      const reduction = data.limiterReduction?.[i] || 0;
      m.card.classList.toggle("limiter-active", reduction > 0.1);
      setText(
        m.safety,
        reduction > 0.1
          ? `Limiter catching · −${reduction.toFixed(1)} dB`
          : "Limiter on · −1.5 dBFS",
      );
      if (i < 2) {
        const db = this.paintBar(m.input, m.inputPeak, data.inputPeaks[i]);
        const clipping = data.clips[i] > 0;
        m.card.classList.toggle("input-clipping", clipping);
        m.card.classList.toggle("input-hot", !clipping && db > -6);
        m.status.classList.toggle("level-warning", clipping);
        m.status.classList.toggle("clip-history", !clipping && clipped[i]);
        setText(
          m.status,
          clipping
            ? "INPUT CLIP · now"
            : clipped[i]
              ? "Clipped earlier · Reset clips"
              : db > -70
                ? `${Math.max(0, -db).toFixed(1)} dB to clip`
                : sources[`mic${i + 1}`]
                  ? "Input ready"
                  : "No signal",
        );
        m.status.title =
          clipping || clipped[i]
            ? "Lower the mic or interface gain. A software limiter cannot repair an already-clipped input."
            : "Input headroom before full scale. Aim for speech peaks around −12 to −6 dBFS. In Blend mode this watches both selected channels before mixing.";
      } else {
        setText(
          m.status,
          i === 3
            ? "Mix protected"
            : desktop.duck
              ? "Ducks in mix"
              : sources.desktop
                ? "Stereo protected"
                : "No signal",
        );
      }
    }
  }
}
