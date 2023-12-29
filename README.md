<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/homebridge-openwebif-tv.png" width="640"></a>
</p>

<span align="center">

# Homebridge OpenWebIf TV

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-openwebif-tv?color=purple)](https://www.npmjs.com/package/homebridge-openwebif-tv)
[![npm](https://badgen.net/npm/v/homebridge-openwebif-tv?color=purple)](https://www.npmjs.com/package/homebridge-openwebif-tv)
[![npm](https://img.shields.io/npm/v/homebridge-openwebif-tv/beta.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-openwebif-tv)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-openwebif-tv.svg)](https://github.com/grzegorz914/homebridge-openwebif-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-openwebif-tv.svg)](https://github.com/grzegorz914/homebridge-openwebif-tv/issues)

Homebridge plugin for Sat Receivers based on the OpenWebIf API. Tested with VU+ Ultimo 4K, Formuler F4 Turbo.

</span>

## Package Requirements

| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) | [Config UI X Wiki](https://github.com/oznu/homebridge-config-ui-x/wiki) | Homebridge Web User Interface | Recommended |
| [OpenWebIf TV](https://www.npmjs.com/package/homebridge-openwebif-tv) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-openwebif-tv/wiki) | Homebridge Plug-In | Required |

## About The Plugin

* Power ON/OFF short press tile in HomeKit app.
* RC/Media control is possible after you go to the RC app on iPhone/iPad.
* Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
* Legacy Volume and Mute control is possible throught extra `lightbulb`/`fan` (slider).
* Channels can be changed using Channels selector in HomeKit.app, additionally can create separate tile.
* Siri can be used for all functions, some times need create legacy buttons/switches/sensors.
* Automations can be used for all functions, some times need create legacy buttons/switches/sensors.
* MQTT publisch topic *Info* and *State* as payload JSON data.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/homekit.png" width="382"></a>
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/inputs.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/rc1.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/RC.png" width="135"></a>
</p>

### Configuration

* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) to configure this plugin.
* The `sample-config.json` can be edited and used as an alternative.
* Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *Hsostname or Address IP* of Sat Receiver.|
| `port` | Here set the *Port* of Sat Receiver. |
| `auth` | If enabled, authorizatins credentials will be used for login. |
| `user` | Here set the authorization *Username*. |
| `pass` | Here set the authorization *Password*. |
| `volumeControl` | Here select volume control mode `None/Disabled`, `Slider`, `Fan`. |
| `infoButtonCommand` | Here select the function of `I` button in RC app. |
| `getInputsFromDevice` | This function get channels by *Bouquet* direct from device, manually configured channels will be skipped. |
| `bouquets.name` | Here set *Bouquet Name* which should be loaded from device, only first 90 services will be used. |
| `bouquets.displayType` | Here select display extra tile for all channels of this bouquet to be exposed in HomeKit app, possible `None/Disabled`, `Outlet`, `Switch`.|
| `inputsDisplayOrder` | Here select display order of the inputs list, `None`, `Alphabetically Name`, `Alphabetically Reference`. |
| `inputs.name` | Here set *Channel Name* which should be exposed in the *Homebridge/HomeKit* |
| `inputs.reference` | Here set *Channel Reference*. All can be found in `homebridge_directory/openwebifTv/inputs_xxxx`. |
| `inputs.displayType` | Here select display extra tile for this channel to be exposed in HomeKit app, possible `None/Disabled`, `Outlet`, `Switch`.|
| `buttons.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*.|
| `buttons.mode` | Here select button mode, `Live TV Channel` or `Remote Control`. |
| `buttons.reference` | Here set *Reference*, only for `Live TV Channel` mode, in other case leave empty. |
| `buttons.command` | Here select `Remote Control` command which will be assigned to the button. |
| `buttons.displayType` | Here select display type in HomeKit app, possible `None/Disabled`, `Outlet`, `Switch`.|
| `sensorPower`| If enabled, then the Power will be exposed as a `Motion Sensor` to use with automations. |
| `sensorVolume`| If enabled, then the Volume will be exposed as a `Motion Sensor` to use with automations. |
| `sensorMute`| If enabled, then the Mute will be exposed as a `Motion Sensor` to use with automations. |
| `sensorChannel`| If enabled, then the Channel will be exposed as a `Motion Sensor` to use with automations. |
| `sensorInputs.name` | Here set own *Name* which You want expose to the *Homebridge/HomeKit* for this sensor. |
| `sensorInputs.reference` | Here set *Reference* like `1:0:1:3ABD:514:13E:820000:0:0:0:` to be exposed as sensor (active on switch to this Input). |
| `sensorInputs.displayType` | Here select sensor type to be exposed in HomeKit app, possible `None/Disabled`, `Motion Sensor`, `Occupancy Sensor`, `Contact Sensor`. |
| `enableDebugMode` | If enabled, deep log will be present in homebridge console. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `disableLogDeviceInfo` | If enabled, add ability to disable log device info by every connections device to the network. |
| `disableLogConnectError` | If enabled, disable logging device connect error. |
| `enableMqtt` | If enabled, MQTT Broker will start automatically and publish all awailable PV installation data. |
| `refreshInterval` | Here set the data refresh interval. |
| `mqttHost` | Here set the *IP Address* or *Hostname* for MQTT Broker.) |
| `mqttPort` | Here set the *Port* for MQTT Broker, default 1883. |
| `mqttClientId` | Here optional set the `Client Id` of MQTT Broker. |
| `mqttPrefix` | Here set the *Prefix* for *Topic* or leave empty. |
| `mqttAuth` | If enabled, MQTT Broker will use authorization credentials. |
| `mqttUser` | Here set the MQTT Broker user. |
| `mqttPasswd` | Here set the MQTT Broker password. |
| `mqttDebug` | If enabled, deep log will be present in homebridge console for MQTT. |
| `Volume Control` | -1 - `None/Disabled`, 0 - `Slider`, 1 - `Fan`.|
| `Display Type Inputs/Buttons` | -1 - `None/Disabled`, 0 - `Outlet`, 1 - `Switch`.|
| `Display Type Sensors` | -1 - `None/Disabled`, 0 - `Motion Sensor`, 1 - `Occupancy Sensor`, 2 - `Contact Sensor`.|
