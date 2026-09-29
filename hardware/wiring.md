# Freight Malawi — ESP32 Tracker Wiring Guide

## Bill of materials

| Component                       | Notes                                             |
|----------------------------------|----------------------------------------------------|
| ESP32 dev board (30/38-pin)      | Any common ESP32-WROOM dev board                   |
| JSN-SR04T waterproof ultrasonic  | Mounted at the top of the fuel tank, facing down   |
| NEO-6M GPS module                | UART, with active antenna if possible              |
| SIM800L GSM module (optional)    | For SMS alerts only; needs a stable 4.0V supply    |
| Status LED + 220Ω resistor       | Or use the ESP32's onboard LED on GPIO2            |
| Voltage divider / opto-isolator  | For safely sensing the vehicle's ignition (ACC) line |
| 5V→3.3V regulated supply         | Sized for ESP32 + GPS + GSM peak current           |

## Pin map (matches `esp32_fuel_tracker.ino` defaults)

| Signal                  | ESP32 Pin | Notes                                    |
|--------------------------|-----------|-------------------------------------------|
| Ultrasonic TRIG          | GPIO 5    | Output                                     |
| Ultrasonic ECHO          | GPIO 18   | Input — **use a divider if sensor is 5V logic** |
| Status LED               | GPIO 2    | Onboard LED on most dev boards             |
| GPS RX (ESP32) ← GPS TX  | GPIO 16   | UART1 RX                                   |
| GPS TX (ESP32) → GPS RX  | GPIO 17   | UART1 TX                                   |
| SIM800L RX (ESP32) ← TX  | GPIO 27   | UART2 RX (only if `ENABLE_SIM800L`)        |
| SIM800L TX (ESP32) → RX  | GPIO 26   | UART2 TX (only if `ENABLE_SIM800L`)        |
| Ignition sense           | GPIO 34   | Input-only pin; **through a divider/opto-isolator, never direct 12V** |

## Power notes

- The ESP32 and GPS run on 3.3–5V logic; the JSN-SR04T typically runs at 5V
  with a 5V-tolerant echo pin on many breakout variants — verify your
  specific module's datasheet before wiring ECHO directly to a 3.3V GPIO.
- SIM800L needs a dedicated regulator capable of ~2A transient current
  during GSM transmit bursts; powering it from the ESP32's onboard 3.3V
  regulator will brown out the board.
- The vehicle's ignition/ACC line is nominally 12V (or 24V on some trucks).
  **Never** connect it directly to a GPIO — use a resistor divider sized for
  your vehicle's voltage, or an opto-isolator module, to bring it down to a
  safe 3.3V logic level.

## Fuel sensor mounting

Mount the JSN-SR04T at the top of the tank, facing straight down at the
fuel surface, sealed against fuel vapour ingress. Measure and record:

- `DISTANCE_EMPTY_CM` — sensor-to-tank-bottom distance (tank empty)
- `DISTANCE_FULL_CM` — sensor-to-fuel-surface distance (tank full)

...and set these constants at the top of `esp32_fuel_tracker.ino` before
flashing. Recalibrate if the tank or sensor mounting changes.

## Safety and prototype disclaimer

This is a prototype reference design for a final-year IoT project. It is
**not** a certified automotive installation. Any physical installation in a
real vehicle should be reviewed by someone qualified in automotive
electrical work, particularly for the ignition-sense tap and power supply
isolation.
