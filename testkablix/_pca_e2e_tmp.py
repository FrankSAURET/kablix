from machine import I2C, Pin
from grove_16_channels_pwm import Grove16PWM
import time
i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=100_000)
pwm = Grove16PWM(i2c)   # adresse 0x7F par defaut
print('PCA_PRETE', pwm.address)
pwm.servo_angle(8, 90)
print('PCA_SERVO_OK')
time.sleep(1)
pwm.all_off()
