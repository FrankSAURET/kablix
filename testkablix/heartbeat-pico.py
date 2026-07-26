# Import the libraries
from machine import ADC
import utime

# Use GPIO26 as analog input
analog_pin = ADC(0)  

# Initialization variables
raw_value = 0
max_value = 0
is_peak = False

# Function for detecting a heartbeat
def heartbeat_detected(ir_sensor_pin, delay_msec):
    global raw_value, max_value, is_peak
    
    result = False
    # Read the current voltage value (0 to 65535)
    raw_value = ir_sensor_pin.read_u16()
    # Adjust the value to the delay
    raw_value = (raw_value * 1000) // delay_msec 
    
    # Reset the maximum value if the difference is too large
    if raw_value * 4 < max_value:
        max_value = int(raw_value * 0.8)
    
    # Peak detection
    if raw_value > max_value - (1000 // delay_msec):
        if raw_value > max_value:
            max_value = raw_value
        # Only one heartbeat should be assigned to the detected peak
        if not is_peak:
            result = True
        is_peak = True
    elif raw_value < max_value - (3000 // delay_msec):
        is_peak = False
        # Here, the maximum value is lowered slightly with each run
        # is slightly reduced again. The reason for this is that
        # not only would the value otherwise always be stable with each stroke
        # would become the same or smaller, but also
        # if the finger should move minimally and thus
        # the signal would generally become weaker.
        max_value -= 1000 // delay_msec
    
    return result

# Delay in milliseconds per scan
delay_msec = 60
beat_msec = 0

print("KY-039 Heart rate measurement")

while True:
    heart_rate_bpm = 0
    if heartbeat_detected(analog_pin, delay_msec):
        # Only calculate heartbeat if beat_msec is not 0
        if beat_msec > 0:
            heart_rate_bpm = 60000 // beat_msec       
        # Only output the pulse if it is within the realistic range
        if 30 < heart_rate_bpm < 200:
            print("Pulse detected: {} BPM".format(heart_rate_bpm))
        # Reset after detection
        beat_msec = 0  
        
    utime.sleep_ms(delay_msec)
    beat_msec += delay_msec
