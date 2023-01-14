<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/homebridge-openwebif-tv.png" width="640"></a>
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

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/homekit.png" width="382"></a>
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/inputs.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/rc1.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-openwebif-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-openwebif-tv/main/graphics/RC.png" width="135"></a>
</p>

### Configuration
* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) to configure this plugin (Highly Recommended). 
* The sample configuration can be edited and used manually as an alternative. 
* See the `sample-config.json` file example or copy the example below into your config.json file, making the apporpriate changes before saving it. 
* Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="left">
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
| `sensorPower`| If enabled, then the Power will be exposed as a `Motion Sensor` to use with automations. |
| `sensorVolume`| If enabled, then the Volume will be exposed as a `Motion Sensor` to use with automations. |
| `sensorMute`| If enabled, then the Mute will be exposed as a `Motion Sensor` to use with automations. |
| `sensorChannel`| If enabled, then the Channel will be exposed as a `Motion Sensor` to use with automations. |
| `volumeControl` | Here select volume control mode `None`, `Slider`, `Fan`. |
| `infoButtonCommand` | Here select the function of `I` button in RC app. |
| `inputs.name` | Here set *Channel Name* which You want expose to the *Homebridge/HomeKit*. |
| `inputs.reference` | Here set *Channel Reference*. All can be found in `homebridge_directory/openwebifTv/inputs_xxxx`. |
| `inputs.switch` | If enabled, the tile for that *Chasnnel* will be expose to the *Homebridge/HomeKit* and can be used for HomeKit automation. |
| `inputs.displayType` | Here select display type in HomeKit app, possible `Button`, `Switch`, `Motion Sensor`, `Occupancy Sensor`.|
| `buttons.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*.| 
| `buttons.mode` | Here select button mode, `Live TV Channel` or `Remote Control`. |
| `buttons.reference` | Here set *Reference*, only for `Live TV Channel` mode, in other case leave empty. | 
| `buttons.command` | Here select `Remote Control` command which will be assigned to the button. |
| `buttons.displayType` | Here select display type in HomeKit app, possible `Switch`, `Button` - selectable in HomeKit app as Light, Fan, Outlet.|
| `enableDebugMode` | If enabled, deep log will be present in homebridge console. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `disableLogDeviceInfo` | If enabled, add ability to disable log device info by every connections device to the network. |
| `enableMqtt` | If enabled, MQTT Broker will start automatically and publish all awailable PV installation data. |
| `mqttHost` | Here set the *IP Address* or *Hostname* for MQTT Broker.) |
| `mqttPort` | Here set the *Port* for MQTT Broker, default 1883.) |
| `mqttPrefix` | Here set the *Prefix* for *Topic* or leave empty.) |
| `mqttAuth` | If enabled, MQTT Broker will use authorization credentials. |
| `mqttUser` | Here set the MQTT Broker user. |
| `mqttPasswd` | Here set the MQTT Broker password. |
| `mqttDebug` | If enabled, deep log will be present in homebridge console for MQTT. |

```json
{
      "platform": "OpenWebIfTv",
      "devices": [
        {
        "name": "Sat Receiver",
        "host": "192.168.0.4",
        "port": 80,
        "auth": false,
        "user": "user",
        "pass": "pass",
        "sensorPower": false,
        "sensorVolume": false,
        "sensorMute": false,
        "sensorChannel": false,
        "disableLogInfo": false,
        "disableLogDeviceInfo": false,
        "enableDebugMode": false,
        "volumeControl": 0,
        "infoButtonCommand": "139",
        "inputs": [
          {
            "name": "Das Erste HD",
            "reference": "1:0:19:283D:3FB:1:C00000:0:0:0:",
            "switch": false,
					  "displayType": 0
          },
          {
            "name": "ZDF HD",
            "reference": "1:0:19:2B66:3F3:1:C00000:0:0:0:",
            "switch": false,
					  "displayType": 0
          },
          {
            "name": "RTL HD",
            "reference": "1:0:19:EF10:421:1:C00000:0:0:0:",
            "switch": false,
					  "displayType": 0
          }
        ],
        "buttons": [
          {
            "name": "Das Erste HD",
            "mode": 0,
            "reference": "1:0:19:283D:3FB:1:C00000:0:0:0:",
						"displayType": 0
          },
          {
            "name": "ZDF HD",
            "mode": 0,
            "reference": "1:0:19:2B66:3F3:1:C00000:0:0:0:",
						"displayType": 0
          },
          {
            "name": "Menu Up",
            "mode": 1,
            "command": "115",
						"displayType": 0
          }
        ],
        "enableMqtt": false,
        "mqttHost": "192.168.1.33",
        "mqttPort": 1883,
        "mqttPrefix": "home/openwebif",
        "mqttAuth": false,
        "mqttUser": "user",
        "mqttPass": "password",
        "mqttDebug": false
      }
    ]
  }
```

* Sort of channels in HomeKit app is alpahabetically but U can sort the channels as in Yours receivers adding channel number at first place of every name:

```json
                {
                    "name": "1 TVP HD",
                    "reference": "1:0:1:1138:2AF8:13E:820000:0:0:0:"
                },
                {
                    "name": "10 TVP 1 HD",
                    "reference": "1:0:1:3ABD:514:13E:820000:0:0:0:"
                },
                {
                    "name": "11 TVP 2 HD",
                    "reference": "1:0:1:C22:1E78:71:820000:0:0:0:"
                },
                {
                    "name": "12 TVP 3",
                    "reference": "1:0:1:113B:2AF8:13E:820000:0:0:0:"
                },
                {
                    "name": "13 TVP INFO HD",
                    "reference": "1:0:1:1139:2AF8:13E:820000:0:0:0:"
                },
                {
                    "name": "14 TVP ABC",
                    "reference": "1:0:1:3D5F:2C88:13E:820000:0:0:0:"
                },
                {
                    "name": "15 TVP Seriale",
                    "reference": "1:0:1:3D5C:2C88:13E:820000:0:0:0:"
                },
                {
                    "name": "16 TVP Kultura",
                    "reference": "1:0:1:3D59:2C88:13E:820000:0:0:0:"
                },
                {
                    "name": "17 TVP Rozrywka",
                    "reference": "1:0:1:4288:2BC0:13E:820000:0:0:0:"
                },
                {
                    "name": "18 TVP Polonia",
                    "reference": "1:0:1:132B:33F4:13E:820000:0:0:0:"
                },
                {
                    "name": "19 TVP Sport HD",
                    "reference": "1:0:1:DB1:2D50:13E:820000:0:0:0:"
                },
                {
                    "name": "2 TVP Historia",
                    "reference": "1:0:1:3D67:2C88:13E:820000:0:0:0:"
                },
                {
                    "name": "20 TVN HD",
                    "reference": "1:0:1:3DCD:640:13E:820000:0:0:0:"
                },
                {
                    "name": "21 TVN 7 HD",
                    "reference": "1:0:1:3DD3:640:13E:820000:0:0:0:"
                },
                {
                    "name": "22 TVN Turbo HD",
                    "reference": "1:0:1:3DD0:640:13E:820000:0:0:0:"
                }
```
