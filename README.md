# homebridge-openwebif-tv
[![npm](https://img.shields.io/npm/dt/homebridge-openwebif-tv.svg)](https://www.npmjs.com/package/homebridge-openwebif-tv) [![npm](https://img.shields.io/npm/v/homebridge-openwebif-tv.svg)](https://www.npmjs.com/package/homebridge-openwebif-tv)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-openwebif-tv.svg)](https://github.com/grzegorz914/homebridge-openwebif-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-openwebif-tv.svg)](https://github.com/grzegorz914/homebridge-openwebif-tv/issues)

Control plugin for Sat Receivers basis on the OpenWebIf interface (Dreambox, VU+, etc..).
Present in HomeKit as TV service, schange channels, volume/mute control, power control.

This plugin is basis on homebridge-openwebif-switch created by alex224.

HomeBridge: https://github.com/nfarina/homebridge

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install homebridge-openwebif-tv using: npm install -g homebridge-openwebif-tv
3. Update your configuration file. See sample-config.json in this repository for a sample. 

# Limitations
Due to HomeKit app limitation max. channels in bouquets is 97. Over this value HomeKit app will no response.
Right now plugin read automatiacally all channels from the Sat Receiver and store in /home/user/.openwebifTv/,
if U want somthing changed in channel list please add Yours prefered channels to the config bouquets.


# Configuration

 <pre>
{
      "platform": "OpenWebIfTv",
      "checkStateInterval": 5,
      "devices": [{
        "name": "Tuner Sat",
        "host": "192.168.0.4",
        "port": 80,
        "auth": false,
        "user": "user",
        "pass": "pass",
        "switchInfoMenu": true,
        "bouquets": [
          {
            "name": "Das Erste HD",
            "reference": "1:0:19:283D:3FB:1:C00000:0:0:0:"
          },
          {
            "name": "ZDF HD",
            "reference": "1:0:19:2B66:3F3:1:C00000:0:0:0:"
          },
          {
            "name": "RTL HD",
            "reference": "1:0:19:EF10:421:1:C00000:0:0:0:"
          },
          {
            "name": "SAT.1 HD",
            "reference": "1:0:19:EF74:3F9:1:C00000:0:0:0:"
          },
          {
            "name": "ProSieben HD",
            "reference": "1:0:19:EF75:3F9:1:C00000:0:0:0:"
          },
          {
            "name": "RTLII HD",
            "reference": "1:0:19:EF15:421:1:C00000:0:0:0:"
          },
          {
            "name": "VOX HD",
            "reference": "1:0:19:EF11:421:1:C00000:0:0:0:"
          },
          {
            "name": "kabel eins HD",
            "reference": "1:0:19:EF76:3F9:1:C00000:0:0:0:"
          },
          {
            "name": "SIXX HD",
            "reference": "1:0:19:EF77:3F9:1:C00000:0:0:0:"
          },
          {
            "name": "SUPER RTL HD",
            "reference": "1:0:19:2E9B:411:1:C00000:0:0:0:"
          },
          {
            "name": "TELE 5 HD",
            "reference": "1:0:19:1519:455:1:C00000:0:0:0:"
          },
          {
            "name": "ORF1 HD",
            "reference": "1:0:19:132F:3EF:1:C00000:0:0:0:"
          },
          {
            "name": "ORF2W HD",
            "reference": "1:0:19:1330:3EF:1:C00000:0:0:0:"
          },
          {
            "name": "RTL UHD",
            "reference": "1:0:1F:307A:3F5:1:C00000:0:0:0:"
          }
        ]
      }
    ]
  }
</pre>

# Info 
Sort of channel in HomeKit app is alpahabetically but U can sort the channels as in Yours receivers adding channel number at first place of every name, some example:
<pre>
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
                },
</pre>

# Whats new:
https://github.com/grzegorz914/homebridge-openwebif-tv/blob/master/CHANGELOG.md

# Development
- Pull request and help in development highly appreciated.
