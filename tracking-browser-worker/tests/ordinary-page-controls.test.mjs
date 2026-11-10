import test from 'node:test';
import assert from 'node:assert/strict';
import {dismissOoclCookieNotice, dismissHapagCookieNotice} from '../src/carriers/ordinary-page-controls.mjs';
import {CARRIERS} from '../src/carriers/adapters.mjs';

function cookieFixture({visible = true, expanded = false, failure = null} = {}) {
  const calls = [];
  const page = {locator: selector => ({
    waitFor: async ({state}) => {
      calls.push(['wait', selector, state]);
      if (state === 'visible' && !visible) throw Object.assign(new Error('not visible'), {name: 'TimeoutError'});
    },
    isVisible: async () => expanded,
    click: async () => { calls.push(['click', selector]); if (failure) throw failure; },
    setChecked: async value => { calls.push(['checked', selector, value]); },
  })};
  return {page, calls};
}

test('OOCL keeps only necessary cookies through the actual settings controls', async () => {
  const fixture = cookieFixture();
  await dismissOoclCookieNotice(fixture.page);
  assert.deepEqual(fixture.calls, [
    ['wait', '#preference', 'visible'], ['click', '#preference'],
    ['checked', '#cookieSwitch1', false], ['checked', '#cookieSwitch2', false],
    ['click', '#updatePreference'], ['wait', '#preference', 'hidden'],
  ]);
});

test('OOCL does not collapse an already-open cookie settings panel', async () => {
  const fixture = cookieFixture({expanded: true});
  await dismissOoclCookieNotice(fixture.page);
  assert.equal(fixture.calls.some(([action, selector]) => action === 'click' && selector === '#preference'), false);
});

test('pages without cookie notices continue without clicking or changing preferences', async () => {
  const fixture = cookieFixture({visible: false});
  await dismissOoclCookieNotice(fixture.page);
  assert.equal(fixture.calls.length, 1);
});

test('cookie interaction and browser errors are not silently swallowed', async () => {
  const failure = new Error('page closed');
  const fixture = cookieFixture({failure});
  await assert.rejects(dismissOoclCookieNotice(fixture.page), error => error === failure);
  await assert.rejects(dismissOoclCookieNotice({locator: () => ({waitFor: async () => {throw failure;}})}), error => error === failure);
});

test('Hapag confirms an open preferences dialog before considering the covered banner', async () => {
  const calls = [];
  let modal = true;
  const confirm = {
    isVisible: async () => modal,
    click: async () => {calls.push('confirm current choices'); modal = false;},
    waitFor: async ({state}) => {assert.equal(state, 'hidden'); assert.equal(modal, false);},
  };
  const reject = {
    isVisible: async () => true,
    click: async () => {assert.equal(modal, false); calls.push('reject banner');},
    waitFor: async ({state}) => {assert.equal(state, 'hidden');},
  };
  await dismissHapagCookieNotice({getByRole: () => confirm, locator: () => reject});
  assert.deepEqual(calls, ['confirm current choices', 'reject banner']);
});

test('Hapag never clicks behind a preference modal whose confirmation fails', async () => {
  const failure = new Error('preference confirmation did not close');
  await assert.rejects(dismissHapagCookieNotice({
    getByRole: () => ({isVisible: async () => true, click: async () => {throw failure;}}),
    locator: () => {throw new Error('must not reach covered banner');},
  }), error => error === failure);
});

function queryFixture({submitError = null} = {}) {
  const calls = [];
  const input = {
    first() {return this;},
    waitFor: async () => {},
    fill: async value => {calls.push(['fill', value]);},
    press: async value => {calls.push(['press', value]);},
  };
  const submit = {
    first() {return this;},
    count: async () => 1,
    click: async () => {calls.push(['submit']); if (submitError) throw submitError;},
  };
  return {calls, page: {
    goto: async () => {}, waitForTimeout: async () => {},
    locator: selector => {
      calls.push(['selector', selector]);
      if (selector === 'textarea' || selector === '#shipment-main-search-2') return input;
      if (selector === 'input[type=submit]') return submit;
      throw new Error('Unexpected selector: ' + selector);
    },
    getByRole: (role, options) => ['Agree', 'Accept All', 'Accept all', 'I Accept', 'Accept'].includes(options.name)
      ? {first() {return this;}, isVisible: async () => false,waitFor:async()=>{throw Object.assign(new Error('not visible'),{name:'TimeoutError'});}} : submit,
  }};
}

test('Yang Ming fills its current textarea and submits once', async () => {
  const fixture = queryFixture();
  await CARRIERS.YML.steps(fixture.page, 'YMJAE237071981');
  assert.deepEqual(fixture.calls, [['selector', 'textarea'], ['fill', 'YMJAE237071981'], ['submit']]);
});

test('ZIM without a cookie notice fills and submits once', async () => {
  const fixture = queryFixture();
  await CARRIERS.ZIM.steps(fixture.page, 'ZIMUSNH22285870');
  assert.deepEqual(fixture.calls, [
    ['selector', '#shipment-main-search-2'], ['fill', 'ZIMUSNH22285870'],
    ['selector', 'input[type=submit]'], ['submit'],
  ]);
});

test('failed submissions propagate instead of returning an empty normal result', async () => {
  const failure = new Error('search click intercepted');
  for (const carrier of ['YML', 'ZIM']) {
    const fixture = queryFixture({submitError: failure});
    await assert.rejects(CARRIERS[carrier].steps(fixture.page, 'SAMPLE'), error => error === failure);
    assert.equal(fixture.calls.filter(([name]) => name === 'submit').length, 1);
  }
});
