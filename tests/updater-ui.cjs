// Real Electron/preload/renderer integration. Network and installer execution are fixtures.
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'latitude-update-ui-'));
  const modulePath=path.resolve(__dirname,'../electron/updater.cjs');
  let app,page;const errors=[];
  async function launch() {
    app=await electron.launch({
      executablePath:process.env.TAKE_TEST_ELECTRON||require('electron'),
      args:['--no-sandbox','--disable-gpu',...(process.platform==='linux'?['--ozone-platform=headless']:[]),path.resolve(__dirname,'..')],
      env:{...process.env,TAKE_STUDIO_TEST:'1',LATITUDE_TEST_PROFILE:path.join(root,'profile'),LATITUDE_UPDATE_TEST_MODE:'windows'},
    });
    page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
    await app.evaluate((_,file)=>{
      const require=process.getBuiltinModule('node:module').createRequire(file);
      const {testing:u,artifact,RELEASES}=require(file),data=Buffer.from('Harmless update fixture');
      const hash=require('node:crypto').createHash('sha256').update(data).digest('hex');
      const name=artifact('0.9.99','windows'),base=`${RELEASES}/download/v0.9.99/`;
      u.testCalls=[];u.testHandoffs=[];
      u.fetcher=async(url)=>{
        u.testCalls.push(url);
        if(url.includes('api.github.com'))return new Response(JSON.stringify([{tag_name:'v0.9.99',prerelease:true,assets:[name,'SHA256SUMS.txt'].map(n=>({name:n,size:n===name?data.length:150,state:'uploaded',browser_download_url:base+n}))}]));
        if(url.endsWith('SHA256SUMS.txt'))return new Response(`${hash}  ${name}\n`);
        return new Response(data);
      };
      u.handoff=async(file,mode)=>u.testHandoffs.push({file,mode});
    },modulePath);
    await page.addInitScript(()=>localStorage.setItem('latitude-v2',JSON.stringify({onboarded:true,reconnectMic:false,mods:{}})));
    await page.goto('take://app/src/index.html?test');
  }
  const native=async()=>app.evaluate((_,file)=>{const require=process.getBuiltinModule('node:module').createRequire(file);const u=require(file).testing;return {state:u.snapshot(),calls:u.testCalls,handoffs:u.testHandoffs};},modulePath);
  try {
    await launch();
    await page.evaluate(()=>document.querySelector('#modal').showModal());
    await page.waitForTimeout(2300);
    assert.equal((await native()).calls.length,0,'Onboarding/another dialog defers the startup check');
    await page.evaluate(()=>document.querySelector('#modal').close());
    await page.locator('#update-dialog').waitFor({state:'visible'});
    assert.equal((await native()).calls.length,2,'Launch checks metadata and checksum, never downloads the artifact');
    assert.equal(await page.locator('#update-now').textContent(),'Update now');
    await page.screenshot({path:path.join(root,'update-prompt.png')});
    await page.click('#update-skip');await page.locator('#update-dialog').waitFor({state:'hidden'});
    await page.evaluate(()=>window.take.updates('launch'));
    assert.equal((await native()).calls.length,2);
    await page.reload();await page.waitForTimeout(2300);
    assert.equal(await page.locator('#update-dialog').isVisible(),false,'Renderer reload must not undo skip');
    assert.equal((await native()).calls.length,2);
    await app.close();app=null;
    await launch();await page.locator('#update-dialog').waitFor({state:'visible'});
    assert.equal((await native()).calls.length,2,'A new process offers the skipped release again');
    await page.click('#update-skip');
    await page.click('[data-view="mods"]');await page.check('[data-mod-id="latitude-editor"]');
    await page.waitForFunction(()=>!!window.__editor);
    // Merely enabling an empty editor must not overwrite a previous recovery draft.
    await page.evaluate(async()=>{
      await window.take.editor('draft',{...window.__editor.project,name:'Previous recovery'});
      const pending=[];
      window.dispatchEvent(new CustomEvent('latitude-before-update',{detail:{waitUntil:p=>pending.push(p)}}));
      await Promise.all(pending);
    });
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'profile','editor-draft.json'),'utf8')).project.name,'Previous recovery');
    await page.evaluate(()=>window.__editor.commit({...window.__editor.project,name:'Update recovery test'}));
    await page.click('[data-view="editor"]');
    await page.evaluate(()=>window.take.updates('check'));await page.locator('#update-dialog').waitFor({state:'visible'});
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(()=>window.__editor.project.name),'Update recovery test','Modal must prevent editor shortcuts');
    await page.click('#update-now');
    await page.waitForFunction(()=>document.querySelector('#update-title').textContent==='Your update is ready to finish.');
    const installed=await native();assert.equal(installed.handoffs.length,1);assert.equal(installed.handoffs[0].mode,'windows');
    assert.equal(installed.calls.filter(x=>x.endsWith('.exe')).length,1);
    const draft=JSON.parse(await fs.readFile(path.join(root,'profile','editor-draft.json'),'utf8'));
    assert.equal(draft.project.name,'Update recovery test','Latest editor draft saved before handing off the update');
    await page.click('#update-skip');
    await page.click('[data-view="settings"]');
    await page.uncheck('#updates-enabled');
    await page.waitForFunction(()=>!document.querySelector('#updates-enabled').disabled);
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'profile','updates.json'),'utf8')).checkAtLaunch,false);
    await assert.rejects(page.evaluate(()=>window.take.updates('arbitrary-operation')),/Unsupported update/);
    await app.close();app=null;
    await launch();await page.waitForTimeout(2300);
    assert.equal((await native()).calls.length,0,'Disabled startup preference survives restart');
    await page.click('[data-view="settings"]');await page.click('#updates-check');
    await page.locator('#update-dialog').waitFor({state:'visible'});
    assert.equal((await native()).calls.length,2,'Manual checks still work when launch checks are disabled');
    if(process.env.LATITUDE_UPDATE_LIVE_CHECK==='1') {
      // Public metadata + checksum only; never download or execute a real release here.
      const live=await app.evaluate(async({net},file)=>{
        const require=process.getBuiltinModule('node:module').createRequire(file),u=require(file).testing;
        u.current='0.0.0';u.fetcher=(url,options)=>net.fetch(url,options);
        const state=await u.check({manual:true});return {phase:state.phase,message:state.message,hash:u.selected?.hash};
      },modulePath);
      assert.equal(live.phase,'available',live.message);assert.match(live.hash,/^[a-f0-9]{64}$/);
      console.log('Live GitHub metadata and checksum verified through Electron networking.');
    }
    assert.deepEqual(errors,[]);
    console.log('Update UI passed: startup deferral, skip/relaunch, manual check, verified download, draft save, handoff, persisted opt-out. Screenshot: '+path.join(root,'update-prompt.png'));
  } finally { if(app)await app.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
