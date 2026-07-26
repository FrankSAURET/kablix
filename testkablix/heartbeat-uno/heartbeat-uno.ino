// Detection simple sur A0 avec timer millis():
// 1) > 3.5V: demarre chrono
// 2) < 3.5V: attend retour au-dessus
// 3) > 3.5V: arrete chrono
// Puis moyenne sur 10 echantillons et affichage BPM uniquement.

const byte PULSE_PIN = A0;
const float VREF = 5.0f;
const float THRESHOLD_V = 3.5f;
const int ADC_MAX = 1023;
const byte SAMPLE_COUNT = 10;

const int THRESHOLD_ADC = (int)(THRESHOLD_V / VREF * ADC_MAX + 0.5f);

unsigned long intervalsMs[SAMPLE_COUNT];
byte intervalIndex = 0;
byte intervalFilled = 0;

bool timing = false;
bool wentBelowThreshold = false;
unsigned long timerStartMs = 0;

void addInterval(unsigned long dtMs) {
  intervalsMs[intervalIndex] = dtMs;
  intervalIndex = (intervalIndex + 1) % SAMPLE_COUNT;
  if (intervalFilled < SAMPLE_COUNT) {
    intervalFilled++;
  }
}

byte sampleWindowForBpm(float bpmInstant) {
  if (bpmInstant < 30.0f) {
    return 1;
  }

  if (bpmInstant >= 60.0f) {
    return SAMPLE_COUNT;
  }

  // Entre 30 et 60 BPM: 1 -> 10 echantillons.
  float ratio = (bpmInstant - 30.0f) / 30.0f;
  int window = 1 + (int)(ratio * (SAMPLE_COUNT - 1) + 0.5f);

  if (window < 1) {
    window = 1;
  }
  if (window > SAMPLE_COUNT) {
    window = SAMPLE_COUNT;
  }

  return (byte)window;
}

float averageRecentIntervalMs(byte sampleWindow) {
  if (intervalFilled == 0 || sampleWindow == 0) {
    return 0.0f;
  }

  if (sampleWindow > intervalFilled) {
    sampleWindow = intervalFilled;
  }

  unsigned long sum = 0;
  for (byte i = 0; i < sampleWindow; i++) {
    int idx = (int)intervalIndex - 1 - i;
    if (idx < 0) {
      idx += SAMPLE_COUNT;
    }
    sum += intervalsMs[idx];
  }

  return (float)sum / sampleWindow;
}

void setup() {
  Serial.begin(115200);
}

void loop() {
  unsigned long now = millis();
  int raw = analogRead(PULSE_PIN);

  if (!timing) {
    if (raw > THRESHOLD_ADC) {
      timerStartMs = now;
      timing = true;
      wentBelowThreshold = false;
    }
  } else {
    if (!wentBelowThreshold) {
      if (raw < THRESHOLD_ADC) {
        wentBelowThreshold = true;
      }
    } else {
      if (raw > THRESHOLD_ADC) {
        unsigned long dtMs = now - timerStartMs;
        addInterval(dtMs);

        float bpmInstant = (dtMs > 0) ? (60000.0f / dtMs) : 0.0f;
        byte sampleWindow = sampleWindowForBpm(bpmInstant);
        float avgMs = averageRecentIntervalMs(sampleWindow);
        float bpm = (avgMs > 0.0f) ? (60000.0f / avgMs) : 0.0f;

        Serial.print("BPM=");
        Serial.println(bpm, 1);

        timing = false;
        wentBelowThreshold = false;
      }
    }
  }

  delay(5);
}
