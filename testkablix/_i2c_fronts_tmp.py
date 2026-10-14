from machine import I2C, Pin
from grove_16_channels_pwm import Grove16PWM
import time
i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=100_000)
pwm = Grove16PWM(i2c)
pwm.servo_angle(0, 90)
print('I2C_FIN')
time.sleep(0.5)
