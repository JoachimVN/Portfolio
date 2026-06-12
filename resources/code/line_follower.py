#!/usr/bin/env pybricks-micropython
from pybricks.hubs import EV3Brick
from pybricks.ev3devices import Motor, ColorSensor
from pybricks.parameters import Port

ev3 = EV3Brick()
color_sensorR = ColorSensor(Port.S4)
color_sensorL = ColorSensor(Port.S1)
left_motor = Motor(Port.A)
right_motor = Motor(Port.D)

ev3.speaker.set_volume(10)

# PID constants
Kp = 1.6  # Proportional gain
Kd = 0.9  # Derivative gain
basespeed = 350

last_error = 0

while True:
    error = color_sensorR.reflection() - color_sensorL.reflection()
    correction = Kp * error + (error - last_error) * Kd
    ev3.screen.print(correction)
    last_error = error
    left_motor.run(basespeed - correction)
    right_motor.run(basespeed + correction)
