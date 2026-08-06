/* CircuitTecture Custom Component SDK — Web Worker Sandbox
   Runs user-defined component logic (logicJs) in an isolated Worker
   with no DOM/network access. Communicates via structured messages. */

/* global self */

self.onmessage = function (e) {
  var msg = e.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'execute') {
    var id = msg.id, logicJs = msg.logicJs, pinValues = msg.pinValues, componentState = msg.componentState;
    try {
      var api = {
        pin: function (name) { return pinValues && pinValues[name]; },
        state: componentState || {},
        log: function () { self.postMessage({ type: 'log', id: id, args: Array.prototype.slice.call(arguments) }); },
        tick: function (updates) { self.postMessage({ type: 'tick', id: id, updates: updates }); }
      };
      var fn = new Function('api', logicJs);
      var result = fn(api);
      self.postMessage({ type: 'result', id: id, value: result, state: api.state });
    } catch (err) {
      self.postMessage({ type: 'error', id: id, message: err.message, stack: err.stack });
    }
  } else if (msg.type === 'sense') {
    var id = msg.id, logicJs = msg.logicJs, pinValues = msg.pinValues, componentState = msg.componentState;
    try {
      var api = {
        pin: function (name) { return pinValues && pinValues[name]; },
        state: componentState || {},
        log: function () { self.postMessage({ type: 'log', id: id, args: Array.prototype.slice.call(arguments) }); }
      };
      var fn = new Function('api', logicJs);
      var result = fn(api);
      self.postMessage({ type: 'senseResult', id: id, value: result, state: api.state });
    } catch (err) {
      self.postMessage({ type: 'error', id: id, message: err.message, stack: err.stack });
    }
  } else if (msg.type === 'render') {
    var id = msg.id, renderSvg = msg.renderSvg, componentState = msg.componentState;
    try {
      var api = { state: componentState || {} };
      var fn = new Function('api', 'return `' + renderSvg + '`;');
      var svg = fn(api);
      self.postMessage({ type: 'renderResult', id: id, svg: svg });
    } catch (err) { // eslint-disable-line no-unused-vars
      self.postMessage({ type: 'renderResult', id: id, svg: '' });
    }
  } else {
    self.postMessage({ type: 'error', id: msg.id, message: 'Unknown message type' });
  }
};
