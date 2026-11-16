// Real native pointer, keyboard and decoded-picture checks for everyday editing.
const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict"), fs = require("node:fs/promises");
const path = require("node:path"), os = require("node:os");
const { execFileSync } = require("node:child_process");
const binary = process.env.TAKE_FFMPEG || require("ffmpeg-static");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-gestures-ui-"));
  const source = path.join(root, "An unusually long frame-counted podcast picture.mp4");
  const audio = path.join(root, "An unusually long separate microphone recording.wav");
  execFileSync(binary, ["-v", "error", "-y", "-f", "lavfi", "-i", "nullsrc=s=320x180:r=30:d=8", "-vf",
    "geq=lum='if(bitand(N,pow(2,floor(X/40))),235,16)':cb=128:cr=128", "-c:v", "libx264", "-g", "150", source]);
  execFileSync(binary, ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=8", audio]);
  let app, page;
  try {
    app = await electron.launch({ executablePath: process.env.TAKE_TEST_ELECTRON || require("electron"),
      args: ["--no-sandbox", "--disable-gpu", ...(process.platform === "linux" ? ["--ozone-platform=headless"] : []), path.resolve(__dirname, "..")],
      env: { ...process.env, TAKE_STUDIO_TEST: "1", LATITUDE_TEST_PROFILE: path.join(root, "profile"), TAKE_FFMPEG: binary } });
    page = await app.firstWindow();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.waitForURL("take://app/src/index.html", { waitUntil: "load" });
    await page.addInitScript(() => localStorage.setItem("latitude-v2", JSON.stringify({ onboarded: true, reconnectMic: false, mods: {} })));
    await page.addInitScript(() => {
      const NativeObserver = ResizeObserver;
      window.timelineObserverConnected = false;
      window.ResizeObserver = class extends NativeObserver {
        observe(node, options) { if (node.id === "edit-timeline") { this.timeline = node; window.timelineObserverConnected = true; } super.observe(node, options); }
        disconnect() { if (this.timeline) window.timelineObserverConnected = false; super.disconnect(); }
      };
    });
    await page.goto("take://app/src/index.html?test");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.click('[data-view="mods"]'); await page.check('[data-mod-id="latitude-editor"]');
    await page.click('[data-view="editor"]'); await page.waitForFunction(() => !!window.__editor);
    await app.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }); }, [source, audio]);
    await page.click("#edit-import"); await page.waitForFunction(() => window.__editor.project.assets.length === 2);
    await page.evaluate(() => {
      const editor = window.__editor, p = structuredClone(editor.project);
      const video = p.assets.find(a => a.kind === "video"), audio = p.assets.find(a => a.kind === "audio");
      p.clips = [
        { id: "picture", asset: video.id, track: p.tracks[0].id, start: 1, in: 1, duration: 4, group: "sync" },
        { id: "voice", asset: audio.id, track: p.tracks[1].id, start: 1, in: 1, duration: 4, group: "sync" },
        { id: "next", asset: video.id, track: p.tracks[0].id, start: 6.5, in: 0, duration: 1 },
      ];
      window.baseProject = structuredClone(p); window.baseMedia = [...editor.media.values()];
      window.resetGestureProject = () => { editor.reset(window.baseProject, window.baseMedia); editor.select("picture"); editor.preview.seek(3); const z = document.querySelector("#edit-zoom"); z.value = 100; z.dispatchEvent(new Event("input")); document.querySelector("#edit-timeline").scrollLeft = 0; };
      window.resetGestureProject();
      window.frameId = () => { const c = document.querySelector("#edit-canvas"), ctx = c.getContext("2d"); let id = 0; for (let bit = 0; bit < 8; bit++) if (ctx.getImageData((bit + 0.5) * c.width / 8, c.height / 2, 1, 1).data[0] > 128) id |= 1 << bit; return id; };
    });
    const frame = async id => page.waitForFunction(n => window.frameId() === n && document.querySelector("#edit-canvas").getAttribute("aria-busy") === "false", id);
    const state = () => page.evaluate(() => ({ p: window.__editor.project, undo: window.__editor.history.undoStack.length, time: window.__editor.preview.time, selected: window.__editor.selected }));
    const reset = async () => { await page.evaluate(() => window.resetGestureProject()); await frame(90); };
    const startHandle = async side => {
      // Scrolling schedules a timeline redraw which replaces the clip nodes.
      // Read the current node and its geometry atomically, rather than retaining
      // an element across protocol calls while that redraw can detach it.
      const handle = await page.waitForFunction(edge => {
        const node = document.querySelector(`[data-clip="picture"] [data-trim="${edge}"]`);
        if (!node) return false;
        const { x, y, width, height } = node.getBoundingClientRect();
        return width > 0 && height > 0 ? { x, y, width, height } : false;
      }, side);
      const b = await handle.jsonValue();
      await handle.dispose();
      assert.ok(b); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    await frame(90);
    let pt = await startHandle("left"); await page.mouse.move(pt.x + 100, pt.y, { steps: 15 });
    await frame(60); // live first retained frame, before release
    assert.match(await page.textContent("#edit-drag-feedback"), /Trim start.*00:00:02:00/);
    let s = await state(); assert.equal(s.undo, 0); assert.equal(s.p.clips[0].in, 2); assert.equal(s.p.clips[1].in, 2);
    await page.mouse.up(); s = await state(); assert.equal(s.undo, 1);
    pt = await startHandle("right"); await page.mouse.move(pt.x - 100, pt.y, { steps: 10 });
    await frame(119); // last retained frame, not the first frame after the cut
    s = await state(); assert.equal(s.p.clips[0].duration, 2); assert.equal(s.p.clips[1].duration, 2);
    await page.mouse.up(); assert.equal((await state()).undo, 2);
    await page.click("#edit-undo"); assert.equal((await state()).p.clips[0].duration, 3);
    // Selecting again after undo must re-enable actions (previously stayed disabled).
    const clip = await page.locator('[data-clip="picture"]').boundingBox();
    await page.mouse.click(clip.x + 35, clip.y + 20); assert.equal(await page.isEnabled("#edit-split"), true);
    await reset(); const before = await state();
    pt = await startHandle("left"); await page.mouse.move(pt.x + 50, pt.y, { steps: 8 }); await frame(45);
    await page.keyboard.press("Escape"); await page.mouse.up(); await frame(90);
    assert.deepEqual(await state(), before, "Escape restores project, playhead and undo history");
    assert.equal(await page.isVisible("#edit-drag-feedback"), false);
    const surface = await page.locator("#edit-canvas").boundingBox();
    await page.mouse.move(surface.x + surface.width / 2, surface.y + surface.height / 2); await page.mouse.down();
    await page.mouse.move(surface.x + surface.width / 2 + 25, surface.y + surface.height / 2 + 10, { steps: 5 });
    await page.waitForFunction(() => window.__editor.project.clips[0].x !== 0);
    await page.keyboard.press("Escape"); await page.mouse.up(); await frame(90);
    assert.deepEqual(await state(), before, "Escape also restores a picture-position drag");
    // Commands during a held canvas gesture must not split/delete the clip or
    // replace history underneath the gesture's pending commit.
    await page.locator("#edit-timeline").focus();
    await page.mouse.move(surface.x + surface.width / 2, surface.y + surface.height / 2); await page.mouse.down();
    await page.mouse.move(surface.x + surface.width / 2 + 30, surface.y + surface.height / 2 + 12, { steps: 5 });
    await page.waitForFunction(() => window.__editor.project.clips[0].x !== 0);
    const held = await state();
    for (const key of ["Delete", "s", "ArrowDown", "Home", "m", "ControlOrMeta+z"]) {
      await page.keyboard.press(key);
      assert.deepEqual(await state(), held, `${key} cannot mutate a held canvas gesture`);
    }
    await page.keyboard.press("Escape"); await page.mouse.up(); await frame(90);
    assert.deepEqual(await state(), before, "Cancel still restores the whole gesture after ignored shortcuts");
    await page.evaluate(() => { const p = structuredClone(window.baseProject); p.tracks[1].locked = true; window.__editor.reset(p, window.baseMedia); window.__editor.select("picture"); });
    const locked = JSON.stringify((await state()).p);
    pt = await startHandle("left"); await page.mouse.move(pt.x + 50, pt.y, { steps: 8 }); await page.mouse.up();
    assert.equal(JSON.stringify((await state()).p), locked, "Locked linked audio blocks the whole trim");
    await reset();
    // Snap the moving clip's END to the next clip's START, with linked audio intact.
    const moveClip = async (delta, alt = false) => {
      const b = await page.locator('[data-clip="picture"]').boundingBox();
      if (alt) await page.keyboard.down("Alt");
      await page.mouse.move(b.x + 50, b.y + 22); await page.mouse.down();
      await page.mouse.move(b.x + 50 + delta * 100, b.y + 22, { steps: 12 });
      await page.waitForFunction(() => !document.querySelector("#edit-drag-feedback").hidden);
    };
    await moveClip(1.46);
    await page.waitForFunction(() => window.__editor.project.clips[0].start === 2.5);
    assert.equal(await page.isVisible("#edit-snap-guide"), true);
    assert.equal((await state()).p.clips[1].start, 2.5);
    await page.keyboard.down("Alt");
    await page.waitForFunction(() => document.querySelector("#edit-snap-guide").hidden);
    await page.keyboard.up("Alt");
    await page.waitForFunction(() => !document.querySelector("#edit-snap-guide").hidden);
    await page.mouse.up();
    await reset(); await moveClip(1.46, true);
    await page.waitForFunction(() => Math.abs(window.__editor.project.clips[0].start - 74 / 30) < 1e-6);
    assert.equal(await page.isVisible("#edit-snap-guide"), false);
    await page.mouse.up(); await page.keyboard.up("Alt");
    // Numeric edits must obey the shortest linked source, rather than trim each independently.
    await reset(); await page.fill("#clip-in", "0"); await page.locator("#clip-in").press("Tab");
    s = await state(); assert.equal(s.p.clips[0].in, 0); assert.equal(s.p.clips[1].in, 0);
    assert.equal(s.p.clips[0].start, 0); assert.equal(s.p.clips[1].start, 0);
    await reset();
    await page.locator("#edit-timeline").focus(); await page.keyboard.press("ArrowDown");
    assert.equal((await state()).time, 5);
    await page.keyboard.press("ArrowDown"); assert.equal((await state()).time, 6.5);
    await page.keyboard.press("ArrowUp"); assert.equal((await state()).time, 5);
    const historyBeforeNavigation = JSON.stringify((await state()).p);
    await page.keyboard.press("n"); assert.equal(await page.getAttribute("#edit-snap", "aria-pressed"), "false");
    await page.keyboard.press("n");
    // Wheel zoom keeps the time under the pointer stationary; Shift-wheel pans.
    await page.evaluate(() => { document.querySelector("#edit-timeline").scrollLeft = 100; });
    const b = await page.locator("#edit-timeline").boundingBox(), x = b.x + 420, y = b.y + 45;
    const anchor = () => page.evaluate(() => { const t = document.querySelector("#edit-timeline"); return (t.scrollLeft + 420 - 150) / Number(document.querySelector("#edit-zoom").value); });
    const a = await anchor();
    await page.mouse.move(x, y); await page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
    await page.mouse.wheel(0, -140); await page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
    await page.waitForFunction(() => Number(document.querySelector("#edit-zoom").value) > 100);
    assert.ok(Math.abs(await anchor() - a) < 0.03);
    const oldScroll = await page.$eval("#edit-timeline", t => t.scrollLeft);
    await page.keyboard.down("Shift"); await page.mouse.wheel(0, 120); await page.keyboard.up("Shift");
    await page.waitForFunction(n => document.querySelector("#edit-timeline").scrollLeft > n + 50, oldScroll);
    assert.equal(JSON.stringify((await state()).p), historyBeforeNavigation);
    // A zoomed end trim must not change its delta as a shorter timeline would
    // otherwise clamp scrollLeft under the pointer on every move.
    await page.evaluate(() => {
      const p = structuredClone(window.baseProject); p.clips = p.clips.slice(0, 2); p.clips.forEach(c => c.duration = 6);
      window.__editor.reset(p, window.baseMedia); window.__editor.select("picture");
      const z = document.querySelector("#edit-zoom"); z.value = 200; z.dispatchEvent(new Event("input"));
      const t = document.querySelector("#edit-timeline"); t.scrollLeft = t.scrollWidth;
    });
    const extent = await page.evaluate(() => ({ actual: document.querySelector("#edit-timeline").scrollWidth, planned: parseFloat(document.querySelector("#edit-timeline-content").style.width) }));
    assert.ok(extent.actual <= extent.planned + 2, "Ruler labels must not extend the scrollable timeline");
    pt = await startHandle("right");
    await page.keyboard.down("Alt");
    await page.mouse.move(pt.x - 100, pt.y, { steps: 15 }); await page.mouse.up(); await page.keyboard.up("Alt");
    assert.equal((await state()).p.clips[0].duration, 5.5);
    assert.equal((await state()).p.clips[1].duration, 5.5);
    // Holding an edge (no extra pointer moves) scrolls, and Escape stops the RAF.
    await reset(); await page.evaluate(() => { const z = document.querySelector("#edit-zoom"); z.value = 240; z.dispatchEvent(new Event("input")); document.querySelector("#edit-timeline").scrollLeft = 0; });
    const rect = await page.locator("#edit-timeline").boundingBox();
    await page.mouse.move(rect.x + 200, rect.y + 16); await page.mouse.down(); await page.mouse.move(rect.x + rect.width - 4, rect.y + 16);
    await page.waitForFunction(() => document.querySelector("#edit-timeline").scrollLeft > 80);
    await page.keyboard.press("Escape"); await page.mouse.up(); await frame(90);
    // Long, layered projects should retain clip nodes while scrolling inside the
    // already rendered region, but render new clips when the viewport leaves it.
    await page.evaluate(() => {
      const p = structuredClone(window.baseProject);
      for (let i = 0; i < 7; i++) p.tracks.push({ ...p.tracks[1], id: `scroll-${i}`, name: `Guest ${i}` });
      for (let i = 1; i <= 60; i++) p.clips.push({ ...p.clips[0], id: `later-${i}`, group: null, start: i * 10 });
      window.__editor.reset(p, window.baseMedia); window.__editor.select("picture"); window.__editor.preview.seek(3);
      const z = document.querySelector("#edit-zoom"); z.value = 100; z.dispatchEvent(new Event("input"));
      document.querySelector("#edit-timeline").scrollLeft = 0;
    });
    await frame(90);
    const scrollBefore = await state();
    const reuse = await page.evaluate(async () => {
      const timeline = document.querySelector("#edit-timeline"), rows = document.querySelector("#edit-track-rows");
      const original = rows.querySelector('[data-clip="picture"]');
      let changes = 0; const observer = new MutationObserver(records => { changes += records.length; });
      observer.observe(rows, { childList: true, subtree: true });
      const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      for (let i = 1; i <= 8; i++) { timeline.scrollTop = i * 20; await settle(); }
      for (let i = 1; i <= 8; i++) { timeline.scrollLeft = i * 20; await settle(); }
      observer.disconnect();
      return { changes, sameClip: original === rows.querySelector('[data-clip="picture"]') };
    });
    assert.deepEqual(reuse, { changes: 0, sameClip: true }, "Small horizontal/vertical scrolls reuse rows and waveforms");
    await page.evaluate(() => { document.querySelector("#edit-timeline").scrollLeft = 12000; });
    await page.waitForSelector('[data-clip="later-12"]');
    assert.equal(await page.locator('[data-clip="picture"]').count(), 0, "Far-away clips remain culled");
    await page.evaluate(() => { document.querySelector("#edit-timeline").scrollLeft = 0; });
    await page.waitForSelector('[data-clip="picture"]');
    assert.deepEqual(await state(), scrollBefore, "Scrolling never changes the project, playhead or undo history");
    await page.setViewportSize({ width: 960, height: 640 });
    await page.evaluate(() => {
      const z = document.querySelector("#edit-zoom"); z.value = 50; z.dispatchEvent(new Event("input"));
      const timeline = document.querySelector("#edit-timeline"); timeline.scrollLeft = timeline.scrollTop = 0;
    });
    assert.equal(await page.locator('[data-clip="later-3"]').count(), 0);
    await page.setViewportSize({ width: 2560, height: 1000 });
    await page.waitForSelector('[data-clip="later-3"]');
    assert.deepEqual(await state(), scrollBefore, "Widening the window reveals additional clips without altering edits");
    assert.equal(await page.evaluate(() => window.timelineObserverConnected), true);
    // Large layered timelines, long names, scaling and reachable footer controls.
    await page.evaluate(() => { const p = structuredClone(window.baseProject); for (let i = 0; i < 7; i++) p.tracks.push({ ...p.tracks[1], id: `extra-${i}`, name: `Guest microphone ${i + 2} with a long descriptive name` }); window.__editor.reset(p, window.baseMedia); window.__editor.preview.seek(3); });
    for (const [width, height, scale] of [[960, 640, 1], [1280, 720, 1], [1280, 720, 1.25], [1480, 1000, 1.5]]) {
      await app.evaluate(({ BrowserWindow }, z) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z), scale);
      await page.setViewportSize({ width, height }); await page.click("#edit-fit");
      for (const id of ["edit-previous-cut", "edit-next-cut", "edit-snap", "edit-save", "edit-export"]) assert.equal(await page.isVisible(`#${id}`), true);
      await page.locator("#edit-snap").scrollIntoViewIfNeeded();
      const save = await page.locator("#edit-save").boundingBox(), top = await page.locator(".topbar").boundingBox();
      assert.ok(save.y >= top.y + top.height - 1, "Save stays visible when scrolling to timeline controls");
      await page.screenshot({ path: path.join(root, `gestures-${width}-${scale}.png`) });
    }
    await page.click("#edit-snap"); // retain disabled preference across mod reload
    await page.evaluate(() => { window.oldTimeline = document.querySelector("#edit-timeline"); });
    await page.click('[data-view="mods"]'); await page.uncheck('[data-mod-id="latitude-editor"]');
    await page.waitForFunction(() => !window.__editor);
    assert.equal(await page.evaluate(() => window.timelineObserverConnected), false, "Disabling the mod disconnects its resize observer");
    assert.equal(await page.evaluate(() => window.oldTimeline.onscroll === null), true, "Disabling removes the scroll callback");
    assert.equal(await page.evaluate(() => window.oldTimeline.dispatchEvent(new WheelEvent("wheel", { cancelable: true, ctrlKey: true, deltaY: 100 }))), true, "Disabled mod removes its non-passive wheel listener");
    await page.check('[data-mod-id="latitude-editor"]'); await page.click('[data-view="editor"]');
    await page.waitForFunction(() => !!window.__editor);
    assert.equal(await page.getAttribute("#edit-snap", "aria-pressed"), "false");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "passed", liveTrimFrames: true, linkedBounds: true, snapBothEdges: true, escapeCancel: true, wheelNavigation: true, heldDragShortcuts: true, scrollReuse: reuse, resizeCoverage: true, observerCleanup: true, root }));
  } catch (error) {
    if (page && !page.isClosed()) { console.error(await page.evaluate(() => ({ project: window.__editor?.project, frame: window.frameId?.(), time: window.__editor?.preview.time, toast: document.querySelector("#toast")?.textContent }))); await page.screenshot({ path: path.join(root, "failure.png") }).catch(() => {}); }
    console.error(root); throw error;
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
