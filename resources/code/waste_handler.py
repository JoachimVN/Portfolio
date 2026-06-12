#!/usr/bin/env pybricks-micropython
from pybricks.hubs import EV3Brick
from pybricks.ev3devices import Motor, ColorSensor, UltrasonicSensor
from pybricks.parameters import Port, Stop, Color
from pybricks.robotics import DriveBase
from pybricks.media.ev3dev import SoundFile, Font
from time import sleep

ev3 = EV3Brick()
obstacle_sensor = UltrasonicSensor(Port.S2)
color_sensor = ColorSensor(Port.S4)
left_motor = Motor(Port.B)
right_motor = Motor(Port.C)
robot = DriveBase(left_motor, right_motor, wheel_diameter=56, axle_track=125)
claw = Motor(Port.A)

big_font = Font(size=32, bold=True)
ev3.screen.set_font(big_font)

class Robot:
    def __init__(self, drive):
        self.drive = drive

    def locate_trash(self):
        self.drive.turn(-90)
        for i in range(180):
            distance = obstacle_sensor.distance()
            ev3.screen.print(distance)
            if distance >= 1000:
                self.drive.turn(1)
            else:
                target_distance = distance
                ev3.speaker.beep(1080, 300)
                for j in range(90):
                    distance = obstacle_sensor.distance()
                    ev3.screen.print(distance)
                    if distance <= 1000 and distance >= target_distance*0.8 and distance <= target_distance*1.2:
                        self.drive.turn(1)
                    else:
                        ev3.speaker.beep(1080, 300)
                        self.drive.turn(-j/2)
                        self.retrieve_trash(target_distance, i+j/2)
                        return
        ev3.speaker.play_file(SoundFile.FANFARE)
        self.drive.turn(720)
        for _ in range(0, 10):
            self.drive.straight(3)
            self.drive.straight(-3)

    def retrieve_trash(self, distance, angle):
        self.drive.straight(distance-100)
        self.pick_up_trash()
        self.drive.turn(180)
        self.drive.straight(distance-100)
        self.drive.turn(-angle+90)
        self.sort()

    def pick_up_trash(self):
        claw.run_until_stalled(-400, then=Stop.COAST, duty_limit=35)
        ev3.screen.print("Claw closed")

    def sort(self):
        color = color_sensor.color()
        if color == Color.YELLOW:
            turn_angle = -45
        elif color == Color.BLUE:
            turn_angle = 0
        else:
            ev3.speaker.beep(100, 200)
            turn_angle = 0
        self.drive.turn(turn_angle)
        self.drive.straight(200)
        claw.run_time(400, 3000)
        self.drive.straight(-200)
        self.drive.turn(-turn_angle+180)
        self.locate_trash()

if __name__ == "__main__":
    robot = Robot(robot)
    robot.locate_trash()
