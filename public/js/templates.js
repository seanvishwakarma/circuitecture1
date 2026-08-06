/* CircuitTecture — starter templates & example gallery.
   Each: { id, name, icon, desc, board, lang, level, build() -> {components,wires,code} } */
(function () {
  const CS = window.CS;
  let t = 0;
  const C = (type, x, y, props = {}, label = '') => ({ id: 'tc' + (++t) + '_' + Date.now().toString(36), type, x, y, r: 0, props: JSON.parse(JSON.stringify(props)), label });
  const W = (fc, fp, tc, tp, color) => ({ id: 'tw' + (++t) + '_' + Date.now().toString(36), a: { c: fc, p: fp }, b: { c: tc, p: tp }, color });
  const G = '#4ade80', R = '#f87171', GR = '#94a3b8', Y = '#fbbf24';

  CS.templates = [
    {
      id: 'blink', name: 'Blink LED', icon: '💡', level: 'Beginner', board: 'uno', lang: 'cpp',
      desc: 'The "hello world" of hardware: LED + 220 Ω resistor blinking on D13.',
      build() {
        const uno = C('uno', 80, 120), res = C('resistor', 440, 60, { value: 220 }), led = C('led', 580, 80, { color: '#ef4444' });
        return {
          components: [uno, res, led],
          wires: [W(uno.id, 'D13', res.id, '1', G), W(res.id, '2', led.id, 'anode', G), W(led.id, 'cathode', uno.id, 'GND', GR)],
          code: `// Blink — the hardware hello world
int ledPin = 13;

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(ledPin, HIGH);
  Serial.println("LED ON");
  delay(500);
  digitalWrite(ledPin, LOW);
  Serial.println("LED OFF");
  delay(500);
}`
        };
      }
    },
    {
      id: 'button', name: 'Button Input', icon: '🔘', level: 'Beginner', board: 'uno', lang: 'cpp',
      desc: 'Read a push button with INPUT_PULLUP and toggle an LED.',
      build() {
        const uno = C('uno', 80, 120), btn = C('pushbutton', 440, 50), led = C('led', 580, 140), res = C('resistor', 440, 200, { value: 220 });
        return {
          components: [uno, btn, led, res],
          wires: [W(uno.id, 'D2', btn.id, '1', G), W(btn.id, '2', uno.id, 'GND', GR), W(uno.id, 'D13', res.id, '1', G), W(res.id, '2', led.id, 'anode', G), W(led.id, 'cathode', uno.id, 'GND2', GR)],
          code: `// Button toggles the LED (uses the internal pull-up resistor)
int buttonPin = 2;
int ledPin = 13;
bool ledOn = false;
bool lastPress = false;

void setup() {
  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  bool pressed = (digitalRead(buttonPin) == LOW);
  if (pressed && !lastPress) {
    ledOn = !ledOn;
    digitalWrite(ledPin, ledOn ? HIGH : LOW);
    Serial.println(ledOn ? "LED ON 💡" : "LED OFF");
  }
  lastPress = pressed;
  delay(30);
}`
        };
      }
    },
    {
      id: 'servo', name: 'Servo Sweep', icon: '🦾', level: 'Beginner', board: 'uno', lang: 'cpp',
      desc: 'Sweep an SG90 servo 0→180° with the Servo library.',
      build() {
        const uno = C('uno', 80, 120), sv = C('servo', 440, 80);
        return {
          components: [uno, sv],
          wires: [W(uno.id, 'D9', sv.id, 'SIG', G), W(uno.id, '5V', sv.id, 'VCC', R), W(uno.id, 'GND', sv.id, 'GND', GR)],
          code: `// Servo sweep
Servo myservo;

void setup() {
  myservo.attach(9);
  Serial.begin(9600);
}

void loop() {
  for (int pos = 0; pos <= 180; pos += 5) {
    myservo.write(pos);
    delay(30);
  }
  for (int pos = 180; pos >= 0; pos -= 5) {
    myservo.write(pos);
    delay(30);
  }
  Serial.println("sweep!");
}`
        };
      }
    },
    {
      id: 'potled', name: 'Knob Dimmer', icon: '🎛️', level: 'Beginner', board: 'uno', lang: 'cpp',
      desc: 'Potentiometer on A0 controls LED brightness via PWM (analogWrite).',
      build() {
        const uno = C('uno', 80, 120), pot = C('potentiometer', 420, 50), led = C('led', 600, 120, { color: '#facc15' }), res = C('resistor', 450, 190, { value: 220 });
        return {
          components: [uno, pot, led, res],
          wires: [W(uno.id, 'A0', pot.id, '2', Y), W(uno.id, '5V', pot.id, '3', R), W(uno.id, 'GND', pot.id, '1', GR), W(uno.id, 'D9', res.id, '1', G), W(res.id, '2', led.id, 'anode', G), W(led.id, 'cathode', uno.id, 'GND2', GR)],
          code: `// Potentiometer -> PWM LED dimmer
void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int knob = analogRead(A0);       // 0..1023
  int brightness = map(knob, 0, 1023, 0, 255);
  analogWrite(9, brightness);
  Serial.println(brightness);      // open the plotter!
  delay(40);
}`
        };
      }
    },
    {
      id: 'ultrasonic', name: 'Distance Alarm', icon: '📡', level: 'Beginner', board: 'uno', lang: 'cpp',
      desc: 'HC-SR04 + buzzer: beep faster as objects get closer.',
      build() {
        const uno = C('uno', 80, 130), us = C('ultrasonic', 430, 60, { auto: true }), buz = C('buzzer', 600, 160);
        return {
          components: [uno, us, buz],
          wires: [W(uno.id, 'D7', us.id, 'TRIG', G), W(uno.id, 'D8', us.id, 'ECHO', G), W(uno.id, '5V', us.id, 'VCC', R), W(uno.id, 'GND', us.id, 'GND', GR), W(uno.id, 'D12', buz.id, '+', G), W(buz.id, '-', uno.id, 'GND2', GR)],
          code: `// Ultrasonic parking sensor — closer = faster beeps
int TRIG = 7, ECHO = 8, BUZZ = 12;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(BUZZ, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(TRIG, LOW); delay(2);
  digitalWrite(TRIG, HIGH); delay(1);
  digitalWrite(TRIG, LOW);

  long us = pulseIn(ECHO, HIGH);
  int cm = us / 58;
  Serial.print("Distance: "); Serial.print(cm); Serial.println(" cm");

  if (cm < 60) {
    tone(BUZZ, 1200, 80);
    delay(cm * 8 + 60);  // beep faster when close
  } else {
    delay(300);
  }
}`
        };
      }
    },
    {
      id: 'temp', name: 'Temperature Logger', icon: '🌡️', level: 'Beginner', board: 'uno', lang: 'cpp',
      desc: 'Log DHT22 readings to the Serial Plotter.',
      build() {
        const uno = C('uno', 80, 120), dht = C('dht22', 440, 80);
        return {
          components: [uno, dht],
          wires: [W(uno.id, 'D2', dht.id, 'DATA', G), W(uno.id, '5V', dht.id, 'VCC', R), W(uno.id, 'GND', dht.id, 'GND', GR)],
          code: `// Temperature & humidity logger
DHT dht(2, DHT22);

void setup() {
  Serial.begin(9600);
  Serial.println("temp,humidity");   // plotter series header
}

void loop() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  Serial.print(t);
  Serial.print(",");
  Serial.println(h);
  delay(1000);
}`
        };
      }
    },
    {
      id: 'rgb', name: 'RGB Mood Lamp', icon: '🌈', level: 'Intermediate', board: 'uno', lang: 'cpp',
      desc: 'PWM color mixing with hue wheel from a potentiometer.',
      build() { return CS.seedsBuild.rgb(); }
    },
    {
      id: 'traffic', name: 'Traffic Light', icon: '🚦', level: 'Beginner', board: 'uno', lang: 'cpp',
      desc: 'Full UK light sequence with proper timing.',
      build() { return CS.seedsBuild.traffic(); }
    },
    {
      id: 'weather', name: 'Weather Station', icon: '🌤️', level: 'Intermediate', board: 'uno', lang: 'cpp',
      desc: 'DHT22 + LDR + 16×2 LCD dashboard.',
      build() { return CS.seedsBuild.weather(); }
    },
    {
      id: 'plant', name: 'Plant Watering', icon: '🌱', level: 'Intermediate', board: 'uno', lang: 'cpp',
      desc: 'Soil sensor + relay pump automation.',
      build() { return CS.seedsBuild.plant(); }
    },
    {
      id: 'alarm', name: 'Motion Alarm', icon: '🚨', level: 'Intermediate', board: 'esp32', lang: 'cpp',
      desc: 'PIR + buzzer + LED intruder alarm with arm button.',
      build() {
        const esp = C('esp32', 100, 90), pir = C('pir', 400, 60), buz = C('buzzer', 600, 60), led = C('led', 600, 180, { color: '#ef4444' }), res = C('resistor', 460, 220, { value: 220 }), btn = C('pushbutton', 400, 260);
        return {
          components: [esp, pir, buz, led, res, btn],
          wires: [W(esp.id, '13', pir.id, 'OUT', G), W(esp.id, '3V3', pir.id, 'VCC', R), W(esp.id, 'GND', pir.id, 'GND', GR), W(esp.id, '25', buz.id, '+', G), W(buz.id, '-', esp.id, 'GNDB', GR), W(esp.id, '2', res.id, '1', G), W(res.id, '2', led.id, 'anode', G), W(led.id, 'cathode', esp.id, 'GND', GR), W(esp.id, '14', btn.id, '1', G), W(btn.id, '2', esp.id, 'GND', GR)],
          code: `// Motion alarm — hold the button to arm/disarm
int PIR = 13, BUZZ = 25, LED = 2, BTN = 14;
bool armed = false;
bool lastBtn = false;

void setup() {
  pinMode(PIR, INPUT);
  pinMode(BTN, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.begin(115200);
  Serial.println("Alarm ready. Press button to arm.");
}

void loop() {
  bool btn = digitalRead(BTN) == LOW;
  if (btn && !lastBtn) {
    armed = !armed;
    digitalWrite(LED, armed ? HIGH : LOW);
    Serial.println(armed ? "🔒 ARMED" : "🔓 Disarmed");
  }
  lastBtn = btn;

  if (armed && digitalRead(PIR) == HIGH) {
    Serial.println("🚨 INTRUDER!");
    tone(BUZZ, 2000, 400);
    delay(500);
    tone(BUZZ, 1500, 400);
    delay(500);
  }
  delay(50);
}`
        };
      }
    },
    {
      id: 'tilt', name: 'Tilt Bubble', icon: '🧭', level: 'Intermediate', board: 'esp32', lang: 'cpp',
      desc: 'MPU6050 bubble level driven by your device orientation.',
      build() {
        const esp = C('esp32', 100, 90), imu = C('mpu6050', 400, 100), oled = C('oled', 620, 110);
        return {
          components: [esp, imu, oled],
          wires: [W(esp.id, '21', imu.id, 'SDA', '#22d3ee'), W(esp.id, '22', imu.id, 'SCL', '#c084fc'), W(esp.id, '3V3', imu.id, 'VCC', R), W(esp.id, 'GND', imu.id, 'GND', GR), W(esp.id, '21', oled.id, 'SDA', '#22d3ee'), W(esp.id, '22', oled.id, 'SCL', '#c084fc'), W(esp.id, '3V3', oled.id, 'VCC', R), W(esp.id, 'GNDB', oled.id, 'GND', GR)],
          code: `// Tilt bubble — tilt your phone / laptop!
IMU imu;
OLED oled(21, 22);

void setup() {
  Serial.begin(115200);
  oled.begin();
}

void loop() {
  Serial.print("x: "); Serial.print(imu.accelX);
  Serial.print("  y: "); Serial.println(imu.accelY);
  oled.clear();
  oled.println("TILT BUBBLE");
  oled.println("x: " + String(imu.accelX));
  oled.println("y: " + String(imu.accelY));
  oled.println("z: " + String(imu.accelZ));
  delay(200);
}`
        };
      }
    },
    {
      id: 'pyblink', name: 'Python Blink', icon: '🐍', level: 'Beginner', board: 'esp32', lang: 'py',
      desc: 'MicroPython-style blink on ESP32.',
      build() {
        const esp = C('esp32', 100, 90), led = C('led', 480, 100, { color: '#22d3ee' }), res = C('resistor', 430, 220, { value: 220 });
        return {
          components: [esp, led, res],
          wires: [W(esp.id, '2', res.id, '1', G), W(res.id, '2', led.id, 'anode', G), W(led.id, 'cathode', esp.id, 'GND', GR)],
          code: `# MicroPython blink on ESP32 (GPIO2 = onboard LED)
from machine import Pin
import time

led = Pin(2, Pin.OUT)

while True:
    led.value(1)
    print("on")
    time.sleep(0.5)
    led.value(0)
    print("off")
    time.sleep(0.5)`
        };
      }
    },
    {
      id: 'piday', name: 'Pi Night Light', icon: '🍓', level: 'Intermediate', board: 'rpi4', lang: 'py',
      desc: 'Raspberry Pi: LDR decides if the LED night light turns on.',
      build() {
        const pi = C('rpi4', 80, 120), ldr = C('ldr', 480, 50), led = C('led', 620, 160, { color: '#facc15' }), res = C('resistor', 480, 220, { value: 330 });
        return {
          components: [pi, ldr, led, res],
          wires: [W(pi.id, '17', ldr.id, 'AO', Y), W(pi.id, '3V3', ldr.id, 'VCC', R), W(pi.id, 'GND1', ldr.id, 'GND', GR), W(pi.id, '18', res.id, '1', G), W(res.id, '2', led.id, 'anode', G), W(led.id, 'cathode', pi.id, 'GND3', GR)],
          code: `# Raspberry Pi night light (RPi.GPIO shim)
import RPi.GPIO as GPIO
import time

GPIO.setmode(GPIO.BCM)
GPIO.setup(18, GPIO.OUT)
GPIO.setup(17, GPIO.IN)

def dark():
    # analog stand-in: reading the LDR "analog" pin returns 0..1 as float*1023
    return GPIO.analog(17) < 300

try:
    while True:
        if dark():
            GPIO.output(18, 1)
            print("Dark — night light ON")
        else:
            GPIO.output(18, 0)
            print("Bright enough — OFF")
        time.sleep(1)
except KeyboardInterrupt:
    GPIO.cleanup()`
        };
      }
    }
  ];

  /* seed-circuit builders shared by seeds gallery + templates */
  CS.seedsBuild = {
    rgb() {
      const uno = C('uno', 80, 150), rgb = C('ledrgb', 460, 60), r1 = C('resistor', 400, 230, { value: 220 }), r2 = C('resistor', 510, 230, { value: 220 }), r3 = C('resistor', 620, 230, { value: 220 }), pot = C('potentiometer', 720, 60);
      return {
        components: [uno, rgb, r1, r2, r3, pot],
        wires: [W(uno.id, 'D9', r1.id, '1', '#f87171'), W(r1.id, '2', rgb.id, 'R', '#f87171'), W(uno.id, 'D10', r2.id, '1', '#4ade80'), W(r2.id, '2', rgb.id, 'G', '#4ade80'), W(uno.id, 'D11', r3.id, '1', '#60a5fa'), W(r3.id, '2', rgb.id, 'B', '#60a5fa'), W(rgb.id, 'C', uno.id, 'GND', GR), W(uno.id, 'A0', pot.id, '2', Y), W(uno.id, '5V', pot.id, '3', '#f87171'), W(uno.id, 'GND2', pot.id, '1', GR)],
        code: `// RGB Mood Lamp — twist the pot to sweep the hue wheel
void setColor(int r, int g, int b) {
  analogWrite(9, r);
  analogWrite(10, g);
  analogWrite(11, b);
}

void hsv(int h) {
  int region = h / 43;
  int f = (h % 43) * 6;
  if (region == 0) setColor(255, f, 0);
  else if (region == 1) setColor(255 - f, 255, 0);
  else if (region == 2) setColor(0, 255, f);
  else if (region == 3) setColor(0, 255 - f, 255);
  else if (region == 4) setColor(f, 0, 255);
  else setColor(255, 0, 255 - f);
}

void setup() { Serial.begin(9600); }

void loop() {
  int hue = map(analogRead(A0), 0, 1023, 0, 255);
  hsv(hue);
  Serial.println(hue);
  delay(50);
}`
      };
    },
    traffic() {
      const uno = C('uno', 80, 170), r1 = C('resistor', 440, 30, { value: 220 }), r2 = C('resistor', 440, 150, { value: 220 }), r3 = C('resistor', 440, 270, { value: 220 }), red = C('led', 590, 10, { color: '#ef4444' }), yel = C('led', 590, 130, { color: '#f59e0b' }), grn = C('led', 590, 250, { color: '#22c55e' });
      return {
        components: [uno, r1, r2, r3, red, yel, grn],
        wires: [W(uno.id, 'D13', r1.id, '1', G), W(r1.id, '2', red.id, 'anode', G), W(uno.id, 'D12', r2.id, '1', G), W(r2.id, '2', yel.id, 'anode', G), W(uno.id, 'D11', r3.id, '1', G), W(r3.id, '2', grn.id, 'anode', G), W(red.id, 'cathode', yel.id, 'cathode', GR), W(yel.id, 'cathode', grn.id, 'cathode', GR), W(grn.id, 'cathode', uno.id, 'GND', GR)],
        code: `// Traffic light — classic sequence
int RED = 13, AMBER = 12, GREEN = 11;

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(AMBER, OUTPUT);
  pinMode(GREEN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(RED, HIGH);
  Serial.println("RED — stop"); delay(3000);
  digitalWrite(AMBER, HIGH);
  Serial.println("get ready..."); delay(1000);
  digitalWrite(RED, LOW); digitalWrite(AMBER, LOW);
  digitalWrite(GREEN, HIGH);
  Serial.println("GREEN — go!"); delay(3000);
  digitalWrite(GREEN, LOW);
  digitalWrite(AMBER, HIGH);
  Serial.println("AMBER — slow down"); delay(1000);
  digitalWrite(AMBER, LOW);
}`
      };
    },
    weather() {
      const uno = C('uno', 60, 140), dht = C('dht22', 430, 40), lcd = C('lcd', 410, 250), ldr = C('ldr', 670, 60);
      return {
        components: [uno, dht, lcd, ldr],
        wires: [W(uno.id, 'D2', dht.id, 'DATA', G), W(uno.id, '5V', dht.id, 'VCC', R), W(uno.id, 'GND', dht.id, 'GND', GR), W(uno.id, 'A0', ldr.id, 'AO', Y), W(uno.id, '5V', ldr.id, 'VCC', R), W(uno.id, 'GND2', ldr.id, 'GND', GR), W(uno.id, 'D7', lcd.id, 'RS', G), W(uno.id, 'D8', lcd.id, 'E', G), W(uno.id, 'D9', lcd.id, 'D4', G), W(uno.id, 'D10', lcd.id, 'D5', G), W(uno.id, 'D11', lcd.id, 'D6', G), W(uno.id, 'D12', lcd.id, 'D7', G), W(lcd.id, 'VDD', uno.id, 'VIN', R), W(lcd.id, 'VSS', dht.id, 'GND', GR), W(lcd.id, 'RW', ldr.id, 'GND', GR), W(lcd.id, 'VO', ldr.id, 'GND', GR), W(lcd.id, 'A', uno.id, 'VIN', R), W(lcd.id, 'K', ldr.id, 'GND', GR)],
        code: `// Weather Station — DHT22 + LDR + 16x2 LCD
DHT dht(2, DHT22);
LiquidCrystal lcd(7, 8, 9, 10, 11, 12);

void setup() {
  Serial.begin(9600);
  lcd.begin();
  lcd.print("Weather Station");
  delay(1200);
  lcd.clear();
}

void loop() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  int lux = analogRead(A0);
  Serial.print(t); Serial.print(","); Serial.println(lux);
  lcd.setCursor(0, 0);
  lcd.print("T:" + String(t) + " H:" + String(h) + "% ");
  lcd.setCursor(0, 1);
  lcd.print("Light: " + String(lux) + "    ");
  delay(2000);
}`
      };
    },
    plant() {
      const uno = C('uno', 60, 140), soil = C('soil', 400, 40, { level: 0.34 }), relay = C('relay', 400, 280), bat = C('battery', 650, 40), pump = C('led', 660, 250, { color: '#60a5fa' }, 'Pump'), btn = C('pushbutton', 560, 160);
      return {
        components: [uno, soil, relay, bat, pump, btn],
        wires: [W(uno.id, 'A0', soil.id, 'AO', Y), W(uno.id, '5V', soil.id, 'VCC', R), W(uno.id, 'GND', soil.id, 'GND', GR), W(uno.id, 'D8', relay.id, 'IN', G), W(uno.id, '5V', relay.id, 'VCC', R), W(uno.id, 'GND2', relay.id, 'GND', GR), W(uno.id, 'D2', btn.id, '1', G), W(btn.id, '2', soil.id, 'GND', GR), W(bat.id, '+', relay.id, 'COM', R), W(relay.id, 'NO', pump.id, 'anode', R), W(pump.id, 'cathode', bat.id, '-', GR)],
        code: `// Auto plant watering
int moisturePin = A0, pumpPin = 8, buttonPin = 2;
int DRY = 40;

void setup() {
  Serial.begin(9600);
  pinMode(pumpPin, OUTPUT);
  pinMode(buttonPin, INPUT_PULLUP);
  Serial.println("Plant monitor online");
}

void loop() {
  int moisture = map(analogRead(moisturePin), 0, 1023, 0, 100);
  bool manual = (digitalRead(buttonPin) == LOW);
  Serial.print("Moisture: "); Serial.print(moisture); Serial.println("%");
  if (moisture < DRY || manual) {
    Serial.println("Watering 3s...");
    digitalWrite(pumpPin, HIGH); delay(3000);
    digitalWrite(pumpPin, LOW); delay(2000);
  }
  delay(1000);
}`
      };
    },
  };
})();
