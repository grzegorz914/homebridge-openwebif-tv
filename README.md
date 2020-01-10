# homebridge-openwebif-tv
[![npm](https://img.shields.io/npm/dt/homebridge-openwebif-tv.svg)](https://www.npmjs.com/package/homebridge-openwebif-tv) [![npm](https://img.shields.io/npm/v/homebridge-openwebif-tv.svg)](https://www.npmjs.com/package/homebridge-openwebif-tv)

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

# Configuration

 <pre>
"accessories": [
        {
            "accessory": "OpenWebIfTv",
            "name": "Tuner Sat",
            "host": "192.168.1.10",
            "port": 80,
            "speakerService": true,
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
            }
       ]
     }
    ]
</pre>

# Info 
Sort of channels in HomeKit app is alpahabetically but U can sort the channels as in Yours receivers, just add channel number at first place of every name, some example:
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
