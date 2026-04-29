# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Homebridge plugin (`homebridge-openwebif-tv`) that exposes Enigma2-based satellite receivers running OpenWebIf as HomeKit accessories. Each receiver becomes an external HomeKit accessory (Television category) with channels as inputs, optional volume control, buttons, and sensors.

## Commands

```bash
# Install dependencies
npm install

# Run locally linked into a Homebridge instance (standard Homebridge dev workflow)
npm link
homebridge -D

# No build step — the plugin is plain ESM JavaScript
# No linting or tests are configured
```

## Architecture

The plugin is pure ESM (`"type": "module"`). All source classes extend `EventEmitter` and wire together through events rather than direct method calls.

**Startup flow:**

1. `index.js` — `OpenWebIfPlatform` registers as a Homebridge platform and, after `didFinishLaunching`, runs all device setups in parallel via `Promise.allSettled`.
2. A *startup* `ImpulseGenerator` fires every 120 s and retries `startDevice()` until it succeeds.
3. `startDevice()` creates an `OpenWebIfDevice`, calls `openwebif.connect()`, builds the HAP accessory, publishes it via `api.publishExternalAccessories()`, stops the startup generator, and starts the *device* `ImpulseGenerator`.
4. The device generator runs two recurring timers: `checkChannels` (every 60 s) and `checkState` (every `refreshInterval` seconds, default 5 s).

**Module responsibilities:**

| File | Class | Responsibility |
|------|-------|----------------|
| `index.js` | `OpenWebIfPlatform` | Platform registration, per-device orchestration |
| `src/openwebifdevice.js` | `OpenWebIfDevice` | HAP accessory construction, characteristic handlers, state updates |
| `src/openwebif.js` | `OpenWebIf` | HTTP communication with receiver (axios), channel/state polling |
| `src/impulsegenerator.js` | `ImpulseGenerator` | Interval-based event emitter; `state(true, timers)` starts, `state(false)` stops |
| `src/mqtt.js` | `Mqtt` | MQTT v5 client for bi-directional external control |
| `src/functions.js` | `Functions` | Async file I/O (`saveData`/`readData`) and `sanitizeString` (strips diacritics and invalid HAP chars) |
| `src/constants.js` | — | `ApiUrls`, `InputSourceType` enum, `DiacriticsMap` |

**State persistence:**

Per-device JSON files are stored in `~/.homebridge/openwebifTv/` and named by IP address (dots removed). Files: `devInfo_<ip>`, `inputs_<ip>`, `channels_<ip>`, `inputsNames_<ip>`, `inputsTargetVisibility_<ip>`. These survive restarts and seed the accessory before the first poll completes.

**HAP service limits:**

HomeKit caps accessories at 99 services total. `openwebifdevice.js` calculates remaining slots before adding input buttons and sensors to avoid exceeding this limit. Inputs (channels) themselves are capped at 85.

## Key config fields

Required per device: `name`, `host`, `port`, `displayType`.

`displayType` selects the HAP category: `1` = Television, `2` = TV_SET_TOP_BOX, `3` = TV_STREAMING_STICK, `4` = AUDIO_RECEIVER.

`volume.displayType`: `1` = Lightbulb, `2` = Fan, `3` = TelevisionSpeaker, `4` = Speaker + Lightbulb, `5` = Speaker + Fan.

`sensors[].displayType`: `1` = MotionSensor, `2` = OccupancySensor, `3` = ContactSensor.

`buttons[].mode`: `0` = channel switch, `1` = RC command, `2` = power command.

Inputs come either from manually listed `inputs.channels` or dynamically from the receiver's bouquets when `inputs.getFromDevice: true`.

## OpenWebIf API endpoints

All defined in `src/constants.js` `ApiUrls`. Key ones:
- `/api/deviceinfo` — device identity (MAC address, model, firmware)
- `/api/statusinfo` — current power/channel/volume state
- `/api/getallservices` — full channel list from receiver
- `/api/powerstate?newstate=<4|5>` — 4 = on, 5 = standby
- `/api/zap?sRef=<encoded-reference>` — switch channel
- `/api/remotecontrol?command=<code>` — send RC key code

## MQTT integration

When `mqtt.enable: true`, the plugin connects as an MQTT v5 client, subscribes to `openwebif/<prefix>/<name>/Set`, and publishes state to `openwebif/<prefix>/<name>/<topic>`. Incoming JSON payload keys: `Power`, `Channel`, `Volume`, `Mute`, `RcControl`.
