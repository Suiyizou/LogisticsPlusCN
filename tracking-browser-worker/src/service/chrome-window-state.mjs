// windowsHide hides a process console; it does not reliably hide Chrome's
// compositor window. Keep the real, persistent browser available for queries
// and human verification, but keep its keeper offscreen and minimized via CDP.
// A new query tab can restore Chrome, so minimization alone is insufficient.
const isOffscreen = bounds => bounds.left + bounds.width < -10000 && bounds.top + bounds.height < -10000;

export async function setManagedChromeWindowState(session, {show = false} = {}) {
  const {targetInfos} = await session.send('Target.getTargets');
  const keeper = targetInfos.find(target => target.type === 'page' && (
    target.title === 'automation-keeper'
    || target.url?.startsWith('data:text/html,<title>automation-keeper</title>')
  ));
  if (!keeper) throw new Error('找不到 automation-keeper，未更改其他浏览器窗口');

  const {windowId, bounds} = await session.send('Browser.getWindowForTarget', {targetId:keeper.targetId});
  // Reusing a running instance must never briefly restore a minimized window.
  if (!show && bounds.windowState === 'minimized' && isOffscreen(bounds)) return bounds;
  if (show) {
    // CDP disallows position/size changes while minimized/maximized. Only an
    // explicit human-maintenance request restores the window onto the desktop.
    if (bounds.windowState !== 'normal') {
      await session.send('Browser.setWindowBounds', {windowId, bounds:{windowState:'normal'}});
    }
    await session.send('Browser.setWindowBounds', {
      windowId, bounds:{left:80, top:80, width:1440, height:1000},
    });
  } else {
    // Startup stays offscreen throughout. After manual --show, --hide also
    // moves the restored position offscreen so a new query tab cannot pop up.
    if (!isOffscreen(bounds)) {
      if (bounds.windowState !== 'normal') {
        await session.send('Browser.setWindowBounds', {windowId, bounds:{windowState:'normal'}});
      }
      await session.send('Browser.setWindowBounds', {windowId, bounds:{left:-32000, top:-32000}});
    }
    await session.send('Browser.setWindowBounds', {windowId, bounds:{windowState:'minimized'}});
  }
  const current = (await session.send('Browser.getWindowBounds', {windowId})).bounds;
  const expected = show ? 'normal' : 'minimized';
  if (current.windowState !== expected) {
    throw new Error(`Chrome 窗口状态未生效：期望 ${expected}，实际 ${current.windowState}`);
  }
  if (!show && !isOffscreen(current)) throw new Error('Chrome 窗口未移出桌面，后台启动未完成');
  return current;
}
