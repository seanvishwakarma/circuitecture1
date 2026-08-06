import { describe, it, expect, beforeEach } from 'vitest';

// Mock the global CS object and make window available (transpile.js uses window.CS)
global.window = global;
global.CS = {
  transpile: null
};

// Load the transpile.js module
const transpileModulePath = '../../public/js/transpile.js';

// Test C++ Arduino sketch line preservation
describe('transpile.js - C++ Arduino line preservation', () => {
  beforeEach(() => {
    // Reset the module cache and reload
    delete require.cache[require.resolve(transpileModulePath)];
    require(transpileModulePath);
  });

  it('preserves line count for simple Arduino sketch', () => {
    const cppCode = `void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(13, LOW);
  delay(1000);
}`;

    const result = CS.transpile(cppCode, 'cpp');
    expect(result.ok).toBe(true);
    
    const inputLines = cppCode.split('\n').length;
    const outputLines = result.js.split('\n').length;
    expect(outputLines).toBe(inputLines);
  });

  it('includes {l:n} markers on correct lines', () => {
    const cppCode = `void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(13, LOW);
  delay(1000);
}`;

    const result = CS.transpile(cppCode, 'cpp');
    expect(result.ok).toBe(true);
    
    const lines = result.js.split('\n');
    
    // Check that {l:n} markers appear on non-empty, non-comment lines
    expect(lines[1]).toContain('yield{l:2}'); // pinMode line
    expect(lines[5]).toContain('yield{l:6}'); // digitalWrite HIGH line
    expect(lines[6]).toContain('yield{l:7}'); // delay line
    expect(lines[7]).toContain('yield{l:8}'); // digitalWrite LOW line
    expect(lines[8]).toContain('yield{l:9}'); // delay line
  });

  it('handles complex Arduino sketch with multiple functions', () => {
    const cppCode = `#include <Servo.h>

Servo myservo;

void setup() {
  myservo.attach(9);
  Serial.begin(9600);
}

void loop() {
  for(int pos = 0; pos < 180; pos++) {
    myservo.write(pos);
    delay(15);
  }
  Serial.println("Done!");
}`;

    const result = CS.transpile(cppCode, 'cpp');
    expect(result.ok).toBe(true);
    
    const inputLines = cppCode.split('\n').length;
    const outputLines = result.js.split('\n').length;
    expect(outputLines).toBe(inputLines);
  });
});

// Test MicroPython line preservation
describe('transpile.js - MicroPython line preservation', () => {
  beforeEach(() => {
    delete require.cache[require.resolve(transpileModulePath)];
    require(transpileModulePath);
  });

  it('preserves line count for simple MicroPython script', () => {
    const pyCode = `from machine import Pin
import time

led = Pin(2, Pin.OUT)

while True:
    led.value(1)
    time.sleep(0.5)
    led.value(0)
    time.sleep(0.5)`;

    const result = CS.transpile(pyCode, 'py');
    expect(result.ok).toBe(true);
    
    const inputLines = pyCode.split('\n').length;
    const outputLines = result.js.split('\n').length;
    expect(outputLines).toBe(inputLines);
  });

  it('includes {l:n} markers on correct lines for MicroPython', () => {
    const pyCode = `from machine import Pin
import time

led = Pin(2, Pin.OUT)

while True:
    led.value(1)
    time.sleep(0.5)
    led.value(0)
    time.sleep(0.5)`;

    const result = CS.transpile(pyCode, 'py');
    expect(result.ok).toBe(true);
    
    const lines = result.js.split('\n');
    
    // Note: control structures (while/for/if) don't get yield markers, only executable statements
    expect(lines[5]).toBe('while (true) {');
    expect(lines[6]).toContain('yield{l:7}'); // led.value(1) line
    expect(lines[7]).toContain('yield{l:8}'); // time.sleep line
    expect(lines[8]).toContain('yield{l:9}'); // led.value(0) line
    expect(lines[9]).toContain('yield{l:10}'); // time.sleep line
  });

  it('handles MicroPython with function definitions', () => {
    const pyCode = `def blink_led(pin, duration):
    led = Pin(pin, Pin.OUT)
    led.value(1)
    time.sleep(duration)
    led.value(0)
    time.sleep(duration)

while True:
    blink_led(2, 0.1)
    blink_led(3, 0.2)`;

    const result = CS.transpile(pyCode, 'py');
    expect(result.ok).toBe(true);
    
    const inputLines = pyCode.split('\n').length;
    const outputLines = result.js.split('\n').length;
    expect(outputLines).toBe(inputLines);
  });
});