import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock global objects (sim.js uses window.CS)
global.window = global;
global.CS = {
  defs: {},
  runtime: () => ({})
};

// Load the sim.js module
const simModulePath = '../../public/js/sim.js';

describe('sim.js - union-find net solver', () => {
  beforeEach(() => {
    // Reset the module cache
    delete require.cache[require.resolve(simModulePath)];
    
    // Set up mock definitions for components
    global.CS.defs = {
      uno: {
        mcu: true,
        vcc: 5,
        pins: [
          { id: '5V', kind: 'power' },
          { id: 'GND', kind: 'ground' },
          { id: 'D13', kind: 'digital' },
          { id: 'A0', kind: 'analog' }
        ]
      },
      battery: {
        pins: [
          { id: 'positive' },
          { id: 'negative' }
        ]
      },
      resistor: {
        pins: [
          { id: '1' },
          { id: '2' }
        ]
      },
      led: {
        pins: [
          { id: 'anode' },
          { id: 'cathode' }
        ]
      }
    };
    
    require(simModulePath);
  });

  function createTestDocument() {
    return {
      components: [
        {
          id: 'battery1',
          type: 'battery'
        },
        {
          id: 'resistor1',
          type: 'resistor',
          props: { value: 220 }
        },
        {
          id: 'led1',
          type: 'led'
        }
      ],
      wires: []
    };
  }

  function createSeriesCircuit() {
    const doc = createTestDocument();
    doc.wires = [
      {
        a: { c: 'battery1', p: 'positive' },
        b: { c: 'resistor1', p: '1' }
      },
      {
        a: { c: 'resistor1', p: '2' },
        b: { c: 'led1', p: 'anode' }
      },
      {
        a: { c: 'led1', p: 'cathode' },
        b: { c: 'battery1', p: 'negative' }
      }
    ];
    return doc;
  }

  it('correctly solves a simple series circuit', () => {
    const doc = createSeriesCircuit();
    const Engine = CS.Engine;
    const engine = new Engine();
    engine.dynLinks = [];
    
    engine.attach(doc);
    engine.mcu = null; // No microcontroller for this test
    
    // Create drivers for battery
    engine.drives = [
      { node: 'battery1.positive', v: 5, strength: 'strong' },
      { node: 'battery1.negative', v: 0, strength: 'strong' }
    ];
    
    engine.solveNets();
    
    // All positive battery terminal should be at 5V
    const batteryPosRoot = engine.netRoot.get('battery1.positive');
    const batteryNegRoot = engine.netRoot.get('battery1.negative');
    
    // These three nodes should be connected
    const resistor1Root = engine.netRoot.get('resistor1.1');
    const resistor2Root = engine.netRoot.get('resistor1.2');
    const ledAnodeRoot = engine.netRoot.get('led1.anode');
    const ledCathodeRoot = engine.netRoot.get('led1.cathode');
    
    // Battery positive should be connected to resistor pin 1
    expect(batteryPosRoot).toBe(resistor1Root);
    
    // Resistor pin 2 should be connected to LED anode
    expect(resistor2Root).toBe(ledAnodeRoot);
    
    // LED cathode should be connected to battery negative
    expect(ledCathodeRoot).toBe(batteryNegRoot);
    
    // Battery positive net should have 5V
    const batteryPosInfo = engine.netInfo.get(batteryPosRoot);
    expect(batteryPosInfo).toBeDefined();
    expect(batteryPosInfo.volts).toBeCloseTo(5, 0.01);
    expect(batteryPosInfo.driven).toBe('strong');
    
    // Battery negative net should have 0V
    const batteryNegInfo = engine.netInfo.get(batteryNegRoot);
    expect(batteryNegInfo).toBeDefined();
    expect(batteryNegInfo.volts).toBeCloseTo(0, 0.01);
    expect(batteryNegInfo.driven).toBe('strong');
    
    // Battery negative net should have 0V
    const ledCathodeInfo = engine.netInfo.get(ledCathodeRoot);
    expect(ledCathodeInfo).toBeDefined();
    expect(ledCathodeInfo.volts).toBeCloseTo(0, 0.01);
  });

  it('detects short circuits between outputs', () => {
    const doc = createTestDocument();
    doc.wires = [
      {
        a: { c: 'battery1', p: 'positive' },
        b: { c: 'battery1', p: 'negative' }
      }
    ];
    
    const Engine = CS.Engine;
    const engine = new Engine();
    engine.dynLinks = [];
    engine.attach(doc);
    engine.mcu = null;
    
    // Create conflicting drivers for the same net
    engine.drives = [
      { node: 'battery1.positive', v: 5, strength: 'strong' },
      { node: 'battery1.negative', v: 0, strength: 'strong' }
    ];
    
    engine.solveNets();
    
    // Battery pins are now shorted, so they should be in the same net
    const batteryPosRoot = engine.netRoot.get('battery1.positive');
    const batteryNegRoot = engine.netRoot.get('battery1.negative');
    expect(batteryPosRoot).toBe(batteryNegRoot);
    
    // The net should be in short condition
    const netInfo = engine.netInfo.get(batteryPosRoot);
    expect(netInfo).toBeDefined();
    expect(netInfo.short).toBe(true);
    expect(netInfo.driven).toBe('short');
    expect(netInfo.volts).toBeNull();
  });

  it('handles resistors connecting nets', () => {
    const doc = createTestDocument();
    doc.wires = [
      {
        a: { c: 'battery1', p: 'positive' },
        b: { c: 'resistor1', p: '1' }
      }
    ];
    // No connection from resistor pin 2 to anything else
    
    const Engine = CS.Engine;
    const engine = new Engine();
    engine.dynLinks = [];
    engine.attach(doc);
    engine.mcu = null;
    
    // Create battery drivers
    engine.drives = [
      { node: 'battery1.positive', v: 5, strength: 'strong' },
      { node: 'battery1.negative', v: 0, strength: 'strong' }
    ];
    
    engine.solveNets();
    
    // Resistor pins should be connected to each other (internal connection)
    const resistor1Root = engine.netRoot.get('resistor1.1');
    const resistor2Root = engine.netRoot.get('resistor1.2');
    expect(resistor1Root).toBe(resistor2Root);
    
    // Battery positive should be connected to resistor pin 1
    const batteryPosRoot = engine.netRoot.get('battery1.positive');
    expect(batteryPosRoot).toBe(resistor1Root);
    
    // Battery negative should be separate net
    const batteryNegRoot = engine.netRoot.get('battery1.negative');
    expect(batteryNegRoot).not.toBe(batteryPosRoot);
  });

  it('handles floating nets correctly', () => {
    const doc = createTestDocument();
    // No wires, just components
    
    const Engine = CS.Engine;
    const engine = new Engine();
    engine.dynLinks = [];
    engine.attach(doc);
    engine.mcu = null;
    
    // No drivers
    engine.drives = [];
    
    engine.solveNets();
    
    // All components should have their pins in separate nets
    const batteryPosRoot = engine.netRoot.get('battery1.positive');
    const batteryNegRoot = engine.netRoot.get('battery1.negative');
    expect(batteryPosRoot).not.toBe(batteryNegRoot);
    
    const resistor1Root = engine.netRoot.get('resistor1.1');
    const resistor2Root = engine.netRoot.get('resistor1.2');
    expect(resistor1Root).toBe(resistor2Root); // Resistor pins are internally connected
    
    const ledAnodeRoot = engine.netRoot.get('led1.anode');
    const ledCathodeRoot = engine.netRoot.get('led1.cathode');
    expect(ledAnodeRoot).not.toBe(ledCathodeRoot);
    
    // All nets should be floating
    for (const [node, root] of engine.netRoot) {
      const info = engine.netInfo.get(root);
      expect(info).toBeDefined();
      expect(info.driven).toBe('float');
      expect(info.volts).toBeNull();
      expect(info.short).toBe(false);
    }
  });

  it('correctly handles weak pull-up drivers', () => {
    const doc = createTestDocument();
    doc.wires = [
      {
        a: { c: 'battery1', p: 'positive' },
        b: { c: 'led1', p: 'anode' }
      }
    ];
    
    const Engine = CS.Engine;
    const engine = new Engine();
    engine.dynLinks = [];
    engine.attach(doc);
    engine.mcu = null;
    
    // Strong high on battery positive
    engine.drives = [
      { node: 'battery1.positive', v: 5, strength: 'strong' },
      { node: 'battery1.negative', v: 0, strength: 'strong' }
    ];
    
    engine.solveNets();
    
    const ledAnodeRoot = engine.netRoot.get('led1.anode');
    const ledAnodeInfo = engine.netInfo.get(ledAnodeRoot);
    expect(ledAnodeInfo).toBeDefined();
    expect(ledAnodeInfo.driven).toBe('strong');
    expect(ledAnodeInfo.volts).toBeCloseTo(5, 0.01);
    
    // Now add a weak pull-up to LED cathode
    engine.drives.push(
      { node: 'led1.cathode', v: 3.3, strength: 'weak' }
    );
    
    engine.solveNets();
    
    const ledCathodeRoot = engine.netRoot.get('led1.cathode');
    const ledCathodeInfo = engine.netInfo.get(ledCathodeRoot);
    expect(ledCathodeInfo).toBeDefined();
    expect(ledCathodeInfo.driven).toBe('weak');
    expect(ledCathodeInfo.volts).toBeCloseTo(3.3, 0.01);
  });
});