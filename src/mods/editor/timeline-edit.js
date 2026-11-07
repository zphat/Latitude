import { clamp, duration, frame, LIMITS, sanitize } from "./model.js";

// Build once at gesture start. Keep the playhead first for equal-distance ties.
export function snapPoints(project, excluded = [], playhead = 0) {
  const skip = new Set(excluded);
  return [...new Set([
    playhead, 0, ...project.markers.map(m => m.time),
    ...project.clips.filter(c => !skip.has(c.id)).flatMap(c => [c.start, c.start + c.duration]),
  ].filter(Number.isFinite).map(t => frame(t, project.fps)))];
}

// A single constrained delta preserves the relationship between linked sources.
// Snap before applying that delta; an unreachable target must never light a guide.
export function dragPlacement(project, id, ids, mode, rawDelta, points = [], tolerance = 0) {
  const chosen = new Set(ids), clips = project.clips.filter(c => chosen.has(c.id));
  const primary = clips.find(c => c.id === id), fps = project.fps;
  if (!primary || !["move", "left", "right"].includes(mode)) throw Error("Choose a clip to move or trim.");
  if (project.tracks.some(t => t.locked && clips.some(c => c.track === t.id))) throw Error("Unlock linked layers before editing.");
  let low, high;
  if (mode === "move") {
    low = -Math.min(...clips.map(c => c.start));
    high = LIMITS.seconds - Math.max(...clips.map(c => c.start + c.duration));
  } else if (mode === "left") {
    low = Math.max(...clips.map(c => -Math.min(c.start, ["image", "title"].includes(c.kind) ? c.start : c.in)));
    high = Math.min(...clips.map(c => c.duration)) - 1 / fps;
  } else {
    low = 1 / fps - Math.min(...clips.map(c => c.duration));
    high = Math.min(...clips.map(c => {
      const asset = project.assets.find(a => a.id === c.asset);
      return Math.min(LIMITS.seconds - c.start - c.duration,
        !asset || asset.missing || asset.kind === "image" ? LIMITS.seconds : asset.duration - c.in - c.duration);
    }));
  }
  low = Math.ceil(low * fps - 1e-6) / fps;
  high = Math.floor(high * fps + 1e-6) / fps;
  let delta = clamp(frame(rawDelta, fps), low, high), guide = null, distance = tolerance, snappedDelta;
  const edges = mode === "move" ? [primary.start, primary.start + primary.duration]
    : [mode === "left" ? primary.start : primary.start + primary.duration];
  for (const point of points) for (const edge of edges) {
    const candidate = frame(point - edge, fps), gap = Math.abs(point - edge - delta);
    if (gap < distance && candidate >= low - 1e-6 && candidate <= high + 1e-6) {
      guide = point; distance = gap; snappedDelta = candidate;
    }
  }
  if (guide !== null) delta = snappedDelta;
  return { delta, guide };
}

export function applyDrag(project, ids, mode, delta, primaryId, targetTrack) {
  const chosen = new Set(ids);
  return sanitize({ ...project, clips: project.clips.map(c => {
    if (!chosen.has(c.id)) return c;
    const x = { ...c };
    if (mode === "move") { x.start += delta; if (x.id === primaryId && targetTrack) x.track = targetTrack; }
    if (mode === "left") {
      x.start += delta; x.duration -= delta;
      if (!["image", "title"].includes(x.kind)) x.in += delta;
    }
    if (mode === "right") x.duration += delta;
    return x;
  }) });
}

export function adjacentCut(project, time, direction) {
  const points = [...new Set([0, duration(project), ...project.clips.flatMap(c => [c.start, c.start + c.duration])])];
  const epsilon = 0.5 / project.fps;
  return direction < 0
    ? Math.max(0, ...points.filter(t => t < time - epsilon))
    : Math.min(duration(project), ...points.filter(t => t > time + epsilon));
}

// Zoom leaves the content under the cursor stationary, except at scroll limits.
export function zoomAnchor(scroll, before, after, x) {
  const at = Math.max(0, (scroll + x - 150) / before);
  return Math.max(0, 150 + at * after - x);
}
